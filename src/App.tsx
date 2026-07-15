import { useState, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { Visualizer } from './components/Visualizer';
import { DataTable } from './components/DataTable';
import type { SubwooferSettings } from './types';
import { calculateArcDelay } from './utils';

function App() {
  const [settings, setSettings] = useState<SubwooferSettings>({
    count: 5,
    width: 1.15,
    depth: 0.75,
    gap: 0.60,
    theta: 90,
    speedOfSound: 343,
    frequency: 63,
  });

  const calculations = useMemo(() => {
    return calculateArcDelay(settings);
  }, [settings]);

  return (
    <div className="flex w-screen h-screen overflow-hidden text-gray-200">
      <Sidebar settings={settings} onChange={setSettings} />
      
      <div className="flex flex-col flex-1 h-full overflow-hidden">
        <Visualizer settings={settings} calculations={calculations} />
        <DataTable calculations={calculations} />
      </div>
    </div>
  );
}

export default App;
