import { useState, useEffect, useMemo } from 'react';
import type { SubwooferSettings, ArrayStats, SubwooferPreset, ReportInfo, SetupType, VenueArea, BoxGroup } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { db } from '../firebase';
import { collection, addDoc, doc, deleteDoc, onSnapshot } from 'firebase/firestore';
import {
  calculateAirAbsorption,
  calculateSpeedOfSound,
  formatMeters,
  DEFAULT_SPEED_OF_SOUND,
  DEFAULT_TEMPERATURE_C,
  MIN_TARGET_FREQ_HZ,
  SANE_LENGTH_M,
  SANE_SPACING_M,
  calculateCoverageAnalysis,
} from '../utils';
import { fetchLocalWeather } from '../weather';

interface SidebarProps {
  settings: SubwooferSettings;
  onChange: (settings: SubwooferSettings) => void;
  stats: ArrayStats;
  reportInfo: ReportInfo;
  onReportInfoChange: (info: ReportInfo) => void;
  /** Untuk panel analisis coverage; opsional agar Sidebar tetap bisa dipakai sendiri. */
  areas?: VenueArea[];
  groups?: BoxGroup[];
}

type NumericField = keyof SubwooferSettings;

const n = (v: unknown, fallback = 0) => {
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Dimensi box pada sumbu array (horizontal), mengikuti orientasi. Rotasi
 * Landscape↔Portrait memutar box 90° pada sumbu depth-nya, menukar Width dan
 * Height — BUKAN Width dan Depth. Ini mengikuti persis tabel lookup dimensi
 * pada kalkulator arc delay resmi (kolom Height/Width tertukar via VLOOKUP
 * orientasi; Depth tidak pernah dipakai untuk sumbu array sama sekali).
 */
const dimX = (s: SubwooferSettings) => (s.orientation === 'Landscape' ? n(s.width) : n(s.height));
/** Dimensi box pada sumbu kedalaman (jarak ke audiens) — tidak berubah oleh orientasi. */
const dimY = (s: SubwooferSettings) => n(s.depth);

const speedOf = (s: SubwooferSettings) => n(s.speedOfSound) || DEFAULT_SPEED_OF_SOUND;

/**
 * Satu pintu masuk untuk semua perubahan setting, supaya nilai turunan
 * (central gap ↔ sub gap, kecepatan suara ↔ suhu, batas baris per tipe
 * setup) selalu konsisten dari mana pun perubahan datang.
 *
 * Sub Gap dan Central Gap saling mengikuti, tapi NILAINYA BEDA: Central Gap
 * = Sub Gap + lebar box, karena central gap adalah jarak pusat-ke-pusat
 * (sudah termasuk badan box), sedangkan sub gap adalah celah kosong saja.
 * Mengedit salah satu otomatis menghitung ulang yang lain lewat lebar box
 * saat ini, supaya array tetap seragam tanpa perlu disetel manual dua kali.
 */
function applyChange(prev: SubwooferSettings, name: NumericField, rawValue: unknown): SubwooferSettings {
  const next = { ...prev, [name]: rawValue } as SubwooferSettings;

  // Suhu / kelembapan → kecepatan suara
  if (name === 'temperature' || name === 'humidity') {
    const t = n(name === 'temperature' ? rawValue : prev.temperature, DEFAULT_TEMPERATURE_C);
    const rh = n(name === 'humidity' ? rawValue : prev.humidity, 50);
    next.speedOfSound = Number(calculateSpeedOfSound(t === 0 && next.temperature === '' ? DEFAULT_TEMPERATURE_C : t, rh).toFixed(1));
  }

  // Sub gap / dimensi / orientasi → central gap ikut menyesuaikan (array seragam)
  if (name === 'gap' || name === 'width' || name === 'height' || name === 'orientation') {
    next.centralGap = Number((n(next.gap) + dimX(next)).toFixed(3));
    if (name === 'gap') next.targetFrequency = '';
  }

  // Central gap diedit langsung → sub gap ikut menyesuaikan (dikurangi lebar box)
  if (name === 'centralGap') {
    const gap = Math.max(0, n(next.centralGap) - dimX(next));
    next.gap = Number(gap.toFixed(3));
    next.centralGap = Number((gap + dimX(next)).toFixed(3));
    next.targetFrequency = '';
  }

  // Frekuensi target → jarak pusat = λ/4 (array tetap koheren sampai 2× target)
  const retargets =
    (name === 'targetFrequency' && rawValue !== '') ||
    ((name === 'speedOfSound' || name === 'temperature' || name === 'humidity') && next.targetFrequency !== '');
  if (retargets) {
    const f = n(next.targetFrequency);
    // Di bawah MIN_TARGET_FREQ_HZ, λ/4 membesar sangat cepat (mendekati 0 Hz
    // → mendekati tak terhingga). Nilai transien saat mengetik ulang field
    // ini (mis. "0.005" sesaat sebelum jadi "63") tidak boleh ikut menghitung
    // ulang gap, atau sub gap bisa "meledak" ke ratusan ribu meter.
    if (f >= MIN_TARGET_FREQ_HZ) {
      const quarter = speedOf(next) / f / 4;
      const gap = Math.max(0, quarter - dimX(next));
      next.gap = Number(gap.toFixed(3));
      next.centralGap = Number((gap + dimX(next)).toFixed(3));
    }
  }

  if (name === 'setupType') {
    Object.assign(next, setupDefaults(rawValue as SetupType, next));
  }

  if (name === 'rows') {
    const max = maxRowsFor(next.setupType);
    if (n(next.rows) > max) next.rows = max;
  }

  return next;
}

const maxRowsFor = (setup: SetupType) => {
  if (setup.includes('End-Fire')) return 8;
  if (setup === 'Gradient Inverted Stack') return 1;
  return 2;
};

/**
 * Setiap tipe setup punya syarat susunan minimum. Tanpa ini, memilih
 * "Gradient In-Line" dengan 1 baris menghasilkan array biasa yang diam-diam
 * tidak melakukan apa pun.
 */
function setupDefaults(setup: SetupType, s: SubwooferSettings): Partial<SubwooferSettings> {
  const out: Partial<SubwooferSettings> = {};
  const max = maxRowsFor(setup);
  if (n(s.rows) > max) out.rows = max;

  if (setup.includes('End-Fire')) {
    if (n(s.rows) < 2) out.rows = 4;
    out.cardioid = false;
    // Jarak antar elemen End-Fire = 1/4 λ pada frekuensi target
    if (s.rowSpacing === '' && n(s.targetFrequency) >= MIN_TARGET_FREQ_HZ) {
      out.rowSpacing = Number((speedOf(s) / n(s.targetFrequency) / 4).toFixed(3));
    }
  } else if (setup === 'Gradient In-Line' || setup === 'Cardioid L/R' || setup === 'Auto-Efficiency' || setup === 'Pattern Implosion') {
    out.rows = 2;
    out.cardioid = true;
    out.invertRearPolarity = true;
    if (s.rowSpacing === '' && n(s.targetFrequency) >= MIN_TARGET_FREQ_HZ) {
      out.rowSpacing = Number((speedOf(s) / n(s.targetFrequency) / 4).toFixed(3));
    }
  } else if (setup === 'Gradient Inverted Stack') {
    out.rows = 1;
    out.cardioid = true;
    out.invertRearPolarity = true;
    if (n(s.stack) < 2) out.stack = 3;
    if (!s.cardioidReversedBoxes.some(Boolean)) {
      out.cardioidReversedBoxes = [true, false, false];
    }
  }
  return out;
}

/**
 * Panel & LambdaSelect sengaja didefinisikan di luar Sidebar. Komponen yang
 * dibuat ulang setiap render akan di-unmount–mount oleh React sehingga input di
 * dalamnya kehilangan fokus tiap ketukan tombol.
 */
function Panel({
  id,
  title,
  isOpen,
  onToggle,
  children,
}: {
  id: number;
  title: string;
  isOpen: boolean;
  onToggle: (id: number) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <button className="panel-head" onClick={() => onToggle(id)} aria-expanded={isOpen}>
        <span className="flex items-center gap-2">
          <span className="panel-index">{id}</span>
          {title}
        </span>
        <span className="text-ink-3 text-[10px]">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && <div className="panel-body">{children}</div>}
    </section>
  );
}

function LambdaSelect({
  value,
  targetF,
  c,
  isTime = false,
  onPick,
  label,
}: {
  value: number;
  targetF: number;
  c: number;
  isTime?: boolean;
  onPick: (v: number) => void;
  label: string;
}) {
  const base = isTime ? (1 / targetF) * 1000 : c / targetF;
  const fraction = base ? value / base : 0;
  const match = [0.25, 0.5, 2 / 3, 1].find((f) => Math.abs(fraction - f) < 0.015);

  return (
    <select
      className="select mt-1 min-h-0 py-1 text-[11px]"
      value={match ? String(match) : 'custom'}
      onChange={(e) => {
        const f = Number(e.target.value);
        if (Number.isFinite(f)) onPick(Number((base * f).toFixed(3)));
      }}
      aria-label={label}
    >
      {!match && (
        <option value="custom">
          ≈ {fraction.toFixed(2)} λ @ {targetF} Hz
        </option>
      )}
      <option value="0.25">¼ λ @ {targetF} Hz</option>
      <option value="0.5">½ λ @ {targetF} Hz</option>
      <option value={String(2 / 3)}>⅔ λ @ {targetF} Hz</option>
      <option value="1">1 λ @ {targetF} Hz</option>
    </select>
  );
}

export function Sidebar({ settings, onChange, stats, reportInfo, onReportInfoChange, areas = [], groups = [] }: SidebarProps) {
  const [savedPresets, setSavedPresets] = useState<SubwooferPreset[]>([]);
  const [open, setOpen] = useState<Record<number, boolean>>({ 1: true, 2: true, 3: true, 4: false, 5: false, 6: false, 7: false });
  // Menyimpan teks mentah agar mengetik "1." atau "0.0" tidak dipotong parser.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [throwDistance, setThrowDistance] = useState(50);
  const [weather, setWeather] = useState<{ status: 'idle' | 'loading' | 'error'; message?: string }>({ status: 'idle' });

  const toggle = (panel: number) => setOpen((p) => ({ ...p, [panel]: !p[panel] }));

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'presets'),
      (snapshot) => {
        setSavedPresets(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as SubwooferPreset));
      },
      (err) => console.error('Gagal memuat preset', err)
    );
    return () => unsubscribe();
  }, []);

  const set = (name: NumericField, value: unknown) => onChange(applyChange(settings, name, value));

  /** Isi suhu & kelembapan dari cuaca terkini di lokasi perangkat. */
  const loadWeather = async () => {
    setWeather({ status: 'loading' });
    try {
      const reading = await fetchLocalWeather();
      onChange({
        ...settings,
        temperature: reading.temperature,
        humidity: reading.humidity,
        speedOfSound: Number(calculateSpeedOfSound(reading.temperature, reading.humidity).toFixed(1)),
      });
      setWeather({ status: 'idle' });
    } catch (e) {
      setWeather({ status: 'error', message: e instanceof Error ? e.message : 'Gagal membaca cuaca.' });
    }
  };

  /** Input angka yang tetap nyaman diketik (mendukung "1.", "-", desimal). */
  const numberProps = (name: NumericField, opts: { step?: string; min?: string; max?: string; placeholder?: string } = {}) => ({
    type: 'number' as const,
    inputMode: 'decimal' as const,
    name: String(name),
    id: String(name),
    value: draft[name as string] ?? (settings[name] as number | '' ?? ''),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setDraft((d) => ({ ...d, [name]: raw }));
      if (raw === '') set(name, '');
      else {
        const parsed = parseFloat(raw);
        if (Number.isFinite(parsed)) set(name, parsed);
      }
    },
    onBlur: () => setDraft((d) => {
      const copy = { ...d };
      delete copy[name as string];
      return copy;
    }),
    ...opts,
  });

  const c = speedOf(settings);
  const targetF = n(settings.targetFrequency) || n(settings.frequency) || 63;
  const isLR = settings.setupType.includes('L/R');
  const isEndFire = settings.setupType.includes('End-Fire');
  const isGradientSetup =
    settings.setupType.includes('Gradient') ||
    settings.setupType === 'Cardioid L/R' ||
    settings.setupType === 'Auto-Efficiency' ||
    settings.setupType === 'Pattern Implosion';
  const rowsCount = Math.max(1, n(settings.rows, 1) || 1);
  const stackCount = Math.max(1, n(settings.stack, 1) || 1);
  const showCardioidPanel = !isEndFire && (isGradientSetup || settings.cardioid || stackCount > 1);
  const usesStackReversal = rowsCount === 1 && (settings.cardioid || isGradientSetup);
  const showTheta = ['Curved Array', 'Straight Delayed Array', 'Auto-Efficiency', 'Pattern Implosion'].includes(
    settings.setupType
  );

  const aliasingFromTarget = useMemo(() => {
    const spacing = n(settings.gap) + dimX(settings);
    return spacing > 0 ? c / (2 * spacing) : 0;
  }, [settings, c]);

  const lambdaProps = (name: NumericField, isTime = false) => ({
    value: n(settings[name]),
    targetF,
    c,
    isTime,
    onPick: (v: number) => set(name, v),
    label: `Setel ${String(name)} sebagai pecahan panjang gelombang`,
  });

  const handleSavePreset = async () => {
    const name = window.prompt('Nama preset baru (contoh: "Custom 18 inch"):');
    if (!name?.trim()) return;
    try {
      const docRef = await addDoc(collection(db, 'presets'), {
        name: name.trim(),
        width: n(settings.width),
        height: n(settings.height),
        depth: n(settings.depth),
        defaultCardioidDelay: n(settings.cardioidDelay),
        sensitivity: n(settings.boxSensitivity),
      });
      onChange({ ...settings, preset: docRef.id });
    } catch (e) {
      console.error(e);
      alert('Gagal menyimpan preset ke cloud.');
    }
  };

  const handleDeletePreset = async (id: string) => {
    if (!window.confirm('Hapus preset ini secara permanen?')) return;
    try {
      await deleteDoc(doc(db, 'presets', id));
      if (settings.preset === id) onChange({ ...settings, preset: 'Custom' });
    } catch (e) {
      console.error(e);
      alert('Gagal menghapus preset.');
    }
  };

  const handlePresetSelect = (value: string) => {
    const preset = savedPresets.find((p) => p.id === value);
    if (!preset || value === 'Custom') {
      onChange({ ...settings, preset: value });
      return;
    }
    const merged: SubwooferSettings = {
      ...settings,
      preset: value,
      width: preset.width,
      height: preset.height,
      depth: preset.depth,
      cardioidDelay: preset.defaultCardioidDelay ?? settings.cardioidDelay,
      boxSensitivity: preset.sensitivity ?? settings.boxSensitivity,
    };
    onChange(applyChange(merged, 'width', preset.width));
  };

  const handleReset = () => {
    if (!window.confirm('Kosongkan seluruh parameter konfigurasi?')) return;
    setDraft({});
    onChange({ ...DEFAULT_SETTINGS, count: '', gap: '', centralGap: '', cardioidDelay: '' });
  };

  // Analisis coverage menghitung ratusan titik sampel, jadi hanya dijalankan
  // saat panelnya benar-benar dibuka.
  const coverage = useMemo(
    () => (open[7] && areas.length && groups.length ? calculateCoverageAnalysis(settings, groups, areas) : null),
    [open, areas, groups, settings]
  );

  const recommendedDelay = stats.recommendedCardioidDelay ?? 0;
  const airLoss = calculateAirAbsorption(10000, n(settings.temperature, DEFAULT_TEMPERATURE_C) || DEFAULT_TEMPERATURE_C, n(settings.humidity, 50) || 50);

  return (
    <div className="w-full h-full bg-panel lg:border-r border-line flex flex-col min-h-0">
      {/* Ringkasan array */}
      <div className="flex-none px-3 pt-3 pb-2 border-b border-line">
        {n(settings.count) > 0 ? (
          <dl className="panel bg-raised p-2.5 space-y-1.5">
            <div className="stat-row">
              <dt>Panjang array</dt>
              <dd className={stats.totalArrayLength > SANE_LENGTH_M ? 'text-danger' : ''}>
                {formatMeters(stats.totalArrayLength)}
              </dd>
            </div>
            <div className="stat-row">
              <dt>Jarak pusat akustik</dt>
              <dd className={stats.acousticCenterSpacing > SANE_SPACING_M ? 'text-danger' : ''}>
                {formatMeters(stats.acousticCenterSpacing)}
              </dd>
            </div>
            <div className="stat-row">
              <dt title="Di atas frekuensi ini muncul grating lobe (spatial aliasing)">Batas aliasing</dt>
              <dd className={stats.upperFreqLimit < 80 ? 'text-warn' : ''}>
                {Number.isFinite(stats.upperFreqLimit) ? `${stats.upperFreqLimit.toFixed(0)} Hz` : '—'}
              </dd>
            </div>
            {stats.arcRadius > 0 && (
              <div className="stat-row">
                <dt>
                  {settings.setupType === 'Curved Array' ? 'Radius busur / mundur fisik maks' : 'Radius busur / delay tepi maks'}
                </dt>
                <dd>
                  {formatMeters(stats.arcRadius)} /{' '}
                  {settings.setupType === 'Curved Array'
                    ? formatMeters(stats.maxArcOffset)
                    : `${((stats.maxArcOffset / c) * 1000).toFixed(2)} ms`}
                </dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="section-note">Isi jumlah box dan dimensi untuk mulai menghitung.</p>
        )}

        {stats.warnings.length > 0 && (
          <ul className="mt-2 space-y-1">
            {stats.warnings.map((w, i) => (
              <li
                key={i}
                className={`text-[11px] leading-snug px-2 py-1.5 rounded border ${
                  w.level === 'error'
                    ? 'text-danger border-danger/40 bg-danger/10'
                    : 'text-warn border-warn/40 bg-warn/10'
                }`}
              >
                {w.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex-1 scroll-y px-3 py-3 space-y-2.5">
        {/* 1 — Konfigurasi array */}
        <Panel id={1} title="Konfigurasi array" isOpen={open[1]} onToggle={toggle}>
          <div>
            <label htmlFor="setupType" className="field-label">
              Tipe setup
            </label>
            <select
              id="setupType"
              className="select input-key"
              value={settings.setupType}
              onChange={(e) => set('setupType', e.target.value)}
            >
              <optgroup label="Distribusi horizontal">
                <option value="Straight Delayed Array">Arc Delay — lurus, busur via delay (default)</option>
                <option value="Curved Array">Curved Array — box dibengkokkan fisik (jarang dipakai)</option>
                <option value="L/R">L/R (kiri–kanan panggung)</option>
              </optgroup>
              <optgroup label="Directional / stage rejection">
                <option value="End-Fire">End-Fire</option>
                <option value="End-Fire L/R">End-Fire L/R</option>
                <option value="Gradient In-Line">Gradient In-Line (2 baris)</option>
                <option value="Gradient Inverted Stack">Gradient Inverted Stack (tumpuk)</option>
                <option value="Cardioid L/R">Cardioid L/R</option>
                <option value="Auto-Efficiency">Auto-Efficiency</option>
                <option value="Pattern Implosion">Pattern Implosion</option>
              </optgroup>
            </select>
          </div>

          {isLR && (
            <div>
              <label htmlFor="stageWidth" className="field-label">
                Lebar panggung (m) — jarak antar cluster
              </label>
              <input className="input" {...numberProps('stageWidth', { min: '0', step: '0.5' })} />
            </div>
          )}

          <div>
            <label htmlFor="count" className="field-label">
              {isLR ? 'Total titik (kiri + kanan)' : 'Jumlah titik horizontal'}
            </label>
            <input
              className="input input-key"
              {...numberProps('count', { min: isLR ? '2' : '1', max: '48', step: '1' })}
            />
          </div>

          {showTheta && (
            <div>
              <label htmlFor="theta" className="field-label">
                Sudut coverage busur θ (°)
              </label>
              <input className="input input-key" {...numberProps('theta', { min: '0', max: '180', step: '1' })} />
              <p className="section-note mt-1">
                {settings.setupType === 'Curved Array'
                  ? 'Box digeser mundur secara fisik mengikuti busur — dipakai hanya bila layout panggung benar-benar memungkinkan box disusun melengkung.'
                  : 'Praktik standar: box tetap lurus di depan panggung, busur coverage dibentuk lewat delay yang makin besar ke arah tepi.'}
              </p>
            </div>
          )}
        </Panel>

        {/* 2 — Box */}
        <Panel id={2} title="Dimensi box" isOpen={open[2]} onToggle={toggle}>
          <div>
            <label htmlFor="preset" className="field-label">
              Preset
            </label>
            <div className="flex gap-1.5">
              <select
                id="preset"
                className="select flex-1"
                value={settings.preset}
                onChange={(e) => handlePresetSelect(e.target.value)}
              >
                <option value="Custom">Dimensi manual</option>
                {savedPresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {settings.preset !== 'Custom' ? (
                <button className="btn btn-danger px-2.5" onClick={() => handleDeletePreset(settings.preset)} title="Hapus preset">
                  Hapus
                </button>
              ) : (
                <button className="btn px-2.5" onClick={handleSavePreset} title="Simpan dimensi saat ini">
                  Simpan
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label htmlFor="width" className="field-label">
                Lebar
              </label>
              <input className="input px-2" {...numberProps('width', { min: '0', step: '0.01' })} />
            </div>
            <div>
              <label htmlFor="height" className="field-label">
                Tinggi
              </label>
              <input className="input px-2" {...numberProps('height', { min: '0', step: '0.01' })} />
            </div>
            <div>
              <label htmlFor="depth" className="field-label">
                Dalam
              </label>
              <input className="input px-2" {...numberProps('depth', { min: '0', step: '0.01' })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="orientation" className="field-label">
                Orientasi
              </label>
              <select
                id="orientation"
                className="select"
                value={settings.orientation}
                onChange={(e) => set('orientation', e.target.value)}
              >
                <option value="Landscape">Landscape</option>
                <option value="Portrait">Portrait</option>
              </select>
            </div>
            <div>
              <label htmlFor="boxSensitivity" className="field-label" title="Max SPL satu box pada jarak 1 m">
                Max SPL @1 m (dB)
              </label>
              <input className="input" {...numberProps('boxSensitivity', { min: '0', step: '1', placeholder: '135' })} />
            </div>
          </div>
          <p className="section-note">
            Muka box menghadap sumbu <strong>+X</strong> ({dimX(settings).toFixed(2)} m) dengan kedalaman{' '}
            {dimY(settings).toFixed(2)} m.
          </p>
        </Panel>

        {/* 3 — Susunan & jarak */}
        <Panel id={3} title="Susunan & jarak" isOpen={open[3]} onToggle={toggle}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="stack" className="field-label">
                Stack (ke atas)
              </label>
              <input className="input input-key" {...numberProps('stack', { min: '1', max: '8', step: '1' })} />
            </div>
            <div>
              <label htmlFor="rows" className="field-label">
                Baris (ke belakang)
              </label>
              <input
                className="input input-key"
                {...numberProps('rows', { min: '1', max: String(maxRowsFor(settings.setupType)), step: '1' })}
                disabled={settings.setupType === 'Gradient Inverted Stack'}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="gap" className="field-label">
                Sub gap (m)
              </label>
              <input className="input" {...numberProps('gap', { min: '0', step: '0.01' })} />
              <LambdaSelect {...lambdaProps('gap')} />
            </div>
            <div>
              <label
                htmlFor="centralGap"
                className="field-label"
                title="Jarak pusat-ke-pusat pasangan box paling tengah = Sub Gap + lebar box — hanya berlaku untuk array genap"
              >
                Central gap (m)
              </label>
              <input
                className="input"
                {...numberProps('centralGap', { min: '0', step: '0.01' })}
                disabled={n(settings.count) % 2 !== 0 || isLR}
              />
              <LambdaSelect {...lambdaProps('centralGap')} />
            </div>
          </div>
          <p className="section-note">
            Sub Gap dan Central Gap saling mengikuti — nilainya pasti berbeda karena Central Gap sudah
            memperhitungkan lebar box (jarak pusat-ke-pusat), sementara Sub Gap hanya celah kosong antar box.
          </p>

          {(rowsCount > 1 || isEndFire) && (
            <div>
              <label htmlFor="rowSpacing" className="field-label">
                Jarak antar baris (m) — pusat ke pusat
              </label>
              <input
                className="input"
                {...numberProps('rowSpacing', {
                  min: '0',
                  step: '0.01',
                  placeholder: (dimY(settings) + n(settings.gap)).toFixed(2),
                })}
              />
              <LambdaSelect {...lambdaProps('rowSpacing')} />
            </div>
          )}

          <div className="pt-2 border-t border-line">
            <label htmlFor="targetFrequency" className="field-label">
              Frekuensi target (Hz) — kunci jarak ke ¼ λ
            </label>
            <input className="input" {...numberProps('targetFrequency', { min: '20', max: '200', step: '1', placeholder: '63' })} />
            <p className="section-note mt-1">
              Jarak ¼ λ menjaga array tetap koheren sampai ±{(aliasingFromTarget || 0).toFixed(0)} Hz. Mengubah sub
              gap secara manual akan melepas kunci ini.
            </p>
          </div>
        </Panel>

        {/* 4 — Cardioid / gradient */}
        {showCardioidPanel && (
          <Panel id={4} title="Cardioid / gradient" isOpen={open[4]} onToggle={toggle}>
            {!isGradientSetup && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={settings.cardioid}
                  onChange={(e) => set('cardioid', e.target.checked)}
                />
                <span className="text-xs font-semibold">Aktifkan pola cardioid</span>
              </label>
            )}

            {(settings.cardioid || isGradientSetup) && (
              <>
                {usesStackReversal && (
                  <div>
                    <span className="field-label">Box yang diputar menghadap belakang</span>
                    <div className="flex flex-wrap gap-2">
                      {Array.from({ length: stackCount }).map((_, i) => (
                        <label
                          key={i}
                          className={`flex items-center gap-1.5 px-2 py-1.5 rounded border cursor-pointer text-[11px] ${
                            settings.cardioidReversedBoxes[i]
                              ? 'border-warn/60 bg-warn/10 text-warn'
                              : 'border-line bg-raised text-ink-2'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="checkbox"
                            checked={settings.cardioidReversedBoxes[i] ?? false}
                            onChange={(e) => {
                              const next = [...settings.cardioidReversedBoxes];
                              next[i] = e.target.checked;
                              onChange({ ...settings, cardioidReversedBoxes: next });
                            }}
                          />
                          Box {i + 1}
                        </label>
                      ))}
                    </div>
                    <p className="section-note mt-1">Urutan dari bawah ke atas tumpukan.</p>
                  </div>
                )}

                {!usesStackReversal && (
                  <p className="section-note">
                    Baris belakang (baris 2 ke atas) otomatis berperan sebagai sumber rear.
                  </p>
                )}

                <div>
                  <label htmlFor="cardioidDelay" className="field-label">
                    Delay tambahan sumber rear (ms)
                  </label>
                  <input className="input input-key" {...numberProps('cardioidDelay', { min: '0', step: '0.05' })} />
                  <LambdaSelect {...lambdaProps('cardioidDelay', true)} />
                  {recommendedDelay > 0 && (
                    <button
                      className="btn w-full mt-1.5 min-h-0 py-1 text-[11px]"
                      onClick={() => set('cardioidDelay', Number(recommendedDelay.toFixed(2)))}
                      title="Waktu tempuh suara sepanjang jarak antar elemen — syarat pembatalan ke belakang"
                    >
                      Pakai nilai fisik: {recommendedDelay.toFixed(2)} ms
                    </button>
                  )}
                  <p className="section-note mt-1">
                    Cardioid membatalkan energi ke belakang bila delay = jarak antar elemen ÷ kecepatan suara,
                    dan polaritas rear dibalik.
                  </p>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={settings.invertRearPolarity}
                    onChange={(e) => set('invertRearPolarity', e.target.checked)}
                  />
                  <span className="text-xs font-semibold">Balik polaritas rear (180°)</span>
                </label>
                {!settings.invertRearPolarity && (
                  <p className="text-[11px] text-warn leading-snug">
                    Tanpa pembalikan polaritas, susunan ini tidak menghasilkan cardioid.
                  </p>
                )}

                {usesStackReversal && (
                  <div className="pt-2 border-t border-line space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={settings.cardioidSpacers}
                        onChange={(e) => set('cardioidSpacers', e.target.checked)}
                      />
                      <span className="text-xs font-semibold" title="Celah udara antar box bertumpuk">
                        Sisipkan celah udara antar tumpukan
                      </span>
                    </label>
                    {settings.cardioidSpacers && (
                      <div>
                        <label htmlFor="cardioidSpacerSize" className="field-label">
                          Tebal celah (m)
                        </label>
                        <input className="input" {...numberProps('cardioidSpacerSize', { min: '0', step: '0.01' })} />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </Panel>
        )}

        {/* 5 — Heatmap & lingkungan */}
        <Panel id={5} title="Heatmap & lingkungan" isOpen={open[5]} onToggle={toggle}>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox"
              checked={settings.showHeatmap}
              onChange={(e) => set('showHeatmap', e.target.checked)}
            />
            <span className="text-xs font-semibold">Tampilkan peta SPL</span>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="frequency" className="field-label">
                Frekuensi pusat (Hz)
              </label>
              <input
                className="input"
                {...numberProps('frequency', { min: '16', max: '250', step: '1' })}
                disabled={!settings.showHeatmap}
              />
            </div>
            <div>
              <label htmlFor="bandwidth" className="field-label">
                Lebar pita
              </label>
              <select
                id="bandwidth"
                className="select"
                value={settings.bandwidth}
                onChange={(e) => set('bandwidth', e.target.value)}
                disabled={!settings.showHeatmap}
              >
                <option value="Single">Nada tunggal</option>
                <option value="1/3 Octave">1/3 oktaf</option>
                <option value="1 Octave">1 oktaf</option>
                <option value="Broadband">Broadband 25–125 Hz</option>
              </select>
            </div>
            <div>
              <label htmlFor="resolution" className="field-label">
                Resolusi render
              </label>
              <select
                id="resolution"
                className="select"
                value={settings.resolution}
                onChange={(e) => set('resolution', e.target.value)}
                disabled={!settings.showHeatmap}
              >
                <option value="Low">Rendah (cepat)</option>
                <option value="Medium">Sedang</option>
                <option value="High">Tinggi</option>
              </select>
            </div>
            <div>
              <label htmlFor="earHeight" className="field-label">
                Tinggi bidang ukur (m)
              </label>
              <input
                className="input"
                {...numberProps('earHeight', { min: '0', step: '0.1', placeholder: '1.6' })}
                disabled={!settings.showHeatmap}
              />
            </div>
            <div>
              <label htmlFor="heatmapBandStep" className="field-label" title="Bulatkan level agar kontur coverage terbaca">
                Kontur bertingkat
              </label>
              <select
                id="heatmapBandStep"
                className="select"
                value={String(Number(settings.heatmapBandStep) || 0)}
                onChange={(e) => set('heatmapBandStep', Number(e.target.value))}
                disabled={!settings.showHeatmap}
              >
                <option value="0">Gradasi halus</option>
                <option value="3">Setiap 3 dB</option>
                <option value="6">Setiap 6 dB</option>
              </select>
            </div>
          </div>
          <p className="section-note">
            Kontur bertingkat membulatkan level ke kelipatan dB sehingga batas coverage −6 dB dan −12 dB
            terbaca sebagai garis, bukan gradasi.
          </p>

          <div className="pt-2 border-t border-line">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="field-label mb-0">Kondisi udara</span>
              <button
                className="btn min-h-0 py-1 px-2 text-[11px]"
                onClick={loadWeather}
                disabled={weather.status === 'loading'}
                title="Ambil suhu & kelembapan terkini dari lokasi perangkat"
              >
                {weather.status === 'loading' ? 'Mengambil…' : 'Ambil dari cuaca'}
              </button>
            </div>
            {weather.status === 'error' && (
              <p className="text-[11px] text-warn leading-snug mb-2">
                {weather.message} Isi manual saja.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="temperature" className="field-label">
                Suhu (°C)
              </label>
              <input className="input" {...numberProps('temperature', { step: '0.5', placeholder: '20' })} />
            </div>
            <div>
              <label htmlFor="humidity" className="field-label">
                Kelembapan (%)
              </label>
              <input className="input" {...numberProps('humidity', { min: '0', max: '100', step: '1', placeholder: '50' })} />
            </div>
            <div className="col-span-2">
              <label htmlFor="speedOfSound" className="field-label">
                Kecepatan suara (m/s)
              </label>
              <input className="input input-key" {...numberProps('speedOfSound', { step: '0.1', placeholder: '343' })} />
              <p className="section-note mt-1">
                Terisi otomatis dari suhu &amp; kelembapan; bisa ditimpa manual. 1 ms ≈ {(c / 1000).toFixed(3)} m.
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-line">
            <span className="field-label">Kompensasi serapan udara (ISO 9613-1)</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                className="input"
                value={throwDistance}
                min={1}
                step={5}
                onChange={(e) => setThrowDistance(Number(e.target.value) || 0)}
                aria-label="Jarak lempar terjauh"
              />
              <span className="text-[11px] text-ink-2 whitespace-nowrap">m jarak</span>
            </div>
            <dl className="mt-2 space-y-1">
              <div className="stat-row">
                <dt>Rugi @ 10 kHz</dt>
                <dd>{(airLoss * throwDistance).toFixed(1)} dB</dd>
              </div>
              <div className="stat-row">
                <dt>Rugi @ 2 kHz</dt>
                <dd>
                  {(
                    calculateAirAbsorption(2000, n(settings.temperature, DEFAULT_TEMPERATURE_C) || DEFAULT_TEMPERATURE_C, n(settings.humidity, 50) || 50) *
                    throwDistance
                  ).toFixed(1)}{' '}
                  dB
                </dd>
              </div>
              <div className="stat-row">
                <dt>Rugi @ {settings.frequency || 63} Hz</dt>
                <dd>
                  {(
                    calculateAirAbsorption(n(settings.frequency, 63) || 63, n(settings.temperature, DEFAULT_TEMPERATURE_C) || DEFAULT_TEMPERATURE_C, n(settings.humidity, 50) || 50) *
                    throwDistance
                  ).toFixed(2)}{' '}
                  dB
                </dd>
              </div>
            </dl>
            <p className="section-note mt-1">
              Angka ini adalah rugi tambahan di luar hukum kuadrat jarak — dipakai sebagai acuan HF shelf untuk zona
              lempar terjauh. Pada pita subwoofer pengaruhnya dapat diabaikan.
            </p>
          </div>
        </Panel>

        {/* 6 — Info proyek */}
        <Panel id={6} title="Info proyek" isOpen={open[6]} onToggle={toggle}>
          <div>
            <label htmlFor="rProject" className="field-label">
              Nama project / acara
            </label>
            <input
              id="rProject"
              type="text"
              className="input"
              value={reportInfo.project}
              onChange={(e) => onReportInfoChange({ ...reportInfo, project: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="rVenue" className="field-label">
              Venue
            </label>
            <input
              id="rVenue"
              type="text"
              className="input"
              value={reportInfo.venue}
              onChange={(e) => onReportInfoChange({ ...reportInfo, venue: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="rEngineer" className="field-label">
                System engineer
              </label>
              <input
                id="rEngineer"
                type="text"
                className="input"
                value={reportInfo.engineer}
                onChange={(e) => onReportInfoChange({ ...reportInfo, engineer: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="rDate" className="field-label">
                Tanggal
              </label>
              <input
                id="rDate"
                type="date"
                className="input"
                value={reportInfo.date}
                onChange={(e) => onReportInfoChange({ ...reportInfo, date: e.target.value })}
              />
            </div>
          </div>
        </Panel>

        {/* 7 — Analisis coverage */}
        <Panel id={7} title="Analisis coverage" isOpen={open[7]} onToggle={toggle}>
          {areas.length === 0 ? (
            <p className="section-note">
              Belum ada area venue. Tambahkan area (mis. "Audience" dan "Stage") lewat panel Area Venue di peta.
            </p>
          ) : !coverage || coverage.areas.length === 0 ? (
            <p className="section-note">Isi jumlah box dan dimensi dulu untuk menghitung spread.</p>
          ) : (
            <>
              {coverage.frontToBack !== null && (
                <div className="panel bg-raised p-2.5">
                  <div className="stat-row">
                    <dt>Front-back rejection</dt>
                    <dd
                      className={
                        coverage.frontToBack >= 10 ? 'text-good' : coverage.frontToBack >= 5 ? 'text-warn' : 'text-danger'
                      }
                    >
                      {coverage.frontToBack >= 0 ? '+' : ''}
                      {coverage.frontToBack.toFixed(1)} dB
                    </dd>
                  </div>
                  <p className="section-note mt-1">
                    Rata-rata {coverage.audienceName} dikurangi {coverage.stageName}. Di atas 10 dB tergolong
                    rejection cardioid yang efektif.
                  </p>
                </div>
              )}

              {coverage.areas.map((a) => (
                <div key={a.areaId} className="panel bg-raised p-2.5">
                  <div className="flex items-baseline justify-between gap-2 mb-1.5">
                    <span className="text-xs font-semibold truncate">{a.areaName}</span>
                    <span className="text-[10px] text-ink-3 tnum flex-none">
                      {a.samples} titik{a.excluded > 0 ? ` (${a.excluded} dekat sumber diabaikan)` : ''}
                    </span>
                  </div>
                  <dl className="space-y-1">
                    <div className="stat-row">
                      <dt title="Selisih titik terkeras dan terpelan — makin kecil makin rata">Deviation</dt>
                      <dd className={a.spread <= 6 ? 'text-good' : a.spread <= 12 ? 'text-warn' : 'text-danger'}>
                        {a.spread.toFixed(1)} dB
                      </dd>
                    </div>
                    <div className="stat-row">
                      <dt>Deviasi baku</dt>
                      <dd>{a.stdDev.toFixed(1)} dB</dd>
                    </div>
                    <div className="stat-row">
                      <dt>Rentang (min → maks)</dt>
                      <dd>
                        {a.min.toFixed(1)} → {a.max.toFixed(1)} dB
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}

              <p className="section-note">
                Dihitung pada {settings.frequency} Hz ({settings.bandwidth}) di ketinggian {settings.earHeight || 1.6} m,
                relatif terhadap satu box pada jarak 1 m. Ubah frekuensi di panel Heatmap untuk memeriksa pita lain.
              </p>
            </>
          )}
        </Panel>

        <button className="btn btn-danger w-full" onClick={handleReset}>
          Reset semua parameter
        </button>
      </div>
    </div>
  );
}
