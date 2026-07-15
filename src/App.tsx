import { useState, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { Visualizer } from './components/Visualizer';
import { DataTable } from './components/DataTable';
import type { SubwooferSettings } from './types';
import { calculateArcDelay } from './utils';

function App() {
  const [settings, setSettings] = useState<SubwooferSettings>({
    count: 6,
    preset: 'Custom',
    orientation: 'Landscape',
    width: 1.15,
    height: 0.55,
    depth: 0.75,
    stack: 1,
    gap: 0.60,
    centralGap: 0.60,
    theta: 90,
    speedOfSound: 343,
    frequency: 63,
    bandwidth: 'Single',
    resolution: 'Medium',
    showHeatmap: true,
    cardioid: false,
    cardioidDelay: 3.4,
    cardioidReversedCount: 1,
  });

  const [mutedPositions, setMutedPositions] = useState<Set<number>>(new Set());

  const handleToggleMute = (positionId: number) => {
    setMutedPositions(prev => {
      const next = new Set(prev);
      if (next.has(positionId)) next.delete(positionId);
      else next.add(positionId);
      return next;
    });
  };

  const { boxes, stats } = useMemo(() => {
    return calculateArcDelay(settings, mutedPositions);
  }, [settings, mutedPositions]);

  return (
    <div className="flex w-screen h-screen overflow-hidden text-gray-200 bg-[#0a0c10] print:block print:h-auto print:bg-white print:text-black">
      {/* Kiri: Pengaturan */}
      <div className="print:hidden h-full flex-shrink-0">
        <Sidebar settings={settings} onChange={setSettings} stats={stats} />
      </div>
      
      {/* Container utama untuk Visualizer & Table saat diprint */}
      <div className="flex-1 flex print:block print:w-full h-full overflow-hidden">
        {/* Tengah: Visualizer Dinamis */}
        <div className="flex-1 h-full overflow-hidden relative print:h-[600px] print:w-full print:mb-8 print:border print:border-gray-300">
          <Visualizer settings={settings} calculations={boxes} />
        </div>

        {/* Kanan: Tabel Data */}
        <div className="print:w-full print:h-auto print:border-none print:shadow-none h-full flex-shrink-0">
          <DataTable 
            calculations={boxes} 
            cardioidEnabled={settings.cardioid} 
            onToggleMute={handleToggleMute}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
