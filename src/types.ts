export type SetupType = 'Arc Array' | 'L/R' | 'End-Fire' | 'Cardioid L/R' | 'End-Fire L/R' | 'Gradient Array';

export interface SubwooferSettings {
  setupType: SetupType;
  stageWidth: number;
  count: number;
  preset: string; 
  orientation: 'Landscape' | 'Portrait';
  width: number;
  height: number;
  depth: number;
  stack: number; 
  gap: number;
  centralGap: number;
  theta: number; 
  speedOfSound: number;
  frequency: number; 
  bandwidth: 'Single' | '1/3 Octave' | '1 Octave' | 'Broadband';
  resolution: 'Low' | 'Medium' | 'High';
  showHeatmap: boolean;
  cardioid: boolean;
  cardioidDelay: number;
  cardioidReversedBoxes: boolean[]; 
}

export interface PhysicalBox {
  stackIndex: number; 
  x: number;
  y: number; 
  z: number; 
  delayMs: number; 
  polarity: 1 | -1; 
  isRear: boolean;
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
}

export interface ReportInfo {
  project: string;
  venue: string;
  engineer: string;
  date: string;
}
