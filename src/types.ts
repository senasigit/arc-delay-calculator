export interface SubwooferSettings {
  count: number;
  width: number;
  depth: number;
  gap: number;
  theta: number; // in degrees
  speedOfSound: number;
  frequency: number; // in Hz
}

export interface BoxCalculation {
  index: number;
  label: string;
  x: number;
  y: number;
  delayMs: number;
}
