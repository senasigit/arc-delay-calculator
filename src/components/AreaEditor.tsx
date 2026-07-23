import type { VenueArea, ShapeType } from '../types';

interface AreaEditorProps {
  areas: VenueArea[];
  onChange: (areas: VenueArea[]) => void;
  activeAreaId: string | null;
  onSelectArea: (id: string | null) => void;
  onClose: () => void;
}

export function AreaEditor({ areas, onChange, activeAreaId, onSelectArea, onClose }: AreaEditorProps) {
  const activeArea = areas.find(a => a.id === activeAreaId);

  const handleAddArea = (shape: ShapeType) => {
    const newArea: VenueArea = {
      id: Math.random().toString(36).substr(2, 9),
      name: `Area ${areas.length + 1}`,
      shape,
      x: 0,
      y: 10, // Default 10m in front
      width: shape === 'Rectangle' || shape === 'Triangle' || shape === 'Trapezoid' ? 20 : 0,
      height: shape === 'Rectangle' || shape === 'Triangle' || shape === 'Trapezoid' ? 15 : 0,
      radius: shape === 'Circle' ? 10 : 0,
      topWidth: shape === 'Trapezoid' ? 10 : 0,
      bottomWidth: shape === 'Trapezoid' ? 20 : 0,
      rotation: 0,
      color: '#3b82f6', // blue-500
    };
    onChange([...areas, newArea]);
    onSelectArea(newArea.id);
  };

  const handleUpdateActive = (updates: Partial<VenueArea>) => {
    if (!activeAreaId) return;
    onChange(areas.map(a => a.id === activeAreaId ? { ...a, ...updates } : a));
  };

  const handleDelete = (id: string) => {
    onChange(areas.filter(a => a.id !== id));
    if (activeAreaId === id) onSelectArea(null);
  };

  return (
    <div className="absolute top-4 right-4 w-72 bg-gradient-to-br from-zinc-900/80 to-black border border-purple-500/50 rounded-xl shadow-[0_0_25px_rgba(168,85,247,0.4)] flex flex-col max-h-[90%] z-30 opacity-100 backdrop-blur-xl">
      <div className="p-3 border-b border-purple-500/50 flex justify-between items-center bg-white/5 rounded-t-xl">
        <h3 className="font-bold text-sm text-purple-300">🗺️ Venue & Area Manager</h3>
        <button onClick={onClose} className="text-purple-300 hover:text-white transition-colors">
          ✕
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Tambah Area */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-purple-300">Tambah Area Baru</label>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => handleAddArea('Rectangle')} className="bg-white/10 hover:bg-white/20 text-xs py-1.5 rounded border border-white/20 transition-colors text-white shadow-sm">Persegi</button>
            <button onClick={() => handleAddArea('Circle')} className="bg-white/10 hover:bg-white/20 text-xs py-1.5 rounded border border-white/20 transition-colors text-white shadow-sm">Lingkaran</button>
            <button onClick={() => handleAddArea('Triangle')} className="bg-white/10 hover:bg-white/20 text-xs py-1.5 rounded border border-white/20 transition-colors text-white shadow-sm">Segitiga</button>
            <button onClick={() => handleAddArea('Trapezoid')} className="bg-white/10 hover:bg-white/20 text-xs py-1.5 rounded border border-white/20 transition-colors text-white shadow-sm">Trapesium</button>
          </div>
        </div>

        {/* List Areas */}
        <label className="text-xs font-bold text-purple-300">Daftar Area</label>
        {areas.length === 0 ? (
           <p className="text-xs text-purple-300 italic">Belum ada area.</p>
        ) : (
           <div className="space-y-1">
             {areas.map(area => (
                <div 
                  key={area.id}
                  onClick={() => onSelectArea(area.id)}
                  className={`flex justify-between items-center px-2 py-1.5 rounded cursor-pointer text-xs border transition-colors ${activeAreaId === area.id ? 'bg-purple-600 border-purple-500/50 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]' : 'bg-white/5 border-white/10 text-purple-300 hover:border-white/30'}`}
                >
                <span className="truncate flex-1">{area.name}</span>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(area.id); }} className="text-red-400 hover:text-red-300 ml-2 px-1">✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Editor for Active Area */}
        {activeArea && (
          <div className="space-y-3 pt-3 border-t border-purple-500/50">
             <label className="text-xs font-bold text-purple-300">Edit Properti Area</label>
             
             <div className="grid grid-cols-2 gap-2">
               <div className="flex flex-col col-span-2">
                 <span className="text-[10px] text-purple-300">Nama Area</span>
                 <input type="text" value={activeArea.name} onChange={e => handleUpdateActive({name: e.target.value})} className="bg-black/20 border border-white/20 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500/50" />
               </div>
               
               <div className="flex flex-col">
                 <span className="text-[10px] text-purple-300">Posisi X (m)</span>
                 <input type="number" step="0.5" value={activeArea.x} onChange={e => handleUpdateActive({x: parseFloat(e.target.value) || 0})} className="bg-black/20 border border-white/20 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500/50" />
               </div>
               <div className="flex flex-col">
                 <span className="text-[10px] text-purple-300">Posisi Y (m)</span>
                 <input type="number" step="0.5" value={activeArea.y} onChange={e => handleUpdateActive({y: parseFloat(e.target.value) || 0})} className="bg-black/20 border border-white/20 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500/50" />
               </div>
             </div>

             {activeArea.shape === 'Circle' ? (
               <div className="flex flex-col col-span-2">
                 <span className="text-[10px] text-purple-300">Radius (m)</span>
                 <input type="number" step="0.5" min="0.1" value={activeArea.radius} onChange={e => handleUpdateActive({radius: parseFloat(e.target.value) || 0.1})} className="bg-black/20 border border-white/20 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500/50" />
               </div>
             ) : activeArea.shape === 'Trapezoid' ? (
               <>
                 <div className="flex flex-col">
                   <span className="text-[10px] text-purple-300">Lebar Atas (m)</span>
                   <input type="number" step="0.5" min="0.1" value={activeArea.topWidth} onChange={e => handleUpdateActive({topWidth: parseFloat(e.target.value) || 0.1})} className="bg-black/20 border border-white/20 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500/50" />
                 </div>
                 <div className="flex flex-col">
                   <span className="text-[10px] text-purple-300">Lebar Bawah (m)</span>
                   <input type="number" step="0.5" min="0.1" value={activeArea.bottomWidth} onChange={e => handleUpdateActive({bottomWidth: parseFloat(e.target.value) || 0.1})} className="bg-black/20 border border-white/20 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500/50" />
                 </div>
                 <div className="flex flex-col col-span-2">
                   <span className="text-[10px] text-purple-300">Tinggi (m)</span>
                   <input type="number" step="0.5" min="0.1" value={activeArea.height} onChange={e => handleUpdateActive({height: parseFloat(e.target.value) || 0.1})} className="bg-black/20 border border-white/20 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500/50" />
                 </div>
               </>
             ) : (
               <div className="grid grid-cols-2 gap-2">
                 <div className="flex flex-col">
                   <span className="text-[10px] text-purple-300">Panjang (m)</span>
                   <input type="number" step="0.5" min="0.1" value={activeArea.width} onChange={e => handleUpdateActive({width: parseFloat(e.target.value) || 0.1})} className="bg-black/20 border border-white/20 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500/50" />
                 </div>
                 <div className="flex flex-col">
                   <span className="text-[10px] text-purple-300">Lebar (m)</span>
                   <input type="number" step="0.5" min="0.1" value={activeArea.height} onChange={e => handleUpdateActive({height: parseFloat(e.target.value) || 0.1})} className="bg-black/20 border border-white/20 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500/50" />
                 </div>
               </div>
             )}

             <div className="grid grid-cols-2 gap-2">
               <div className="flex flex-col">
                 <span className="text-[10px] text-purple-300">Rotasi (derajat)</span>
                 <input type="number" step="1" value={activeArea.rotation} onChange={e => handleUpdateActive({rotation: parseFloat(e.target.value) || 0})} className="bg-black/20 border border-white/20 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-purple-500/50" />
               </div>
               
               <div className="flex flex-col">
                 <span className="text-[10px] text-purple-300">Warna Garis</span>
                 <input type="color" value={activeArea.color} onChange={e => handleUpdateActive({color: e.target.value})} className="bg-black/20 border border-white/20 rounded h-6 w-full cursor-pointer p-0 border-none" />
               </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
