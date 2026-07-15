import type { BoxCalculation } from '../types';

interface DataTableProps {
  calculations: BoxCalculation[];
  cardioidEnabled: boolean;
  onToggleMute: (positionId: number) => void;
}

export function DataTable({ calculations, cardioidEnabled, onToggleMute }: DataTableProps) {
  // Hanya ambil box bagian depan untuk tabel, karena delay belakang otomatis (di-set via Cardioid Delay)
  const frontBoxes = calculations.filter(c => !c.isRear);
  
  return (
    <div className="w-80 h-full bg-dark-panel border-l border-dark-border flex flex-col overflow-y-auto">
      <div className="p-4 border-b border-dark-border sticky top-0 bg-dark-panel z-10 print:static print:border-none print:p-0 print:mb-4">
        <h2 className="text-lg font-bold text-white print:text-black">DSP Delay Values</h2>
        <p className="text-xs text-gray-400 print:text-gray-600">Jarak Arc (Y) & Delay ms</p>
      </div>
      
      <div className="flex-1 p-4 print:p-0">
        <div className="space-y-2">
          {frontBoxes.map((box) => (
            <div 
              key={box.index} 
              className={`p-3 rounded border transition-colors ${box.muted ? 'bg-gray-800/50 border-gray-700 opacity-60 print:opacity-40' : 'bg-[#0f1115] border-dark-border hover:border-gray-600 print:border-gray-300'}`}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold text-gray-200 print:text-black">{box.label}</span>
                <button 
                  onClick={() => onToggleMute(box.positionId)}
                  className={`text-xs px-2 py-1 rounded font-bold border print:hidden ${box.muted ? 'bg-red-900/50 text-red-400 border-red-800 hover:bg-red-800' : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'}`}
                >
                  {box.muted ? 'MUTED' : 'Mute'}
                </button>
                {box.muted && <span className="hidden print:inline text-red-500 font-bold text-xs border border-red-500 px-1 rounded">MUTED</span>}
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400 print:text-gray-600">Arc Y (m)</span>
                <span className="text-sm font-medium text-gray-300 print:text-black">{box.virtualY.toFixed(3)} m</span>
              </div>
              
              <div className="flex justify-between items-center mt-1">
                <span className="text-xs text-gray-400 print:text-gray-600">Front Delay (ms)</span>
                <span className="text-sm font-bold text-accent print:text-black">{box.delayMs.toFixed(2)} ms</span>
              </div>
              
              {cardioidEnabled && box.totalCardioidDelayMs !== undefined && (
                <div className="flex justify-between items-center mt-1 pt-1 border-t border-gray-800 print:border-gray-300">
                  <span className="text-xs text-gray-500 print:text-gray-600">Rear Delay (ms)</span>
                  <span className="text-xs font-bold text-purple-400 print:text-black">{box.totalCardioidDelayMs.toFixed(2)} ms</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
