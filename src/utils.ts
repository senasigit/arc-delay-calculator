import type { SubwooferSettings, BoxGroup, PhysicalBox, ArrayStats } from './types';

export function calculateArcDelay(settings: SubwooferSettings, mutedPositions: Set<number> = new Set(), disabledCardioidPositions: Set<number> = new Set()): { groups: BoxGroup[], stats: ArrayStats } {
  const { setupType, cardioid, cardioidReversedBoxes } = settings;
  const count = Number(settings.count) || 0;
  const stageWidth = Number(settings.stageWidth) || 0;
  const orientation = settings.orientation;
  const width = Number(settings.width) || 0;
  const depth = Number(settings.depth) || 0;
  const gap = Number(settings.gap) || 0;
  const centralGap = Number(settings.centralGap) || 0;
  const theta = Number(settings.theta) || 0;
  const speedOfSound = Number(settings.speedOfSound) || 343;
  const cardioidDelay = Number(settings.cardioidDelay) || 0;
  const stackCount = Number(settings.stack) || 1;
  const rowsCount = Number(settings.rows) || 1;
  
  const n = setupType.includes('L/R') ? Math.floor(count / 2) * 2 : count;
  
  if (n < 1) return { groups: [], stats: { acousticCenterSpacing: 0, totalArrayLength: 0, upperFreqLimit: 0 } };

  const dimensionX = orientation === 'Landscape' ? width : depth;
  const dimensionY = orientation === 'Landscape' ? depth : width;
  const acousticCenterSpacing = dimensionX + gap;
  
  let totalArrayLength = 0;
  if (n % 2 === 0) {
     totalArrayLength = centralGap + (n - 2) * acousticCenterSpacing + dimensionX;
  } else {
     totalArrayLength = (n - 1) * acousticCenterSpacing + dimensionX;
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
  const rNum = (totalArrayLength - dimensionX) / 2;
  const R = theta > 0 ? rNum / Math.sin(thetaRad / 2) : 0;
  
  const groups: BoxGroup[] = [];
  const isEven = n % 2 === 0;

  // Helpers
  const createGroup = (id: number, label: string, x: number, y: number, virtualY: number, baseGroupDelayMs: number) => {
    const isMuted = mutedPositions.has(id);
    const cardioidDisabled = disabledCardioidPositions.has(id);
    const physicalBoxes: PhysicalBox[] = [];
    const rearPhysicalY = dimensionY;
    const isRowBased = rowsCount > 1;
    const isEndFire = setupType.includes('End-Fire');
    const rowSpacing = Number(settings.rowSpacing) || (dimensionY + gap);
    const spacingY = rowSpacing;
    
    for (let r = 0; r < rowsCount; r++) {
      let rowDelayMs = baseGroupDelayMs;
      
      // End Fire applies specific delay per row (front is max delay, rear is 0 delay)
      // Row 0 is the REAR box (0m), Row 1 is in front of it (-spacingY), etc.
      if (isEndFire && isRowBased) {
          const delayStep = typeof settings.endFireDelayStep === 'number' 
             ? settings.endFireDelayStep 
             : ((spacingY / speedOfSound) * 1000);
          rowDelayMs += r * delayStep;
      }

      for (let s = 0; s < stackCount; s++) {
        const revIndex = isRowBased ? r : s;
        const isCardioidSetup = cardioid || setupType === 'Cardioid L/R';
        const isRear = !isEndFire && isCardioidSetup && !cardioidDisabled && cardioidReversedBoxes[revIndex] === true;
        const boxZ = (s * Number(settings.height)) + (Number(settings.height) / 2);
        
        const rowPhysicalY = (isEndFire ? -r : r) * spacingY;
        const boxY = y + rowPhysicalY + (!isRowBased && isRear ? rearPhysicalY : 0); 
        
        let polarity = 1;
        const isGradientBehavior = setupType === 'Gradient Array' || setupType === 'Cardioid L/R';
        if (isRear || (isGradientBehavior && isRowBased && r > 0)) {
           polarity = settings.invertRearPolarity ? -1 : 1;
        }

        let boxDelayMs = rowDelayMs;
        
        let positionLabel = '';
        if (isRowBased) {
            if (isEndFire) {
                positionLabel = r === 0 ? 'REAR' : (r === rowsCount - 1 ? 'FRONT' : `ROW ${r+1}`);
            } else {
                positionLabel = r === 0 ? 'FRONT' : (r === rowsCount - 1 ? 'REAR' : `ROW ${r+1}`);
            }
        } else {
            positionLabel = isRear ? 'REAR' : 'FRONT';
        }
        
        if (isGradientBehavior) {
           if (isRowBased && r > 0) {
              boxDelayMs += cardioidDelay;
           }
        } else {
           if (isRear) {
              boxDelayMs += cardioidDelay;
           }
        }
        
        physicalBoxes.push({
          stackIndex: isRowBased ? (r * stackCount + s) : s,
          rowIndex: r,
          stackLevel: s,
          x,
          y: boxY,
          z: boxZ,
          delayMs: boxDelayMs,
          polarity: polarity as 1 | -1,
          isRear: isGradientBehavior ? false : isRear,
          positionLabel
        });
      }
    }

    const facingMultiplier = settings.arrayFacing === 'Up' ? -1 : 1;

    groups.push({
      positionId: id,
      label,
      x,
      y: y * facingMultiplier,
      virtualY: virtualY * facingMultiplier,
      baseDelayMs: baseGroupDelayMs,
      muted: isMuted,
      cardioidDisabled,
      boxes: physicalBoxes.map(b => ({ ...b, y: b.y * facingMultiplier }))
    });
  };

  if (setupType === 'Arc Array' || setupType === 'Gradient Array' || setupType === 'End-Fire') {
      // End-Fire Array also uses this distribution (X axis along stage)
      for (let i = 0; i < n; i++) {
        let x = 0;
        let label = '';
        
        if (isEven) {
          const halfIndex = i < n / 2 ? (n / 2 - 1 - i) : (i - n / 2);
          const absX = (centralGap / 2) + (halfIndex * acousticCenterSpacing);
          x = i < n / 2 ? -absX : absX;
          const sideLabel = i < n / 2 ? 'L' : 'R';
          label = `Box ${sideLabel}${halfIndex + 1}`;
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
        if (R > 0 && setupType === 'Arc Array') {
          const rSquared = R * R;
          const xSquared = x * x;
          if (rSquared >= xSquared) {
             virtualY = R - Math.sqrt(rSquared - xSquared);
             delayMs = (virtualY / speedOfSound) * 1000;
          }
        }
        createGroup(i, label, x, 0, virtualY, delayMs);
      }
  } 
  else if (setupType === 'L/R' || setupType === 'Cardioid L/R' || setupType === 'End-Fire L/R') {
      const leftCount = n / 2;
      const rightCount = n / 2;

      // Draw left cluster
      const leftStartX = -(stageWidth / 2) - ((leftCount - 1) * acousticCenterSpacing) / 2;
      for (let i = 0; i < leftCount; i++) {
         const x = leftStartX + (i * acousticCenterSpacing);
         createGroup(i, `${setupType} Left ${i + 1}`, x, 0, 0, 0);
      }

      // Draw right cluster
      const rightStartX = (stageWidth / 2) - ((rightCount - 1) * acousticCenterSpacing) / 2;
      for (let i = 0; i < rightCount; i++) {
         const x = rightStartX + (i * acousticCenterSpacing);
         createGroup(leftCount + i, `${setupType} Right ${i + 1}`, x, 0, 0, 0);
      }
  }

  groups.sort((a, b) => a.positionId - b.positionId);
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
  
  const resMap: Record<string, number> = {
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

  const frequencies = getFrequenciesForBandwidth(Number(frequency) || 63, bandwidth);
  const EAR_HEIGHT = 1.6; 
  
  for (let r = 0; r < rows; r++) {
    const py = r * blockSize; 
    const yMeters = -(py - cy - offsetY) / scale; 
    
    for (let c = 0; c < cols; c++) {
      const px = c * blockSize;
      const xMeters = (px - cx - offsetX) / scale;
      
      let totalSquarePressure = 0;

      for (const freq of frequencies) {
        const k = (2 * Math.PI * freq) / (Number(speedOfSound) || 343);
        let realSum = 0;
        let imagSum = 0;
        
        for (const group of groups) {
          if (group.muted) continue;

          for (const box of group.boxes) {
            const dx = xMeters - box.x;
            const dy = yMeters - box.y; 
            const dz = EAR_HEIGHT - box.z; 
            
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            
            if (distance < 0.1) continue;
            
            const attenuation = 1 / distance;
            const delaySec = box.delayMs / 1000;
            
            const effectiveDistance = distance + (delaySec * (Number(speedOfSound) || 343));
            const phase = k * effectiveDistance;
            
            const pressure = attenuation * box.polarity; 
            
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
