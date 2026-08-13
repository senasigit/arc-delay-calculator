import { useMemo } from 'react';
import type { SubwooferSettings, ArrayStats, BoxGroup, VenueArea, ReportInfo, SubwooferPreset } from '../types';
import { formatMeters, calculateCoverageAnalysis, SPL_RAMP_CSS, SANE_LENGTH_M, SANE_SPACING_M } from '../utils';
import type { ReportHeatmapImage } from '../reportHeatmap';

export interface PrintReportProps {
  settings: SubwooferSettings;
  stats: ArrayStats;
  groups: BoxGroup[];
  areas: VenueArea[];
  reportInfo: ReportInfo;
  heatmapImages: ReportHeatmapImage[] | null;
  /** Gambar statis tampak depan (elevasi) — lihat reportFrontView.ts. */
  frontViewImage: string | null;
  /** Untuk menerjemahkan settings.preset (ID dokumen Firestore) menjadi nama yang dibaca manusia. */
  presets: SubwooferPreset[];
}

const SHAPE_LABELS: Record<VenueArea['shape'], string> = {
  Rectangle: 'Persegi',
  Circle: 'Lingkaran',
  Semicircle: 'Setengah lingkaran',
  Triangle: 'Segitiga',
  Trapezoid: 'Trapesium',
};

/** Ukuran area sebagai satu string ringkas, tergantung bentuknya. */
function areaSizeLabel(area: VenueArea): string {
  if (area.shape === 'Circle' || area.shape === 'Semicircle') {
    return `Radius ${formatMeters(Number(area.radius) || 0)}`;
  }
  if (area.shape === 'Trapezoid') {
    return `${formatMeters(Number(area.topWidth) || 0)} / ${formatMeters(Number(area.bottomWidth) || 0)} × ${formatMeters(Number(area.height) || 0)}`;
  }
  return `${formatMeters(Number(area.width) || 0)} × ${formatMeters(Number(area.height) || 0)}`;
}

// Sinkron dengan AboutModal.tsx — satu sumber identitas aplikasi di seluruh app.
const APP_VERSION = '1.0';
const DEVELOPER = 'Sena Sigit';

const SETUP_LABELS: Record<SubwooferSettings['setupType'], string> = {
  'Straight Delayed Array': 'Arc Delay — lurus, busur dibentuk lewat delay per box (default)',
  'Curved Array': 'Curved Array — box dibengkokkan fisik',
  'L/R': 'L/R (kiri–kanan panggung)',
  'End-Fire': 'End-Fire',
  'End-Fire L/R': 'End-Fire L/R',
  'Gradient In-Line': 'Gradient In-Line (2 baris)',
  'Gradient Inverted Stack': 'Gradient Inverted Stack (tumpuk)',
  'Cardioid L/R': 'Cardioid L/R',
  'Auto-Efficiency': 'Auto-Efficiency',
  'Pattern Implosion': 'Pattern Implosion',
};

const FACING_LABELS: Record<SubwooferSettings['arrayFacing'], string> = {
  Up: 'Atas (↑)',
  Down: 'Bawah (↓)',
  Left: 'Kiri (←)',
  Right: 'Kanan (→)',
};

/** Satu baris label–nilai, dipakai berulang di semua tabel ringkasan laporan. */
function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 border-b border-gray-200 text-[11px]">
      <span className="text-gray-500">{label}{hint ? <span className="text-gray-400"> — {hint}</span> : null}</span>
      <span className="font-semibold text-gray-900 text-right">{value}</span>
    </div>
  );
}

function Section({ n: num, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid mb-5">
      <h2 className="text-[13px] font-bold text-gray-900 mb-2 pb-1 border-b-2 border-gray-800">
        {num}. {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Isi laporan saja, tanpa pembungkus hidden/print — dipakai DUA tempat:
 * disembunyikan sampai `window.print()` dipanggil (PrintReport di bawah),
 * DAN ditampilkan langsung di layar untuk preview (PrintPreviewModal.tsx).
 * Keduanya harus selalu identik, makanya kontennya satu sumber di sini.
 */
export function PrintReportContent({
  settings,
  stats,
  groups,
  areas,
  reportInfo,
  heatmapImages,
  frontViewImage,
  presets,
}: PrintReportProps) {
  const totals = useMemo(() => {
    let total = 0, front = 0, rear = 0, inverted = 0, muted = 0, maxDelay = 0;
    for (const g of groups) {
      for (const b of g.boxes) {
        total++;
        if (b.isRear) rear++; else front++;
        if (b.polarity === -1) inverted++;
        if (g.muted || b.muted) muted++;
        if (b.delayMs > maxDelay) maxDelay = b.delayMs;
      }
    }
    return { total, front, rear, inverted, muted, maxDelay };
  }, [groups]);

  // Dihitung ulang di sini (bukan dari panel Sidebar) karena laporan harus
  // lengkap terlepas dari panel mana yang sedang dibuka pengguna di layar.
  const coverage = useMemo(
    () => (areas.length && groups.length ? calculateCoverageAnalysis(settings, groups, areas) : null),
    [areas, groups, settings]
  );

  // settings.preset menyimpan ID dokumen Firestore (mis. "VYjps11yrrYhfNApUETS"),
  // bukan namanya — harus dicari di daftar preset, kalau tidak, laporan akan
  // menampilkan ID mentah yang tidak ada artinya bagi pembaca.
  const presetName =
    settings.preset === 'Custom'
      ? 'Dimensi manual'
      : presets.find((p) => p.id === settings.preset)?.name ?? 'Dimensi manual';

  const isLR = settings.setupType.includes('L/R');
  const isGradientSetup =
    settings.setupType.includes('Gradient') ||
    settings.setupType === 'Auto-Efficiency' ||
    settings.setupType === 'Pattern Implosion' ||
    settings.setupType === 'Cardioid L/R';
  const cardioidActive = settings.cardioid || isGradientSetup;
  const reversedBoxLabels = (settings.cardioidReversedBoxes ?? [])
    .map((v, i) => (v ? `Box ${i + 1}` : null))
    .filter(Boolean)
    .join(', ');

  const now = new Date();
  const generatedAt = `${now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })} · ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <div className="text-gray-900" style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* ---------------- Sampul / kop laporan ---------------- */}
      <div className="mb-6 pb-4 border-b-4 border-gray-800">
        <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Laporan Konfigurasi Subwoofer Array</p>
        <h1 className="text-3xl font-bold text-gray-900 mb-1">{reportInfo.project || 'Simulasi Subwoofer Array'}</h1>
        <p className="text-[11px] text-gray-500 mb-3">
          Dibuat dengan <strong className="text-gray-700">Sub Forge</strong> v{APP_VERSION} — kalkulator array &amp;
          delay subwoofer (arc delay, cardioid, end-fire, dan peta SPL) · dikembangkan oleh {DEVELOPER}
        </p>
        <div className="grid grid-cols-2 gap-x-10 gap-y-0.5 text-[11px] text-gray-700">
          <p><strong>Venue</strong>: {reportInfo.venue || '—'}</p>
          <p><strong>System engineer</strong>: {reportInfo.engineer || '—'}</p>
          <p><strong>Tanggal event</strong>: {reportInfo.date || '—'}</p>
          <p><strong>Dibuat</strong>: {generatedAt} · Sub Forge</p>
        </div>
      </div>

      {/* ---------------- 1. Informasi project ---------------- */}
      <Section n={1} title="Informasi Project">
        <div className="grid grid-cols-2 gap-x-10">
          <div>
            <Row label="Nama project / acara" value={reportInfo.project || '—'} />
            <Row label="Venue" value={reportInfo.venue || '—'} />
          </div>
          <div>
            <Row label="System engineer" value={reportInfo.engineer || '—'} />
            <Row label="Tanggal" value={reportInfo.date || '—'} />
          </div>
        </div>
      </Section>

      {/* ---------------- 2. Konfigurasi array ---------------- */}
      <Section n={2} title="Konfigurasi Array">
        <div className="grid grid-cols-2 gap-x-10">
          <div>
            <Row label="Tipe setup" value={SETUP_LABELS[settings.setupType]} />
            <Row label="Arah hadap array" value={FACING_LABELS[settings.arrayFacing]} />
            <Row label={isLR ? 'Total titik (kiri + kanan)' : 'Jumlah titik horizontal'} value={String(settings.count || 0)} />
          </div>
          <div>
            {isLR && <Row label="Lebar panggung (jarak antar cluster)" value={formatMeters(Number(settings.stageWidth) || 0)} />}
            {Number(settings.theta) > 0 && <Row label="Sudut coverage busur (θ)" value={`${settings.theta}°`} />}
            <Row label="Frekuensi target (kunci ¼λ)" value={`${settings.targetFrequency || 63} Hz`} />
          </div>
        </div>
      </Section>

      {/* ---------------- 3. Jumlah total box ---------------- */}
      <Section n={3} title="Jumlah Total Box">
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            ['Total box', totals.total],
            ['Front', totals.front],
            ['Rear', totals.rear],
            ['Di-mute', totals.muted],
          ].map(([label, value]) => (
            <div key={label} className="border border-gray-300 rounded p-2">
              <div className="text-[9px] uppercase tracking-wide text-gray-500">{label}</div>
              <div className="text-xl font-bold text-gray-900">{value}</div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-500 mt-1.5">
          {settings.stack || 1} stack × {settings.rows || 1} baris per titik. Delay maksimum {totals.maxDelay.toFixed(2)} ms,
          polaritas terbalik pada {totals.inverted} box.
        </p>
      </Section>

      {/* ---------------- 4. Informasi umum (ringkasan array) ---------------- */}
      <Section n={4} title="Informasi Umum Array">
        <div className="grid grid-cols-2 gap-x-10">
          <div>
            <Row
              label="Panjang array (tepi-ke-tepi)"
              value={formatMeters(stats.totalArrayLength)}
              hint={stats.totalArrayLength > SANE_LENGTH_M ? 'TIDAK WAJAR' : undefined}
            />
            <Row
              label="Jarak pusat akustik antar box"
              value={formatMeters(stats.acousticCenterSpacing)}
              hint={stats.acousticCenterSpacing > SANE_SPACING_M ? 'TIDAK WAJAR' : undefined}
            />
          </div>
          <div>
            <Row
              label="Batas aliasing spasial"
              value={Number.isFinite(stats.upperFreqLimit) ? `${stats.upperFreqLimit.toFixed(0)} Hz` : '—'}
              hint="di atas frekuensi ini muncul grating lobe"
            />
            {stats.arcRadius > 0 && (
              <Row
                label={settings.setupType === 'Curved Array' ? 'Radius busur / mundur fisik maks' : 'Radius busur / delay tepi maks'}
                value={`${formatMeters(stats.arcRadius)} / ${
                  settings.setupType === 'Curved Array'
                    ? formatMeters(stats.maxArcOffset)
                    : `${((stats.maxArcOffset / (Number(settings.speedOfSound) || 343)) * 1000).toFixed(2)} ms`
                }`}
              />
            )}
          </div>
        </div>
        {stats.warnings.length > 0 && (
          <ul className="mt-2 space-y-1">
            {stats.warnings.map((w, i) => (
              <li
                key={i}
                className={`text-[10px] leading-snug px-2 py-1 rounded border ${
                  w.level === 'error' ? 'border-red-400 bg-red-50 text-red-700' : 'border-amber-400 bg-amber-50 text-amber-700'
                }`}
              >
                {w.level === 'error' ? '⚠ ' : '! '}{w.message}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ---------------- 5. Jenis box / dimensi box ---------------- */}
      <Section n={5} title="Jenis & Dimensi Box">
        <div className="grid grid-cols-2 gap-x-10">
          <div>
            <Row label="Preset" value={presetName} />
            <Row label="Dimensi (Lebar × Tinggi × Dalam)" value={`${settings.width || 0} × ${settings.height || 0} × ${settings.depth || 0} m`} />
            <Row label="Orientasi" value={settings.orientation} />
          </div>
          <div>
            <Row label="Sensitivitas (Max SPL @1 m)" value={`${settings.boxSensitivity || '—'} dB`} />
            <Row label="Sumbu array" value={`+X (${(settings.orientation === 'Landscape' ? Number(settings.width) || 0 : Number(settings.height) || 0).toFixed(2)} m)`} />
          </div>
        </div>
      </Section>

      {/* ---------------- 6. Susunan & jarak ---------------- */}
      <Section n={6} title="Susunan & Jarak">
        <div className="grid grid-cols-2 gap-x-10">
          <div>
            <Row label="Stack (ke atas)" value={String(settings.stack || 1)} />
            <Row label="Baris (ke belakang)" value={String(settings.rows || 1)} />
            <Row label="Sub gap" value={`${settings.gap || 0} m`} />
          </div>
          <div>
            <Row label="Central gap" value={`${settings.centralGap || 0} m`} />
            {(Number(settings.rows) > 1 || settings.setupType.includes('End-Fire')) && (
              <Row label="Jarak antar baris (pusat-ke-pusat)" value={`${settings.rowSpacing || 0} m`} />
            )}
          </div>
        </div>
        <p className="text-[10px] text-gray-500 mt-1">
          Sub Gap = celah kosong antar box. Central Gap = jarak pusat-ke-pusat pasangan box paling tengah (sudah
          termasuk badan box) — keduanya selalu berbeda nilai dan saling mengikuti.
        </p>

        {frontViewImage && (
          <div className="mt-3 break-inside-avoid">
            <p className="text-[10px] font-semibold text-gray-700 mb-1">
              Tampak depan (dilihat dari sisi audiens — tiap kotak satu box, "S1/S2/…" menandai urutan tumpukan)
            </p>
            <div className="border border-gray-300 rounded overflow-hidden">
              <img src={frontViewImage} alt="Tampak depan array" className="w-full block" />
            </div>
          </div>
        )}
      </Section>

      {/* ---------------- 7. Cardioid / gradient ---------------- */}
      <Section n={7} title="Cardioid / Gradient">
        {!cardioidActive ? (
          <p className="text-[11px] text-gray-500">Tidak aktif — array ini memancar omnidirectional (tanpa rejection panggung).</p>
        ) : (
          <div className="grid grid-cols-2 gap-x-10">
            <div>
              <Row label="Status" value="Aktif" />
              <Row label="Delay tambahan sumber rear" value={`${settings.cardioidDelay || 0} ms`} />
              <Row label="Polaritas rear dibalik 180°" value={settings.invertRearPolarity ? 'Ya' : 'Tidak'} />
            </div>
            <div>
              {reversedBoxLabels && <Row label="Box yang dibalik menghadap belakang" value={reversedBoxLabels} />}
              {settings.cardioidSpacers && <Row label="Celah udara antar tumpukan" value={`${settings.cardioidSpacerSize || 0} m`} />}
              {(stats.recommendedCardioidDelay ?? 0) > 0 && (
                <Row label="Delay fisik yang direkomendasikan" value={`${(stats.recommendedCardioidDelay ?? 0).toFixed(2)} ms`} />
              )}
            </div>
          </div>
        )}
        {cardioidActive && !settings.invertRearPolarity && (
          <p className="text-[10px] text-red-600 mt-1 font-semibold">
            Peringatan: tanpa pembalikan polaritas, susunan ini TIDAK menghasilkan efek cardioid.
          </p>
        )}
      </Section>

      {/* ---------------- 8. Heatmap / lingkungan ---------------- */}
      <Section n={8} title="Kondisi Lingkungan & Pengaturan Peta SPL">
        <div className="grid grid-cols-2 gap-x-10">
          <div>
            <Row label="Suhu udara" value={`${settings.temperature !== '' ? settings.temperature : 20} °C`} />
            <Row label="Kelembapan relatif" value={`${settings.humidity !== '' ? settings.humidity : 50} %`} />
            <Row label="Kecepatan suara" value={`${settings.speedOfSound || 343} m/s`} />
          </div>
          <div>
            <Row label="Frekuensi acuan tampilan" value={`${settings.frequency || 63} Hz (${settings.bandwidth})`} />
            <Row label="Tinggi bidang ukur (ear height)" value={`${settings.earHeight || 1.6} m`} />
            <Row label="Resolusi render" value={settings.resolution} />
          </div>
        </div>
      </Section>

      {/* ---------------- 9. Analisis coverage ---------------- */}
      <Section n={9} title="Analisis Coverage">
        {areas.length === 0 ? (
          <p className="text-[11px] text-gray-500">Belum ada area venue (Audience/Stage) untuk dianalisis.</p>
        ) : (
          <>
            <p className="text-[10px] font-semibold text-gray-700 mb-1">Daftar area venue</p>
            <table className="w-full text-[10px] border-collapse mb-3">
              <thead>
                <tr className="border-b-2 border-gray-800 text-left text-gray-500">
                  <th className="py-1 pr-2 font-semibold">Nama</th>
                  <th className="py-1 pr-2 font-semibold">Bentuk</th>
                  <th className="py-1 pr-2 font-semibold text-right">Ukuran</th>
                  <th className="py-1 pr-2 font-semibold text-right">Posisi (X, Y)</th>
                  <th className="py-1 font-semibold text-right">Rotasi</th>
                </tr>
              </thead>
              <tbody>
                {areas.map((a) => (
                  <tr key={a.id} className="border-b border-gray-200">
                    <td className="py-1 pr-2 font-medium">
                      <span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ backgroundColor: a.color }} />
                      {a.name}
                    </td>
                    <td className="py-1 pr-2">{SHAPE_LABELS[a.shape]}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{areaSizeLabel(a)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      {formatMeters(Number(a.x) || 0)}, {formatMeters(Number(a.y) || 0)}
                    </td>
                    <td className="py-1 text-right tabular-nums">{Number(a.rotation) || 0}°</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {!coverage || coverage.areas.length === 0 ? (
          areas.length > 0 && (
            <p className="text-[11px] text-gray-500">Isi jumlah box dan dimensi array untuk menghitung statistik SPL tiap area.</p>
          )
        ) : (
          <>
            <p className="text-[10px] font-semibold text-gray-700 mb-1">Statistik SPL per area</p>
            {coverage.frontToBack !== null && (
              <div className="mb-2 border border-gray-300 rounded p-2 inline-block">
                <span className="text-[10px] uppercase tracking-wide text-gray-500 mr-2">Front-back rejection</span>
                <span className="text-base font-bold text-gray-900">
                  {coverage.frontToBack >= 0 ? '+' : ''}{coverage.frontToBack.toFixed(1)} dB
                </span>
              </div>
            )}
            <table className="w-full text-[10px] border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-800 text-left text-gray-500">
                  <th className="py-1 pr-2 font-semibold">Area</th>
                  <th className="py-1 pr-2 font-semibold text-right">Titik sampel</th>
                  <th className="py-1 pr-2 font-semibold text-right">Deviation (maks−min)</th>
                  <th className="py-1 pr-2 font-semibold text-right">Deviasi baku</th>
                  <th className="py-1 font-semibold text-right">Rentang</th>
                </tr>
              </thead>
              <tbody>
                {coverage.areas.map((a) => (
                  <tr key={a.areaId} className="border-b border-gray-200">
                    <td className="py-1 pr-2 font-medium">{a.areaName}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{a.samples}</td>
                    <td className="py-1 pr-2 text-right tabular-nums font-semibold">{a.spread.toFixed(1)} dB</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{a.stdDev.toFixed(1)} dB</td>
                    <td className="py-1 text-right tabular-nums">{a.min.toFixed(1)} → {a.max.toFixed(1)} dB</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-gray-500 mt-1.5">
              Dihitung pada {settings.frequency || 63} Hz ({settings.bandwidth}), relatif terhadap satu box pada
              jarak 1 m. Deviation ≤ 6 dB tergolong rata, 6–12 dB sedang, {'>'}12 dB perlu perbaikan. Front-back
              rejection di atas 10 dB tergolong efektif membatalkan energi ke panggung/FOH.
            </p>
          </>
        )}
      </Section>

      {/* ---------------- 10. Tabel DSP ---------------- */}
      <div className="break-before-page" />
      <Section n={10} title="Tabel DSP — Delay & Polaritas per Box">
        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-800 text-left text-gray-500">
              <th className="py-1 pr-2 font-semibold">Posisi</th>
              <th className="py-1 pr-2 font-semibold text-right">X (m)</th>
              <th className="py-1 pr-2 font-semibold text-right">Y (m)</th>
              <th className="py-1 pr-2 font-semibold">Baris/Stack</th>
              <th className="py-1 pr-2 font-semibold">Peran</th>
              <th className="py-1 pr-2 font-semibold text-right">Delay (ms)</th>
              <th className="py-1 pr-2 font-semibold text-right">Polaritas</th>
              <th className="py-1 font-semibold text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {groups.flatMap((g) =>
              [...g.boxes].reverse().map((b) => (
                <tr key={`${g.positionId}-${b.stackIndex}`} className={`border-b border-gray-200 ${g.muted || b.muted ? 'text-gray-400' : ''}`}>
                  <td className="py-1 pr-2 font-medium">{g.label}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{b.x.toFixed(2)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{b.y.toFixed(2)}</td>
                  <td className="py-1 pr-2 tabular-nums">B{b.rowIndex + 1}·S{b.stackLevel + 1}</td>
                  <td className="py-1 pr-2">{b.positionLabel}{b.reversed ? ' · dibalik' : ''}</td>
                  <td className="py-1 pr-2 text-right tabular-nums font-semibold">{b.delayMs.toFixed(2)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{b.polarity === -1 ? 'INV' : 'Normal'}</td>
                  <td className="py-1 text-right">{g.muted || b.muted ? 'MUTE' : 'ON'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Section>

      {/* ---------------- 11. Peta SPL per frekuensi ---------------- */}
      <div className="break-before-page" />
      <Section n={11} title="Peta SPL per Frekuensi">
        <div className="mb-3 border border-gray-300 rounded p-2.5 bg-gray-50 text-[10px] text-gray-700 leading-relaxed">
          <p className="font-semibold text-gray-900 mb-1">Cara membaca peta ini:</p>
          <p>
            Tiap peta menunjukkan sebaran level suara (SPL) di lantai venue dilihat dari atas, pada satu frekuensi
            atau pita frekuensi. Warna <strong>biru/ungu</strong> = paling pelan, <strong>hijau/kuning</strong> =
            level menengah/target, <strong>merah</strong> = paling keras. Level bersifat <em>relatif</em> terhadap
            titik terkuat di peta tersebut (rentang {35} dB), bukan angka dB SPL mutlak — gunanya untuk melihat
            KERATAAN sebaran, bukan volume absolut. Kotak gelap menandai posisi box subwoofer; kotak berwarna
            coklat/amber adalah box yang dibalik fisik (cardioid).
          </p>
          <div className="flex items-center gap-2 mt-2">
            <div className="w-40 h-3 rounded-sm border border-gray-400" style={{ background: `linear-gradient(to right, ${SPL_RAMP_CSS})` }} />
            <span className="text-[9px] text-gray-500">pelan → keras (skala relatif, sama untuk semua peta di bawah)</span>
          </div>
        </div>

        {!heatmapImages ? (
          <p className="text-[11px] text-gray-500">Peta belum tersedia — coba klik Export PDF sekali lagi.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {heatmapImages.map((img) => (
              <div key={img.key} className="break-inside-avoid border border-gray-300 rounded overflow-hidden">
                {img.dataUrl ? (
                  <img src={img.dataUrl} alt={img.label} className="w-full block" />
                ) : (
                  <p className="text-[10px] text-gray-400 p-4 text-center">Gagal membuat peta {img.label}.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="mt-6 pt-2 border-t border-gray-300 text-[9px] text-gray-400 text-center">
        Dibuat otomatis dengan Sub Forge — {generatedAt}
      </div>
    </div>
  );
}

/** Disembunyikan di layar, hanya muncul saat window.print() benar-benar dipanggil. */
export function PrintReport(props: PrintReportProps) {
  return (
    <div className="hidden print:block">
      <PrintReportContent {...props} />
    </div>
  );
}
