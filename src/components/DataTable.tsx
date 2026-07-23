import type { BoxGroup } from '../types';

interface DataTableProps {
  groups: BoxGroup[];
  cardioidEnabled: boolean;
  onToggleMute: (positionId: number) => void;
  onToggleCardioid: (positionId: number) => void;
}

export function DataTable({ groups, cardioidEnabled, onToggleMute, onToggleCardioid }: DataTableProps) {
  
  return (
    <div className="w-full md:w-80 h-full bg-white/5 backdrop-blur-md border-l border-white/10 flex flex-col overflow-y-auto">
      <div className="p-4 border-b border-white/10 sticky top-0 bg-black/20 backdrop-blur-md z-10 print:static print:border-none print:p-0 print:mb-4 print:bg-transparent">
        <h2 className="text-lg font-bold text-white print:text-black">DSP Delay & Setup Table</h2>
        <p className="text-xs text-yellow-400 print:text-gray-600 mb-3">Instruksi Fisik dan Kalkulasi Delay (ms)</p>
        
        {groups.length > 0 && (
          <div className="bg-zinc-900/80 border border-yellow-500/30 rounded-lg p-3 grid grid-cols-3 gap-2 text-center shadow-inner">
            <div className="flex flex-col">
               <span className="text-[10px] text-yellow-500 uppercase tracking-wider">Total Box</span>
               <span className="text-xl font-bold text-white">
                 {groups.reduce((sum, group) => sum + group.boxes.length, 0)}
               </span>
            </div>
            <div className="flex flex-col border-x border-white/10">
               <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Front</span>
               <span className="text-xl font-bold text-zinc-200">
                 {groups.reduce((sum, group) => sum + group.boxes.filter(b => !b.isRear).length, 0)}
               </span>
            </div>
            <div className="flex flex-col">
               <span className="text-[10px] text-amber-500 uppercase tracking-wider">Rear</span>
               <span className="text-xl font-bold text-amber-300">
                 {groups.reduce((sum, group) => sum + group.boxes.filter(b => b.isRear).length, 0)}
               </span>
            </div>
          </div>
        )}
      </div>
      
      <div className="flex-1 p-4 print:p-0">
        <div className="space-y-3">
          {groups.map((group) => (
            <div 
              key={group.positionId} 
              className={`p-3 rounded-xl border transition-colors ${group.muted ? 'bg-red-900/20 border-red-900/50 opacity-60 print:opacity-40' : 'bg-black/20 border-white/10 hover:border-white/30 shadow-lg print:border-gray-300'}`}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold text-yellow-400 print:text-black">{group.label}</span>
                <div className="flex space-x-1 print:hidden">
                  {cardioidEnabled && (
                    <button 
                      onClick={() => onToggleCardioid(group.positionId)}
                      className={`text-[10px] px-1.5 py-1 rounded font-bold border ${group.cardioidDisabled ? 'bg-gray-800 text-yellow-400 border-gray-700 hover:bg-gray-700' : 'bg-zinc-900/80 text-yellow-400 border-purple-500/50 hover:bg-purple-600'}`}
                    >
                      {group.cardioidDisabled ? 'C-OFF' : 'C-ON'}
                    </button>
                  )}
                  <button 
                    onClick={() => onToggleMute(group.positionId)}
                    className={`text-[10px] px-1.5 py-1 rounded font-bold border ${group.muted ? 'bg-red-900/50 text-red-400 border-red-800 hover:bg-red-800' : 'bg-gray-800 text-yellow-400 border-gray-700 hover:bg-gray-700'}`}
                  >
                    {group.muted ? 'MUTED' : 'Mute'}
                  </button>
                </div>
                {group.muted && <span className="hidden print:inline text-red-500 font-bold text-xs border border-red-500 px-1 rounded">MUTED</span>}
              </div>
              
              <div className="flex justify-between items-center pb-2 border-b border-gray-800 print:border-gray-300">
                <span className="text-xs text-yellow-400 print:text-gray-600">Titik Fisik X (m)</span>
                <span className="text-sm font-medium text-yellow-400 print:text-black">{group.x.toFixed(3)} m</span>
              </div>

              {/* Rincian Box di dalam Stack */}
              <div className="mt-2 space-y-1.5">
                 {/* Looping secara terbalik agar Box teratas (indeks tertinggi) dirender di baris paling atas tabel */}
                 {[...group.boxes].reverse().map((box) => (
                     <div key={box.stackIndex} className="flex justify-between items-center text-xs border-b border-white/5 pb-1 mb-1 last:border-0 last:pb-0 last:mb-0">
                       <span className={`w-28 font-medium ${box.isRear ? 'text-yellow-400 print:text-yellow-500' : 'text-zinc-300 print:text-gray-600'}`}>
                          {box.rowIndex !== undefined && box.stackLevel !== undefined 
                            ? `Baris ${box.rowIndex + 1} • Stack ${box.stackLevel + 1}` 
                            : `Box ${box.stackIndex + 1}`}
                       </span>
                       
                       <span className={`flex-1 text-center font-bold ${box.isRear || box.polarity === -1 ? 'text-orange-400 print:text-orange-500' : 'text-zinc-100 print:text-black'}`}>
                          {box.positionLabel} {box.isRear ? '(Reversed)' : (box.polarity === -1 ? '(Inverted)' : '')}
                       </span>

                       <span className={`w-16 text-right font-bold ${box.isRear ? 'text-orange-400 print:text-orange-500' : 'text-yellow-400 print:text-yellow-500'}`}>
                          {box.delayMs.toFixed(2)} ms
                       </span>
                    </div>
                 ))}
              </div>
              
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
