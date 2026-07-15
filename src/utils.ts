import type { SubwooferSettings, BoxCalculation, ArrayStats } from './types';

export function calculateArcDelay(settings: SubwooferSettings): { boxes: BoxCalculation[], stats: ArrayStats } {
  const { count, orientation, width, depth, gap, centralGap, theta, speedOfSound, cardioidDelay } = settings;
  const n = count;
  
  if (n < 1) return { boxes: [], stats: { acousticCenterSpacing: 0, totalArrayLength: 0, upperFreqLimit: 0 } };

  // Dimension used for spacing depends on orientation
  const dimension = orientation === 'Landscape' ? width : depth;
  
  // Acoustic centre spacing 'y' (in excel, it's box dimension + sub spacing)
  const acousticCenterSpacing = dimension + gap;
  
  // Total Array Length (L)
  // Excel formula D29: =(($D$20-1)*$D$30)+$K$54+$D$22
  // => (N-1) * acousticCenterSpacing + dimension + centralGap
  const totalArrayLength = (n - 1) * acousticCenterSpacing + dimension + centralGap;
  
  // Upper Frequency Limit
  // Excel formula: =MIN((343/D30)/2, (343/(D22+0.01))/2)
  const upperFreqLimit = Math.min(
    (speedOfSound / acousticCenterSpacing) / 2, 
    (speedOfSound / (centralGap + 0.01)) / 2
  );

  const stats: ArrayStats = {
    acousticCenterSpacing,
    totalArrayLength,
    upperFreqLimit
  };

  // Convert theta to radians
  const thetaRad = (theta * Math.PI) / 180;
  
  // Virtual Radius (r)
  // Excel formula D31: =((($D$29-K54)/2)/SIN($F$21/2))
  // => ((TotalLength - dimension) / 2) / sin(theta / 2)
  const rNum = (totalArrayLength - dimension) / 2;
  const R = theta > 0 ? rNum / Math.sin(thetaRad / 2) : 0;
  
  const boxes: BoxCalculation[] = [];
  const isEven = n % 2 === 0;

  for (let i = 0; i < n; i++) {
    let x = 0;
    
    // Hitung Posisi X berdasarkan ganjil/genap (sama persis dengan excel)
    if (isEven) {
      // Excel D44 (Even): =(($D$22-$D$23)/2)+($D$30/2)+(index * $D$30)
      // Where index goes from 0 to N/2 - 1 for one side.
      // We will map i from 0 to n-1.
      const halfIndex = i < n / 2 ? (n / 2 - 1 - i) : (i - n / 2);
      const absX = ((centralGap - gap) / 2) + (acousticCenterSpacing / 2) + (halfIndex * acousticCenterSpacing);
      x = i < n / 2 ? -absX : absX;
    } else {
      // Excel D42 (Odd): index * $D$30
      const middleIndex = Math.floor(n / 2);
      const offsetIndex = i - middleIndex;
      x = offsetIndex * acousticCenterSpacing;
    }
    
    let y = 0;
    let delayMs = 0;
    
    if (R > 0) {
      // Virtual displacement Y = R - sqrt(R^2 - X^2)
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

export function calculate2DSpatialHeatmap(
  settings: SubwooferSettings, 
  boxes: BoxCalculation[], 
  widthPx: number, 
  heightPx: number, 
  cx: number, 
  cy: number, 
  scale: number,
  resolution: number // block size in pixels
) {
  const { speedOfSound, frequency } = settings;
  const cols = Math.ceil(widthPx / resolution);
  const rows = Math.ceil(heightPx / resolution);
  
  const heatmap = new Float32Array(cols * rows);
  let maxSpl = -Infinity;
  let minSpl = Infinity;

  // Pre-calculate angular frequency
  const k = (2 * Math.PI * frequency) / speedOfSound;

  for (let r = 0; r < rows; r++) {
    const py = r * resolution;
    // Jarak Y dalam meter dari titik array (cy)
    // Di canvas, y membesar ke bawah. cy adalah posisi array (Y=0).
    // Depan array adalah daerah di mana y < cy.
    const yMeters = (py - cy) / scale; 
    
    for (let c = 0; c < cols; c++) {
      const px = c * resolution;
      // Jarak X dalam meter dari titik tengah (cx)
      const xMeters = (px - cx) / scale;
      
      let realSum = 0;
      let imagSum = 0;
      
      for (const box of boxes) {
        // Jarak dari box ke titik koordinat 2D
        const dx = xMeters - box.x;
        const dy = yMeters; // Box selalu di Y=0 (fisik)
        
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Skip jika terlalu dekat (mencegah infinity)
        if (distance < 0.1) continue;
        
        // Penurunan tekanan karena jarak (1/r)
        const attenuation = 1 / distance;
        
        // Fasa total = k * (jarak) - 2 * PI * f * delay_in_seconds
        const delaySec = box.delayMs / 1000;
        const phase = k * distance - (2 * Math.PI * frequency * delaySec);
        
        realSum += attenuation * Math.cos(phase);
        imagSum += attenuation * Math.sin(phase);
      }
      
      // Magnitude SPL
      const pressure = Math.sqrt(realSum * realSum + imagSum * imagSum);
      
      // Konversi ke dB
      // pressure = 0 -> -inf, batas aman log10(1e-12)
      const spl = pressure > 1e-12 ? 20 * Math.log10(pressure) : -240;
      
      heatmap[r * cols + c] = spl;
      if (spl > maxSpl) maxSpl = spl;
      if (spl < minSpl && spl > -240) minSpl = spl;
    }
  }

  return { heatmap, cols, rows, maxSpl, minSpl };
}

export function splToColor(spl: number, maxSpl: number, dynamicRange: number = 40): string {
  // SPL heatmap color logic (Rainbow: Red -> Yellow -> Green -> Blue)
  // SPL is relative to maxSpl. 
  // 0 dB relative to max = Red (1.0)
  // -dynamicRange dB relative to max = Blue (0.0)
  
  const relativeSpl = spl - maxSpl;
  let normalized = 1 + (relativeSpl / dynamicRange);
  if (normalized < 0) normalized = 0;
  if (normalized > 1) normalized = 1;
  
  // Hue map: 0 = Red, 240 = Blue. We want normalized=1 to be Red, 0 to be Blue.
  const hue = (1 - normalized) * 240;
  // Saturation 100%, Lightness 50%
  // But for aesthetic prediction maps, slightly dim the very quiet areas
  const alpha = normalized > 0.1 ? 0.7 : normalized * 7;
  
  return `hsla(${hue}, 100%, 50%, ${alpha})`;
}
