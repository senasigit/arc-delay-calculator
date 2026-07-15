import { useState, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { Visualizer } from './components/Visualizer';
import { DataTable } from './components/DataTable';
import type { SubwooferSettings, ReportInfo } from './types';
import { calculateArcDelay } from './utils';

function App() {
  const [settings, setSettings] = useState<SubwooferSettings>({
    count: 7, // User want to test 7
    preset: 'Custom',
    orientation: 'Landscape',
    width: 1.15,
    height: 0.55,
    depth: 0.75,
    stack: 3, // Testing stack 3
    gap: 0.60,
    centralGap: 0.60,
    theta: 90,
    speedOfSound: 343,
    frequency: 63,
    bandwidth: 'Single',
    resolution: 'Medium',
    showHeatmap: true,
    cardioid: true, // Auto enable to show feature
    cardioidDelay: 3.4,
    cardioidReversedBoxes: [false, true, false, false], // Middle box reversed
  });

  const [reportInfo, setReportInfo] = useState<ReportInfo>({
    project: '',
    venue: '',
    engineer: '',
    date: new Date().toISOString().split('T')[0]
  });

  const [mutedPositions, setMutedPositions] = useState<Set<number>>(new Set());
  const [disabledCardioidPositions, setDisabledCardioidPositions] = useState<Set<number>>(new Set());

  const handleToggleMute = (positionId: number) => {
    setMutedPositions(prev => {
      const next = new Set(prev);
      if (next.has(positionId)) next.delete(positionId);
      else next.add(positionId);
      return next;
    });
  };

  const handleToggleCardioid = (positionId: number) => {
    setDisabledCardioidPositions(prev => {
      const next = new Set(prev);
      if (next.has(positionId)) next.delete(positionId);
      else next.add(positionId);
      return next;
    });
  };

  const { groups, stats } = useMemo(() => {
    return calculateArcDelay(settings, mutedPositions, disabledCardioidPositions);
  }, [settings, mutedPositions, disabledCardioidPositions]);

  return (
    <div className="flex w-screen h-screen overflow-hidden text-gray-200 bg-[#0a0c10] print:block print:h-auto print:bg-white print:text-black">
      {/* Sidebar - Sembunyi saat diprint */}
      <div className="print:hidden h-full flex-shrink-0">
        <Sidebar 
          settings={settings} 
          onChange={setSettings} 
          stats={stats} 
          reportInfo={reportInfo}
          onReportInfoChange={setReportInfo}
        />
      </div>
      
      {/* Area Utama */}
      <div className="flex-1 flex flex-col print:block print:w-full h-full overflow-hidden relative">
        
        {/* HEADER LAPORAN (HANYA TAMPIL SAAT DIPRINT ATAU DILIHAT DI PDF) */}
        <div className="hidden print:block mb-6 pt-4 border-b-2 border-gray-800 pb-4">
           <h1 className="text-3xl font-extrabold text-black uppercase mb-1">{reportInfo.project || 'SIMULASI SUBWOOFER ARRAY'}</h1>
           <div className="grid grid-cols-2 gap-4 text-sm mt-4 text-gray-800">
             <div>
               <p><span className="font-bold w-20 inline-block">Venue</span>: {reportInfo.venue || '-'}</p>
               <p><span className="font-bold w-20 inline-block">Tanggal</span>: {reportInfo.date}</p>
             </div>
             <div>
               <p><span className="font-bold w-24 inline-block">Audio Engineer</span>: {reportInfo.engineer || '-'}</p>
               <p><span className="font-bold w-24 inline-block">Software</span>: Antigravity Arc Delay Calculator v2.0</p>
             </div>
           </div>
        </div>
        
        {/* Area Map & Tabel */}
        <div className="flex-1 flex print:block print:w-full h-full overflow-hidden">
          {/* Tengah: Visualizer Dinamis */}
          <div className="flex-1 h-full overflow-hidden relative print:h-[500px] print:w-full print:mb-8 print:border print:border-gray-300">
            <Visualizer settings={settings} groups={groups} />
          </div>

          {/* Kanan: Tabel Data */}
          <div className="print:w-full print:h-auto print:border-none print:shadow-none h-full flex-shrink-0">
            <DataTable 
              groups={groups} 
              cardioidEnabled={settings.cardioid}
              onToggleMute={handleToggleMute}
              onToggleCardioid={handleToggleCardioid}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
