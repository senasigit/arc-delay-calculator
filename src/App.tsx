import { useState, useMemo, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { flushSync } from 'react-dom';
import { Sidebar } from './components/Sidebar';
import { Visualizer } from './components/Visualizer';
import { DataTable } from './components/DataTable';
import { ProjectModal } from './components/ProjectModal';
import { AreaEditor } from './components/AreaEditor';
import { AudioUtilities } from './components/AudioUtilities';
import { AutoConfigModal } from './components/AutoConfigModal';
import { AboutModal } from './components/AboutModal';
import { AreaOnboarding } from './components/AreaOnboarding';
import { PrintReportContent } from './components/PrintReport';
import { PrintPreviewModal } from './components/PrintPreviewModal';
import { useTheme, type ThemeMode } from './theme';
import { fetchLocalWeather, hasGeolocationPermission } from './weather';
import { calculateSpeedOfSound, sanitizeSettings } from './utils';
import type { SubwooferSettings, ReportInfo, ProjectData, VenueArea, SubwooferPreset } from './types';
import { DEFAULT_SETTINGS, normalizeSettings } from './types';
import { calculateArcDelay } from './utils';
import { REPORT_HEATMAP_SPECS, generateReportHeatmapImage, type ReportHeatmapImage } from './reportHeatmap';
import { generateFrontViewImage } from './reportFrontView';
import { db } from './firebase';
import { doc, updateDoc, collection, onSnapshot } from 'firebase/firestore';

type Tab = 'setup' | 'map' | 'dsp' | 'tools';

const TABS: { id: Tab; label: string }[] = [
  { id: 'setup', label: 'Setup' },
  { id: 'map', label: 'Peta' },
  { id: 'dsp', label: 'DSP' },
  { id: 'tools', label: 'Tools' },
];

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function App() {
  const [settings, setSettings] = useState<SubwooferSettings>(DEFAULT_SETTINGS);
  const [reportInfo, setReportInfo] = useState<ReportInfo>({
    project: '',
    venue: '',
    engineer: '',
    date: new Date().toISOString().split('T')[0],
  });

  const [mutedPositions, setMutedPositions] = useState<Set<number>>(new Set());
  const [disabledCardioidPositions, setDisabledCardioidPositions] = useState<Set<number>>(new Set());
  // Override per BOX (bukan per posisi) dari tabel DSP — kunci "positionId:stackIndex".
  const [invertedBoxes, setInvertedBoxes] = useState<Set<string>>(new Set());
  const [disabledCardioidBoxes, setDisabledCardioidBoxes] = useState<Set<string>>(new Set());
  const [mutedBoxes, setMutedBoxes] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<Tab>('setup');
  const [activeProject, setActiveProject] = useState<ProjectData | null>(null);
  const [areas, setAreas] = useState<VenueArea[]>([]);
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [showAreaEditor, setShowAreaEditor] = useState(false);
  const [showUtility, setShowUtility] = useState(false);
  const [showAutoConfig, setShowAutoConfig] = useState(false);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [showAbout, setShowAbout] = useState(false);
  const [showAreaOnboarding, setShowAreaOnboarding] = useState(false);
  const [printHeatmaps, setPrintHeatmaps] = useState<ReportHeatmapImage[] | null>(null);
  const [printFrontView, setPrintFrontView] = useState<string | null>(null);
  const [preparingReport, setPreparingReport] = useState(false);
  const [preparingProgress, setPreparingProgress] = useState<{ done: number; total: number } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Preset box tersimpan di collection Firestore terpisah dari project — dibaca
  // di sini juga (bukan cuma di Sidebar) supaya laporan PDF bisa menampilkan
  // NAMA preset yang dipilih, bukan sekadar ID dokumennya (settings.preset).
  const [presets, setPresets] = useState<SubwooferPreset[]>([]);
  // Saat true, seluruh UI interaktif diganti dengan PrintReportContent lewat
  // conditional render React — BUKAN CSS "hidden print:block" seperti
  // sebelumnya. Laporan tetap kosong (Page 1 of 1) di Safari walau sudah
  // di-generate: dugaan kuat ini bug WebKit soal cascade layer Tailwind v4
  // (@layer + @media print + varian) yang gagal menimpa `hidden`. Event
  // beforeprint/afterprint murni JS, tidak bergantung sama sekali pada
  // cascade CSS, jadi kebal terhadap bug spesifik itu — pola yang sama
  // seperti perbaikan bug sidebar Safari sebelumnya (unmount, bukan toggle
  // CSS).
  const [isPrinting, setIsPrinting] = useState(false);
  const { mode: themeMode, resolved: theme, setMode: setThemeMode } = useTheme();

  useEffect(() => {
    // flushSync WAJIB di sini — React 18+ membatch state update dari event
    // listener native (termasuk beforeprint), jadi tanpa ini DOM belum tentu
    // sempat ter-commit sebelum mesin cetak browser mengambil snapshot
    // halaman. flushSync memaksa React merender & meng-commit SAAT ITU JUGA,
    // sebelum handler ini selesai — jaminan dari React sendiri, tidak
    // bergantung pada perilaku CSS/browser tertentu.
    const onBeforePrint = () => flushSync(() => setIsPrinting(true));
    const onAfterPrint = () => flushSync(() => setIsPrinting(false));
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
    };
  }, []);

  // Terbukti di Safari nyata: beforeprint TETAP terlambat — halaman masih
  // kosong ("Page 1 of 1") walau listener di atas sudah flushSync. Dugaan:
  // Safari mengambil snapshot halaman untuk dicetak SAAT window.print()
  // dipanggil, sebelum beforeprint sempat berguna mengubah apa pun (bug
  // WebKit lama). Jadi jangan andalkan event itu sama sekali untuk jalur
  // tombol kita sendiri — set isPrinting SEBELUM window.print() dipanggil,
  // di handler klik yang sama (tetap dianggap gesture pengguna asli, bukan
  // dari setTimeout), supaya DOM sudah dalam kondisi final SEBELUM Safari
  // sempat mengambil snapshot apa pun. Listener beforeprint/afterprint di
  // atas tetap dipertahankan sebagai jaring pengaman untuk jalur lain
  // (mis. pengguna menekan Cmd+P langsung, bukan lewat tombol ini).
  const handlePrintNow = () => {
    flushSync(() => setIsPrinting(true));
    window.print();
  };

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipFirstSaveRef = useRef(true);

  // Auto-save ke Firestore, di-debounce agar tidak menulis tiap ketukan tombol.
  useEffect(() => {
    if (!activeProject) return;
    if (skipFirstSaveRef.current) {
      skipFirstSaveRef.current = false;
      return;
    }

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSaveState('saving');

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await updateDoc(doc(db, 'projects', activeProject.id), {
          settings,
          reportInfo,
          areas,
          updatedAt: Date.now(),
        });
        setSaveState('saved');
      } catch (e) {
        console.error('Auto-save gagal', e);
        setSaveState('error');
      }
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [settings, reportInfo, areas, activeProject]);

  // Suhu awal diambil dari cuaca setempat, tetapi HANYA jika izin lokasi sudah
  // pernah diberikan — supaya membuka aplikasi tidak langsung memunculkan
  // dialog izin. Tombol manual di panel Heatmap tetap tersedia.
  const weatherTriedRef = useRef(false);
  useEffect(() => {
    if (weatherTriedRef.current) return;
    weatherTriedRef.current = true;

    (async () => {
      if (!(await hasGeolocationPermission())) return;
      try {
        const reading = await fetchLocalWeather();
        setSettings((prev) => {
          // Jangan timpa nilai yang sudah diisi manual pada project ini.
          if (prev.temperature !== '') return prev;
          return {
            ...prev,
            temperature: reading.temperature,
            humidity: reading.humidity,
            speedOfSound: Number(calculateSpeedOfSound(reading.temperature, reading.humidity).toFixed(1)),
          };
        });
      } catch {
        /* cuaca opsional — abaikan kegagalan */
      }
    })();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'presets'),
      (snapshot) => setPresets(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as SubwooferPreset)),
      (err) => console.error('Gagal memuat preset', err)
    );
    return () => unsubscribe();
  }, []);

  const handleSelectProject = (project: ProjectData) => {
    // Project lama bisa punya skema berbeda — selalu gabungkan dengan default.
    const normalized = normalizeSettings(project.settings);
    // Project yang tersimpan sebelum MIN_TARGET_FREQ_HZ ditambahkan bisa saja
    // masih menyimpan gap/central gap yang meledak dari bug lama — perbaiki
    // begitu dimuat, jangan tunggu pengguna menemukan sendiri lewat peta yang
    // tiba-tiba menampilkan skala kilometer.
    const { settings: sanitized, fixed } = sanitizeSettings(normalized);
    setSettings(sanitized);
    if (fixed.length > 0) {
      window.alert(
        `Project ini menyimpan ${fixed.join(', ')} dengan nilai yang tidak wajar (kemungkinan dari sesi lama) ` +
          'dan sudah dikembalikan ke nilai default. Silakan atur ulang jarak sesuai kebutuhan Anda.'
      );
    }
    const loadedAreas = project.areas ?? [];
    setReportInfo(project.reportInfo ?? { project: '', venue: '', engineer: '', date: '' });
    setAreas(loadedAreas);
    setMutedPositions(new Set());
    setDisabledCardioidPositions(new Set());
    setInvertedBoxes(new Set());
    setDisabledCardioidBoxes(new Set());
    setMutedBoxes(new Set());
    skipFirstSaveRef.current = true;
    setSaveState('idle');
    setActiveProject(project);
    // Project baru (atau project lama tanpa area sama sekali) — tawarkan
    // menambahkan area venue dulu sebelum lanjut mengatur array.
    if (loadedAreas.length === 0) setShowAreaOnboarding(true);
  };

  const toggleIn =
    <T,>(setter: Dispatch<SetStateAction<Set<T>>>) =>
    (id: T) => {
      setter((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };

  const { groups, stats } = useMemo(
    () =>
      calculateArcDelay(
        settings,
        mutedPositions,
        disabledCardioidPositions,
        invertedBoxes,
        disabledCardioidBoxes,
        mutedBoxes
      ),
    [settings, mutedPositions, disabledCardioidPositions, invertedBoxes, disabledCardioidBoxes, mutedBoxes]
  );

  // Membuat 10 peta SPL statis (per frekuensi) itu berat — dijalankan hanya
  // saat tombol Export PDF ditekan, bukan tiap render. Dibuat SATU PER SATU
  // (bukan sekali batch) dengan jeda requestAnimationFrame di antaranya,
  // supaya (a) label tombol bisa menunjukkan progres asli — sebelumnya cuma
  // "Menyiapkan…" statis yang terasa macet padahal sedang bekerja — dan
  // (b) browser sempat bernapas antar gambar alih-alih membekukan tab
  // selama beberapa detik penuh sekaligus. Setelah siap, tampilkan preview
  // dulu — jangan langsung window.print() — supaya pengguna bisa memeriksa
  // isinya dan membatalkan kalau ada yang belum sesuai.
  const yieldToBrowser = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const handleExportPdf = async () => {
    setPreparingReport(true);
    const total = REPORT_HEATMAP_SPECS.length + 1; // +1 untuk gambar tampak depan
    setPreparingProgress({ done: 0, total });
    await yieldToBrowser();

    const images: ReportHeatmapImage[] = [];
    for (const spec of REPORT_HEATMAP_SPECS) {
      images.push(generateReportHeatmapImage(settings, groups, areas, spec));
      setPreparingProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
      await yieldToBrowser();
    }
    setPrintHeatmaps(images);

    setPrintFrontView(generateFrontViewImage(settings, groups));
    setPreparingProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    await yieldToBrowser();

    setPreparingReport(false);
    setPreparingProgress(null);
    setPreviewOpen(true);
  };

  const openTab = (tab: Tab) => {
    setActiveTab(tab);
    setShowUtility(tab === 'tools');
  };

  const saveLabel: Record<SaveState, string> = {
    idle: 'Tersinkron',
    saving: 'Menyimpan…',
    saved: 'Tersimpan',
    error: 'Gagal simpan',
  };

  if (isPrinting) {
    // Diganti total dengan konten laporan polos saat sungguh mencetak —
    // lihat catatan di deklarasi isPrinting soal kenapa ini React
    // conditional render, bukan CSS "hidden print:block". min-h-screen +
    // bg-white WAJIB di sini: tanpa ini, latar belakang mengikuti <body>
    // (yang tetap dark kalau tema aplikasi gelap, karena swap ini tidak
    // lewat @media print sama sekali) — teks gelap di atas latar gelap jadi
    // nyaris tak terbaca, persis bug yang terlihat di Safari.
    return (
      <div className="min-h-screen bg-white p-6">
        {/* Jaring pengaman: kalau window.print() di suatu browser tidak
            sungguh membuka dialog cetak (afterprint jadi tak pernah
            terpicu), tanpa tombol ini pengguna terjebak permanen di
            tampilan laporan tanpa jalan kembali ke aplikasi. */}
        <button
          className="fixed top-3 right-3 z-50 px-3 py-1.5 rounded-md bg-gray-900 text-white text-xs font-semibold shadow-lg print-hide"
          onClick={() => setIsPrinting(false)}
        >
          ← Kembali ke aplikasi
        </button>
        <PrintReportContent
          settings={settings}
          stats={stats}
          groups={groups}
          areas={areas}
          reportInfo={reportInfo}
          heatmapImages={printHeatmaps}
          frontViewImage={printFrontView}
          presets={presets}
        />
      </div>
    );
  }

  return (
    <>
      {!activeProject && (
        <ProjectModal
          onSelectProject={handleSelectProject}
          defaultSettings={settings}
          defaultReportInfo={reportInfo}
        />
      )}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      {showAreaOnboarding && activeProject && (
        <AreaOnboarding
          areas={areas}
          onChange={setAreas}
          onClose={() => setShowAreaOnboarding(false)}
          onOpenFullEditor={() => {
            setActiveTab('map');
            setShowAreaEditor(true);
          }}
        />
      )}
      {showAutoConfig && (
        <AutoConfigModal
          currentSettings={settings}
          areas={areas}
          onClose={() => setShowAutoConfig(false)}
          onApply={(updates) => setSettings((prev) => ({ ...prev, ...updates }))}
        />
      )}

      <div className="app-shell flex flex-col bg-canvas text-ink overflow-hidden">
        {/* ---------------- Top bar ---------------- */}
        <header className="safe-top flex items-center gap-2 px-3 py-2 border-b border-line bg-panel flex-none print-hide">
          <button
            className="btn btn-ghost px-1.5 gap-2 flex-none"
            onClick={() => setShowAbout(true)}
            title="Tentang aplikasi & pengembang"
          >
            <img src="/logo.png" alt="" className="w-6 h-6 object-contain" />
            <span className="text-sm font-semibold tracking-tight">Sub Forge</span>
          </button>
          <div className="min-w-0 flex items-baseline gap-2">
            {activeProject && (
              <span className="text-xs text-ink-2 truncate hidden sm:inline">/ {activeProject.name}</span>
            )}
          </div>

          <span
            className={`chip ml-1 hidden sm:inline-flex ${saveState === 'error' ? 'chip-danger' : ''}`}
            title="Status sinkronisasi cloud"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                saveState === 'error' ? 'bg-danger' : saveState === 'saving' ? 'bg-warn' : 'bg-good'
              }`}
            />
            {saveLabel[saveState]}
          </span>

          {/* overflow-x-auto = jaring pengaman: kalau toolbar tetap lebih
              lebar dari layar (HP sangat sempit), tombolnya bisa digeser
              alih-alih ada yang ter-clip tak terjangkau di luar layar sama
              sekali (bug nyata sebelumnya — select tema kepotong di iPhone). */}
          <div className="ml-auto flex items-center gap-1.5 overflow-x-auto">
            <button
              className="btn hidden lg:inline-flex"
              onClick={() => setShowUtility(true)}
              title="Kalkulator audio pendukung"
            >
              Tools
            </button>
            <button className="btn" onClick={() => setShowAutoConfig(true)} title="Asisten konfigurasi otomatis">
              Asisten
            </button>
            <button
              className="btn"
              onClick={handleExportPdf}
              disabled={preparingReport}
              title="Buat laporan PDF lengkap (konfigurasi, DSP, dan peta SPL tiap frekuensi) — tampilkan preview dulu sebelum dicetak"
            >
              {preparingReport ? (
                <>
                  <span className="sm:hidden">
                    {preparingProgress ? `${preparingProgress.done}/${preparingProgress.total}` : '…'}
                  </span>
                  <span className="hidden sm:inline">
                    Menyiapkan… {preparingProgress ? `${preparingProgress.done}/${preparingProgress.total}` : ''}
                  </span>
                </>
              ) : (
                <>
                  <span className="sm:hidden">PDF</span>
                  <span className="hidden sm:inline">Export PDF</span>
                </>
              )}
            </button>
            <button className="btn" onClick={() => setActiveProject(null)} title="Buka project lain">
              Project
            </button>
            <div className="hidden lg:flex items-center border border-line rounded-md overflow-hidden">
              <button
                onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
                className={`btn rounded-none border-0 border-r border-line px-2 ${isLeftSidebarOpen ? 'bg-hover' : ''}`}
                title={isLeftSidebarOpen ? 'Sembunyikan panel setup' : 'Tampilkan panel setup'}
                aria-pressed={isLeftSidebarOpen}
              >
                ◧
              </button>
              <button
                onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
                className={`btn rounded-none border-0 px-2 ${isRightSidebarOpen ? 'bg-hover' : ''}`}
                title={isRightSidebarOpen ? 'Sembunyikan tabel DSP' : 'Tampilkan tabel DSP'}
                aria-pressed={isRightSidebarOpen}
              >
                ◨
              </button>
            </div>
            <select
              className="select w-auto min-h-0 py-1.5 text-[11px] pl-2"
              value={themeMode}
              onChange={(e) => setThemeMode(e.target.value as ThemeMode)}
              aria-label="Tema tampilan"
              title="Tema tampilan"
            >
              <option value="system">Sistem</option>
              <option value="light">Terang</option>
              <option value="dark">Gelap</option>
            </select>
          </div>
        </header>

        <div className="flex-1 flex flex-col lg:flex-row min-h-0 print-hide">
          {/* ---------------- Panel setup (kiri) ---------------- */}
          {/* Disembunyikan dengan MELEPAS elemen dari DOM (bukan hanya toggle
              class display), supaya browser terpaksa menghitung ulang layout
              dari nol setiap kali dimunculkan lagi. Toggle class display saja
              (tanpa animasi sekalipun) ternyata masih gagal mengembang lagi di
              Safari — indikasi bug reflow WebKit pada flex item bertingkat,
              bukan soal animasi. Unmount/remount tidak bergantung pada mesin
              reflow browser sama sekali. */}
          {(isLeftSidebarOpen || activeTab === 'setup') && (
            <aside
              className={`${activeTab === 'setup' ? 'flex' : 'hidden'} ${
                isLeftSidebarOpen ? 'lg:flex' : 'lg:hidden'
              } flex-none w-full lg:w-80 min-h-0 print-hide`}
            >
              <div className="w-full min-h-0 flex">
                <Sidebar
                  settings={settings}
                  onChange={setSettings}
                  stats={stats}
                  reportInfo={reportInfo}
                  onReportInfoChange={setReportInfo}
                  areas={areas}
                  groups={groups}
                />
              </div>
            </aside>
          )}

          {/* ---------------- Area utama ---------------- */}
          {/* min-w-0 WAJIB: tanpa ini, default CSS flexbox membuat <main>
              menolak menyusut lebih sempit dari konten intrinsiknya (kanvas
              peta) walau flex-1 mengizinkan shrink. Saat lebar total
              [sidebar kiri + main + sidebar kanan] melebihi lebar jendela,
              baris flex meluap dan panel kanan (item terakhir) terdorong ke
              luar area yang terlihat — bukan hilang, hanya ter-clip oleh
              overflow-hidden pada .app-shell. Inilah sebabnya menyembunyikan
              panel kiri "memunculkan" panel kanan lagi: ruang jadi cukup. */}
          {/* Laporan cetak sekarang diganti total lewat conditional render
              React (lihat isPrinting) saat window.print() sungguh dipanggil,
              bukan CSS print:block — jadi kelas print-hide di sini sekadar
              jaring pengaman, bukan mekanisme utamanya lagi. */}
          <main className={`${activeTab === 'map' ? 'flex' : 'hidden'} lg:flex flex-1 flex-col min-h-0 min-w-0 print-hide`}>
            {/* Peta */}
            <div className="flex-1 relative min-h-0 flex m-0 lg:m-2 lg:rounded-lg lg:border border-line overflow-hidden">
              <Visualizer
                settings={settings}
                groups={groups}
                areas={areas}
                activeAreaId={activeAreaId}
                onSelectArea={setActiveAreaId}
                onUpdateArea={(id, updates) =>
                  setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)))
                }
                onChangeSettings={setSettings}
                onOpenAreaEditor={() => setShowAreaEditor(true)}
                areaEditorOpen={showAreaEditor}
                theme={theme}
              />

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
          </main>

          {/* Tabel DSP — dipindah keluar dari <main> agar sejajar (satu level
              flex) dengan panel setup kiri, bukan tersarang dua lapis di
              dalam <main> > row. Nesting yang lebih dalam adalah satu-satunya
              perbedaan struktural tersisa antara panel kiri (sudah terbukti
              berfungsi di Safari setelah di-unmount) dan panel kanan (masih
              gagal) — jadi diratakan supaya keduanya benar-benar simetris. */}
          {isRightSidebarOpen && (
            <aside className="hidden lg:flex flex-none lg:w-96 border-l border-line bg-panel min-h-0 print-hide">
              <div className="w-full min-h-0 flex">
                <DataTable
                  groups={groups}
                  settings={settings}
                  onToggleMute={toggleIn(setMutedPositions)}
                  onToggleCardioid={toggleIn(setDisabledCardioidPositions)}
                  invertedBoxes={invertedBoxes}
                  onToggleBoxInvert={toggleIn(setInvertedBoxes)}
                  disabledCardioidBoxes={disabledCardioidBoxes}
                  onToggleBoxCardioid={toggleIn(setDisabledCardioidBoxes)}
                  mutedBoxes={mutedBoxes}
                  onToggleBoxMute={toggleIn(setMutedBoxes)}
                  onToggleGlobalMute={(type, mute) =>
                    setSettings((prev) => ({ ...prev, [type === 'front' ? 'muteFront' : 'muteRear']: mute }))
                  }
                />
              </div>
            </aside>
          )}

          {/* Tabel DSP versi mobile */}
          <section className={`${activeTab === 'dsp' ? 'flex' : 'hidden'} lg:hidden flex-1 min-h-0 print-hide`}>
            <DataTable
              groups={groups}
              settings={settings}
              onToggleMute={toggleIn(setMutedPositions)}
              onToggleCardioid={toggleIn(setDisabledCardioidPositions)}
              invertedBoxes={invertedBoxes}
              onToggleBoxInvert={toggleIn(setInvertedBoxes)}
              disabledCardioidBoxes={disabledCardioidBoxes}
              onToggleBoxCardioid={toggleIn(setDisabledCardioidBoxes)}
              mutedBoxes={mutedBoxes}
              onToggleBoxMute={toggleIn(setMutedBoxes)}
              onToggleGlobalMute={(type, mute) =>
                setSettings((prev) => ({ ...prev, [type === 'front' ? 'muteFront' : 'muteRear']: mute }))
              }
            />
          </section>

          {/* Utilities */}
          {showUtility && (
            <section className="fixed inset-0 z-40 flex flex-col bg-canvas pb-[52px] lg:pb-0 print-hide">
              <div className="safe-top flex items-center justify-between px-3 py-2 border-b border-line bg-panel flex-none">
                <h2 className="text-sm font-semibold">Audio Utilities</h2>
                <button
                  className="btn"
                  onClick={() => {
                    setShowUtility(false);
                    if (activeTab === 'tools') setActiveTab('map');
                  }}
                >
                  Tutup
                </button>
              </div>
              <AudioUtilities settings={settings} />
            </section>
          )}
        </div>

        {/* ---------------- Tab bar mobile (bawah, ala iOS) ---------------- */}
        {/* z-50 agar tetap dapat ditekan di atas overlay Tools */}
        <nav className="safe-bottom lg:hidden flex-none flex border-t border-line bg-panel relative z-50 print-hide">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => openTab(tab.id)}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'text-accent-hi border-t-2 border-accent -mt-px'
                  : 'text-ink-3 border-t-2 border-transparent -mt-px'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {previewOpen && (
        <PrintPreviewModal
          settings={settings}
          stats={stats}
          groups={groups}
          areas={areas}
          reportInfo={reportInfo}
          heatmapImages={printHeatmaps}
          frontViewImage={printFrontView}
          presets={presets}
          onClose={() => setPreviewOpen(false)}
          onPrint={handlePrintNow}
        />
      )}
    </>
  );
}

export default App;
