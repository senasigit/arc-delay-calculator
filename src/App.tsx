import { useState, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { Visualizer } from './components/Visualizer';
import { DataTable } from './components/DataTable';
import type { SubwooferSettings } from './types';
import { calculateArcDelay } from './utils';

function App() {
  const [settings, setSettings] = useState<SubwooferSettings>({
    count: 6, // Changed to 6 as even numbers are now fully supported
    orientation: 'Landscape',
    width: 1.15,
    depth: 0.75,
    gap: 0.60,
    centralGap: 0.60,
    theta: 90,
    speedOfSound: 343,
    frequency: 63,
    cardioid: false,
    cardioidDelay: 3.4
  });

  const { boxes, stats } = useMemo(() => {
    return calculateArcDelay(settings);
  }, [settings]);

  return (
    <div className="flex w-screen h-screen overflow-hidden text-gray-200">
      <Sidebar settings={settings} onChange={setSettings} stats={stats} />
      
      <div className="flex flex-col flex-1 h-full overflow-hidden">
        <Visualizer settings={settings} calculations={boxes} />
        <DataTable calculations={boxes} cardioidEnabled={settings.cardioid} />
      </div>
    </div>
  );
}

export default App;
