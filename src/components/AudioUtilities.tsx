import { useState } from 'react';
import type { SubwooferSettings } from '../types';

interface AudioUtilitiesProps {
  settings: SubwooferSettings;
}

const TABS = [
  { id: 'spl', name: 'SPL Calculator', icon: '🔊' },
  { id: 'spl-add', name: 'SPL Addition', icon: '➕' },
  { id: 'ceiling', name: 'Ceiling Coverage', icon: '🎯' },
  { id: 'air', name: 'Air Absorption', icon: '💨' },
  { id: 'time-dist', name: 'Time ↔ Distance', icon: '⏱️' },
  { id: 'freq-wave', name: 'Freq ↔ Wavelength', icon: '〰️' },
  { id: 'line-array', name: 'Line Array Trans.', icon: '📏' },
  { id: 'volts', name: 'dBu ↔ dBV ↔ Volts', icon: '⚡' },
  { id: 'q-bw', name: 'Q ↔ Bandwidth', icon: '🎚️' },
  { id: 'limiter', name: 'Limiter Threshold', icon: '🛡️' },
  { id: 'gain', name: 'Amplifier Gain', icon: '📈' },
  { id: 'cable-low', name: 'Cable (Low-Z)', icon: '🔌' },
  { id: 'cable-high', name: 'Cable (High-Z)', icon: '🏭' },
];

export function AudioUtilities({ settings }: AudioUtilitiesProps) {
  const [activeTab, setActiveTab] = useState('spl');

  // Helper to parse float safely
  const pFloat = (val: string | number) => {
    const parsed = typeof val === 'string' ? parseFloat(val) : val;
    return isNaN(parsed) ? 0 : parsed;
  };

  const c = pFloat(settings.speedOfSound) || 343; // Default speed of sound

  return (
    <div className="flex h-full w-full bg-zinc-950 text-white overflow-hidden">
      {/* Sidebar List */}
      <div className="w-48 lg:w-64 border-r border-zinc-800 bg-zinc-900/50 flex flex-col h-full overflow-y-auto">
        <div className="p-4 border-b border-zinc-800 sticky top-0 bg-zinc-900/90 backdrop-blur z-10 hidden lg:block">
          <h2 className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 uppercase tracking-wider">
            Audio Utilities
          </h2>
          <p className="text-xs text-zinc-400 mt-1">c = {c.toFixed(1)} m/s</p>
        </div>
        <div className="flex-1 p-2 space-y-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-xs lg:text-sm font-semibold transition-all ${
                activeTab === tab.id 
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 shadow-[inset_0_0_15px_rgba(37,99,235,0.1)]' 
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-transparent'
              }`}
            >
              <span className="mr-2">{tab.icon}</span> <span className="hidden lg:inline">{tab.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 h-full overflow-y-auto p-4 lg:p-10 relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 to-black">
        <div className="max-w-2xl mx-auto">
           {activeTab === 'spl' && <SPLCalc />}
           {activeTab === 'spl-add' && <SPLAdd />}
           {activeTab === 'ceiling' && <Ceiling />}
           {activeTab === 'air' && <AirAbsorption />}
           {activeTab === 'time-dist' && <TimeDist c={c} />}
           {activeTab === 'freq-wave' && <FreqWave c={c} />}
           {activeTab === 'line-array' && <LineArray c={c} />}
           {activeTab === 'volts' && <Volts />}
           {activeTab === 'q-bw' && <QBW />}
           {activeTab === 'limiter' && <Limiter />}
           {activeTab === 'gain' && <Gain />}
           {activeTab === 'cable-low' && <CableLow />}
           {activeTab === 'cable-high' && <CableHigh />}
        </div>
      </div>
    </div>
  );
}

// 1. SPL Calculator
function SPLCalc() {
  const [sens, setSens] = useState(98);
  const [power, setPower] = useState(1000);
  const [dist, setDist] = useState(1);

  const calc = () => {
    if (dist <= 0) return 0;
    return sens + 10 * Math.log10(power || 1) - 20 * Math.log10(dist);
  };

  return <ToolCard title="SPL Calculator" icon="🔊" desc="Hitung SPL maksimal pada jarak tertentu berdasarkan daya amplifier dan sensitivitas.">
    <InputGroup label="Sensitivity (1W/1m, dB)" value={sens} onChange={setSens} />
    <InputGroup label="Power (Watts)" value={power} onChange={setPower} />
    <InputGroup label="Distance (m)" value={dist} onChange={setDist} />
    <Result value={`${calc().toFixed(2)} dB SPL`} />
  </ToolCard>;
}

// 2. SPL Addition
function SPLAdd() {
  const [spl1, setSpl1] = useState(100);
  const [spl2, setSpl2] = useState(100);

  const calc = () => {
    const sum = Math.pow(10, spl1/10) + Math.pow(10, spl2/10);
    return 10 * Math.log10(sum);
  };

  return <ToolCard title="SPL Addition" icon="➕" desc="Menjumlahkan tingkat tekanan suara (SPL) dari dua sumber suara acak (incoherent).">
    <InputGroup label="SPL Source 1 (dB)" value={spl1} onChange={setSpl1} />
    <InputGroup label="SPL Source 2 (dB)" value={spl2} onChange={setSpl2} />
    <Result value={`${calc().toFixed(2)} dB SPL`} />
  </ToolCard>;
}

// 3. Ceiling Coverage
function Ceiling() {
  const [ceilH, setCeilH] = useState(3);
  const [earH, setEarH] = useState(1.2);
  const [angle, setAngle] = useState(90);

  const calc = () => {
    const h = ceilH - earH;
    if (h <= 0) return 0;
    const r = h * Math.tan((angle/2) * Math.PI / 180);
    return r * 2; // Diameter
  };

  return <ToolCard title="Ceiling Coverage" icon="🎯" desc="Hitung diameter area cakupan speaker plafon pada tinggi telinga audiens.">
    <InputGroup label="Ceiling Height (m)" value={ceilH} onChange={setCeilH} />
    <InputGroup label="Listener Ear Height (m)" value={earH} step={0.1} onChange={setEarH} />
    <InputGroup label="Speaker Dispersion Angle (°)" value={angle} onChange={setAngle} />
    <Result value={`${calc().toFixed(2)} m (Diameter)`} />
  </ToolCard>;
}

// 4. Air Absorption
function AirAbsorption() {
  // Rough ISO 9613-1 approximation
  const [dist, setDist] = useState(100);
  const [freq, setFreq] = useState(10000);
  const [temp, setTemp] = useState(20);
  const [hum, setHum] = useState(50);
  
  const calc = () => {
     const tKelvin = temp + 273.15;
     const f2 = Math.pow(freq, 2);
     // Rough empirical formula scaling
     const alpha = (f2 * Math.pow(10, -11)) * Math.pow(tKelvin/293, 0.5) * (1 / (hum/100)); 
     return alpha * dist;
  };

  return <ToolCard title="Air Absorption" icon="💨" desc="Perkiraan redaman frekuensi tinggi di udara akibat jarak, suhu, dan kelembapan.">
    <InputGroup label="Distance (m)" value={dist} onChange={setDist} />
    <InputGroup label="Frequency (Hz)" value={freq} step={100} onChange={setFreq} />
    <InputGroup label="Temperature (°C)" value={temp} onChange={setTemp} />
    <InputGroup label="Humidity (%)" value={hum} onChange={setHum} />
    <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded text-yellow-300 text-xs">
       Catatan: Nilai ini merupakan estimasi penyederhanaan yang mendekati standar ISO 9613-1.
    </div>
    <Result value={`-${calc().toFixed(2)} dB Loss`} />
  </ToolCard>;
}

// 5. Time ↔ Distance
function TimeDist({ c }: { c: number }) {
  const [val, setVal] = useState(10);
  const [mode, setMode] = useState<'dist' | 'time'>('dist');
  
  return <ToolCard title="Time ↔ Distance" icon="⏱️" desc={`Kecepatan Suara: ${c.toFixed(1)} m/s (sesuai setting utama)`}>
    <div className="flex gap-4 mb-4">
      <button onClick={() => setMode('dist')} className={`flex-1 py-2 rounded-lg text-sm font-bold border ${mode === 'dist' ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>Input Distance</button>
      <button onClick={() => setMode('time')} className={`flex-1 py-2 rounded-lg text-sm font-bold border ${mode === 'time' ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>Input Time</button>
    </div>
    <InputGroup label={mode === 'dist' ? "Distance (m)" : "Time (ms)"} value={val} step={0.1} onChange={setVal} />
    
    <Result value={
      mode === 'dist' 
        ? `${((val / c) * 1000).toFixed(2)} ms` 
        : `${((val / 1000) * c).toFixed(2)} m`
    } />
  </ToolCard>;
}

// 6. Freq ↔ Wavelength
function FreqWave({ c }: { c: number }) {
  const [val, setVal] = useState(100);
  const [mode, setMode] = useState<'freq' | 'wave'>('freq'); 
  
  const renderResults = () => {
    if (val <= 0) return null;
    
    if (mode === 'freq') {
      const lambda = c / val;
      return (
        <div className="mt-8 pt-6 border-t border-zinc-800 flex flex-col gap-3">
          <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest text-center mb-1">Hasil Panjang Gelombang (λ)</div>
          
          <div className="bg-zinc-950/40 p-4 rounded-xl border border-zinc-800/50 flex justify-between items-center">
            <span className="text-zinc-400 font-bold">1 λ (Full)</span>
            <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">{lambda.toFixed(3)} m</span>
          </div>
          
          <div className="bg-zinc-950/40 p-4 rounded-xl border border-zinc-800/50 flex justify-between items-center">
            <span className="text-zinc-400 font-bold">2/3 λ</span>
            <span className="text-xl font-black text-cyan-400">{(lambda * (2/3)).toFixed(3)} m</span>
          </div>
          
          <div className="bg-zinc-950/40 p-4 rounded-xl border border-zinc-800/50 flex justify-between items-center">
            <span className="text-zinc-400 font-bold">1/2 λ (Half)</span>
            <span className="text-xl font-black text-blue-400">{(lambda / 2).toFixed(3)} m</span>
          </div>
          
          <div className="bg-zinc-950/40 p-4 rounded-xl border border-zinc-800/50 flex justify-between items-center">
            <span className="text-zinc-400 font-bold">1/4 λ (Quarter)</span>
            <span className="text-xl font-black text-indigo-400">{(lambda / 4).toFixed(3)} m</span>
          </div>
        </div>
      );
    } else {
      const freq = c / val;
      return (
        <Result value={`${freq.toFixed(1)} Hz`} subtext={`Untuk 1 λ sepanjang ${val} meter`} />
      );
    }
  };

  return <ToolCard title="Freq ↔ Wavelength" icon="〰️" desc={`Kecepatan Suara: ${c.toFixed(1)} m/s (sesuai setting utama)`}>
    <div className="flex gap-4 mb-4">
      <button onClick={() => setMode('freq')} className={`flex-1 py-2 rounded-lg text-sm font-bold border ${mode === 'freq' ? 'bg-blue-600 border-blue-500 text-white shadow-lg' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>Input Frequency</button>
      <button onClick={() => setMode('wave')} className={`flex-1 py-2 rounded-lg text-sm font-bold border ${mode === 'wave' ? 'bg-blue-600 border-blue-500 text-white shadow-lg' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>Input Wavelength</button>
    </div>
    <InputGroup label={mode === 'freq' ? "Frequency (Hz)" : "Wavelength (m)"} value={val} step={0.1} onChange={setVal} />
    
    {renderResults()}
  </ToolCard>;
}

// 7. Line Array
function LineArray({ c }: { c: number }) {
  const [len, setLen] = useState(4);
  const [freq, setFreq] = useState(1000);

  const calc = () => {
    return (Math.pow(len, 2) * freq) / (2 * c);
  };

  return <ToolCard title="Line Array Transition" icon="📏" desc="Jarak transisi (Critical Distance) dari near-field (cylindrical) menuju far-field (spherical).">
    <InputGroup label="Total Array Length (m)" value={len} step={0.5} onChange={setLen} />
    <InputGroup label="Frequency (Hz)" value={freq} step={100} onChange={setFreq} />
    <Result value={`${calc().toFixed(2)} m`} />
  </ToolCard>;
}

// 8. Volts
function Volts() {
  const [dBu, setDBu] = useState<string>('0');
  const [dBV, setDBV] = useState<string>('-2.22');
  const [volts, setVolts] = useState<string>('0.7746');

  const onDBu = (v: number) => {
    const V = 0.7746 * Math.pow(10, v/20);
    setDBu(v.toString());
    setVolts(V.toFixed(4));
    setDBV((20 * Math.log10(V)).toFixed(2));
  };
  const onDBV = (v: number) => {
    const V = Math.pow(10, v/20);
    setDBV(v.toString());
    setVolts(V.toFixed(4));
    setDBu((20 * Math.log10(V / 0.7746)).toFixed(2));
  };
  const onV = (v: number) => {
    if (v <= 0) v = 0.0001;
    setVolts(v.toString());
    setDBu((20 * Math.log10(v / 0.7746)).toFixed(2));
    setDBV((20 * Math.log10(v)).toFixed(2));
  };

  return <ToolCard title="dBu ↔ dBV ↔ Volts" icon="⚡" desc="Ketik di salah satu kolom untuk mengkonversi tegangan (Vrms) ke skala logaritmik.">
    <InputGroup label="dBu (Ref: 0.7746V)" value={parseFloat(dBu)} step={0.1} onChange={onDBu} />
    <InputGroup label="dBV (Ref: 1V)" value={parseFloat(dBV)} step={0.1} onChange={onDBV} />
    <InputGroup label="Volts (Vrms)" value={parseFloat(volts)} step={0.1} onChange={onV} />
  </ToolCard>;
}

// 9. Q BW
function QBW() {
  const [val, setVal] = useState(1);
  const [mode, setMode] = useState<'bw' | 'q'>('bw');
  
  const calc = () => {
     if (mode === 'bw') {
        const p = Math.pow(2, val);
        const q = Math.sqrt(p) / (p - 1);
        return { res: `${q.toFixed(3)} Q`, type: 'Q Factor' };
     } else {
        const b = 1/val; 
        const a = Math.pow(b, 2) / 2;
        const bw = Math.log2(1 + a + Math.sqrt(Math.pow(1+a, 2) - 1));
        return { res: `${bw.toFixed(3)} Octaves`, type: 'Bandwidth' };
     }
  };

  const r = calc();

  return <ToolCard title="Q ↔ Bandwidth" icon="🎚️" desc="Konversi tingkat kelebaran filter (Q factor) EQ parametrik ke Bandwidth (Oktaf).">
    <div className="flex gap-4 mb-4">
      <button onClick={() => setMode('bw')} className={`flex-1 py-2 rounded-lg text-sm font-bold border ${mode === 'bw' ? 'bg-amber-600 border-amber-500 text-white shadow-lg' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>Input Bandwidth</button>
      <button onClick={() => setMode('q')} className={`flex-1 py-2 rounded-lg text-sm font-bold border ${mode === 'q' ? 'bg-amber-600 border-amber-500 text-white shadow-lg' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>Input Q Factor</button>
    </div>
    <InputGroup label={mode === 'bw' ? "Bandwidth (Octaves)" : "Q Factor"} value={val} step={0.1} onChange={setVal} />
    <Result value={r.res} subtext={`Hasil ${r.type}`} />
  </ToolCard>;
}

// 10. Limiter
function Limiter() {
  const [power, setPower] = useState(1000);
  const [imp, setImp] = useState(8);
  const [gain, setGain] = useState(32); 

  const calc = () => {
    const vSpk = Math.sqrt(power * imp);
    const vIn = vSpk / Math.pow(10, gain / 20);
    const dbu = 20 * Math.log10(vIn / 0.7746);
    return { vIn, dbu, vSpk };
  };
  const r = calc();

  return <ToolCard title="Limiter Threshold" icon="🛡️" desc="Hitung titik aman Limiter (Threshold) di Processor / DSP agar speaker tidak putus.">
    <InputGroup label="Speaker Continuous RMS (Watts)" value={power} onChange={setPower} />
    <InputGroup label="Speaker Nominal Impedance (Ohms)" value={imp} onChange={setImp} />
    <InputGroup label="Amplifier Gain (dB)" value={gain} onChange={setGain} />
    <Result value={`${r.dbu.toFixed(2)} dBu`} subtext={`Eq. Input: ${r.vIn.toFixed(2)} Vrms | Amp Output: ${r.vSpk.toFixed(1)} Vrms`} />
  </ToolCard>;
}

// 11. Amp Gain
function Gain() {
  const [sens, setSens] = useState(1.4);
  const [power, setPower] = useState(1000);
  const [imp, setImp] = useState(8);

  const calc = () => {
    const vOut = Math.sqrt(power * imp);
    return 20 * Math.log10(vOut / sens);
  };

  return <ToolCard title="Amplifier Gain" icon="📈" desc="Hitung total Voltage Gain (dB) sebuah power amplifier.">
    <InputGroup label="Input Sensitivity (Vrms)" value={sens} step={0.1} onChange={setSens} />
    <InputGroup label="Rated Output Power (Watts)" value={power} onChange={setPower} />
    <InputGroup label="Rated Load Impedance (Ohms)" value={imp} onChange={setImp} />
    <Result value={`${calc().toFixed(2)} dB Voltage Gain`} />
  </ToolCard>;
}

// 12. Cable Low Z
function CableLow() {
  const [len, setLen] = useState(20);
  const [area, setArea] = useState(2.5);
  const [load, setLoad] = useState(8);
  
  const calc = () => {
    const r = (0.0175 * len * 2) / area; 
    const loss = 20 * Math.log10(load / (load + r));
    const powerLoss = (1 - Math.pow(10, loss/10)) * 100;
    return { r, loss, powerLoss };
  };
  const r = calc();

  return <ToolCard title="Speaker Cable (Low Z)" icon="🔌" desc="Hitung rugi daya (Power Loss) pada instalasi kabel speaker impedansi rendah (4/8 ohm).">
    <InputGroup label="Cable Length (m)" value={len} onChange={setLen} />
    <InputGroup label="Cross Section (mm²)" value={area} step={0.5} onChange={setArea} />
    <InputGroup label="Speaker Load (Ohms)" value={load} onChange={setLoad} />
    <Result value={`${r.loss.toFixed(2)} dB Loss`} subtext={`Power Loss: ${r.powerLoss.toFixed(1)}% | Resistance: ${r.r.toFixed(3)} Ω`} />
  </ToolCard>;
}

// 13. Cable High Z
function CableHigh() {
  const [len, setLen] = useState(100);
  const [area, setArea] = useState(1.5);
  const [taps, setTaps] = useState(100); 
  const [volts, setVolts] = useState(100); 
  
  const calc = () => {
    const i = taps / volts;
    const r = (0.0175 * len * 2) / area;
    const vDrop = i * r;
    const vEnd = volts - vDrop;
    const loss = 20 * Math.log10(vEnd / volts);
    const powerLoss = (1 - Math.pow(vEnd/volts, 2)) * 100;
    return { vEnd, loss, powerLoss };
  };
  const r = calc();

  return <ToolCard title="Speaker Cable (High Z)" icon="🏭" desc="Hitung rugi tegangan pada instalasi sistem tata suara gedung (Constant Voltage 70V / 100V).">
    <InputGroup label="Line Voltage (V)" value={volts} onChange={setVolts} />
    <InputGroup label="Total Speaker Taps (Watts)" value={taps} onChange={setTaps} />
    <InputGroup label="Cable Length (m)" value={len} onChange={setLen} />
    <InputGroup label="Cross Section (mm²)" value={area} step={0.5} onChange={setArea} />
    <Result value={`${r.vEnd.toFixed(1)} V diujung (${r.loss.toFixed(2)} dB)`} subtext={`Power Loss: ${r.powerLoss.toFixed(1)}%`} />
  </ToolCard>;
}

// --- UI Helpers ---

function ToolCard({ title, icon, desc, children }: any) {
  return (
    <div className="bg-zinc-950/80 backdrop-blur-xl border border-zinc-700/50 rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.8)] p-6 lg:p-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-3 mb-2">
        <div className="text-4xl filter drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">{icon}</div>
        <h2 className="text-2xl lg:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">{title}</h2>
      </div>
      <p className="text-zinc-400 text-sm mb-6 pb-4 border-b border-zinc-800">{desc}</p>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
}

function InputGroup({ label, value, onChange, step = 1 }: any) {
  return (
    <div className="flex justify-between items-center bg-zinc-900/60 p-3 rounded-lg border border-zinc-800 focus-within:border-blue-500/50 focus-within:bg-zinc-900 transition-colors">
      <label className="text-sm font-semibold text-zinc-300 w-1/2">{label}</label>
      <input 
        type="number" 
        value={value}
        step={step}
        onChange={(e) => {
           const v = e.target.value === '' ? 0 : parseFloat(e.target.value);
           if(!isNaN(v)) onChange(v);
        }}
        className="w-32 bg-black border border-zinc-700 rounded py-2 px-3 text-right font-mono text-lg text-blue-400 focus:outline-none focus:border-blue-500 shadow-inner"
      />
    </div>
  );
}

function Result({ value, subtext }: { value: string, subtext?: string }) {
  return (
    <div className="mt-8 pt-6 border-t border-zinc-800 flex flex-col items-center justify-center bg-zinc-950/40 p-6 rounded-xl border border-zinc-800/50">
      <div className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Result</div>
      <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 text-center">
        {value}
      </div>
      {subtext && <div className="text-zinc-400 text-sm mt-3 font-mono bg-black/50 px-3 py-1 rounded">{subtext}</div>}
    </div>
  );
}
