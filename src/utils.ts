import type { SubwooferSettings, BoxCalculation, ArrayStats } from './types';

export function calculateArcDelay(settings: SubwooferSettings): { boxes: BoxCalculation[], stats: ArrayStats } {
  const { count, orientation, width, depth, gap, centralGap, theta, speedOfSound, cardioidDelay } = settings;
  const n = count;
  
  if (n < 1) return { boxes: [], stats: { acousticCenterSpacing: 0, totalArrayLength: 0, upperFreqLimit: 0 } };

  const dimension = orientation === 'Landscape' ? width : depth;
  const acousticCenterSpacing = dimension + gap;
  const totalArrayLength = (n - 1) * acousticCenterSpacing + dimension + centralGap;
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
    if (isEven) {
      const halfIndex = i < n / 2 ? (n / 2 - 1 - i) : (i - n / 2);
      const absX = ((centralGap - gap) / 2) + (acousticCenterSpacing / 2) + (halfIndex * acousticCenterSpacing);
      x = i < n / 2 ? -absX : absX;
    } else {
      const middleIndex = Math.floor(n / 2);
      const offsetIndex = i - middleIndex;
      x = offsetIndex * acousticCenterSpacing;
    }
    
    let y = 0;
    let delayMs = 0;
    
    if (R > 0) {
      const rSquared = R * R;
      const xSquared = x * x;
      if (rSquared >= xSquared) {
         y = R - Math.sqrt(rSquared - xSquared);
         delayMs = (y / speedOfSound) * 1000;
      }
    }
    
    let label = `Box ${i + 1}`;
    if (i === 0) label += " (Paling Kiri)";
    else if (i === n - 1) label += " (Paling Kanan)";
    else if (!isEven && i === Math.floor(n / 2)) label += " (Tengah)";

    boxes.push({
      index: i,
      label,
      x,
      y,
      delayMs,
      totalCardioidDelayMs: delayMs + cardioidDelay
    });
  }
  
  return { boxes, stats };
}

function getFrequenciesForBandwidth(fc: number, bandwidth: string): number[] {
  if (bandwidth === '1/3 Octave') {
    return [
      fc * Math.pow(2, -1/6),
      fc,
      fc * Math.pow(2, 1/6)
    ];
  }
  if (bandwidth === '1 Octave') {
    return [
      fc * Math.pow(2, -1/2),
      fc * Math.pow(2, -1/4),
      fc,
      fc * Math.pow(2, 1/4),
      fc * Math.pow(2, 1/2)
    ];
  }
  if (bandwidth === 'Broadband') {
    return [30, 40, 50, 63, 80, 100, 120];
  }
  return [fc]; // Single
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
  const { speedOfSound, frequency, bandwidth, resolution } = settings;
  
  // Resolusi pixel per block
  const resMap = {
    'Low': 12,
    'Medium': 8,
    'High': 4
  };
  const blockSize = resMap[resolution] || 8;

  const cols = Math.ceil(widthPx / blockSize);
  const rows = Math.ceil(heightPx / blockSize);
  
  const heatmap = new Float32Array(cols * rows);
  let maxSpl = -Infinity;
  let minSpl = Infinity;

  const frequencies = getFrequenciesForBandwidth(frequency, bandwidth);
  
  for (let r = 0; r < rows; r++) {
    // Canvas y coordinate
    const py = r * blockSize; 
    // Adjusted y considering panning (offsetY) and zooming (scale)
    const yMeters = (py - cy - offsetY) / scale; 
    
    for (let c = 0; c < cols; c++) {
      const px = c * blockSize;
      // Adjusted x considering panning (offsetX) and zooming (scale)
      const xMeters = (px - cx - offsetX) / scale;
      
      let totalSquarePressure = 0;

      for (const freq of frequencies) {
        const k = (2 * Math.PI * freq) / speedOfSound;
        let realSum = 0;
        let imagSum = 0;
        
        for (const box of boxes) {
          const dx = xMeters - box.x;
          const dy = yMeters; 
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < 0.1) continue;
          
          const attenuation = 1 / distance;
          const delaySec = box.delayMs / 1000;
          
          // Phase calculation
          // Rear boxes have cardioid delay added? 
          // The visualizer currently simulates an array of boxes firing at the calculated arc delay.
          // Full cardioid simulation would require modeling rear boxes at physical depth offset with reversed polarity and delay.
          // For now, we simulate the forward response based on Arc delay only.
          const phase = k * distance - (2 * Math.PI * freq * delaySec);
          
          realSum += attenuation * Math.cos(phase);
          imagSum += attenuation * Math.sin(phase);
        }
        
        const pressureSquared = (realSum * realSum) + (imagSum * imagSum);
        totalSquarePressure += pressureSquared;
      }
      
      // RMS Pressure
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
  
  const hue = (1 - normalized) * 240; // 0=Red, 240=Blue
  const alpha = normalized > 0.1 ? 0.8 : normalized * 8;
  
  return `hsla(${hue}, 100%, 50%, ${alpha})`;
}
