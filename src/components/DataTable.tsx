import type { BoxCalculation } from '../types';

interface DataTableProps {
  calculations: BoxCalculation[];
  cardioidEnabled: boolean;
}

export function DataTable({ calculations, cardioidEnabled }: DataTableProps) {
  return (
    <div className="h-64 bg-dark-panel border-t border-dark-border overflow-hidden flex flex-col">
      <div className="p-4 border-b border-dark-border flex justify-between items-center bg-[#15181e]">
        <h2 className="text-lg font-semibold text-white">Nilai Delay DSP</h2>
        <span className="text-xs text-gray-400">Dihitung dari titik pusat (0m)</span>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <table className="w-full text-left text-sm text-gray-300">
          <thead className="text-xs text-gray-400 uppercase bg-[#0f1115] sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 rounded-tl">Label Box</th>
              <th className="px-4 py-3">Posisi Fisik X (m)</th>
              <th className="px-4 py-3">Arc Delay (ms)</th>
              {cardioidEnabled && (
                <th className="px-4 py-3 rounded-tr">Total Cardioid (ms)</th>
              )}
              {!cardioidEnabled && <th className="px-4 py-3 rounded-tr"></th>}
            </tr>
          </thead>
          <tbody>
            {calculations.map((box) => (
              <tr key={box.index} className="border-b border-dark-border hover:bg-[#1f2229] transition-colors">
                <td className="px-4 py-3 font-medium text-gray-100">{box.label}</td>
                <td className="px-4 py-3">{box.x > 0 ? '+' : ''}{box.x.toFixed(3)}</td>
                <td className="px-4 py-3 font-bold text-accent">{box.delayMs.toFixed(2)} ms</td>
                {cardioidEnabled && (
                  <td className="px-4 py-3 font-bold text-green-400">{box.totalCardioidDelayMs.toFixed(2)} ms</td>
                )}
                {!cardioidEnabled && <td></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
