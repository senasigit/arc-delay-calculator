import { useState, useMemo, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { Visualizer } from './components/Visualizer';
import { DataTable } from './components/DataTable';
import { ProjectModal } from './components/ProjectModal';
import { AreaEditor } from './components/AreaEditor';
import type { SubwooferSettings, ReportInfo, ProjectData, VenueArea } from './types';
import { calculateArcDelay } from './utils';
import { db } from './firebase';
import { doc, updateDoc } from 'firebase/firestore';

function App() {
  const [settings, setSettings] = useState<SubwooferSettings>({
    setupType: 'Arc Array',
    stageWidth: '',
    count: '',
    preset: 'Custom',
    orientation: 'Landscape',
    width: '',
    height: '',
    depth: '',
    stack: '',
    gap: 0.5,
    rowSpacing: '',
    rowGap: '',
    centralGap: 1.5,
    theta: '',
    speedOfSound: '',
    temperature: '',
    humidity: 50,
    frequency: 63,
    targetFrequency: 63,
    bandwidth: '1/3 Octave',
    resolution: 'Medium',
    showHeatmap: false,
    cardioid: false,
    cardioidDelay: '',
    invertRearPolarity: true,
    endFireDelayStep: '',
    cardioidReversedBoxes: [],
    rows: '',
  });

  const [reportInfo, setReportInfo] = useState<ReportInfo>({
    project: '',
    venue: '',
    engineer: '',
    date: new Date().toISOString().split('T')[0]
  });

  const [mutedPositions, setMutedPositions] = useState<Set<number>>(new Set());
  const [disabledCardioidPositions, setDisabledCardioidPositions] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<'setup' | 'map' | 'dsp'>('setup');
  const [activeProject, setActiveProject] = useState<ProjectData | null>(null);
  const [areas, setAreas] = useState<VenueArea[]>([]);
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [showAreaEditor, setShowAreaEditor] = useState(false);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);

  // Auto-save effect
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  useEffect(() => {
    if (!activeProject) return;
    
    // Clear previous timeout
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    
    // Debounce save for 2 seconds
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const docRef = doc(db, 'projects', activeProject.id);
        await updateDoc(docRef, {
          settings,
          reportInfo,
          areas,
          updatedAt: Date.now()
        });
        console.log("Project auto-saved.");
      } catch (e) {
        console.error("Auto-save failed", e);
      }
    }, 2000);
    
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [settings, reportInfo, areas, activeProject]);

  const handleSelectProject = (project: ProjectData) => {
    setSettings(project.settings);
    setReportInfo(project.reportInfo);
    setAreas(project.areas || []);
    setActiveProject(project);
  };

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
    <>
      {!activeProject && (
        <ProjectModal 
          onSelectProject={handleSelectProject} 
          defaultSettings={settings} 
          defaultReportInfo={reportInfo} 
        />
      )}
      <div className="flex w-screen h-screen overflow-hidden text-yellow-400 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-zinc-950 via-black to-zinc-900 print:block print:h-auto print:bg-white print:text-black flex-col lg:flex-row">
      
      {/* Mobile Top Nav / Tabs */}
      <div className="lg:hidden flex bg-slate-900/50 backdrop-blur-md border-b border-slate-700 p-2 space-x-2 print:hidden z-20 shadow-md">
         <button onClick={() => setActiveTab('setup')} className={`flex-1 py-2 text-xs font-bold rounded transition-colors ${activeTab === 'setup' ? 'bg-blue-600 text-white' : 'bg-white/5 text-yellow-400'}`}>⚙️ Setup</button>
         <button onClick={() => setActiveTab('map')} className={`flex-1 py-2 text-xs font-bold rounded transition-colors ${activeTab === 'map' ? 'bg-blue-600 text-white' : 'bg-white/5 text-yellow-400'}`}>🗺️ 2D Map</button>
         <button onClick={() => setActiveTab('dsp')} className={`flex-1 py-2 text-xs font-bold rounded transition-colors ${activeTab === 'dsp' ? 'bg-blue-600 text-white' : 'bg-white/5 text-yellow-400'}`}>🎛️ DSP</button>
      </div>

      {/* Sidebar Kiri */}
      <div className={`${activeTab === 'setup' ? 'flex-1 min-h-0' : 'hidden print:block'} lg:flex-none lg:block ${isLeftSidebarOpen ? 'w-full lg:w-80 h-full' : 'w-0 h-full overflow-hidden'} flex-shrink-0 transition-all duration-300 print:hidden relative`}>
        <div className="w-full lg:w-80 h-full">
          <Sidebar 
            settings={settings} 
            onChange={setSettings} 
            stats={stats} 
            reportInfo={reportInfo}
            onReportInfoChange={setReportInfo}
            activeProject={activeProject}
            onCloseProject={() => setActiveProject(null)}
          />
        </div>
      </div>
      
      {/* Area Utama */}
      <div className={`${activeTab === 'setup' ? 'hidden print:flex' : 'flex'} lg:flex flex-1 flex-col print:block print:w-full h-full overflow-hidden relative`}>
        
        {/* HEADER LAPORAN (HANYA TAMPIL SAAT DIPRINT ATAU DILIHAT DI PDF) */}
        <div className="hidden print:block mb-6 pt-4 border-b-2 border-gray-800 pb-4">
           <h1 className="text-3xl font-extrabold text-black uppercase mb-1">{reportInfo.project || 'SIMULASI SUBWOOFER ARRAY'}</h1>
           <div className="grid grid-cols-2 gap-4 text-sm mt-4 text-gray-800">
             <div>
               <p><span className="font-bold w-32 inline-block">Venue</span>: {reportInfo.venue || '-'}</p>
               <p><span className="font-bold w-32 inline-block">Tanggal</span>: {reportInfo.date}</p>
               <p><span className="font-bold w-32 inline-block">Audio Engineer</span>: {reportInfo.engineer || '-'}</p>
             </div>
             <div>
               <p><span className="font-bold w-32 inline-block">Tipe Setup</span>: {settings.setupType}</p>
               <p><span className="font-bold w-32 inline-block">Sub Preset</span>: {settings.preset}</p>
               <p><span className="font-bold w-32 inline-block">Dimensi & Posisi</span>: {settings.width}m x {settings.height}m x {settings.depth}m ({settings.orientation})</p>
             </div>
           </div>
           
           <div className="grid grid-cols-2 gap-4 text-sm mt-2 text-gray-800">
             <div>
               <p><span className="font-bold w-32 inline-block">Stack (Atas)</span>: {settings.stack}</p>
               <p><span className="font-bold w-32 inline-block">Rows (Belakang)</span>: {settings.rows}</p>
               <p><span className="font-bold w-32 inline-block">Sub Gap / Central</span>: {settings.gap}m / {settings.centralGap}m</p>
               <p><span className="font-bold w-32 inline-block">Suhu / Lembap</span>: {settings.temperature !== '' ? settings.temperature : '-'}°C / {settings.humidity !== '' ? settings.humidity : '-'}%</p>
             </div>
             <div>
               <p><span className="font-bold w-32 inline-block">Cardioid / Gradient</span>: {settings.cardioid ? 'YES' : 'NO'}</p>
               <p><span className="font-bold w-32 inline-block">Sudut Cakupan</span>: {settings.theta}°</p>
               <p><span className="font-bold w-32 inline-block">Heatmap Freq</span>: {settings.frequency}Hz ({settings.bandwidth})</p>
               <p><span className="font-bold w-32 inline-block">Kecepatan Suara</span>: {settings.speedOfSound !== '' ? settings.speedOfSound : '-'} m/s</p>
             </div>
           </div>
        </div>
        
        {/* Area Map & Tabel */}
        <div className="flex-1 flex flex-col lg:flex-row print:block print:w-full h-full overflow-hidden">
          {/* Tengah: Visualizer Dinamis */}
          <div className={`${activeTab === 'map' ? 'flex-1 min-h-0' : 'hidden print:flex'} lg:flex flex-1 h-full overflow-hidden relative print:flex print:h-[500px] print:w-full print:mb-8 print:border print:border-gray-300 rounded-lg m-2 shadow-[0_0_20px_rgba(0,0,0,0.5)] border border-white/10`}>
            
            {/* Toggle Left Sidebar Button */}
            <button 
              onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
              className="hidden lg:flex absolute top-1/2 left-0 transform -translate-y-1/2 bg-slate-800/80 hover:bg-slate-700 text-white p-1.5 rounded-r-md border border-l-0 border-white/20 shadow-lg z-20 transition-colors backdrop-blur-md"
              title={isLeftSidebarOpen ? "Hide Setup" : "Show Setup"}
            >
              {isLeftSidebarOpen ? '◀' : '▶'}
            </button>

            {/* Toggle Right Sidebar Button */}
            <button 
              onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
              className="hidden lg:flex absolute top-1/2 right-0 transform -translate-y-1/2 bg-slate-800/80 hover:bg-slate-700 text-white p-1.5 rounded-l-md border border-r-0 border-white/20 shadow-lg z-20 transition-colors backdrop-blur-md"
              title={isRightSidebarOpen ? "Hide DSP" : "Show DSP"}
            >
              {isRightSidebarOpen ? '▶' : '◀'}
            </button>

            <Visualizer 
              settings={settings} 
              groups={groups} 
              areas={areas}
              activeAreaId={activeAreaId}
              onSelectArea={setActiveAreaId}
              onUpdateArea={(id, updates) => {
                 setAreas(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
              }}
            />
            
            {!showAreaEditor && (
              <button 
                onClick={() => setShowAreaEditor(true)}
                className="absolute top-4 right-4 bg-gradient-to-r from-yellow-300 to-amber-500 hover:from-purple-500 hover:to-indigo-500 border border-yellow-500/50 text-white px-4 py-2 rounded-lg shadow-[0_0_15px_rgba(168,85,247,0.5)] text-xs font-bold transition-all z-20 print:hidden"
              >
                🗺️ Area Manager
              </button>
            )}
            
            {showAreaEditor && (
              <AreaEditor 
                areas={areas}
                onChange={setAreas}
                activeAreaId={activeAreaId}
                onSelectArea={setActiveAreaId}
                onClose={() => setShowAreaEditor(false)}
              />
            )}
          </div>

          {/* Kanan: Tabel Data */}
          <div className={`${activeTab === 'dsp' ? 'flex-1 min-h-0' : 'hidden print:block'} lg:flex-none lg:block ${isRightSidebarOpen ? 'w-full lg:w-96 h-full' : 'w-0 h-full overflow-hidden'} flex-shrink-0 border-l border-white/10 bg-slate-900/40 backdrop-blur-md print:w-full print:border-none transition-all duration-300 relative`}>
            <div className="w-full lg:w-96 h-full overflow-y-auto">
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
    </div>
    </>
  );
}

export default App;
