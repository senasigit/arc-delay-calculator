export interface SubwooferSettings {
  count: number;
  orientation: 'Landscape' | 'Portrait';
  width: number;
  depth: number;
  gap: number;
  centralGap: number;
  theta: number; // in degrees
  speedOfSound: number;
  frequency: number; // in Hz
  cardioid: boolean;
  cardioidDelay: number;
}

export interface BoxCalculation {
  index: number;
  label: string;
  x: number; // Physical X position
  y: number; // Virtual Y displacement
  delayMs: number; // Arc delay
  totalCardioidDelayMs: number; // Arc delay + cardioid delay
}

export interface ArrayStats {
  acousticCenterSpacing: number;
  totalArrayLength: number;
  upperFreqLimit: number;
}
