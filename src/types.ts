export type SetupType = 'End-Fire' | 'Gradient In-Line' | 'Gradient Inverted Stack' | 'Auto-Efficiency' | 'Pattern Implosion' | 'Curved Array' | 'Straight Delayed Array' | 'L/R' | 'End-Fire L/R' | 'Cardioid L/R';
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
  rowSpacing: number | ''; // Jarak Muka ke Muka (Front-to-Front)
  rowGap: number | ''; // Jarak fisik antar baris (depan-belakang)
  centralGap: number | '';
  theta: number | ''; // Spread angle for Arc Array
  speedOfSound: number | '';
  temperature: number | ''; // in Celsius
  humidity: number | ''; // in %
  frequency: number | ''; // Frequency for Heatmap
  targetFrequency: number | ''; // Target Frequency for 1/4 Lambda calculations
  bandwidth: 'Single' | '1/3 Octave' | '1 Octave' | 'Broadband';
  resolution: 'Low' | 'Medium' | 'High';
  showHeatmap: boolean;
  cardioid: boolean;
  cardioidDelay: number | '';
  invertRearPolarity: boolean; // Option to invert rear box polarity
  endFireDelayStep: number | ''; // Manual override for End-Fire delay step
  cardioidReversedBoxes: boolean[]; 
  cardioidSpacers: boolean; // Mind the Gap feature
  cardioidSpacerSize: number | ''; // Size of the spacer in meters
  rows: number | ''; // For Array Depth
  muteFront?: boolean;
  muteRear?: boolean;
}

export interface PhysicalBox {
  stackIndex: number; 
  rowIndex?: number;
  stackLevel?: number;
  x: number;
  y: number; 
  z: number; 
  delayMs: number; 
  polarity: 1 | -1; 
  isRear: boolean;
  muted?: boolean;
  positionLabel: string;
}

export interface BoxGroup {
  positionId: number; 
  label: string;
  x: number; 
  y: number;
  virtualY: number; 
  baseDelayMs: number; 
  muted: boolean;
  cardioidDisabled: boolean; // Menandakan apakah posisi ini mengabaikan pola cardioid
  boxes: PhysicalBox[];
}

export interface ArrayStats {
  acousticCenterSpacing: number;
  totalArrayLength: number;
  upperFreqLimit: number;
}

export interface SubwooferPreset {
  id: string;
  name: string;
  width: number;
  height: number;
  depth: number;
  defaultCardioidDelay?: number;
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
