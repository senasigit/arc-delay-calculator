import type { BoxCalculation } from '../types';

interface DataTableProps {
  calculations: BoxCalculation[];
  cardioidEnabled: boolean;
}

export function DataTable({ calculations, cardioidEnabled }: DataTableProps) {
  return (
    <div className="w-80 h-full bg-dark-panel border-l border-dark-border flex flex-col overflow-hidden">
      <div className="p-4 border-b border-dark-border bg-[#15181e] flex-shrink-0">
        <h2 className="text-lg font-semibold text-white mb-1">Nilai Delay DSP</h2>
        <p className="text-xs text-gray-400">Dihitung dari titik pusat (0m)</p>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-sm text-gray-300">
          <thead className="text-xs text-gray-400 uppercase bg-[#0f1115] sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-4 py-3 border-b border-dark-border">Posisi</th>
              <th className="px-4 py-3 border-b border-dark-border">X (m)</th>
              <th className="px-4 py-3 border-b border-dark-border">Delay (ms)</th>
              {cardioidEnabled && (
                <th className="px-4 py-3 border-b border-dark-border">Total (ms)</th>
              )}
            </tr>
          </thead>
          <tbody>
            {calculations.map((box, i) => (
              <tr key={i} className="border-b border-dark-border/50 hover:bg-[#1f2229] transition-colors">
                <td className="px-4 py-3 font-medium text-gray-100 whitespace-nowrap">
                  {box.label}
                </td>
                <td className="px-4 py-3 text-xs">{box.x > 0 ? '+' : ''}{box.x.toFixed(2)}</td>
                <td className="px-4 py-3 font-bold text-accent">{box.delayMs.toFixed(2)}</td>
                {cardioidEnabled && (
                  <td className={`px-4 py-3 font-bold ${box.isRear ? 'text-purple-400' : 'text-green-400'}`}>
                    {box.totalCardioidDelayMs?.toFixed(2) || '-'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
