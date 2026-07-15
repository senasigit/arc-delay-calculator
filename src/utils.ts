import type { SubwooferSettings, BoxGroup, PhysicalBox, ArrayStats } from './types';

export function calculateArcDelay(settings: SubwooferSettings, mutedPositions: Set<number> = new Set(), disabledCardioidPositions: Set<number> = new Set()): { groups: BoxGroup[], stats: ArrayStats } {
  const { count, orientation, width, depth, gap, centralGap, theta, speedOfSound, cardioid, cardioidDelay, stack, cardioidReversedBoxes } = settings;
  const n = count;
  
  if (n < 1) return { groups: [], stats: { acousticCenterSpacing: 0, totalArrayLength: 0, upperFreqLimit: 0 } };

  const dimension = orientation === 'Landscape' ? width : depth;
  const acousticCenterSpacing = dimension + gap;
  
  let totalArrayLength = 0;
  if (n % 2 === 0) {
     totalArrayLength = centralGap + (n - 2) * acousticCenterSpacing + dimension;
  } else {
     totalArrayLength = (n - 1) * acousticCenterSpacing + dimension;
  }
  
  const upperFreqLimit = Math.min(
    (speedOfSound / acousticCenterSpacing) / 2, 
    n % 2 === 0 ? (speedOfSound / centralGap) / 2 : Infinity
  );

  const stats: ArrayStats = {
    acousticCenterSpacing,
    totalArrayLength,
    upperFreqLimit
  };

  const thetaRad = (theta * Math.PI) / 180;
  const rNum = (totalArrayLength - dimension) / 2;
  const R = theta > 0 ? rNum / Math.sin(thetaRad / 2) : 0;
  
  const groups: BoxGroup[] = [];
  const isEven = n % 2 === 0;

  for (let i = 0; i < n; i++) {
    let x = 0;
    let label = '';
    
    if (isEven) {
      const halfIndex = i < n / 2 ? (n / 2 - 1 - i) : (i - n / 2);
      const absX = (centralGap / 2) + (halfIndex * acousticCenterSpacing);
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
    
    const isMuted = mutedPositions.has(i);
    const cardioidDisabled = disabledCardioidPositions.has(i);
    const physicalBoxes: PhysicalBox[] = [];
    const rearPhysicalY = orientation === 'Landscape' ? depth : width;
    
    for (let s = 0; s < stack; s++) {
      const isRear = cardioid && !cardioidDisabled && cardioidReversedBoxes[s] === true;
      const boxZ = (s * settings.height) + (settings.height / 2); // Ketinggian titik pusat box dari lantai
      const boxY = isRear ? rearPhysicalY : 0; 
      
      physicalBoxes.push({
        stackIndex: s,
        x,
        y: boxY,
        z: boxZ,
        delayMs: delayMs + (isRear ? cardioidDelay : 0),
        polarity: isRear ? -1 : 1,
        isRear
      });
    }

    groups.push({
      positionId: i,
      label,
      x,
      virtualY,
      baseDelayMs: delayMs,
      muted: isMuted,
      cardioidDisabled,
      boxes: physicalBoxes
    });
  }
  
  groups.sort((a, b) => a.x - b.x);
  return { groups, stats };
}

function getFrequenciesForBandwidth(fc: number, bandwidth: string): number[] {
  if (bandwidth === '1/3 Octave') return [fc * Math.pow(2, -1/6), fc, fc * Math.pow(2, 1/6)];
  if (bandwidth === '1 Octave') return [fc * Math.pow(2, -1/2), fc * Math.pow(2, -1/4), fc, fc * Math.pow(2, 1/4), fc * Math.pow(2, 1/2)];
  if (bandwidth === 'Broadband') return [30, 40, 50, 63, 80, 100, 120];
  return [fc]; 
}

export function calculate2DSpatialHeatmap(
  settings: SubwooferSettings, 
  groups: BoxGroup[], 
  widthPx: number, 
  heightPx: number, 
  cx: number, 
  cy: number, 
  scale: number,
  offsetX: number,
  offsetY: number
) {
  const { speedOfSound, frequency, bandwidth, resolution, showHeatmap } = settings;
  
  const resMap = {
    'Low': 8,
    'Medium': 4,
    'High': 2 
  };
  const blockSize = resMap[resolution] || 4;

  const cols = Math.ceil(widthPx / blockSize);
  const rows = Math.ceil(heightPx / blockSize);
  
  const heatmap = new Float32Array(cols * rows);
  let maxSpl = -Infinity;
  let minSpl = Infinity;

  if (!showHeatmap) {
      return { heatmap, cols, rows, maxSpl: 0, minSpl: 0, blockSize };
  }

  const frequencies = getFrequenciesForBandwidth(frequency, bandwidth);
  const EAR_HEIGHT = 1.6; // Rata-rata tinggi telinga manusia (1.6 meter)
  
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
        
        for (const group of groups) {
          if (group.muted) continue;

          for (const box of group.boxes) {
            const dx = xMeters - box.x;
            const dy = yMeters - box.y; 
            const dz = EAR_HEIGHT - box.z; // Kalkulasi 3D murni!
            
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            
            if (distance < 0.1) continue;
            
            const attenuation = 1 / distance;
            const delaySec = box.delayMs / 1000;
            
            // Delay menambah jarak tempuh virtual (mengembangkan kurva dispersi)
            const effectiveDistance = distance + (delaySec * speedOfSound);
            const phase = k * effectiveDistance;
            
            const pressure = attenuation * box.polarity; // stackCount is naturally handled by the inner loop
            
            realSum += pressure * Math.cos(phase);
            imagSum += pressure * Math.sin(phase);
          }
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
  const lightness = normalized > 0.05 ? 50 : normalized * 1000; 
  const alpha = normalized > 0.05 ? 0.9 : normalized * 15;
  
  return `hsla(${hue}, 100%, ${lightness}%, ${alpha})`;
}
