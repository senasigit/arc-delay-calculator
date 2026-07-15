import type { BoxGroup } from '../types';

interface DataTableProps {
  groups: BoxGroup[];
  cardioidEnabled: boolean;
  onToggleMute: (positionId: number) => void;
  onToggleCardioid: (positionId: number) => void;
}

export function DataTable({ groups, cardioidEnabled, onToggleMute, onToggleCardioid }: DataTableProps) {
  
  return (
    <div className="w-80 h-full bg-dark-panel border-l border-dark-border flex flex-col overflow-y-auto">
      <div className="p-4 border-b border-dark-border sticky top-0 bg-dark-panel z-10 print:static print:border-none print:p-0 print:mb-4">
        <h2 className="text-lg font-bold text-white print:text-black">DSP Delay & Setup Table</h2>
        <p className="text-xs text-gray-400 print:text-gray-600">Instruksi Fisik dan Kalkulasi Delay (ms)</p>
      </div>
      
      <div className="flex-1 p-4 print:p-0">
        <div className="space-y-3">
          {groups.map((group) => (
            <div 
              key={group.positionId} 
              className={`p-3 rounded border transition-colors ${group.muted ? 'bg-gray-800/50 border-gray-700 opacity-60 print:opacity-40' : 'bg-[#0f1115] border-dark-border hover:border-gray-600 print:border-gray-300'}`}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold text-gray-200 print:text-black">{group.label}</span>
                <div className="flex space-x-1 print:hidden">
                  {cardioidEnabled && (
                    <button 
                      onClick={() => onToggleCardioid(group.positionId)}
                      className={`text-[10px] px-1.5 py-1 rounded font-bold border ${group.cardioidDisabled ? 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700' : 'bg-purple-900/50 text-purple-400 border-purple-800 hover:bg-purple-800'}`}
                    >
                      {group.cardioidDisabled ? 'C-OFF' : 'C-ON'}
                    </button>
                  )}
                  <button 
                    onClick={() => onToggleMute(group.positionId)}
                    className={`text-[10px] px-1.5 py-1 rounded font-bold border ${group.muted ? 'bg-red-900/50 text-red-400 border-red-800 hover:bg-red-800' : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'}`}
                  >
                    {group.muted ? 'MUTED' : 'Mute'}
                  </button>
                </div>
                {group.muted && <span className="hidden print:inline text-red-500 font-bold text-xs border border-red-500 px-1 rounded">MUTED</span>}
              </div>
              
              <div className="flex justify-between items-center pb-2 border-b border-gray-800 print:border-gray-300">
                <span className="text-xs text-gray-400 print:text-gray-600">Titik Fisik X (m)</span>
                <span className="text-sm font-medium text-gray-300 print:text-black">{group.x.toFixed(3)} m</span>
              </div>

              {/* Rincian Box di dalam Stack */}
              <div className="mt-2 space-y-1.5">
                 {/* Looping secara terbalik agar Box teratas (indeks tertinggi) dirender di baris paling atas tabel */}
                 {[...group.boxes].reverse().map((box) => (
                    <div key={box.stackIndex} className="flex justify-between items-center text-xs">
                       <span className={`w-14 font-medium ${box.isRear ? 'text-purple-400 print:text-purple-700' : 'text-gray-400 print:text-gray-600'}`}>
                          Box {box.stackIndex + 1}
                       </span>
                       
                       <span className={`flex-1 text-center font-bold ${box.isRear ? 'text-purple-400 print:text-purple-700' : 'text-gray-300 print:text-black'}`}>
                          {box.isRear ? 'REVERSED (Cardioid)' : 'FRONT'}
                       </span>

                       <span className={`w-16 text-right font-bold ${box.isRear ? 'text-purple-400 print:text-purple-700' : 'text-accent print:text-blue-700'}`}>
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
