import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, getDocs, orderBy, query, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import type { ProjectData, SubwooferSettings, ReportInfo } from '../types';

interface ProjectModalProps {
  onSelectProject: (project: ProjectData) => void;
  defaultSettings: SubwooferSettings;
  defaultReportInfo: ReportInfo;
}

export function ProjectModal({ onSelectProject, defaultSettings, defaultReportInfo }: ProjectModalProps) {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const snapshot = await getDocs(query(collection(db, 'projects'), orderBy('updatedAt', 'desc')));
        setProjects(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as ProjectData));
      } catch (e) {
        console.error('Gagal memuat project:', e);
        setLoadError('Tidak bisa terhubung ke cloud. Periksa koneksi internet.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleCreateNew = async () => {
    if (!newProjectName.trim() || creating) return;
    setCreating(true);
    const newProject = {
      name: newProjectName.trim(),
      settings: defaultSettings,
      reportInfo: defaultReportInfo,
      areas: [],
      updatedAt: Date.now(),
    };
    try {
      const docRef = await addDoc(collection(db, 'projects'), newProject);
      onSelectProject({ id: docRef.id, ...newProject });
    } catch (e) {
      console.error('Gagal membuat project:', e);
      alert('Gagal membuat project. Periksa koneksi internet.');
      setCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm('Hapus project ini secara permanen?')) return;
    try {
      await deleteDoc(doc(db, 'projects', id));
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error(err);
      alert('Gagal menghapus project.');
    }
  };

  const handleRename = async (e: React.MouseEvent, proj: ProjectData) => {
    e.stopPropagation();
    const newName = window.prompt('Nama baru project:', proj.name);
    if (!newName?.trim() || newName === proj.name) return;
    try {
      await updateDoc(doc(db, 'projects', proj.id), { name: newName.trim() });
      setProjects((prev) => prev.map((p) => (p.id === proj.id ? { ...p, name: newName.trim() } : p)));
    } catch (err) {
      console.error(err);
      alert('Gagal mengubah nama project.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="panel w-full max-w-md max-h-[85dvh] flex flex-col shadow-2xl">
        <header className="flex-none px-5 pt-5 pb-4 border-b border-line">
          <div className="flex items-center gap-2.5 mb-1">
            <img src="/logo.png" alt="" className="w-7 h-7 object-contain" />
            <h1 className="text-lg font-semibold tracking-tight">Sub Forge</h1>
          </div>
          <p className="section-note">Kalkulator array &amp; delay subwoofer. Pilih project atau buat baru.</p>
        </header>

        <div className="flex-1 scroll-y px-5 py-4">
          <h2 className="field-label">Project tersimpan</h2>
          {loading ? (
            <p className="section-note">Memuat…</p>
          ) : loadError ? (
            <p className="text-[11px] text-danger border border-danger/40 bg-danger/10 rounded px-2 py-1.5">
              {loadError}
            </p>
          ) : projects.length === 0 ? (
            <p className="section-note">Belum ada project tersimpan.</p>
          ) : (
            <ul className="space-y-1.5">
              {projects.map((proj) => (
                <li key={proj.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectProject(proj)}
                    onKeyDown={(e) => e.key === 'Enter' && onSelectProject(proj)}
                    className="flex items-center justify-between gap-2 bg-raised border border-line hover:border-line-strong rounded px-3 py-2.5 cursor-pointer transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{proj.name}</p>
                      <p className="text-[11px] text-ink-3">
                        {proj.updatedAt ? new Date(proj.updatedAt).toLocaleString('id-ID') : '—'}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-none">
                      <button className="btn px-2 min-h-0 py-1 text-[11px]" onClick={(e) => handleRename(e, proj)}>
                        Ubah nama
                      </button>
                      <button
                        className="btn btn-danger px-2 min-h-0 py-1 text-[11px]"
                        onClick={(e) => handleDelete(e, proj.id)}
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="flex-none px-5 py-4 border-t border-line">
          <label htmlFor="newProject" className="field-label">
            Buat project baru
          </label>
          <div className="flex gap-2">
            <input
              id="newProject"
              type="text"
              placeholder="Nama project"
              className="input flex-1"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateNew()}
            />
            <button className="btn btn-primary px-4" onClick={handleCreateNew} disabled={creating || !newProjectName.trim()}>
              {creating ? '…' : 'Buat'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
