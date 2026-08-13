import { useState } from 'react';
import type { SubwooferSettings } from '../types';
import { calculateAirAbsorption, lineArrayTransition, DEFAULT_SPEED_OF_SOUND } from '../utils';

interface AudioUtilitiesProps {
  settings: SubwooferSettings;
}

const TOOLS = [
  { id: 'spl', name: 'SPL & jarak' },
  { id: 'spl-add', name: 'Penjumlahan SPL' },
  { id: 'ceiling', name: 'Ceiling Coverage' },
  { id: 'air', name: 'Serapan udara' },
  { id: 'time-dist', name: 'Waktu ↔ jarak' },
  { id: 'freq-wave', name: 'Frekuensi ↔ λ' },
  { id: 'line-array', name: 'Transisi line array' },
  { id: 'volts', name: 'dBu / dBV / Volt' },
  { id: 'q-bw', name: 'Q ↔ bandwidth' },
  { id: 'limiter', name: 'Threshold limiter' },
  { id: 'gain', name: 'Gain amplifier' },
  { id: 'cable-low', name: 'Kabel low-Z' },
  { id: 'cable-high', name: 'Kabel 70/100 V' },
];

export function AudioUtilities({ settings }: AudioUtilitiesProps) {
  const [activeTool, setActiveTool] = useState('spl');
  const c = Number(settings.speedOfSound) || DEFAULT_SPEED_OF_SOUND;

  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-0 bg-canvas">
      {/* Navigasi: strip horizontal di mobile, daftar vertikal di desktop */}
      <nav className="flex-none lg:w-56 border-b lg:border-b-0 lg:border-r border-line bg-panel">
        <div className="hidden lg:block px-3 pt-3 pb-2">
          <p className="text-[11px] text-ink-3 tnum">c = {c.toFixed(1)} m/s</p>
        </div>
        <div className="flex lg:flex-col gap-1 p-2 overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto lg:max-h-full">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className={`flex-none lg:w-full text-left px-3 py-2 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                activeTool === tool.id
                  ? 'bg-accent/15 text-accent-hi border border-accent/40'
                  : 'text-ink-2 hover:bg-raised border border-transparent'
              }`}
            >
              {tool.name}
            </button>
          ))}
        </div>
      </nav>

      <div className="flex-1 scroll-y p-4 lg:p-8">
        <div className="max-w-xl mx-auto">
          {activeTool === 'spl' && <SPLCalc />}
          {activeTool === 'spl-add' && <SPLAdd />}
          {activeTool === 'ceiling' && <Ceiling />}
          {activeTool === 'air' && <AirAbsorption />}
          {activeTool === 'time-dist' && <TimeDist c={c} />}
          {activeTool === 'freq-wave' && <FreqWave c={c} />}
          {activeTool === 'line-array' && <LineArray c={c} />}
          {activeTool === 'volts' && <Volts />}
          {activeTool === 'q-bw' && <QBW />}
          {activeTool === 'limiter' && <Limiter />}
          {activeTool === 'gain' && <Gain />}
          {activeTool === 'cable-low' && <CableLow />}
          {activeTool === 'cable-high' && <CableHigh />}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- alat ---- */

function SPLCalc() {
  const [sens, setSens] = useState(98);
  const [power, setPower] = useState(1000);
  const [dist, setDist] = useState(10);
  const [freq, setFreq] = useState(4000);
  const [temp, setTemp] = useState(20);
  const [hum, setHum] = useState(50);

  const geometric = dist > 0 ? sens + 10 * Math.log10(Math.max(power, 1e-6)) - 20 * Math.log10(dist) : 0;
  // Serapan udara ikut dihitung supaya angka jarak jauh realistis — pada 4 kHz
  // / 50 m rugi ini sudah lebih dari 1 dB dan terus membesar dengan frekuensi.
  const airLoss = dist > 0 ? calculateAirAbsorption(freq, temp, Math.min(100, Math.max(1, hum))) * dist : 0;

  return (
    <ToolCard title="SPL & jarak" desc="SPL di ruang bebas dari sensitivitas dan daya amplifier, sudah termasuk rugi serapan udara.">
      <Field label="Sensitivitas (dB @ 1 W / 1 m)" value={sens} onChange={setSens} />
      <Field label="Daya (watt)" value={power} onChange={setPower} />
      <Field label="Jarak (m)" value={dist} step={0.5} onChange={setDist} />
      <Field label="Frekuensi (Hz)" value={freq} step={100} onChange={setFreq} />
      <Field label="Suhu (°C)" value={temp} step={0.5} onChange={setTemp} />
      <Field label="Kelembapan relatif (%)" value={hum} onChange={setHum} />
      <Result
        value={`${(geometric - airLoss).toFixed(1)} dB SPL`}
        note={`Jarak saja ${geometric.toFixed(1)} dB (−6 dB tiap penggandaan) · serapan udara −${airLoss.toFixed(2)} dB @ ${freq} Hz.`}
      />
    </ToolCard>
  );
}

function SPLAdd() {
  const [a, setA] = useState(100);
  const [b, setB] = useState(100);

  const incoherent = 10 * Math.log10(Math.pow(10, a / 10) + Math.pow(10, b / 10));
  const coherent = 20 * Math.log10(Math.pow(10, a / 20) + Math.pow(10, b / 20));

  return (
    <ToolCard
      title="Penjumlahan SPL"
      desc="Dua sumber yang tidak berkorelasi menjumlah secara daya (+3 dB). Dua sumber sefase menjumlah secara tekanan (+6 dB)."
    >
      <Field label="Sumber 1 (dB)" value={a} onChange={setA} />
      <Field label="Sumber 2 (dB)" value={b} onChange={setB} />
      <Result value={`${incoherent.toFixed(1)} dB`} note={`Acak / tidak berkorelasi. Bila sefase penuh: ${coherent.toFixed(1)} dB.`} />
    </ToolCard>
  );
}

function Ceiling() {
  const [ceilH, setCeilH] = useState(3);
  const [earH, setEarH] = useState(1.2);
  const [angle, setAngle] = useState(90);

  const h = ceilH - earH;
  const diameter = h > 0 ? 2 * h * Math.tan(((angle / 2) * Math.PI) / 180) : 0;

  // Tiga pola jarak baku instalasi plafon, dari paling hemat unit sampai
  // paling rata. 0.707 = √2/2 (pola "minimum overlap" yang lingkaran −6 dB
  // saling bersinggungan di titik diagonal grid persegi).
  const patterns: [string, number, string][] = [
    ['Tepi bersentuhan', 1.0, 'paling hemat unit, ada lubang di antara'],
    ['Minimum overlap', Math.SQRT1_2, 'kompromi umum, kerataan baik'],
    ['Tepi ke tengah', 0.5, 'paling rata, untuk speech/paging kritis'],
  ];

  return (
    <ToolCard title="Ceiling Speaker Coverage" desc="Diameter coverage pada bidang telinga untuk sudut dispersi nominal (−6 dB).">
      <Field label="Tinggi plafon (m)" value={ceilH} step={0.1} onChange={setCeilH} />
      <Field label="Tinggi telinga pendengar (m)" value={earH} step={0.1} onChange={setEarH} />
      <Field label="Sudut dispersi (°)" value={angle} onChange={setAngle} />
      <Result value={`${diameter.toFixed(2)} m`} note={`Tinggi jatuh ${h > 0 ? h.toFixed(2) : 0} m di atas telinga.`} />

      <div className="mt-4 pt-4 border-t border-line space-y-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-3 mb-1">
          Jarak antar speaker (grid persegi)
        </div>
        {patterns.map(([label, factor, hint]) => (
          <div key={label} className="flex justify-between items-baseline bg-raised border border-line rounded px-3 py-2">
            <span className="text-xs text-ink-2">
              {label}
              <span className="block text-[10px] text-ink-3">{hint}</span>
            </span>
            <span className="text-base font-semibold tnum">{(diameter * factor).toFixed(2)} m</span>
          </div>
        ))}
      </div>
    </ToolCard>
  );
}

function AirAbsorption() {
  const [dist, setDist] = useState(100);
  const [freq, setFreq] = useState(10000);
  const [temp, setTemp] = useState(20);
  const [hum, setHum] = useState(50);

  const alpha = calculateAirAbsorption(freq, temp, Math.min(100, Math.max(1, hum)));
  const total = alpha * dist;

  return (
    <ToolCard
      title="Serapan udara"
      desc="Perhitungan penuh ISO 9613-1 / ANSI S1.26 — rugi tambahan di luar hukum kuadrat jarak."
    >
      <Field label="Jarak (m)" value={dist} onChange={setDist} />
      <Field label="Frekuensi (Hz)" value={freq} step={100} onChange={setFreq} />
      <Field label="Suhu (°C)" value={temp} step={0.5} onChange={setTemp} />
      <Field label="Kelembapan relatif (%)" value={hum} onChange={setHum} />
      <Result
        value={`−${total.toFixed(2)} dB`}
        note={`Koefisien ${alpha.toFixed(4)} dB/m. Rugi ini terpisah dari −${(20 * Math.log10(Math.max(dist, 1))).toFixed(1)} dB akibat jarak.`}
      />
    </ToolCard>
  );
}

function TimeDist({ c }: { c: number }) {
  const [val, setVal] = useState(10);
  const [mode, setMode] = useState<'dist' | 'time'>('dist');

  return (
    <ToolCard title="Waktu ↔ jarak" desc={`Kecepatan suara ${c.toFixed(1)} m/s, mengikuti setting utama.`}>
      <Toggle
        options={[
          { id: 'dist', label: 'Masukkan jarak' },
          { id: 'time', label: 'Masukkan waktu' },
        ]}
        value={mode}
        onChange={(v) => setMode(v as 'dist' | 'time')}
      />
      <Field label={mode === 'dist' ? 'Jarak (m)' : 'Waktu (ms)'} value={val} step={0.1} onChange={setVal} />
      <Result
        value={mode === 'dist' ? `${((val / c) * 1000).toFixed(2)} ms` : `${((val / 1000) * c).toFixed(3)} m`}
        note={`1 ms ≈ ${(c / 1000).toFixed(3)} m`}
      />
    </ToolCard>
  );
}

function FreqWave({ c }: { c: number }) {
  const [val, setVal] = useState(63);
  const [mode, setMode] = useState<'freq' | 'wave'>('freq');
  const lambda = val > 0 ? c / val : 0;

  return (
    <ToolCard title="Frekuensi ↔ panjang gelombang" desc={`Kecepatan suara ${c.toFixed(1)} m/s, mengikuti setting utama.`}>
      <Toggle
        options={[
          { id: 'freq', label: 'Masukkan frekuensi' },
          { id: 'wave', label: 'Masukkan λ' },
        ]}
        value={mode}
        onChange={(v) => setMode(v as 'freq' | 'wave')}
      />
      <Field label={mode === 'freq' ? 'Frekuensi (Hz)' : 'Panjang gelombang (m)'} value={val} step={1} onChange={setVal} />

      {mode === 'freq' ? (
        <div className="mt-5 pt-4 border-t border-line space-y-1.5">
          {[
            ['1 λ', lambda],
            ['⅔ λ', (lambda * 2) / 3],
            ['½ λ', lambda / 2],
            ['¼ λ', lambda / 4],
          ].map(([label, value]) => (
            <div key={label as string} className="flex justify-between items-baseline bg-raised border border-line rounded px-3 py-2">
              <span className="text-xs text-ink-2">{label}</span>
              <span className="text-base font-semibold tnum">{(value as number).toFixed(3)} m</span>
            </div>
          ))}
          <p className="section-note">Jarak ¼ λ antar elemen menjaga array koheren sampai sekitar {(val * 2).toFixed(0)} Hz.</p>
        </div>
      ) : (
        <Result value={val > 0 ? `${(c / val).toFixed(1)} Hz` : '—'} note={`Untuk 1 λ sepanjang ${val} m.`} />
      )}
    </ToolCard>
  );
}

function LineArray({ c }: { c: number }) {
  const [len, setLen] = useState(4);
  const [freq, setFreq] = useState(1000);

  return (
    <ToolCard
      title="Transisi line array"
      desc="Jarak Rayleigh, batas near-field (silindris, −3 dB/penggandaan) menuju far-field (sferis, −6 dB/penggandaan)."
    >
      <Field label="Panjang total array (m)" value={len} step={0.5} onChange={setLen} />
      <Field label="Frekuensi (Hz)" value={freq} step={100} onChange={setFreq} />
      <Result
        value={`${lineArrayTransition(len, freq, c).toFixed(2)} m`}
        note="Di bawah jarak ini array masih berperilaku sebagai sumber garis."
      />
    </ToolCard>
  );
}

function Volts() {
  const [volts, setVolts] = useState(0.7746);
  const dBu = 20 * Math.log10(Math.max(volts, 1e-9) / 0.7746);
  const dBV = 20 * Math.log10(Math.max(volts, 1e-9));

  return (
    <ToolCard title="dBu ↔ dBV ↔ Volt" desc="Konversi tegangan sinyal. dBu mengacu ke 0.7746 Vrms, dBV mengacu ke 1 Vrms.">
      <Field label="Tegangan (Vrms)" value={volts} step={0.01} onChange={(v) => setVolts(Math.max(0, v))} />
      <Field label="dBu" value={Number(dBu.toFixed(2))} step={0.1} onChange={(v) => setVolts(0.7746 * Math.pow(10, v / 20))} />
      <Field label="dBV" value={Number(dBV.toFixed(2))} step={0.1} onChange={(v) => setVolts(Math.pow(10, v / 20))} />
      <Result value={`${dBu.toFixed(2)} dBu`} note={`= ${dBV.toFixed(2)} dBV = ${volts.toFixed(4)} Vrms`} />
    </ToolCard>
  );
}

function QBW() {
  const [val, setVal] = useState(1);
  const [mode, setMode] = useState<'bw' | 'q'>('bw');

  let result = '—';
  if (mode === 'bw' && val > 0) {
    const p = Math.pow(2, val);
    result = `${(Math.sqrt(p) / (p - 1)).toFixed(3)} Q`;
  } else if (mode === 'q' && val > 0) {
    const a = Math.pow(1 / val, 2) / 2;
    result = `${Math.log2(1 + a + Math.sqrt(Math.pow(1 + a, 2) - 1)).toFixed(3)} oktaf`;
  }

  return (
    <ToolCard title="Q ↔ bandwidth" desc="Konversi lebar filter EQ parametrik antara faktor Q dan bandwidth dalam oktaf (titik −3 dB).">
      <Toggle
        options={[
          { id: 'bw', label: 'Masukkan bandwidth' },
          { id: 'q', label: 'Masukkan Q' },
        ]}
        value={mode}
        onChange={(v) => setMode(v as 'bw' | 'q')}
      />
      <Field label={mode === 'bw' ? 'Bandwidth (oktaf)' : 'Faktor Q'} value={val} step={0.1} onChange={setVal} />
      <Result value={result} />
    </ToolCard>
  );
}

function Limiter() {
  const [power, setPower] = useState(1000);
  const [imp, setImp] = useState(8);
  const [gain, setGain] = useState(32);

  const vSpk = Math.sqrt(Math.max(power, 0) * Math.max(imp, 0.1));
  const vIn = vSpk / Math.pow(10, gain / 20);
  const dbu = 20 * Math.log10(Math.max(vIn, 1e-9) / 0.7746);

  return (
    <ToolCard
      title="Threshold limiter"
      desc="Titik threshold di DSP agar amplifier tidak melampaui daya kontinu speaker. Pakai daya RMS/kontinu, bukan peak."
    >
      <Field label="Daya kontinu speaker (watt RMS)" value={power} onChange={setPower} />
      <Field label="Impedansi nominal (ohm)" value={imp} onChange={setImp} />
      <Field label="Voltage gain amplifier (dB)" value={gain} step={0.1} onChange={setGain} />
      <Result value={`${dbu.toFixed(2)} dBu`} note={`Input setara ${vIn.toFixed(3)} Vrms · output amp ${vSpk.toFixed(1)} Vrms`} />
    </ToolCard>
  );
}

function Gain() {
  const [sens, setSens] = useState(1.4);
  const [power, setPower] = useState(1000);
  const [imp, setImp] = useState(8);

  const vOut = Math.sqrt(Math.max(power, 0) * Math.max(imp, 0.1));
  const gain = sens > 0 ? 20 * Math.log10(vOut / sens) : 0;

  return (
    <ToolCard title="Gain amplifier" desc="Voltage gain total dari sensitivitas input dan daya keluaran terukur.">
      <Field label="Sensitivitas input (Vrms)" value={sens} step={0.1} onChange={setSens} />
      <Field label="Daya keluaran terukur (watt)" value={power} onChange={setPower} />
      <Field label="Impedansi beban (ohm)" value={imp} onChange={setImp} />
      <Result value={`${gain.toFixed(2)} dB`} note={`Tegangan keluaran maksimum ${vOut.toFixed(1)} Vrms`} />
    </ToolCard>
  );
}

function CableLow() {
  const [len, setLen] = useState(20);
  const [area, setArea] = useState(2.5);
  const [load, setLoad] = useState(8);

  const r = area > 0 ? (0.0175 * len * 2) / area : Infinity;
  const loss = 20 * Math.log10(load / (load + r));
  const powerLoss = (1 - Math.pow(10, loss / 10)) * 100;
  const dampingFactor = r > 0 ? load / r : Infinity;

  return (
    <ToolCard title="Kabel speaker low-Z" desc="Rugi daya pada instalasi 4/8 ohm. Tembaga, resistivitas 0.0175 Ω·mm²/m, pulang-pergi.">
      <Field label="Panjang kabel (m)" value={len} onChange={setLen} />
      <Field label="Luas penampang (mm²)" value={area} step={0.5} onChange={setArea} />
      <Field label="Impedansi beban (ohm)" value={load} onChange={setLoad} />
      <Result
        value={`${loss.toFixed(2)} dB`}
        note={`Rugi daya ${powerLoss.toFixed(1)}% · resistansi kabel ${r.toFixed(3)} Ω · damping factor maks ${dampingFactor.toFixed(0)}`}
      />
      {loss < -0.5 && (
        <p className="text-[11px] text-warn mt-2">Rugi di atas 0.5 dB — perbesar penampang atau perpendek jalur.</p>
      )}
    </ToolCard>
  );
}

function CableHigh() {
  const [len, setLen] = useState(100);
  const [area, setArea] = useState(1.5);
  const [taps, setTaps] = useState(100);
  const [volts, setVolts] = useState(100);

  const current = volts > 0 ? taps / volts : 0;
  const r = area > 0 ? (0.0175 * len * 2) / area : Infinity;
  const vEnd = Math.max(0, volts - current * r);
  const loss = volts > 0 ? 20 * Math.log10(Math.max(vEnd, 1e-9) / volts) : 0;
  const powerLoss = (1 - Math.pow(vEnd / Math.max(volts, 1e-9), 2)) * 100;

  return (
    <ToolCard title="Kabel 70 V / 100 V" desc="Rugi tegangan pada jalur constant-voltage untuk sistem tata suara gedung.">
      <Field label="Tegangan jalur (V)" value={volts} onChange={setVolts} />
      <Field label="Total tap speaker (watt)" value={taps} onChange={setTaps} />
      <Field label="Panjang kabel (m)" value={len} onChange={setLen} />
      <Field label="Luas penampang (mm²)" value={area} step={0.5} onChange={setArea} />
      <Result value={`${vEnd.toFixed(1)} V di ujung`} note={`${loss.toFixed(2)} dB · rugi daya ${powerLoss.toFixed(1)}% · arus ${current.toFixed(2)} A`} />
      {loss < -0.5 && (
        <p className="text-[11px] text-warn mt-2">Rugi melebihi 0.5 dB — standar instalasi umumnya membatasi di angka ini.</p>
      )}
    </ToolCard>
  );
}

/* ------------------------------------------------------------- UI kecil --- */

function ToolCard({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="panel p-5 lg:p-6">
      <h2 className="text-base font-semibold mb-1">{title}</h2>
      <p className="section-note mb-5 pb-4 border-b border-line">{desc}</p>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  // Draft menahan teks mentah supaya "0.", "-" dan desimal bisa diketik utuh.
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className="flex items-center justify-between gap-3 bg-raised border border-line rounded px-3 py-2 focus-within:border-accent transition-colors">
      <label className="text-xs text-ink-2 flex-1">{label}</label>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        className="input w-28 text-right px-2"
        value={draft ?? value}
        onChange={(e) => {
          setDraft(e.target.value);
          const parsed = parseFloat(e.target.value);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
        onBlur={() => setDraft(null)}
      />
    </div>
  );
}

function Toggle({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1 p-1 bg-raised border border-line rounded mb-3">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={`flex-1 py-1.5 rounded text-xs font-semibold transition-colors ${
            value === opt.id ? 'bg-accent-dim text-white' : 'text-ink-2 hover:text-ink'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Result({ value, note }: { value: string; note?: string }) {
  return (
    <div className="mt-5 pt-4 border-t border-line">
      <div className="bg-raised border border-line rounded px-4 py-4 text-center">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-3 mb-1">Hasil</div>
        <div className="text-2xl font-semibold tnum text-accent-hi">{value}</div>
        {note && <div className="section-note mt-2">{note}</div>}
      </div>
    </div>
  );
}
