import type { VenueArea, ShapeType } from '../types';

interface AreaEditorProps {
  areas: VenueArea[];
  onChange: (areas: VenueArea[]) => void;
  activeAreaId: string | null;
  onSelectArea: (id: string | null) => void;
  onClose: () => void;
}

const SHAPES: { shape: ShapeType; label: string }[] = [
  { shape: 'Rectangle', label: 'Persegi' },
  { shape: 'Circle', label: 'Lingkaran' },
  { shape: 'Semicircle', label: 'Setengah lingkaran' },
  { shape: 'Triangle', label: 'Segitiga' },
  { shape: 'Trapezoid', label: 'Trapesium' },
];

const AREA_COLORS = ['#3987e5', '#199e70', '#c98500', '#e66767', '#9085e9'];

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `area-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

export function AreaEditor({ areas, onChange, activeAreaId, onSelectArea, onClose }: AreaEditorProps) {
  const activeArea = areas.find((a) => a.id === activeAreaId);

  const handleAddArea = (shape: ShapeType) => {
    const boxy = shape === 'Rectangle' || shape === 'Triangle' || shape === 'Trapezoid';
    const newArea: VenueArea = {
      id: newId(),
      name: `Area ${areas.length + 1}`,
      shape,
      x: 0,
      y: 10,
      width: boxy ? 20 : 0,
      height: boxy ? 15 : 0,
      radius: shape === 'Circle' || shape === 'Semicircle' ? 10 : 0,
      topWidth: shape === 'Trapezoid' ? 10 : 0,
      bottomWidth: shape === 'Trapezoid' ? 20 : 0,
      rotation: 0,
      color: AREA_COLORS[areas.length % AREA_COLORS.length],
    };
    onChange([...areas, newArea]);
    onSelectArea(newArea.id);
  };

  const update = (updates: Partial<VenueArea>) => {
    if (!activeAreaId) return;
    onChange(areas.map((a) => (a.id === activeAreaId ? { ...a, ...updates } : a)));
  };

  // Posisi X/Y hasil geser mouse (screenToWorld di Visualizer) selalu punya
  // sisa desimal panjang dari pembagian dengan scale (mis. 4.011403189135647)
  // — dibulatkan ke 1 cm supaya input tetap enak dibaca dan diketik ulang.
  const round2 = (v: number) => Math.round(v * 100) / 100;

  /**
   * Semua field numerik wajib melewati parser. Sebelumnya nilai disimpan
   * sebagai string sehingga menggeser area setelah mengetik menghasilkan
   * penggabungan string ("10" + 0.5 = "100.5") dan area melompat jauh.
   */
  const numberField = (
    key: 'x' | 'y' | 'width' | 'height' | 'radius' | 'topWidth' | 'bottomWidth' | 'rotation',
    label: string,
    min?: number
  ) => (
    <div>
      <label htmlFor={`area-${key}`} className="field-label">
        {label}
      </label>
      <input
        id={`area-${key}`}
        type="number"
        inputMode="decimal"
        step="0.5"
        min={min}
        className="input"
        value={activeArea ? round2(activeArea[key] ?? 0) : 0}
        onChange={(e) => {
          const parsed = parseFloat(e.target.value);
          const rounded = Number.isFinite(parsed) ? round2(parsed) : 0;
          update({ [key]: min !== undefined ? Math.max(min, rounded) : rounded });
        }}
      />
    </div>
  );

  const handleDelete = (id: string) => {
    onChange(areas.filter((a) => a.id !== id));
    if (activeAreaId === id) onSelectArea(null);
  };

  const toggleLock = (id: string) => {
    onChange(areas.map((a) => (a.id === id ? { ...a, locked: !a.locked } : a)));
  };

  return (
    <div className="absolute z-30 panel bg-panel/95 backdrop-blur-sm flex flex-col inset-x-2 bottom-2 max-h-[62%] lg:inset-x-auto lg:bottom-auto lg:top-2 lg:right-2 lg:w-72 lg:max-h-[calc(100%-1rem)] print-hide">
      <header className="flex-none flex items-center justify-between px-3 py-2 border-b border-line">
        <h3 className="text-xs font-semibold">Area venue</h3>
        <button className="btn btn-ghost px-2" onClick={onClose} aria-label="Tutup editor area">
          ✕
        </button>
      </header>

      <div className="flex-1 scroll-y p-3 space-y-3">
        <div>
          <span className="field-label">Tambah area</span>
          <div className="grid grid-cols-2 gap-1.5">
            {SHAPES.map(({ shape, label }) => (
              <button
                key={shape}
                className={`btn text-[11px] ${shape === 'Semicircle' ? 'col-span-2' : ''}`}
                onClick={() => handleAddArea(shape)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="field-label">Daftar area</span>
          {areas.length === 0 ? (
            <p className="section-note">Belum ada area. Beri nama "Audience" dan "Stage" agar asisten bisa membacanya.</p>
          ) : (
            <ul className="space-y-1">
              {areas.map((area) => (
                <li key={area.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectArea(area.id)}
                    onKeyDown={(e) => e.key === 'Enter' && onSelectArea(area.id)}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer text-[11px] ${
                      activeAreaId === area.id ? 'border-accent bg-accent/12 text-ink' : 'border-line bg-raised text-ink-2'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-sm flex-none" style={{ backgroundColor: area.color }} />
                    <span className="truncate flex-1">{area.name}</span>
                    <button
                      className={`btn btn-ghost px-1.5 min-h-0 py-0.5 ${area.locked ? 'text-accent-hi' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLock(area.id);
                      }}
                      aria-pressed={!!area.locked}
                      aria-label={area.locked ? `Buka kunci ${area.name}` : `Kunci posisi ${area.name}`}
                      title={area.locked ? 'Posisi terkunci — klik untuk buka' : 'Kunci posisi agar tidak tergeser tak sengaja'}
                    >
                      {area.locked ? '🔒' : '🔓'}
                    </button>
                    <button
                      className="btn btn-ghost px-1.5 min-h-0 py-0.5 text-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(area.id);
                      }}
                      aria-label={`Hapus ${area.name}`}
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {activeArea && (
          <div className="pt-3 border-t border-line space-y-2.5">
            <div>
              <label htmlFor="area-name" className="field-label">
                Nama area
              </label>
              <input
                id="area-name"
                type="text"
                className="input"
                value={activeArea.name}
                onChange={(e) => update({ name: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="field-label !mb-0">Posisi</span>
              <button
                className={`btn px-2 min-h-0 py-1 text-[11px] ${activeArea.locked ? 'btn-primary' : ''}`}
                onClick={() => toggleLock(activeArea.id)}
                aria-pressed={!!activeArea.locked}
                title="Saat terkunci, area ini tidak bisa digeser dengan drag di peta"
              >
                {activeArea.locked ? '🔒 Terkunci' : '🔓 Kunci posisi'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {numberField('x', 'Posisi X (m)')}
              {numberField('y', 'Posisi Y (m)')}
            </div>
            {activeArea.locked && (
              <p className="section-note">Posisi terkunci — tidak bisa digeser dengan drag di peta. Field di atas tetap bisa diketik manual.</p>
            )}

            {activeArea.shape === 'Circle' || activeArea.shape === 'Semicircle' ? (
              numberField('radius', 'Radius (m)', 0.1)
            ) : activeArea.shape === 'Trapezoid' ? (
              <div className="grid grid-cols-2 gap-2">
                {numberField('topWidth', 'Lebar atas (m)', 0.1)}
                {numberField('bottomWidth', 'Lebar bawah (m)', 0.1)}
                <div className="col-span-2">{numberField('height', 'Kedalaman (m)', 0.1)}</div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {numberField('width', 'Lebar (m)', 0.1)}
                {numberField('height', 'Kedalaman (m)', 0.1)}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {numberField('rotation', 'Rotasi (°)')}
              <div>
                <label htmlFor="area-color" className="field-label">
                  Warna
                </label>
                <input
                  id="area-color"
                  type="color"
                  className="input p-1 h-9"
                  value={activeArea.color}
                  onChange={(e) => update({ color: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
