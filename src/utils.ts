import type { SubwooferSettings, BoxCalculation, ArrayStats, SubwooferPreset } from './types';

export const SUBWOOFER_PRESETS: SubwooferPreset[] = [
  { id: 'Custom', name: 'Custom Dimension', width: 1.15, depth: 0.75 },
  { id: 'SX110', name: 'Martin Audio SX110', width: 0.417, depth: 0.297 },
  { id: 'SX210', name: 'Martin Audio SX210', width: 0.720, depth: 0.295 },
  { id: 'SX112', name: 'Martin Audio SX112', width: 0.487, depth: 0.385 },
  { id: 'SX212', name: 'Martin Audio SX212', width: 0.872, depth: 0.385 },
  { id: 'SXF115', name: 'Martin Audio SXF115', width: 0.500, depth: 0.510 },
  { id: 'SXC118', name: 'Martin Audio SXC118', width: 0.635, depth: 0.603 },
  { id: 'SX118', name: 'Martin Audio SX118', width: 0.600, depth: 0.509 },
  { id: 'SX218', name: 'Martin Audio SX218', width: 1.085, depth: 0.537 },
  { id: 'SXH218', name: 'Martin Audio SXH218', width: 1.112, depth: 0.609 },
  { id: 'MSX', name: 'Martin Audio MSX', width: 0.500, depth: 0.510 },
  { id: 'DSX', name: 'Martin Audio DSX', width: 1.125, depth: 0.595 },
  { id: 'MLX', name: 'Martin Audio MLX', width: 1.126, depth: 0.607 },
];

export function calculateArcDelay(settings: SubwooferSettings): { boxes: BoxCalculation[], stats: ArrayStats } {
  const { count, orientation, width, depth, gap, centralGap, theta, speedOfSound, cardioid, cardioidDelay } = settings;
  const n = count;
  
  if (n < 1) return { boxes: [], stats: { acousticCenterSpacing: 0, totalArrayLength: 0, upperFreqLimit: 0 } };

  const dimension = orientation === 'Landscape' ? width : depth;
  const acousticCenterSpacing = dimension + gap;
  const totalArrayLength = (n - 1) * acousticCenterSpacing + dimension + (n % 2 === 0 ? centralGap - gap : 0);
  const upperFreqLimit = Math.min(
    (speedOfSound / acousticCenterSpacing) / 2, 
    (speedOfSound / (centralGap + 0.01)) / 2
  );

  const stats: ArrayStats = {
    acousticCenterSpacing,
    totalArrayLength,
    upperFreqLimit
  };

  const thetaRad = (theta * Math.PI) / 180;
  const rNum = (totalArrayLength - dimension) / 2;
  const R = theta > 0 ? rNum / Math.sin(thetaRad / 2) : 0;
  
  const boxes: BoxCalculation[] = [];
  const isEven = n % 2 === 0;

  for (let i = 0; i < n; i++) {
    let x = 0;
    let label = '';
    
    if (isEven) {
      const halfIndex = i < n / 2 ? (n / 2 - 1 - i) : (i - n / 2);
      const absX = ((centralGap - gap) / 2) + (acousticCenterSpacing / 2) + (halfIndex * acousticCenterSpacing);
      x = i < n / 2 ? -absX : absX;
      
      const sideLabel = i < n / 2 ? 'L' : 'R';
      const posLabel = halfIndex + 1;
      label = `Box ${sideLabel}${posLabel}`;
    } else {
      const middleIndex = Math.floor(n / 2);
      const offsetIndex = i - middleIndex;
      x = offsetIndex * acousticCenterSpacing;
      
      if (offsetIndex === 0) {
        label = `Box C (Tengah)`;
      } else {
        const sideLabel = offsetIndex < 0 ? 'L' : 'R';
        label = `Box ${sideLabel}${Math.abs(offsetIndex)}`;
      }
    }
    
    let virtualY = 0;
    let delayMs = 0;
    
    if (R > 0) {
      const rSquared = R * R;
      const xSquared = x * x;
      if (rSquared >= xSquared) {
         virtualY = R - Math.sqrt(rSquared - xSquared);
         delayMs = (virtualY / speedOfSound) * 1000;
      }
    }
    
    // Front Box
    boxes.push({
      index: i * 2, // reserve space for rear box
      label: label + (cardioid ? ' (Front)' : ''),
      x,
      y: 0,
      virtualY,
      delayMs,
      polarity: 1,
      isRear: false,
      totalCardioidDelayMs: delayMs + cardioidDelay
    });
    
    // Rear Cardioid Box (Gradient setup: physically behind)
    if (cardioid) {
      // Typically rear box is placed directly behind the front box
      // Distance is physical depth. In our coordinate system, y goes positive backwards.
      const rearPhysicalY = orientation === 'Landscape' ? depth : width;
      
      boxes.push({
        index: i * 2 + 1,
        label: label + ' (Rear)',
        x,
        y: rearPhysicalY, 
        virtualY,
        delayMs: delayMs + cardioidDelay, // Total delay includes arc + cardioid delay
        polarity: -1, // Polarity inversion for rejection
        isRear: true
      });
    }
  }
  
  // Sort from Left to Right for better table display
  boxes.sort((a, b) => a.x - b.x);
  
  return { boxes, stats };
}

function getFrequenciesForBandwidth(fc: number, bandwidth: string): number[] {
  if (bandwidth === '1/3 Octave') return [fc * Math.pow(2, -1/6), fc, fc * Math.pow(2, 1/6)];
  if (bandwidth === '1 Octave') return [fc * Math.pow(2, -1/2), fc * Math.pow(2, -1/4), fc, fc * Math.pow(2, 1/4), fc * Math.pow(2, 1/2)];
  if (bandwidth === 'Broadband') return [30, 40, 50, 63, 80, 100, 120];
  return [fc]; 
}

export function calculate2DSpatialHeatmap(
  settings: SubwooferSettings, 
  boxes: BoxCalculation[], 
  widthPx: number, 
  heightPx: number, 
  cx: number, 
  cy: number, 
  scale: number,
  offsetX: number,
  offsetY: number
) {
  const { speedOfSound, frequency, bandwidth, resolution, stack } = settings;
  
  // Offscreen canvas logic: We calculate a lower resolution heatmap and return raw pixels
  // HD resolution mapping
  const resMap = {
    'Low': 8,
    'Medium': 5,
    'High': 2 // Very high detail, more CPU
  };
  const blockSize = resMap[resolution] || 5;

  const cols = Math.ceil(widthPx / blockSize);
  const rows = Math.ceil(heightPx / blockSize);
  
  const heatmap = new Float32Array(cols * rows);
  let maxSpl = -Infinity;
  let minSpl = Infinity;

  const frequencies = getFrequenciesForBandwidth(frequency, bandwidth);
  
  // Stacking multiplier (n boxes stacked vertically adds coherent pressure)
  // 2 boxes = +6dB pressure (pressure * 2)
  // For SPL mapping we just multiply pressure by stack count.
  const stackMultiplier = Math.max(1, stack);
  
  for (let r = 0; r < rows; r++) {
    const py = r * blockSize; 
    const yMeters = (py - cy - offsetY) / scale; 
    
    for (let c = 0; c < cols; c++) {
      const px = c * blockSize;
      const xMeters = (px - cx - offsetX) / scale;
      
      let totalSquarePressure = 0;

      for (const freq of frequencies) {
        const k = (2 * Math.PI * freq) / speedOfSound;
        let realSum = 0;
        let imagSum = 0;
        
        for (const box of boxes) {
          const dx = xMeters - box.x;
          const dy = yMeters - box.y; // Physical Y offset matters for cardioid 
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < 0.1) continue;
          
          const attenuation = 1 / distance;
          const delaySec = box.delayMs / 1000;
          
          const phase = k * distance - (2 * Math.PI * freq * delaySec);
          const pressure = attenuation * box.polarity * stackMultiplier;
          
          realSum += pressure * Math.cos(phase);
          imagSum += pressure * Math.sin(phase);
        }
        
        const pressureSquared = (realSum * realSum) + (imagSum * imagSum);
        totalSquarePressure += pressureSquared;
      }
      
      const rmsPressure = Math.sqrt(totalSquarePressure / frequencies.length);
      const spl = rmsPressure > 1e-12 ? 20 * Math.log10(rmsPressure) : -240;
      
      heatmap[r * cols + c] = spl;
      if (spl > maxSpl) maxSpl = spl;
      if (spl < minSpl && spl > -240) minSpl = spl;
    }
  }

  return { heatmap, cols, rows, maxSpl, minSpl, blockSize };
}

export function splToColor(spl: number, maxSpl: number, dynamicRange: number = 40): string {
  const relativeSpl = spl - maxSpl;
  let normalized = 1 + (relativeSpl / dynamicRange);
  if (normalized < 0) normalized = 0;
  if (normalized > 1) normalized = 1;
  
  const hue = (1 - normalized) * 240; 
  // Add some visual punch to the SPL map
  const lightness = normalized > 0.05 ? 50 : normalized * 1000; 
  const alpha = normalized > 0.05 ? 0.9 : normalized * 15;
  
  return `hsla(${hue}, 100%, ${lightness}%, ${alpha})`;
}
