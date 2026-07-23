import { useState, useEffect } from 'react';
import type { SubwooferSettings, ArrayStats, SubwooferPreset, ReportInfo } from '../types';
import { db } from '../firebase';
import { collection, addDoc, doc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { calculateAirAbsorption } from '../utils';

interface SidebarProps {
  settings: SubwooferSettings;
  onChange: (settings: SubwooferSettings) => void;
  stats: ArrayStats;
  reportInfo: ReportInfo;
  onReportInfoChange: (info: ReportInfo) => void;
  activeProject?: any;
  onCloseProject?: () => void;
  onOpenAutoConfig?: () => void;
}

export function Sidebar({ settings, onChange, stats, reportInfo, onReportInfoChange, onCloseProject, onOpenAutoConfig }: SidebarProps) {
  const [savedPresets, setSavedPresets] = useState<SubwooferPreset[]>([]);
  const [openPanels, setOpenPanels] = useState<Record<number, boolean>>({
    1: true,
    2: false,
    3: false,
    4: false,
    5: true,
    6: false,
  });

  const togglePanel = (panel: number) => {
    setOpenPanels(prev => ({ ...prev, [panel]: !prev[panel] }));
  };

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'presets'), (snapshot) => {
      const presetsData: SubwooferPreset[] = [];
      snapshot.forEach(document => {
         presetsData.push({ id: document.id, ...document.data() } as SubwooferPreset);
      });
      setSavedPresets(presetsData);
    });
    return () => unsubscribe();
  }, []);

  const handleSavePreset = async () => {
    const name = window.prompt('Masukkan Nama Preset Baru (Contoh: "Custom 18 Inch"):');
    if (!name || name.trim() === '') return;
    const newPreset = { name: name.trim(), width: settings.width, height: settings.height, depth: settings.depth, defaultCardioidDelay: Number(settings.cardioidDelay) || 0 };
    try {
      const docRef = await addDoc(collection(db, 'presets'), newPreset);
      onChange({ ...settings, preset: docRef.id });
    } catch (e) {
      console.error('Error adding preset', e);
      alert('Gagal menyimpan ke Cloud Firestore.');
    }
  };

  const handleDeletePreset = async (id: string) => {
    if (!window.confirm('Hapus preset ini secara permanen dari Cloud?')) return;
    try {
      await deleteDoc(doc(db, 'presets', id));
      if (settings.preset === id) onChange({ ...settings, preset: 'Custom' });
    } catch (e) {
      console.error('Error deleting', e);
      alert('Gagal menghapus dari Cloud Firestore.');
    }
  };

  const renderLambdaHelper = (name: keyof typeof settings, val: string | number, colorClass: string = 'text-blue-300/60', isTime: boolean = false) => {
    const f = Number(settings.targetFrequency) || 63;
    const c = Number(settings.speedOfSound) || 343.0;
    const lambda = c / f;
    const periodMs = (1 / f) * 1000;
    
    const baseVal = isTime ? periodMs : lambda;
    const d = Number(val);
    const fraction = d ? (d / baseVal) : 0;
    
    const setFraction = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const frac = Number(e.target.value);
      if (!frac || isNaN(frac)) return;
      const newVal = (baseVal * frac).toFixed(isTime ? 1 : 2);
      onChange({ ...settings, [name]: newVal });
    };

    const isQuarter = Math.abs(fraction - 0.25) < 0.02;
    const isHalf = Math.abs(fraction - 0.5) < 0.02;
    const isTwoThird = Math.abs(fraction - 0.6667) < 0.02;
    const isFull = Math.abs(fraction - 1.0) < 0.02;

    let selectValue = "custom";
    if (isQuarter) selectValue = "0.25";
    else if (isHalf) selectValue = "0.5";
    else if (isTwoThird) selectValue = "0.6667";
    else if (isFull) selectValue = "1";

    return (
      <div className="flex items-center mt-1 w-full">
        <select value={selectValue} onChange={setFraction} className={`w-full bg-black/20 border border-white/5 rounded px-1 py-0.5 outline-none cursor-pointer text-[9px] ${colorClass} font-bold opacity-80 hover:opacity-100 transition-opacity`}>
          {selectValue === 'custom' && <option value="custom" className="bg-zinc-900">≈ {fraction.toFixed(2)} λ @ {f}Hz</option>}
          <option value="0.25" className="bg-zinc-900 text-white">1/4 λ @ {f}Hz</option>
          <option value="0.5" className="bg-zinc-900 text-white">1/2 λ @ {f}Hz</option>
          <option value="0.6667" className="bg-zinc-900 text-white">2/3 λ @ {f}Hz</option>
          <option value="1" className="bg-zinc-900 text-white">1 λ @ {f}Hz</option>
        </select>
      </div>
    );
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      onChange({ ...settings, [name]: checked });
      return;
    }

    if (name === 'preset') {
      const selected = savedPresets.find(p => p.id === value);
      if (selected && value !== 'Custom') {
        const dim = settings.orientation === 'Landscape' ? Number(selected.width) : Number(selected.depth);
        onChange({ 
          ...settings, 
          preset: value, 
          width: selected.width, 
          height: selected.height, 
          depth: selected.depth,
          cardioidDelay: selected.defaultCardioidDelay !== undefined ? selected.defaultCardioidDelay : settings.cardioidDelay,
          centralGap: Number(settings.gap) + dim
        });
      } else {
        onChange({ ...settings, preset: value });
      }
      return;
    }

    let parsedValue: string | number = value;
    if (type === 'number') {
      parsedValue = value === '' ? '' : (parseFloat(value) || 0);
    }

    const newSettings = { ...settings, [name]: parsedValue };

    if (name === 'temperature' || name === 'humidity') {
       const t = name === 'temperature' ? Number(parsedValue) : Number(settings.temperature);
       
       // Formula from Merlijn van Veen - Sonic Atmosphere (Equation 3):
       // c = 331.3 * Math.sqrt(1 + (T / 273.15))
       // Humidity has a negligible effect (< 0.3%) so we can ignore it for practical purposes.
       const c = 331.3 * Math.sqrt(1 + (t / 273.15));
       newSettings.speedOfSound = parseFloat(c.toFixed(2));
    }

    if (name === 'gap' || name === 'width' || name === 'depth' || name === 'orientation') {
      const dim = newSettings.orientation === 'Landscape' ? Number(newSettings.width) : Number(newSettings.depth);
      newSettings.centralGap = Number(newSettings.gap) + dim;
      if (name === 'gap') newSettings.targetFrequency = '';
    }

    if (name === 'centralGap') {
      const dim = newSettings.orientation === 'Landscape' ? Number(newSettings.width) : Number(newSettings.depth);
      newSettings.gap = Math.max(0, Number(newSettings.centralGap) - dim);
      newSettings.centralGap = newSettings.gap + dim;
      newSettings.targetFrequency = '';
    }
    
    if (name === 'targetFrequency' && value) {
      const freq = Number(value);
      if (freq > 0) {
        newSettings.centralGap = (Number(newSettings.speedOfSound) / freq) / 4;
        const dim = newSettings.orientation === 'Landscape' ? Number(newSettings.width) : Number(newSettings.depth);
        newSettings.gap = Math.max(0, newSettings.centralGap - dim);
        newSettings.centralGap = newSettings.gap + dim;
      }
    } else if ((name === 'speedOfSound' || name === 'temperature' || name === 'humidity') && newSettings.targetFrequency) {
      // If speed of sound changes (manually or via temp/hum), update gap if locked to targetFrequency
      const freq = Number(newSettings.targetFrequency);
      if (freq > 0) {
        newSettings.centralGap = (Number(newSettings.speedOfSound) / freq) / 4;
        const dim = newSettings.orientation === 'Landscape' ? Number(newSettings.width) : Number(newSettings.depth);
        newSettings.gap = Math.max(0, newSettings.centralGap - dim);
        newSettings.centralGap = newSettings.gap + dim;
      }
    }

    // Force Rear Invert for Gradient
    const isGradientBehavior = newSettings.setupType.includes('Gradient') || newSettings.setupType === 'Auto-Efficiency' || newSettings.setupType === 'Pattern Implosion';
    if (isGradientBehavior) {
       newSettings.invertRearPolarity = true;
    }

    // Force max rows based on setupType
    if (name === 'setupType' || name === 'rows') {
      let maxAllowed = 2;
      if (newSettings.setupType.includes('End-Fire')) maxAllowed = 10;
      else if (newSettings.setupType === 'Gradient In-Line') maxAllowed = 2;
      else if (newSettings.setupType === 'Gradient Inverted Stack') maxAllowed = 1;
      else if (newSettings.setupType === 'Curved Array') maxAllowed = 2;
      else maxAllowed = 2;
      
      if (Number(newSettings.rows) > maxAllowed) {
        newSettings.rows = maxAllowed;
      }
    }

    onChange(newSettings);
  };

  const handleReset = () => {
    if (window.confirm("Apakah Anda yakin ingin mereset semua nilai konfigurasi? Semua parameter akan dikosongkan.")) {
      onChange({
        setupType: 'Curved Array',
        preset: 'Custom',
        count: '',
        rows: '',
        stack: '',
        gap: '',
        centralGap: '',
        rowSpacing: '',
        rowGap: '',
        theta: '',
        width: '',
        height: '',
        depth: '',
        orientation: 'Landscape',
        arrayFacing: 'Right',
        speedOfSound: '',
        temperature: '',
        humidity: 50,
        frequency: 63,
        targetFrequency: '',
        bandwidth: '1/3 Octave',
        resolution: 'Medium',
        showHeatmap: false,
        cardioid: false,
        cardioidDelay: '',
        invertRearPolarity: false,
        endFireDelayStep: '',
        cardioidReversedBoxes: [],
        cardioidSpacers: false,
        cardioidSpacerSize: 0.15,
        stageWidth: '',
      });
    }
  };

  const handlePrint = () => window.print();

  return (
    <div className="w-full md:w-80 h-full bg-slate-900/40 backdrop-blur-md md:border-r border-white/10 flex flex-col overflow-y-auto">
      <div className="p-6 pb-2">
        <div className="flex justify-between items-start mb-2">
           <div className="flex items-center cursor-pointer group" onClick={() => alert("Sub Forge\nCreated by Sena Sigit\nInstagram: @senatarium\nCopyright 2026")}>
             <img src="/logo.png" alt="Sub Forge Logo" className="w-8 h-8 mr-2 group-hover:scale-110 transition-transform object-contain" />
             <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 leading-tight drop-shadow-lg tracking-tight">Sub Forge</h1>
           </div>
           <div className="flex flex-col space-y-2">
             <div className="flex space-x-2">
               {onOpenAutoConfig && (
                 <button onClick={onOpenAutoConfig} className="bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded text-xs font-bold transition-colors border border-indigo-400 shadow shadow-indigo-500/50 flex-1">
                    🤖 Sena
                 </button>
               )}
               {onCloseProject && (
                 <button onClick={onCloseProject} className="bg-yellow-600 hover:bg-yellow-500 text-black px-2 py-1 rounded text-xs font-bold transition-colors border border-yellow-500 shadow flex-1">
                    📁 Open
                 </button>
               )}
               <button onClick={handleReset} className="bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded text-xs font-bold transition-colors border border-red-500 shadow flex-1">
                  🗑️ Reset
               </button>
             </div>
             <button onClick={handlePrint} className="bg-zinc-800 hover:bg-zinc-700 px-3 py-1 rounded text-xs font-bold text-white transition-colors border border-gray-600 shadow w-full">
                Export PDF
             </button>
           </div>
        </div>
        <p className="text-xs text-yellow-500 font-bold flex items-center mb-4">
           <span className="w-2 h-2 rounded-full bg-yellow-500 mr-2 animate-pulse"></span> Cloud Synced
        </p>

        {Number(settings.count) > 1 && (
          <div className="mb-4 bg-gradient-to-r from-zinc-900/90 to-black border-yellow-500/30 p-4 rounded-xl border border-slate-500/50 space-y-2 shadow-lg backdrop-blur-md">
            <div className="flex justify-between items-center">
               <span className="text-xs text-yellow-400">Total Panjang Array</span>
               <span className="text-sm font-semibold text-yellow-400">{stats.totalArrayLength.toFixed(2)} m</span>
            </div>
            <div className="flex justify-between items-center">
               <span className="text-xs text-yellow-400">Jarak Pusat (S-center)</span>
               <span className="text-sm font-semibold text-amber-100">{stats.acousticCenterSpacing.toFixed(2)} m</span>
            </div>
            <div className="flex justify-between items-center">
               <span className="text-xs text-yellow-400">Batas Freq Atas</span>
               <span className="text-sm font-semibold text-amber-500">{stats.upperFreqLimit.toFixed(0)} Hz</span>
            </div>
            {settings.setupType === 'Curved Array' && Number(settings.theta) > 0 && (
              <div className="pt-2 border-t border-slate-500/50 mt-2">
                <span className="text-[10px] text-fuchsia-400 font-bold block mb-1">Beaming Frequencies (Curved Array)</span>
                <div className="flex justify-between text-[10px] text-fuchsia-300">
                  <span title="F1: Vertical beamwidth equals nominal">F1: {Math.round((21 * 1000) / (stats.totalArrayLength * Math.pow(Number(settings.theta), 0.935)))} Hz</span>
                  <span title="F2: Vertical beamwidth 1/3 narrower">F2: {Math.round((42 * 1000) / (stats.totalArrayLength * Math.pow(Number(settings.theta), 0.935)))} Hz</span>
                  <span title="F3: Vertical beamwidth recovers">F3: {Math.round((189 * 1000) / (stats.totalArrayLength * Math.pow(Number(settings.theta), 0.935)))} Hz</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      <div className="flex-1 px-6 space-y-5 pb-6 overflow-y-auto">
        
        {/* PANEL 1: Konfigurasi Dasar */}
        <div className="bg-gradient-to-br from-zinc-900/80 to-black p-4 rounded-xl border border-white/10 space-y-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-2xl">
          <h3 className="text-sm font-bold text-blue-400 border-b border-blue-500/30 pb-2 cursor-pointer flex justify-between items-center" onClick={() => togglePanel(1)}>
            <span>1. Konfigurasi Dasar</span>
            <span>{openPanels[1] ? "▲" : "▼"}</span>
          </h3>
          {openPanels[1] && (
            <div className="space-y-4 pt-2">
              <div className="flex flex-col">
                <label htmlFor="setupType" className="text-xs font-medium text-blue-400 mb-1">Tipe Setup Array</label>
                <select id="setupType" name="setupType" value={settings.setupType} onChange={handleChange} className="bg-white/5 border border-blue-500/30 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500/50 transition-colors text-sm font-bold text-yellow-300">
                  <optgroup label="ARRAY (Distribusi)">
                    <option value="Curved Array">Curved (Arc Array)</option>
                    <option value="Straight Delayed Array">Straight Delayed Array</option>
                    <option value="L/R">L/R (Kiri/Kanan)</option>
                  </optgroup>
                  <optgroup label="CARDIOID (Tolak Panggung)">
                    <option value="End-Fire">End-Fire (Maju)</option>
                    <option value="End-Fire L/R">End-Fire L/R</option>
                    <option value="Gradient In-Line">Gradient: In-Line (Mundur)</option>
                    <option value="Gradient Inverted Stack">Gradient: Inverted Stack (Tumpuk)</option>
                    <option value="Cardioid L/R">Cardioid L/R</option>
                    <option value="Auto-Efficiency">Auto-Efficiency</option>
                    <option value="Pattern Implosion">Pattern Implosion</option>
                  </optgroup>
                </select>
              </div>
              
              {settings.setupType.includes('L/R') && (
                <div className="flex flex-col">
                  <label htmlFor="stageWidth" className="text-xs font-medium text-blue-400 mb-1">Lebar Panggung (m)</label>
                  <input id="stageWidth" type="number" name="stageWidth" min="1" step="0.5" value={settings.stageWidth} onChange={handleChange} className="bg-white/5 border border-blue-500/30 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500/50 transition-colors" />
                </div>
              )}

              <div className="flex flex-col">
                <label htmlFor="count" className="text-xs font-medium text-blue-400 mb-1">{settings.setupType.includes('L/R') ? 'Total Jumlah Box (Kiri + Kanan)' : 'Total Jumlah Box (Titik Fisik)'}</label>
                <input id="count" type="number" name="count" min={settings.setupType.includes('L/R') ? "2" : "1"} max="32" value={settings.count} onChange={handleChange} className="bg-white/5 border border-blue-500/30 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500/50 transition-colors text-sm font-bold text-yellow-300" />
              </div>
              
              <div className="flex flex-col border-t border-gray-800 pt-3">
                 <label htmlFor="targetFrequency" className="text-xs font-medium text-yellow-300 mb-1">Target Freq (Hz) - Auto 1/4 Lambda</label>
                 <input id="targetFrequency" type="number" name="targetFrequency" min="20" max="200" placeholder="Contoh: 63" value={settings.targetFrequency} onChange={handleChange} className="bg-white/5 border border-blue-500/30 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500/50 transition-colors text-sm" />
              </div>
            </div>
          )}
        </div>

        {/* PANEL 2: Dimensi & Orientasi */}
        <div className="bg-gradient-to-br from-zinc-900/80 to-black p-4 rounded-xl border border-white/10 space-y-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-2xl">
          <h3 className="text-sm font-bold text-indigo-400 border-b border-indigo-500/30 pb-2 cursor-pointer flex justify-between items-center" onClick={() => togglePanel(2)}>
            <span>2. Dimensi Fisik Subwoofer</span>
            <span>{openPanels[2] ? "▲" : "▼"}</span>
          </h3>
          {openPanels[2] && (
            <div className="space-y-4 pt-2">
              <div className="flex flex-col">
                <label htmlFor="preset" className="text-xs font-medium text-indigo-400 mb-1">Preset Subwoofer</label>
                <div className="flex space-x-2">
                   <select id="preset" name="preset" value={settings.preset} onChange={handleChange} className="flex-1 bg-white/5 border border-indigo-500/30 rounded px-3 py-2 text-white focus:outline-none focus:border-indigo-500/50 transition-colors text-xs w-full truncate">
                     <option value="Custom">-- Custom Dimension --</option>
                     {savedPresets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                   </select>
                   {settings.preset !== 'Custom' ? (
                      <button onClick={() => handleDeletePreset(settings.preset)} className="bg-red-900/50 hover:bg-red-900 border border-red-800 text-red-200 px-3 py-2 rounded text-xs transition-colors" title="Hapus Preset">X</button>
                   ) : (
                      <button onClick={handleSavePreset} className="bg-yellow-900/30 hover:bg-yellow-800 border border-indigo-500/30 text-white px-3 py-2 rounded text-xs transition-colors whitespace-nowrap" title="Simpan Dimensi Saat Ini">Save</button>
                   )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="flex flex-col">
                  <label htmlFor="width" className="text-[10px] font-medium text-indigo-400 mb-1">Lebar (W) m</label>
                  <input id="width" type="number" name="width" min="0.1" step="0.05" value={settings.width} onChange={handleChange} className="bg-white/5 border border-indigo-500/30 rounded px-2 py-2 text-white focus:outline-none focus:border-indigo-500/50 transition-colors text-xs" />
                </div>
                <div className="flex flex-col">
                  <label htmlFor="height" className="text-[10px] font-medium text-indigo-400 mb-1">Tinggi (H) m</label>
                  <input id="height" type="number" name="height" min="0.1" step="0.05" value={settings.height} onChange={handleChange} className="bg-white/5 border border-indigo-500/30 rounded px-2 py-2 text-white focus:outline-none focus:border-indigo-500/50 transition-colors text-xs" />
                </div>
                <div className="flex flex-col">
                  <label htmlFor="depth" className="text-[10px] font-medium text-indigo-400 mb-1">Dalam (D) m</label>
                  <input id="depth" type="number" name="depth" min="0.1" step="0.05" value={settings.depth} onChange={handleChange} className="bg-white/5 border border-indigo-500/30 rounded px-2 py-2 text-white focus:outline-none focus:border-indigo-500/50 transition-colors text-xs" />
                </div>
              </div>

              <div className="flex flex-col">
                <label htmlFor="orientation" className="text-xs font-medium text-indigo-400 mb-1">Orientasi Box</label>
                <select id="orientation" name="orientation" value={settings.orientation} onChange={handleChange} className="bg-white/5 border border-indigo-500/30 rounded px-2 py-2 text-white focus:outline-none focus:border-indigo-500/50 transition-colors text-xs">
                  <option value="Landscape">Landscape</option>
                  <option value="Portrait">Portrait</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* PANEL 3: Susunan & Jarak */}
        <div className="bg-gradient-to-br from-zinc-900/80 to-black p-4 rounded-xl border border-white/10 space-y-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-2xl">
          <h3 className="text-sm font-bold text-purple-400 border-b border-purple-500/30 pb-2 cursor-pointer flex justify-between items-center" onClick={() => togglePanel(3)}>
            <span>3. Susunan Matrix & Jarak</span>
            <span>{openPanels[3] ? "▲" : "▼"}</span>
          </h3>
          {openPanels[3] && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col">
                  <label htmlFor="stack" className="text-xs font-medium text-purple-400 mb-1">Stack (Tumpukan)</label>
                  <input id="stack" type="number" name="stack" min="1" step="1" max="6" value={settings.stack} onChange={handleChange} className="bg-white/5 border border-purple-500/30 rounded px-2 py-2 text-white focus:outline-none focus:border-purple-500/50 transition-colors text-sm font-bold text-yellow-300" />
                </div>
                <div className="flex flex-col">
                  <label htmlFor="rows" className="text-xs font-medium text-purple-400 mb-1">Rows (Baris Belakang)</label>
                  <input id="rows" type="number" name="rows" min="1" step="1" max={settings.setupType.includes('End-Fire') ? 10 : settings.setupType.includes('Gradient In-Line') ? 2 : 2} value={settings.rows} onChange={handleChange} className="bg-white/5 border border-purple-500/30 rounded px-2 py-2 text-white focus:outline-none focus:border-purple-500/50 transition-colors text-sm font-bold text-yellow-300" disabled={settings.setupType === 'Gradient Inverted Stack'} />
                </div>
                <div className="flex flex-col">
                  <label htmlFor="rowSpacing" className="text-xs font-medium text-purple-400 mb-1">Jarak Baris (m)</label>
                  <input id="rowSpacing" type="number" name="rowSpacing" min="0" step="0.05" value={settings.rowSpacing} onChange={handleChange} placeholder={((settings.orientation === 'Landscape' ? Number(settings.depth) : Number(settings.width)) + Number(settings.gap)).toFixed(2)} className="bg-white/5 border border-purple-500/30 rounded px-2 py-2 text-white focus:outline-none focus:border-purple-500/50 transition-colors text-sm" />
                  {renderLambdaHelper('rowSpacing', settings.rowSpacing, 'text-purple-300/60')}
                </div>
                <div className="flex flex-col">
                  <label htmlFor="gap" className="text-xs font-medium text-purple-400 mb-1">Sub Gap (m)</label>
                  <input id="gap" type="number" name="gap" min="0" step="0.05" value={settings.gap} onChange={handleChange} className="bg-white/5 border border-purple-500/30 rounded px-2 py-2 text-white focus:outline-none focus:border-purple-500/50 transition-colors text-sm" />
                  {renderLambdaHelper('gap', settings.gap, 'text-purple-300/60')}
                </div>
                <div className="flex flex-col">
                  <label htmlFor="centralGap" className="text-xs font-medium text-purple-400 mb-1">Central Gap (m)</label>
                  <input id="centralGap" type="number" name="centralGap" min="0" step="0.05" value={settings.centralGap} onChange={handleChange} disabled={Number(settings.count) % 2 !== 0 || settings.setupType.includes('L/R')} className={`bg-white/5 border border-purple-500/30 rounded px-2 py-2 text-white focus:outline-none focus:border-purple-500/50 transition-colors text-sm ${(Number(settings.count) % 2 !== 0 || settings.setupType.includes('L/R')) ? 'opacity-50 cursor-not-allowed' : ''}`} />
                  {renderLambdaHelper('centralGap', settings.centralGap, 'text-purple-300/60')}
                </div>
              </div>
              
              {(settings.setupType === 'Curved Array' || settings.setupType === 'Straight Delayed Array' || settings.setupType === 'Auto-Efficiency' || settings.setupType === 'Pattern Implosion') && (
                <div className="flex flex-col pt-3 border-t border-purple-500/30">
                  <label htmlFor="theta" className="text-xs font-medium text-yellow-300 mb-1">Sudut Cakupan (Theta) °</label>
                  <input id="theta" type="number" name="theta" min="0" max="180" value={settings.theta} onChange={handleChange} className="bg-white/5 border border-purple-500/30 rounded px-3 py-2 text-white focus:outline-none focus:border-purple-500/50 transition-colors font-bold" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* PANEL 4: Tuning Cardioid / Gradient */}
        {(!settings.setupType.includes('End-Fire') && !settings.setupType.includes('L/R') && (settings.setupType.includes('Gradient') || Number(settings.stack) > 1 || settings.setupType.includes('Array'))) && (
          <div className="bg-gradient-to-br from-zinc-900/80 to-black p-4 rounded-xl border border-white/10 space-y-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-2xl">
            <h3 className="text-sm font-bold text-fuchsia-400 border-b border-fuchsia-500/30 pb-2 cursor-pointer flex justify-between items-center" onClick={() => togglePanel(4)}>
              <span>4. Tuning Cardioid / Gradient</span>
              <span>{openPanels[4] ? "▲" : "▼"}</span>
            </h3>
            {openPanels[4] && (
              <div className="space-y-4 pt-2">
                <div className="flex items-center">
                  <input type="checkbox" id="cardioid" name="cardioid" checked={settings.cardioid} onChange={handleChange} disabled={settings.setupType.includes('Gradient')} className="w-4 h-4 rounded border-gray-300 text-fuchsia-400 focus:ring-fuchsia-500 bg-black/20 disabled:opacity-50" />
                  <label htmlFor="cardioid" className="ml-2 text-xs font-bold text-fuchsia-400">Aktifkan Gradient Cardioid</label>
                </div>
                
                {(settings.cardioid || settings.setupType.includes('Gradient')) && (
                  <div className="flex flex-col bg-white/5 p-3 rounded-lg border border-fuchsia-500/20">
                    {!settings.setupType.includes('Gradient In-Line') && (
                      <>
                        <label className="text-[10px] font-medium text-fuchsia-400 mb-2">Pilih Box Menghadap Belakang (Reversed)</label>
                        <div className="flex flex-wrap gap-3 mb-3">
                          {Array.from({ length: Number(settings.stack) }).map((_, i) => (
                             <label key={i} className="flex flex-col items-center cursor-pointer">
                                <span className="text-[10px] text-fuchsia-400 font-bold mb-1">Box {i + 1}</span>
                                <input 
                                  type="checkbox"
                                  checked={settings.cardioidReversedBoxes[i] || false}
                                  onChange={(e) => {
                                     const newRev = [...settings.cardioidReversedBoxes];
                                     newRev[i] = e.target.checked;
                                     onChange({ ...settings, cardioidReversedBoxes: newRev });
                                  }}
                                  className="w-4 h-4 text-fuchsia-500 bg-white/5 border-gray-500 rounded focus:ring-fuchsia-400"
                                />
                             </label>
                          ))}
                        </div>
                      </>
                    )}
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col">
                        <label htmlFor="cardioidDelay" className="text-[10px] font-medium text-yellow-300 mb-1">Rear Additional Delay (ms)</label>
                        <input id="cardioidDelay" type="number" name="cardioidDelay" min="0" step="0.1" value={settings.cardioidDelay} onChange={handleChange} className="bg-white/5 border border-fuchsia-500/30 rounded px-2 py-1.5 text-white focus:outline-none focus:border-fuchsia-500/50 transition-colors text-sm w-full font-bold" />
                        {renderLambdaHelper('cardioidDelay', settings.cardioidDelay, 'text-fuchsia-300/60', true)}
                      </div>
                      <label className="flex items-center space-x-2 cursor-pointer bg-fuchsia-900/40 px-2 py-2 rounded border border-fuchsia-500/30">
                        <input type="checkbox" checked={settings.invertRearPolarity} onChange={(e) => onChange({ ...settings, invertRearPolarity: e.target.checked })} className="w-3 h-3 text-fuchsia-500 bg-black/20 border-fuchsia-500/50 rounded focus:ring-fuchsia-400" />
                        <span className="text-[10px] font-bold text-fuchsia-300">Invert Rear Phase (180°)</span>
                      </label>
                      <div className="flex flex-col border border-fuchsia-500/20 rounded p-2 bg-black/30 space-y-2 mt-2">
                         <label className="flex items-center space-x-2 cursor-pointer">
                           <input type="checkbox" name="cardioidSpacers" checked={settings.cardioidSpacers} onChange={handleChange} className="w-3 h-3 text-fuchsia-500 bg-black/20 border-fuchsia-500/50 rounded focus:ring-fuchsia-400" />
                           <span className="text-[10px] font-bold text-fuchsia-300" title="Mind the Gap: Celah udara menstabilkan baffle">Sisipkan Celah Udara (Spacers)</span>
                         </label>
                         {settings.cardioidSpacers && (
                            <div className="flex items-center justify-between ml-5">
                              <label htmlFor="cardioidSpacerSize" className="text-[9px] text-fuchsia-400/80">Tebal Celah (m):</label>
                              <input id="cardioidSpacerSize" type="number" name="cardioidSpacerSize" min="0" step="0.01" value={settings.cardioidSpacerSize} onChange={handleChange} className="w-16 bg-white/5 border border-fuchsia-500/30 rounded px-1.5 py-1 text-white focus:outline-none focus:border-fuchsia-500/50 text-[10px]" />
                            </div>
                         )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* PANEL 5: Heatmap & Lingkungan */}
        <div className="bg-gradient-to-br from-zinc-900/80 to-black p-4 rounded-xl border border-white/10 space-y-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-2xl">
          <div className="flex justify-between items-center border-b border-rose-500/30 pb-2">
             <h3 className="text-sm font-bold text-rose-400 flex-1 cursor-pointer" onClick={() => togglePanel(5)}>
               5. Analisis Heatmap & Udara {openPanels[5] ? "▲" : "▼"}
             </h3>
          </div>
          {openPanels[5] && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center bg-rose-900/40 px-3 py-2 rounded-lg border border-rose-500/30 mb-2">
                <input type="checkbox" id="showHeatmap" name="showHeatmap" checked={settings.showHeatmap} onChange={handleChange} className="w-4 h-4 rounded border-gray-300 text-rose-400 focus:ring-rose-500 bg-black/20" />
                <label htmlFor="showHeatmap" className="ml-2 text-xs font-bold text-rose-400 flex-1 cursor-pointer">Tampilkan SPL Heatmap</label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col">
                  <label htmlFor="frequency" className="text-[10px] font-medium text-rose-400 mb-1">Frekuensi Pusat (Hz)</label>
                  <input id="frequency" type="number" name="frequency" min="20" max="200" value={settings.frequency} onChange={handleChange} disabled={!settings.showHeatmap} className="bg-white/5 border border-rose-500/30 rounded px-2 py-1.5 text-white focus:outline-none focus:border-rose-500/50 transition-colors text-xs font-bold disabled:opacity-50" />
                </div>
                <div className="flex flex-col">
                  <label htmlFor="bandwidth" className="text-[10px] font-medium text-rose-400 mb-1">Bandwidth</label>
                  <select id="bandwidth" name="bandwidth" value={settings.bandwidth} onChange={handleChange} disabled={!settings.showHeatmap} className="bg-white/5 border border-rose-500/30 rounded px-2 py-1.5 text-white focus:outline-none focus:border-rose-500/50 transition-colors text-[11px] disabled:opacity-50">
                    <option value="Single">Single Tone</option>
                    <option value="1/3 Octave">1/3 Octave</option>
                    <option value="1 Octave">1 Octave</option>
                    <option value="Broadband">Broadband</option>
                  </select>
                </div>
                <div className="flex flex-col col-span-2">
                  <label htmlFor="resolution" className="text-[10px] font-medium text-rose-400 mb-1">Kualitas Render Peta</label>
                  <select id="resolution" name="resolution" value={settings.resolution} onChange={handleChange} disabled={!settings.showHeatmap} className="bg-white/5 border border-rose-500/30 rounded px-3 py-1.5 text-white focus:outline-none focus:border-rose-500/50 transition-colors text-xs disabled:opacity-50">
                    <option value="Low">Low (Cepat)</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High (Detail/HD)</option>
                  </select>
                </div>
              </div>
              
              <div className="border-t border-rose-500/30 pt-3 mt-2 space-y-3">
                 <h4 className="text-[11px] font-bold text-yellow-300">Kondisi Udara (Mempengaruhi Suara)</h4>
                 <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col">
                      <label htmlFor="temperature" className="text-[10px] font-medium text-rose-400 mb-1">Suhu (°C)</label>
                      <input id="temperature" type="number" name="temperature" placeholder="20" value={settings.temperature} onChange={handleChange} className="bg-white/5 border border-rose-500/30 rounded px-2 py-1.5 text-white focus:outline-none focus:border-rose-500/50 transition-colors text-xs" />
                    </div>
                    <div className="flex flex-col">
                      <label htmlFor="humidity" className="text-[10px] font-medium text-rose-400 mb-1">Kelembapan (%)</label>
                      <input id="humidity" type="number" name="humidity" placeholder="50" min="0" max="100" value={settings.humidity} onChange={handleChange} className="bg-white/5 border border-rose-500/30 rounded px-2 py-1.5 text-white focus:outline-none focus:border-rose-500/50 transition-colors text-xs" />
                    </div>
                 </div>
                 <div className="flex flex-col">
                   <label htmlFor="speedOfSound" className="text-[10px] font-medium text-rose-400 mb-1">Kecepatan Suara (m/s)</label>
                   <input id="speedOfSound" type="number" name="speedOfSound" placeholder="343" step="0.1" value={settings.speedOfSound} onChange={handleChange} className="bg-black/30 border border-rose-500/30 rounded px-3 py-2 text-rose-400 focus:outline-none focus:border-rose-500/50 transition-colors text-sm font-bold shadow-inner" />
                 </div>
              </div>
              
              <div className="border-t border-rose-500/30 pt-3 mt-2 space-y-3">
                <h4 className="text-[11px] font-bold text-yellow-300">Array Shading Strategy (Line Array)</h4>
                <p className="text-[9px] text-rose-300/80 leading-snug">Rekomendasi kompensasi HF berdasarkan redaman udara (Jarak 50m @ 10kHz).</p>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-rose-400">HF Shelf (Bottom Zone):</span>
                  <span className="font-bold text-white">0 dB (Full Range)</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-rose-400">HF Shelf (Top Zone):</span>
                  <span className="font-bold text-rose-500">
                    +{ (calculateAirAbsorption(10000, Number(settings.temperature)||20, Number(settings.humidity)||50) * 50).toFixed(1) } dB
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* PANEL 6: Data Export PDF */}
        <div className="bg-gradient-to-br from-zinc-900/80 to-black p-4 rounded-xl border border-white/10 space-y-3 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-2xl mb-4">
          <h3 className="text-sm font-bold text-emerald-400 border-b border-emerald-500/30 pb-2 cursor-pointer flex justify-between items-center" onClick={() => togglePanel(6)}>
            <span>6. Data Info Proyek</span>
            <span>{openPanels[6] ? "▲" : "▼"}</span>
          </h3>
          {openPanels[6] && (
            <div className="space-y-4 pt-2">
              <div className="flex flex-col">
                <input type="text" title="Nama Project / Acara" placeholder="Nama Project / Acara" value={reportInfo.project} onChange={(e) => onReportInfoChange({...reportInfo, project: e.target.value})} className="bg-white/5 border border-emerald-500/30 rounded px-3 py-2 text-white focus:outline-none focus:border-emerald-500/50 transition-colors text-xs" />
              </div>
              <div className="flex flex-col">
                <input type="text" title="Venue / Lokasi" placeholder="Venue / Lokasi" value={reportInfo.venue} onChange={(e) => onReportInfoChange({...reportInfo, venue: e.target.value})} className="bg-white/5 border border-emerald-500/30 rounded px-3 py-2 text-white focus:outline-none focus:border-emerald-500/50 transition-colors text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="text" title="System Engineer" placeholder="System Engineer" value={reportInfo.engineer} onChange={(e) => onReportInfoChange({...reportInfo, engineer: e.target.value})} className="bg-white/5 border border-emerald-500/30 rounded px-2 py-2 text-white focus:outline-none focus:border-emerald-500/50 transition-colors text-xs" />
                <input type="date" title="Tanggal Acara" value={reportInfo.date} onChange={(e) => onReportInfoChange({...reportInfo, date: e.target.value})} className="bg-white/5 border border-emerald-500/30 rounded px-2 py-2 text-white focus:outline-none focus:border-emerald-500/50 transition-colors text-[10px]" />
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
