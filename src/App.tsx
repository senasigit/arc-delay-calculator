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
    cardioid: false,
    cardioidDelay: 3.4
  });

  const { boxes, stats } = useMemo(() => {
    return calculateArcDelay(settings);
  }, [settings]);

  return (
    <div className="flex w-screen h-screen overflow-hidden text-gray-200 bg-[#0a0c10]">
      {/* Kiri: Pengaturan */}
      <Sidebar settings={settings} onChange={setSettings} stats={stats} />
      
      {/* Tengah: Visualizer Dinamis */}
      <div className="flex-1 h-full overflow-hidden relative">
        <Visualizer settings={settings} calculations={boxes} />
      </div>

      {/* Kanan: Tabel Data */}
      <DataTable calculations={boxes} cardioidEnabled={settings.cardioid} />
    </div>
  );
}

export default App;
