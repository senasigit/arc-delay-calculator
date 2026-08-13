import { useState } from 'react';
import type { VenueArea } from '../types';

interface AreaOnboardingProps {
  areas: VenueArea[];
  onChange: (areas: VenueArea[]) => void;
  onClose: () => void;
  onOpenFullEditor: () => void;
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `area-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

interface AreaPreset {
  key: string;
  name: string;
  label: string;
  hint: string;
  color: string;
  build: () => Omit<VenueArea, 'id' | 'name' | 'color'>;
}

/**
 * Nama area di sini SENGAJA cocok dengan pola deteksi otomatis Asisten
 * Konfigurasi (regex /audience|penonton/i dan /stage|panggung/i) — area
 * yang dibuat lewat wizard ini langsung terbaca oleh fitur rekomendasi
 * otomatis tanpa perlu diganti nama manual.
 */
const PRESETS: AreaPreset[] = [
  {
    key: 'audience',
    name: 'Audience',
    label: 'Area Audience (Penonton)',
    hint: 'Area utama penonton — dipakai Asisten untuk menghitung spread & sudut coverage.',
    color: '#3987e5',
    build: () => ({
      shape: 'Rectangle', x: 0, y: 20, width: 24, height: 20, radius: 0,
      rotation: 0,
    }),
  },
  {
    key: 'stage',
    name: 'Stage',
    label: 'Area Stage (Panggung)',
    hint: 'Sumber panggung — dipakai Asisten untuk menghitung rejection zone (End-Fire/Gradient).',
    color: '#c98500',
    // Tepi depan panggung (paling dekat ke barisan sub) diletakkan pas di
    // garis sub (y=0), memanjang ke belakang — tidak menembus barisan sub.
    build: () => ({
      shape: 'Rectangle', x: 0, y: -3, width: 12, height: 6, radius: 0,
      rotation: 0,
    }),
  },
  {
    key: 'foh',
    name: 'FOH',
    label: 'Area FOH (Mix Position)',
    hint: 'Penanda posisi meja mixer FOH — referensi visual, belum dihitung otomatis.',
    color: '#9085e9',
    build: () => ({
      shape: 'Rectangle', x: 0, y: 25, width: 3, height: 3, radius: 0,
      rotation: 0,
    }),
  },
];

export function AreaOnboarding({ areas, onChange, onClose, onOpenFullEditor }: AreaOnboardingProps) {
  const [added, setAdded] = useState<Set<string>>(new Set());

  const addPreset = (preset: AreaPreset) => {
    const newArea: VenueArea = { id: newId(), name: preset.name, color: preset.color, ...preset.build() };
    onChange([...areas, newArea]);
    setAdded((prev) => new Set(prev).add(preset.key));
  };

  const removePreset = (preset: AreaPreset) => {
    onChange(areas.filter((a) => a.name !== preset.name));
    setAdded((prev) => {
      const next = new Set(prev);
      next.delete(preset.key);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="panel w-full max-w-md max-h-[85dvh] flex flex-col shadow-2xl">
        <header className="flex-none px-5 pt-5 pb-4 border-b border-line">
          <h2 className="text-sm font-semibold">Siapkan area venue</h2>
          <p className="section-note mt-1">
            Tambahkan area denah panggung sebelum mulai — Asisten Konfigurasi memakainya untuk menghitung spread
            array secara otomatis. Bisa dilewati dan diatur nanti.
          </p>
        </header>

        <div className="flex-1 scroll-y px-5 py-4 space-y-2.5">
          {PRESETS.map((preset) => {
            const isAdded = added.has(preset.key);
            return (
              <div
                key={preset.key}
                className={`panel p-3 flex items-start gap-3 ${isAdded ? 'border-good/50 bg-good/5' : 'bg-raised'}`}
              >
                <span
                  className="w-3 h-3 rounded-sm flex-none mt-1"
                  style={{ backgroundColor: preset.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold">{preset.label}</p>
                  <p className="section-note mt-0.5">{preset.hint}</p>
                </div>
                <button
                  className={`btn flex-none px-3 min-h-0 py-1.5 text-[11px] ${isAdded ? 'btn-danger' : 'btn-primary'}`}
                  onClick={() => (isAdded ? removePreset(preset) : addPreset(preset))}
                >
                  {isAdded ? 'Hapus' : '+ Tambah'}
                </button>
              </div>
            );
          })}

          <button
            className="btn w-full mt-1"
            onClick={() => {
              onOpenFullEditor();
              onClose();
            }}
          >
            Area lain (VIP, delay zone, dsb.) — buka Area Manager penuh
          </button>
        </div>

        <footer className="flex-none px-5 py-4 border-t border-line flex gap-2">
          <button className="btn flex-1" onClick={onClose}>
            Lewati
          </button>
          <button className="btn btn-primary flex-1" onClick={onClose}>
            Selesai
          </button>
        </footer>
      </div>
    </div>
  );
}
