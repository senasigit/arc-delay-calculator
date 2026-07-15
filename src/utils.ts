import type { SubwooferSettings, BoxCalculation } from './types';

export function calculateArcDelay(settings: SubwooferSettings): BoxCalculation[] {
  const { count, width, gap, theta, speedOfSound } = settings;
  const n = count;
  
  if (n < 3) return []; // Needs at least 3 boxes for an arc

  // 1. Center-to-center distance (d) = W + G
  const d = width + gap;
  
  // 2. Total Array Length (L) for center-to-center
  const L = (n - 1) * d;
  
  // Convert theta to radians
  const thetaRad = (theta * Math.PI) / 180;
  
  // 3. Imaginary Radius (R) = L / (2 * sin(Theta_in_radians / 2))
  const R = theta > 0 ? L / (2 * Math.sin(thetaRad / 2)) : 0;
  
  const results: BoxCalculation[] = [];
  const middleIndex = Math.floor(n / 2);

  for (let i = 0; i < n; i++) {
    // Tentukan posisi fisik X. Jika box tengah adalah x=0
    const x = (i - middleIndex) * d;
    
    let y = 0;
    let delayMs = 0;
    
    if (R > 0) {
      // Tentukan kemunduran imajiner Y: Y = R - sqrt(R^2 - X^2)
      const rSquared = R * R;
      const xSquared = x * x;
      
      if (rSquared >= xSquared) {
         y = R - Math.sqrt(rSquared - xSquared);
         // Hitung nilai Delay (ms): Delay = (Y / c) * 1000
         delayMs = (y / speedOfSound) * 1000;
      }
    }
    
    let label = `Box ${i + 1}`;
    if (i === 0) label += " (Kiri)";
    else if (i === middleIndex) label += " (Tengah)";
    else if (i === n - 1) label += " (Kanan)";

    results.push({
      index: i,
      label,
      x,
      y,
      delayMs
    });
  }
  
  return results;
}

export interface PolarPoint {
  angleDeg: number;
  magnitude: number; // Normalized 0 to 1
}

export function calculatePolarPattern(settings: SubwooferSettings, boxes: BoxCalculation[]): PolarPoint[] {
  if (boxes.length === 0) return [];
  
  const { speedOfSound, frequency } = settings;
  const points: PolarPoint[] = [];
  
  // Hitung respon polar dari -90 hingga +90 derajat
  // 0 derajat adalah arah depan (on-axis)
  let maxMagnitude = 0;
  const rawMagnitudes: number[] = [];
  
  for (let angle = -90; angle <= 90; angle++) {
    const angleRad = (angle * Math.PI) / 180;
    let realSum = 0;
    let imagSum = 0;
    
    for (const box of boxes) {
      // Selisih jarak relatif untuk sudut angleRad (jika box sejajar sumbu X, gelombang merambat lurus ke arah -Y, 
      // sehingga sudut diukur dari -Y. Arah kedatangan/keberangkatan d = x * sin(angle))
      // Delay (detik)
      const delaySec = box.delayMs / 1000;
      
      // Total waktu rambat/fase = jarak / kecepatan - delay_yang_diberikan
      // Fase = 2 * PI * f * ( x * sin(angle) / c - delaySec )
      const phase = 2 * Math.PI * frequency * ( (box.x * Math.sin(angleRad)) / speedOfSound - delaySec );
      
      realSum += Math.cos(phase);
      imagSum += Math.sin(phase);
    }
    
    const magnitude = Math.sqrt(realSum * realSum + imagSum * imagSum);
    rawMagnitudes.push(magnitude);
    if (magnitude > maxMagnitude) {
      maxMagnitude = magnitude;
    }
  }
  
  // Normalisasi
  for (let i = 0; i <= 180; i++) {
    points.push({
      angleDeg: i - 90,
      magnitude: maxMagnitude > 0 ? rawMagnitudes[i] / maxMagnitude : 0
    });
  }
  
  return points;
}
