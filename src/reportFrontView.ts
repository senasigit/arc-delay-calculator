import type { SubwooferSettings, BoxGroup } from './types';
import { canvasColors } from './theme';
import { findGapPairs, drawGapDimensionLine, formatMeters } from './utils';

/**
 * Gambar statis "tampak depan" (elevasi) untuk laporan PDF — versi ringkas
 * dari mode "Depan" di Visualizer.tsx, digambar ulang ke kanvas offscreen
 * dengan latar putih supaya cocok dicetak di kertas.
 */

const IMG_W = 900;
const IMG_H = 360;

export function generateFrontViewImage(settings: SubwooferSettings, groups: BoxGroup[]): string {
  const canvas = document.createElement('canvas');
  canvas.width = IMG_W;
  canvas.height = IMG_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const col = canvasColors('light');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, IMG_W, IMG_H);

  const dimensionX = settings.orientation === 'Landscape' ? Number(settings.width) || 0 : Number(settings.height) || 0;
  const dimensionZ = settings.orientation === 'Landscape' ? Number(settings.height) || 0 : Number(settings.width) || 0;

  let minX = Infinity, maxX = -Infinity, maxZ = 0, hasBoxes = false;
  for (const g of groups) {
    for (const b of g.boxes) {
      minX = Math.min(minX, b.x - dimensionX / 2);
      maxX = Math.max(maxX, b.x + dimensionX / 2);
      maxZ = Math.max(maxZ, b.z + dimensionZ / 2);
      hasBoxes = true;
    }
  }
  if (!hasBoxes) {
    minX = -2;
    maxX = 2;
    maxZ = Math.max(dimensionZ, 1);
  }

  const spanX = Math.max(maxX - minX, 1) * 1.15;
  const spanZ = Math.max(maxZ, 1) * 1.3;
  const padSide = 40, padTop = 26, padBottom = 50;
  const scale = Math.min((IMG_W - padSide * 2) / spanX, (IMG_H - padTop - padBottom) / spanZ, 220);
  const contentCX = (minX + maxX) / 2;
  const originX = IMG_W / 2 - contentCX * scale;
  const groundY = IMG_H - padBottom;

  // Lantai
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padSide * 0.3, Math.round(groundY) + 0.5);
  ctx.lineTo(IMG_W - padSide * 0.3, Math.round(groundY) + 0.5);
  ctx.stroke();

  // Grid tinggi + label meter
  const MIN_LABEL_PX = 40;
  const rawStep = MIN_LABEL_PX / Math.max(scale, 1e-6);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const stepF = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const decF = stepF < 1 ? (stepF < 0.1 ? 2 : 1) : 0;

  ctx.font = '10px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let h = 0; h <= maxZ + stepF; h += stepF) {
    const y = groundY - h * scale;
    if (y < padTop - 10) break;
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padSide * 0.3, Math.round(y) + 0.5);
    ctx.lineTo(IMG_W - padSide * 0.3, Math.round(y) + 0.5);
    ctx.stroke();
    ctx.fillStyle = '#555';
    ctx.fillText(`${h.toFixed(decF)} m`, padSide * 0.3 - 6, y);
  }

  // Box per posisi, ditumpuk sesuai box.z
  const MIN_BOX_PX = 16;
  groups.forEach((group) => {
    group.boxes.forEach((box) => {
      const rawWf = dimensionX * scale;
      const rawHf = dimensionZ * scale;
      let wF: number, hF: number;
      if (rawWf > 0 && rawHf > 0) {
        const growF = Math.max(1, MIN_BOX_PX / Math.min(rawWf, rawHf));
        wF = rawWf * growF;
        hF = rawHf * growF;
      } else {
        wF = Math.max(rawWf, MIN_BOX_PX);
        hF = Math.max(rawHf, MIN_BOX_PX);
      }
      const cx = originX + box.x * scale;
      const cy = groundY - box.z * scale;
      const rx = cx - wF / 2;
      const ry = cy - hF / 2;

      ctx.fillStyle = box.muted ? col.boxFillMuted : box.reversed ? col.boxFillReversed : col.boxFill;
      ctx.fillRect(rx, ry, wF, hF);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx, ry, wF, hF);

      ctx.fillStyle = box.reversed ? col.baffleReversed : col.baffle;
      ctx.fillRect(rx, ry, wF, Math.max(2, Math.min(4, hF * 0.12)));

      if (hF >= 16 && wF >= 22) {
        // Sama seperti mode Depan interaktif: isi box selalu gelap, jadi
        // teks dipakai warna terang tetap + halo gelap, bukan warna abu-abu
        // yang nyaris tak terbaca. Box yang dibalik fisik (reversed) dapat
        // tag "REVERSED" tambahan kalau ruangnya cukup (diukur dari lebar
        // teks sesungguhnya, bukan tebakan px), jatuh ke "REV" lalu ke
        // sekadar warna+strip saja bila box makin kecil.
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        const drawTag = (text: string, x: number, y: number) => {
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = 'rgba(0,0,0,0.85)';
          ctx.strokeText(text, x, y);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(text, x, y);
        };

        ctx.font = '700 8px Arial, sans-serif';
        const revWidth = ctx.measureText('REVERSED').width;
        const canFitBoth = box.reversed && hF >= 24 && wF >= revWidth + 8;

        if (canFitBoth) {
          ctx.font = '700 9px Arial, sans-serif';
          drawTag(`S${box.stackLevel + 1}`, cx, cy - hF * 0.2);
          ctx.font = '700 8px Arial, sans-serif';
          drawTag('REVERSED', cx, cy + hF * 0.24);
        } else if (box.reversed && wF >= ctx.measureText('REV').width + 6) {
          drawTag('REV', cx, cy);
        } else {
          ctx.font = '700 9px Arial, sans-serif';
          drawTag(`S${box.stackLevel + 1}`, cx, cy);
        }
        ctx.lineWidth = 1;
      }
    });

    const gx = originX + group.x * scale;
    ctx.font = '700 11px Arial, sans-serif';
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(group.label, gx, groundY + 6);
  });

  // Penanda Sub Gap & Central Gap — sama seperti mode Depan interaktif,
  // ditaruh di atas kolom tertinggi supaya tidak bertabrakan dengan label
  // "S1/S2" di dalam box.
  if (groups.length >= 2 && dimensionX > 0) {
    const { sorted, regularPairIdx, centralPairIdx, isEvenArray } = findGapPairs(
      groups,
      dimensionX,
      Number(settings.gap) || 0
    );
    const dimY = Math.max(padTop + 6, groundY - maxZ * scale - 18);
    const rawWf0 = dimensionX * scale;
    const rawHf0 = dimensionZ * scale;
    const wFOuter =
      rawWf0 > 0 && rawHf0 > 0 ? rawWf0 * Math.max(1, MIN_BOX_PX / Math.min(rawWf0, rawHf0)) : Math.max(rawWf0, MIN_BOX_PX);

    if (regularPairIdx >= 0) {
      const a = sorted[regularPairIdx];
      const b = sorted[regularPairIdx + 1];
      const x0 = originX + a.x * scale + wFOuter / 2;
      const x1 = originX + b.x * scale - wFOuter / 2;
      const trueGap = b.x - a.x - dimensionX;
      drawGapDimensionLine(ctx, x0, x1, dimY, `Sub Gap ${formatMeters(trueGap, 3)}`, '#3c434e', '#ffffff');
    }

    if (isEvenArray) {
      const a = sorted[centralPairIdx];
      const b = sorted[centralPairIdx + 1];
      const x0 = originX + a.x * scale;
      const x1 = originX + b.x * scale;
      const trueGap = b.x - a.x;
      drawGapDimensionLine(ctx, x0, x1, dimY - 16, `Central Gap ${formatMeters(trueGap, 3)}`, '#2a78d6', '#ffffff');
    }
  }

  return canvas.toDataURL('image/png');
}
