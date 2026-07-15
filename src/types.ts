export interface SubwooferSettings {
  count: number;
  preset: string; // 'Custom' or preset name
  orientation: 'Landscape' | 'Portrait';
  width: number;
  height: number;
  depth: number;
  stack: number; // Total tumpukan per posisi
  gap: number;
  centralGap: number;
  theta: number; // in degrees
  speedOfSound: number;
  frequency: number; // in Hz
  bandwidth: 'Single' | '1/3 Octave' | '1 Octave' | 'Broadband';
  resolution: 'Low' | 'Medium' | 'High';
  showHeatmap: boolean;
  cardioid: boolean;
  cardioidDelay: number;
  cardioidReversedCount: number; // Berapa box yg dibalik dari total stack
}

export interface BoxCalculation {
  index: number;
  positionId: number; // Group ID untuk Mute per stack
  label: string;
  x: number; // Physical X position
  y: number; // Physical Y displacement
  virtualY: number; // Virtual Y displacement from arc delay
  delayMs: number; // Total Delay applied to this box
  polarity: 1 | -1; // 1 for front, -1 for rear cardioid
  isRear: boolean;
  stackCount: number; // Berapa box yg merepresentasikan titik ini
  muted: boolean;
  totalCardioidDelayMs?: number; // Info column
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
