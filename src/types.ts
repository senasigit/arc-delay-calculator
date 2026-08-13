export type SetupType =
  | 'End-Fire'
  | 'Gradient In-Line'
  | 'Gradient Inverted Stack'
  | 'Auto-Efficiency'
  | 'Pattern Implosion'
  | 'Curved Array'
  | 'Straight Delayed Array'
  | 'L/R'
  | 'End-Fire L/R'
  | 'Cardioid L/R';

export type ShapeType = 'Rectangle' | 'Circle' | 'Triangle' | 'Trapezoid' | 'Semicircle';

export interface VenueArea {
  id: string;
  name: string;
  shape: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  topWidth?: number;
  bottomWidth?: number;
  rotation: number;
  color: string;
  /** Kunci posisi — mencegah tergeser tak sengaja saat drag di peta. */
  locked?: boolean;
}

export interface SubwooferSettings {
  setupType: SetupType;
  stageWidth: number | '';
  count: number | '';
  preset: string;
  orientation: 'Landscape' | 'Portrait';
  arrayFacing: 'Up' | 'Down' | 'Left' | 'Right';
  width: number | '';
  height: number | '';
  depth: number | '';
  stack: number | '';
  gap: number | '';
  rowSpacing: number | ''; // Jarak pusat-ke-pusat antar baris (depan-belakang)
  centralGap: number | ''; // Jarak PUSAT-ke-pusat pasangan box paling tengah (array genap) = gap + lebar box
  theta: number | ''; // Sudut coverage busur
  speedOfSound: number | '';
  temperature: number | ''; // Celsius
  humidity: number | ''; // %
  frequency: number | ''; // Frekuensi pusat heatmap
  targetFrequency: number | ''; // Frekuensi acuan kalkulasi lambda
  bandwidth: 'Single' | '1/3 Octave' | '1 Octave' | 'Broadband';
  resolution: 'Low' | 'Medium' | 'High';
  showHeatmap: boolean;
  heatmapBandStep: number | ''; // 0 = gradasi halus, >0 = kontur bertingkat (dB)
  clipHeatmapToAreas: boolean; // Batasi peta hanya di dalam area venue
  cardioid: boolean;
  cardioidDelay: number | '';
  invertRearPolarity: boolean;
  endFireDelayStep: number | ''; // Override manual step delay End-Fire
  cardioidReversedBoxes: boolean[];
  cardioidSpacers: boolean; // "Mind the gap" — celah udara antar box bertumpuk
  cardioidSpacerSize: number | '';
  rows: number | '';
  earHeight: number | ''; // Ketinggian bidang ukur heatmap (m)
  boxSensitivity: number | ''; // Max SPL satu box @1m, untuk mode SPL absolut
  muteFront?: boolean;
  muteRear?: boolean;
}

export interface PhysicalBox {
  stackIndex: number;
  rowIndex: number;
  stackLevel: number;
  x: number;
  y: number;
  z: number;
  delayMs: number;
  polarity: 1 | -1;
  /** Elemen ini berperan sebagai sumber belakang (cardioid/gradient). */
  isRear: boolean;
  /** Box diputar fisik menghadap belakang (bukan sekadar baris belakang). */
  reversed: boolean;
  muted?: boolean;
  positionLabel: string;
  /**
   * Box ini SECARA STRUKTURAL bisa berperan sebagai elemen cardioid (baris
   * belakang, atau tumpukan yang dicentang di cardioidReversedBoxes) —
   * dihitung SEBELUM toggle nonaktifkan-per-box, supaya tombol C-on/C-off di
   * tabel DSP tidak muncul di box FRONT yang memang tak pernah ikut cardioid.
   */
  cardioidCandidate: boolean;
}

export interface BoxGroup {
  positionId: number;
  label: string;
  x: number;
  y: number;
  /** Pergeseran mundur untuk membentuk busur fisik (m). */
  arcOffset: number;
  baseDelayMs: number;
  muted: boolean;
  cardioidDisabled: boolean;
  boxes: PhysicalBox[];
}

export interface ArrayWarning {
  level: 'error' | 'warn';
  message: string;
}

export interface ArrayStats {
  acousticCenterSpacing: number;
  totalArrayLength: number;
  upperFreqLimit: number;
  arcRadius: number;
  maxArcOffset: number;
  recommendedCardioidDelay?: number;
  warnings: ArrayWarning[];
}

export interface SubwooferPreset {
  id: string;
  name: string;
  width: number;
  height: number;
  depth: number;
  defaultCardioidDelay?: number;
  sensitivity?: number;
}

export interface ReportInfo {
  project: string;
  venue: string;
  engineer: string;
  date: string;
}

export interface ProjectData {
  id: string;
  name: string;
  settings: SubwooferSettings;
  areas?: VenueArea[];
  reportInfo: ReportInfo;
  updatedAt: number;
}

/**
 * Nilai awal tunggal untuk seluruh aplikasi. Dipakai juga saat memuat project
 * lama agar field yang belum ada di dokumen Firestore tidak menjadi undefined
 * (penyebab crash saat dibaca sebagai array/angka).
 */
export const DEFAULT_SETTINGS: SubwooferSettings = {
  // Praktik lapangan: box subwoofer selalu lurus di depan panggung — muka
  // gelombang dibengkokkan lewat delay per box (ilmu "arc delay"), bukan
  // dengan menggeser posisi fisiknya. 'Curved Array' (bengkok fisik) tetap
  // tersedia untuk kasus khusus, tapi bukan default.
  setupType: 'Straight Delayed Array',
  stageWidth: '',
  count: '',
  preset: 'Custom',
  orientation: 'Landscape',
  // Sub menghadap ke kanan: panggung di kiri, audiens membentang ke kanan —
  // orientasi denah yang paling umum dipakai saat menggambar layout venue.
  arrayFacing: 'Right',
  width: '',
  height: '',
  depth: '',
  stack: '',
  gap: 0.5,
  rowSpacing: '',
  centralGap: 1.5, // Ditimpa otomatis begitu gap/dimensi box terisi (lihat Sidebar.applyChange)
  theta: '',
  speedOfSound: '',
  temperature: '',
  humidity: 50,
  frequency: 63,
  targetFrequency: 63,
  bandwidth: '1/3 Octave',
  resolution: 'Medium',
  showHeatmap: false,
  heatmapBandStep: 0,
  clipHeatmapToAreas: false,
  cardioid: false,
  cardioidDelay: 4,
  invertRearPolarity: true,
  endFireDelayStep: '',
  cardioidReversedBoxes: [],
  cardioidSpacers: false,
  cardioidSpacerSize: 0.15,
  rows: '',
  earHeight: 1.6,
  boxSensitivity: 135,
  muteFront: false,
  muteRear: false,
};

/** Gabungkan settings tersimpan dengan default agar selalu lengkap & bertipe benar. */
export function normalizeSettings(saved: Partial<SubwooferSettings> | undefined | null): SubwooferSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(saved ?? {}) } as SubwooferSettings;
  if (!Array.isArray(merged.cardioidReversedBoxes)) merged.cardioidReversedBoxes = [];
  merged.clipHeatmapToAreas = merged.clipHeatmapToAreas === true;
  merged.muteFront = merged.muteFront === true;
  merged.muteRear = merged.muteRear === true;
  return merged;
}
