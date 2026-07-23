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
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const q = query(collection(db, 'projects'), orderBy('updatedAt', 'desc'));
        const querySnapshot = await getDocs(q);
        const projectsData: ProjectData[] = [];
        querySnapshot.forEach((doc) => {
          projectsData.push({ id: doc.id, ...doc.data() } as ProjectData);
        });
        setProjects(projectsData);
      } catch (e) {
        console.error("Error loading projects:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchProjects();
  }, []);

  const handleCreateNew = async () => {
    if (!newProjectName.trim()) return;
    setCreating(true);
    
    const newProject = {
      name: newProjectName.trim(),
      settings: defaultSettings,
      reportInfo: defaultReportInfo,
      updatedAt: Date.now()
    };
    
    try {
      const docRef = await addDoc(collection(db, 'projects'), newProject);
      onSelectProject({ id: docRef.id, ...newProject });
    } catch (e) {
      console.error("Error creating project:", e);
      alert("Gagal membuat project. Periksa koneksi.");
      setCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm("Hapus project ini secara permanen?")) return;
    try {
      await deleteDoc(doc(db, 'projects', id));
      setProjects(projects.filter(p => p.id !== id));
    } catch(err) {
      console.error(err);
      alert("Gagal menghapus project.");
    }
  };

  const handleEditName = async (e: React.MouseEvent, proj: ProjectData) => {
    e.stopPropagation();
    const newName = window.prompt("Masukkan nama baru untuk project:", proj.name);
    if (!newName || newName.trim() === '' || newName === proj.name) return;
    
    try {
      await updateDoc(doc(db, 'projects', proj.id), { name: newName.trim() });
      setProjects(projects.map(p => p.id === proj.id ? { ...p, name: newName.trim() } : p));
    } catch(err) {
      console.error(err);
      alert("Gagal mengubah nama project.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-[#0a0c10] border border-dark-border rounded-lg shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center mb-2 justify-center">
          <img src="/logo.png" alt="Sub Forge Logo" className="w-10 h-10 mr-3 object-contain" />
          <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-amber-500">Sub Forge</h2>
        </div>
        <p className="text-sm text-yellow-400 mb-6">Pilih project yang sudah ada atau buat baru.</p>
        
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-yellow-400 mb-3">Project Sebelumnya</h3>
          {loading ? (
            <p className="text-xs text-gray-500">Memuat...</p>
          ) : projects.length === 0 ? (
            <p className="text-xs text-gray-500 italic">Belum ada project tersimpan.</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
              {projects.map((proj) => (
                <div
                  key={proj.id}
                  className="w-full flex items-center justify-between bg-[#0f1115] hover:bg-[#1a1d24] border border-dark-border rounded p-3 transition-colors cursor-pointer"
                  onClick={() => onSelectProject(proj)}
                >
                  <div>
                    <p className="font-bold text-accent text-sm">{proj.name}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Terakhir diubah: {new Date(proj.updatedAt).toLocaleString('id-ID')}
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <button 
                      onClick={(e) => handleEditName(e, proj)}
                      className="text-xs bg-gray-800 hover:bg-gray-700 text-yellow-400 px-2 py-1 rounded border border-gray-600 transition-colors"
                      title="Edit Nama Project"
                    >
                      ✏️ Edit
                    </button>
                    <button 
                      onClick={(e) => handleDelete(e, proj.id)}
                      className="text-xs bg-red-900/50 hover:bg-red-800 text-red-300 px-2 py-1 rounded border border-red-800 transition-colors"
                      title="Hapus Project"
                    >
                      🗑️ Hapus
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="border-t border-dark-border pt-4">
          <h3 className="text-sm font-semibold text-yellow-400 mb-3">Buat Project Baru</h3>
          <div className="flex space-x-2">
            <input 
              type="text"
              placeholder="Nama Project Baru..."
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateNew()}
              className="flex-1 bg-[#0f1115] border border-dark-border rounded px-3 py-2 text-white focus:outline-none focus:border-accent transition-colors text-sm"
            />
            <button 
              onClick={handleCreateNew}
              disabled={creating || !newProjectName.trim()}
              className="bg-accent hover:bg-yellow-500 disabled:opacity-50 text-white font-bold px-4 py-2 rounded text-sm transition-colors"
            >
              {creating ? '...' : 'Buat'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
