import { useEffect, useState } from 'react';
import type { SubwooferSettings, SetupType, VenueArea, SubwooferPreset } from '../types';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';

interface AutoConfigModalProps {
  onClose: () => void;
  onApply: (updates: Partial<SubwooferSettings>) => void;
  currentSettings: SubwooferSettings;
  areas: VenueArea[];
}

export const AutoConfigModal: React.FC<AutoConfigModalProps> = ({ onClose, onApply, currentSettings, areas }) => {
  const [boxCount, setBoxCount] = useState<number>(Number(currentSettings.count) || 4);
  const [priority, setPriority] = useState<'Coverage' | 'Throw' | 'Rejection' | 'Gradient' | 'Cardioid' | 'Balanced'>('Coverage');
  const [alignmentStrategy, setAlignmentStrategy] = useState<'Monarchy' | 'Democracy'>('Democracy');

  const [areaWidth, setAreaWidth] = useState<number>(20);
  const [areaDepth, setAreaDepth] = useState<number>(30);
  const [targetFreq, setTargetFreq] = useState<number>(Number(currentSettings.targetFrequency) || 63);

  const [recommendation, setRecommendation] = useState<Partial<SubwooferSettings> | null>(null);
  const [explanation, setExplanation] = useState<string>('');

  const [isLR, setIsLR] = useState<boolean>(false);
  const [audienceAreaId, setAudienceAreaId] = useState<string>('');
  const [stageAreaId, setStageAreaId] = useState<string>('');
  
  const [savedPresets, setSavedPresets] = useState<SubwooferPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(currentSettings.preset);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'presets'), (snapshot) => {
      const presetsData: SubwooferPreset[] = [];
      snapshot.forEach((document) => {
         presetsData.push({ id: document.id, ...document.data() } as SubwooferPreset);
      });
      setSavedPresets(presetsData);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Try to auto-detect Audience area
    const audienceArea = areas.find(a => a.name.toLowerCase().includes('audience') || a.name.toLowerCase().includes('penonton'));
    if (audienceArea) {
       setAudienceAreaId(audienceArea.id);
       const width = audienceArea.shape === 'Circle' ? audienceArea.radius * 2 : Math.max(audienceArea.width || 0, audienceArea.topWidth || 0, audienceArea.bottomWidth || 0);
       const depth = audienceArea.shape === 'Circle' ? audienceArea.radius * 2 : (audienceArea.height || 0);
       if (width > 0) setAreaWidth(width);
       if (depth > 0) setAreaDepth(depth);
    }
    const stageArea = areas.find(a => a.name.toLowerCase().includes('stage') || a.name.toLowerCase().includes('panggung'));
    if (stageArea) {
       setStageAreaId(stageArea.id);
    }
  }, [areas]);

  const calculateRecommendedBoxes = () => {
    const speedOfSound = Number(currentSettings.speedOfSound) || 343;
    const lambda = speedOfSound / targetFreq;
    const quarterLambda = lambda / 4;
    const halfLambda = lambda / 2;
    
    let availableSpace = areaDepth; 
    let availableWidth = areaWidth;
    if (stageAreaId && audienceAreaId) {
       const stageArea = areas.find(a => a.id === stageAreaId);
       const audArea = areas.find(a => a.id === audienceAreaId);
       if (stageArea && audArea) {
          const stageFront = stageArea.y - ((stageArea.height || 0) / 2);
          const audFront = audArea.y + ((audArea.height || 0) / 2);
          availableSpace = Math.abs(stageFront - audFront);
          
          const sW = stageArea.shape === 'Circle' ? stageArea.radius * 2 : Math.max(stageArea.width || 0, stageArea.topWidth || 0, stageArea.bottomWidth || 0);
          const aW = audArea.shape === 'Circle' ? audArea.radius * 2 : Math.max(audArea.width || 0, audArea.topWidth || 0, audArea.bottomWidth || 0);
          // Prioritaskan lebar panggung, jika tidak ada, gunakan lebar penonton tapi batasi maksimal 12 meter
          availableWidth = sW > 0 ? sW : Math.min(aW, 12);
       }
    }

    // Target physical length is roughly 50% of the audience width to achieve good pattern control
    // But constrained by available width
    let targetLength = Math.min(areaWidth * 0.5, availableWidth);
    
    // Max columns that can physically fit
    const maxColsFit = Math.floor(availableWidth / halfLambda) + 1;
    let estCols = Math.ceil(targetLength / halfLambda) + 1;
    if (estCols > maxColsFit) estCols = maxColsFit;
    
    let estTotal = estCols;
    
    if (priority === 'Rejection' || priority === 'Gradient' || priority === 'Balanced') {
       if (availableSpace >= quarterLambda) {
          estTotal = Math.max(4, estCols * 2); 
       }
    } else if (priority === 'Cardioid') {
       estTotal = Math.max(3, estCols * 3);
    }
    
    if (isLR) {
       estTotal = Math.max(4, Math.ceil(estTotal / 2) * 2); 
    }
    
    setBoxCount(Math.max(2, Math.min(estTotal, 48)));
  };

  const calculateConfig = () => {
    const speedOfSound = Number(currentSettings.speedOfSound) || 343;
    const lambda = speedOfSound / targetFreq;
    const quarterLambda = lambda / 4;
    const halfLambda = lambda / 2;

    let availableSpace = 100;
    let availableWidth = areaWidth;
    const audienceArea = areas.find(a => a.id === audienceAreaId);
    const stageArea = areas.find(a => a.id === stageAreaId);
    if (audienceArea && stageArea) {
      const stageBottom = stageArea.y + (stageArea.shape === 'Circle' ? stageArea.radius * 2 : (stageArea.height || 0));
      const audienceTop = audienceArea.y;
      if (audienceTop > stageBottom) {
         availableSpace = audienceTop - stageBottom;
      }
      
      const sW = stageArea.shape === 'Circle' ? stageArea.radius * 2 : Math.max(stageArea.width || 0, stageArea.topWidth || 0, stageArea.bottomWidth || 0);
      const aW = audienceArea.shape === 'Circle' ? audienceArea.radius * 2 : Math.max(audienceArea.width || 0, audienceArea.topWidth || 0, audienceArea.bottomWidth || 0);
      availableWidth = sW > 0 ? sW : Math.min(aW, 12);
    }

    let recSetup: SetupType = isLR ? 'L/R' : 'Curved Array';
    let recTheta = 0;
    let recGap = halfLambda;
    let recRows = 1;
    let recRowSpacing = 0;
    let recCount = boxCount;
    let reason = '';
    let invertRear = false;

    let cardioidRev: boolean[] | undefined;
    const selectedPreset = savedPresets.find(p => p.id === selectedPresetId);
    const cardDelayMs = selectedPreset?.defaultCardioidDelay ?? 4;
    const boxWidth = selectedPreset?.width ?? 0.6;
    
    // gap is physical distance between edges, so acoustic spacing = gap + boxWidth
    const maxAcousticSpacing = speedOfSound / (2 * 99);
    let idealAcousticSpacing = halfLambda;
    let gapLabel = "1/2 Lambda";
    
    if (halfLambda > maxAcousticSpacing) {
        if (quarterLambda <= maxAcousticSpacing) {
            idealAcousticSpacing = quarterLambda;
            gapLabel = "1/4 Lambda";
        } else {
            idealAcousticSpacing = maxAcousticSpacing;
            gapLabel = "Maksimum (Batas 99Hz)";
        }
    }
    
    recGap = Math.max(0, idealAcousticSpacing - boxWidth);

    const angleRad = 2 * Math.atan((areaWidth / 2) / areaDepth);
    const calculatedTheta = Math.round(angleRad * (180 / Math.PI));
    
    // Apply Democracy vs Monarchy rules
    if (alignmentStrategy === 'Democracy') {
       if (isLR) {
          reason += "⚠️ DEMOCRACY: Anda memilih setup L/R yang inherently memiliki Power Alleys. Untuk hasil penyebaran merata, sangat disarankan menggunakan setup Center (seperti Curved Array / Arc).\n";
       }
    } else {
       if (!isLR && priority === 'Coverage') {
          reason += "👑 MONARCHY: Fokus fase sempurna di FOH. Memaksimalkan impact di tengah namun mengorbankan pinggiran.\n";
       }
    }

    if (priority === 'Coverage') {
      recSetup = isLR ? 'L/R' : 'Curved Array';
      recTheta = calculatedTheta;
      reason += isLR 
        ? `L/R Array dipilih karena konfigurasi dipaksa Kiri/Kanan. Jarak antar box diset ke ${gapLabel} untuk menjaga batas frekuensi atas (>= 99Hz).` 
        : `Curved Array dipilih untuk menyebarkan suara merata ke lebar ${areaWidth}m. Sudut (Theta) diatur ke ${recTheta}°. Spacing diset ke ${gapLabel} (menjaga aliasing di atas 99Hz).`;
        
    } else if (priority === 'Throw') {
      recSetup = isLR ? 'L/R' : 'Straight Delayed Array'; 
      recTheta = 0; 
      reason += isLR
        ? "Setup L/R lurus dipilih untuk memfokuskan energi lurus ke depan sejauh mungkin."
        : `Straight Array (0°) dipilih untuk daya dorong ke depan secara maksimum. Jarak ${gapLabel}.`;
        
    } else if (priority === 'Cardioid') {
      recSetup = isLR ? 'L/R' : 'Curved Array';
      recTheta = calculatedTheta;
      recRows = 1;
      invertRear = true; // MUST BE TRUE for Cardioid Tumpuk to work
      
      let stackNeeded = 3;
      if (boxCount < 3) stackNeeded = 2; 
      
      recCount = Math.max(1, Math.floor(boxCount / stackNeeded));
      if (isLR && recCount < 2) recCount = 2;
      
      cardioidRev = stackNeeded === 3 ? [true, false, false] : [true, false]; 
      
      reason = isLR 
         ? `Cardioid L/R dipilih! Disusun menumpuk (stacked). Box paling bawah menghadap ke belakang (di-invert & di-delay) untuk meredam panggung.`
         : `Cardioid (Tumpuk) dipilih! Terdapat ${recCount} kolom tersusun melengkung sebesar ${recTheta}°. Box paling bawah di-reverse untuk meredam panggung.`;

    } else if (priority === 'Rejection') {
      recSetup = isLR ? 'End-Fire L/R' : 'End-Fire';
      recRows = 2; 
      recCount = Math.floor(boxCount / 2);
      if (recCount < 1) recCount = 1;
      recRowSpacing = quarterLambda;
      
      if (availableSpace < quarterLambda) {
         recSetup = isLR ? 'Cardioid L/R' : 'Gradient In-Line';
         invertRear = true;
         reason = `🚨 Ruang kosong panggung (${availableSpace.toFixed(1)}m) tidak cukup untuk End-Fire! Beralih ke ${recSetup} untuk menolak bass dengan aman.`;
      } else {
         reason = `${recSetup} (2-Elemen) dipilih. Jarak antar kolom ${gapLabel} (efisien) dan jarak belakang 1/4 Lambda. Konfigurasi ini mendorong bass maju sejauh mungkin.`;
      }
    } else if (priority === 'Gradient') {
      recSetup = isLR ? 'Cardioid L/R' : 'Gradient In-Line';
      recRows = 2;
      recCount = Math.floor(boxCount / 2);
      if (recCount < 1) recCount = 1;
      recRowSpacing = quarterLambda;
      invertRear = true;
      reason = isLR 
         ? `Gradient L/R dipilih! Disusun 2 baris (depan-belakang). Invert Polarity aktif, jarak belakang 1/4 Lambda.`
         : `Gradient Array dipilih! Disusun ${recCount} kolom x 2 baris untuk membatalkan suara ke panggung (Rejection). Invert Polarity aktif dan jarak 1/4 Lambda.`;
    } else if (priority === 'Balanced') {
      recSetup = isLR ? 'L/R' : 'Straight Delayed Array';
      recRows = 2;
      recTheta = calculatedTheta;
      recRowSpacing = quarterLambda;
      recCount = Math.floor(boxCount / 2);
      if (recCount < 1) recCount = 1;
      invertRear = true;
      
      reason = isLR 
        ? `The Holy Grail L/R: Kombinasi jarak ke samping ${gapLabel} (efisiensi terjaga) dan 1/4 Lambda ke belakang (rejection belakang maksimal).`
        : `🌟 THE HOLY GRAIL (Balanced): Straight Delayed Array dikombinasikan dengan Gradient 2-Baris! Jarak antar kolom ${gapLabel} menjaga aliasing di atas 99Hz. Otomatis di-delay untuk menyebar merata ${recTheta}°. Baris belakang berjarak 1/4 Lambda menyapu bersih panggung!`;
    }

    const physicalGap = recGap > 0 ? recGap : 1;
    let maxCols = Math.floor(availableWidth / physicalGap) + 1;
    if (isLR) {
       maxCols = Math.max(2, Math.floor(maxCols / 2) * 2); 
    }
    if (maxCols < 1) maxCols = 1;
    
    let finalCount = Math.min(recCount, maxCols);
    if (isLR && finalCount < 2) finalCount = 2; 
    
    let finalStack = Math.floor(boxCount / (finalCount * recRows));
    if (finalStack < 1) finalStack = 1;
    
    if (finalStack > 1) {
       reason += ` Lahan horisontal (${availableWidth.toFixed(1)}m) terbatas, box di-stack setinggi ${finalStack} tumpukan.`;
    }

    const recOutput: any = {
      setupType: recSetup,
      count: finalCount,
      theta: recTheta,
      gap: parseFloat(recGap.toFixed(2)),
      rowSpacing: parseFloat(recRowSpacing.toFixed(2)),
      centralGap: parseFloat((recGap + boxWidth).toFixed(2)),
      rows: recRows,
      stack: finalStack,
      targetFrequency: targetFreq,
      invertRearPolarity: invertRear,
      cardioid: (priority === 'Cardioid' || priority === 'Balanced' || priority === 'Gradient' || priority === 'Rejection'),
    };
    
    if (priority === 'Cardioid' && cardioidRev) {
       recOutput.cardioidReversedBoxes = cardioidRev;
       recOutput.cardioidDelay = cardDelayMs;
    } else if (priority === 'Balanced' || priority === 'Gradient') {
       recOutput.cardioidDelay = cardDelayMs;
    }

    if (selectedPresetId !== 'Custom') {
       const selectedPreset = savedPresets.find(p => p.id === selectedPresetId);
       if (selectedPreset) {
         recOutput.preset = selectedPresetId;
         recOutput.width = selectedPreset.width;
         recOutput.height = selectedPreset.height;
         recOutput.depth = selectedPreset.depth;
         if (recOutput.cardioid && selectedPreset.defaultCardioidDelay !== undefined) {
            recOutput.cardioidDelay = selectedPreset.defaultCardioidDelay;
         }
       }
    }

    setRecommendation(recOutput);
    setExplanation(reason);
  };

  const handleApply = () => {
    if (recommendation) {
      onApply(recommendation);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-gradient-to-b from-zinc-900/80 to-black border border-white/10 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-4 border-b border-white/10 bg-indigo-900/20">
          <h2 className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 flex items-center">
            <span className="mr-2 text-xl">🤖</span> Sena Recomendation
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto overflow-x-hidden">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-bold text-gray-400">Jumlah Subwoofer</label>
                <button onClick={calculateRecommendedBoxes} className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30 hover:bg-indigo-500/40 transition-colors" title="Hitung estimasi box ideal berdasarkan ukuran area">🪄 Hitung Ideal</button>
              </div>
              <input type="number" min="2" value={boxCount} onChange={(e) => setBoxCount(Number(e.target.value))} className="w-full bg-white/5 border border-indigo-500/30 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Target Freq (Hz)</label>
              <input type="number" value={targetFreq} onChange={(e) => setTargetFreq(Number(e.target.value))} className="w-full bg-white/5 border border-indigo-500/30 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
            </div>
          </div>
          
          <div className="mb-4">
            <label className="block text-xs font-bold text-gray-400 mb-1">Strategi Penyelarasan Spasial (Error Redistribution)</label>
            <div className="flex bg-black/40 border border-indigo-500/30 rounded-lg p-1">
              <button 
                type="button"
                onClick={() => setAlignmentStrategy('Monarchy')}
                className={`flex-1 py-1.5 text-[11px] font-bold rounded-md transition-all ${alignmentStrategy === 'Monarchy' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
              >
                👑 Monarchy (FOH Impact)
              </button>
              <button 
                type="button"
                onClick={() => setAlignmentStrategy('Democracy')}
                className={`flex-1 py-1.5 text-[11px] font-bold rounded-md transition-all ${alignmentStrategy === 'Democracy' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
              >
                🤝 Democracy (Pemerataan)
              </button>
            </div>
            <p className="text-[9px] text-gray-500 mt-1">
               {alignmentStrategy === 'Monarchy' ? 'Fokus menyelaraskan fase sempurna di satu titik (FOH), mengorbankan area lain (berisiko Power Alleys).' : 'Fokus mendistribusikan error secara spasial agar fase merata ke seluruh penonton, mengurangi parahnya Power Alleys.'}
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-bold text-gray-400 mb-1">Preset Subwoofer</label>
            <select value={selectedPresetId} onChange={(e) => setSelectedPresetId(e.target.value)} className="w-full bg-white/5 border border-indigo-500/30 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
              <option value="Custom">Custom (Manual)</option>
              {savedPresets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Target Area (Audience)</label>
              <select value={audienceAreaId} onChange={(e) => {
                setAudienceAreaId(e.target.value);
                const area = areas.find(a => a.id === e.target.value);
                if (area) {
                  const width = area.shape === 'Circle' ? area.radius * 2 : Math.max(area.width || 0, area.topWidth || 0, area.bottomWidth || 0);
                  const depth = area.shape === 'Circle' ? area.radius * 2 : (area.height || 0);
                  if (width > 0) setAreaWidth(width);
                  if (depth > 0) setAreaDepth(depth);
                }
              }} className="w-full bg-white/5 border border-indigo-500/30 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                <option value="">-- Pilih Area (Manual) --</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.name} ({a.shape})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Sumber Area (Stage)</label>
              <select value={stageAreaId} onChange={(e) => setStageAreaId(e.target.value)} className="w-full bg-white/5 border border-indigo-500/30 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                <option value="">-- Pilih Area (Abaikan) --</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.name} ({a.shape})</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Lebar Area Audience (m)</label>
              <input type="number" value={areaWidth} onChange={(e) => setAreaWidth(Number(e.target.value))} className="w-full bg-white/5 border border-indigo-500/30 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">Kedalaman Area Audience (m)</label>
              <input type="number" value={areaDepth} onChange={(e) => setAreaDepth(Number(e.target.value))} className="w-full bg-white/5 border border-indigo-500/30 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
            </div>
          </div>
          {areas.length === 0 && (
            <div className="text-xs text-yellow-500 bg-yellow-500/10 border border-yellow-500/30 p-2 rounded">
              💡 <strong>Tips:</strong> Buat area bernama "Audience" dan "Stage" di Area Manager agar ukuran & spasi diisi otomatis!
            </div>
          )}
          
          <div className="flex items-center bg-indigo-900/20 px-3 py-2 rounded-lg border border-indigo-500/30">
            <input type="checkbox" id="isLR" checked={isLR} onChange={e => setIsLR(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-indigo-400 focus:ring-indigo-500 bg-black/20" />
            <label htmlFor="isLR" className="ml-2 text-xs font-bold text-indigo-300 cursor-pointer">Harus L/R (Pisahkan ke Kiri & Kanan Panggung)</label>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 mb-2">Fokus Utama (Prioritas)</label>
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => setPriority('Balanced')}
                className={`col-span-2 py-2 px-1 rounded border text-xs font-bold transition-all ${priority === 'Balanced' ? 'bg-pink-500/20 border-pink-400 text-pink-300' : 'bg-white/5 border-white/10 text-gray-500 hover:bg-white/10'}`}
              >
                🌟 Paling Terbaik (The Holy Grail)
              </button>
              <button 
                onClick={() => setPriority('Coverage')}
                className={`py-2 px-1 rounded border text-xs font-bold transition-all ${priority === 'Coverage' ? 'bg-blue-500/20 border-blue-400 text-blue-300' : 'bg-white/5 border-white/10 text-gray-500 hover:bg-white/10'}`}
              >
                📡 Merata (Coverage)
              </button>
              <button 
                onClick={() => setPriority('Throw')}
                className={`py-2 px-1 rounded border text-xs font-bold transition-all ${priority === 'Throw' ? 'bg-orange-500/20 border-orange-400 text-orange-300' : 'bg-white/5 border-white/10 text-gray-500 hover:bg-white/10'}`}
              >
                🚀 Tembak Jauh (Throw)
              </button>
              <button 
                onClick={() => setPriority('Rejection')}
                className={`py-2 px-1 rounded border text-xs font-bold transition-all ${priority === 'Rejection' ? 'bg-purple-500/20 border-purple-400 text-purple-300' : 'bg-white/5 border-white/10 text-gray-500 hover:bg-white/10'}`}
              >
                Maju (End-Fire)
              </button>
              <button 
                onClick={() => setPriority('Gradient')}
                className={`py-2 px-1 rounded border text-xs font-bold transition-all ${priority === 'Gradient' ? 'bg-teal-500/20 border-teal-400 text-teal-300' : 'bg-white/5 border-white/10 text-gray-500 hover:bg-white/10'}`}
              >
                Mundur (Gradient)
              </button>
              <button 
                onClick={() => setPriority('Cardioid')}
                className={`py-2 px-1 rounded border text-xs font-bold transition-all ${priority === 'Cardioid' ? 'bg-pink-500/20 border-pink-400 text-pink-300' : 'bg-white/5 border-white/10 text-gray-500 hover:bg-white/10'}`}
              >
                Tumpuk (Cardioid)
              </button>
            </div>
          </div>

          <button onClick={calculateConfig} className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg transition-all active:scale-95">
            ✨ Hitung Rekomendasi
          </button>

          {recommendation && (
            <div className="mt-4 p-4 rounded-lg bg-indigo-950/40 border border-indigo-500/30 space-y-3">
               <div className="flex justify-between items-center border-b border-indigo-500/20 pb-2">
                 <span className="text-xs text-indigo-300 uppercase font-bold tracking-wider">Hasil Rekomendasi</span>
                 <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">Siap Diterapkan</span>
               </div>
               
               <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                 <div className="flex justify-between">
                   <span className="text-gray-400">Tipe Setup:</span>
                   <span className="font-bold text-white">{recommendation.setupType}</span>
                 </div>
                 {recommendation.setupType === 'Curved Array' && Number(recommendation.theta) > 0 && (
                   <div className="flex justify-between">
                     <span className="text-gray-400">Sudut (Theta):</span>
                     <span className="font-bold text-yellow-400">{recommendation.theta}°</span>
                   </div>
                 )}
                 {Number(recommendation.rowSpacing) > 0 && (
                   <div className="flex justify-between">
                     <span className="text-gray-400">Row Spacing:</span>
                     <span className="font-bold text-blue-400">{recommendation.rowSpacing} m</span>
                   </div>
                 )}
                 <div className="flex justify-between">
                   <span className="text-gray-400">Sub Spacing:</span>
                   <span className="font-bold text-blue-400">{recommendation.gap} m</span>
                 </div>
               </div>
               
               <p className="text-xs text-indigo-200/80 leading-relaxed italic bg-black/20 p-2 rounded border border-white/5">
                 "{explanation}"
               </p>

               <button onClick={handleApply} className="w-full py-2 mt-2 rounded bg-green-600 hover:bg-green-500 text-white font-bold text-sm shadow transition-all active:scale-95">
                 ✅ Terapkan ke Project
               </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
