import type { SubwooferSettings, BoxGroup, VenueArea } from './types';
import { calculate2DSpatialHeatmap, renderHeatmapToImageData, SANE_LENGTH_M, facingAngle, findGapPairs, drawGapDimensionLine, findRowSpacingPair, drawVerticalDimensionLine, formatMeters } from './utils';
import { canvasColors } from './theme';

/**
 * Sepuluh peta yang selalu disertakan di laporan PDF, meniru halaman
 * "Mapping" EASE Focus yang menampilkan tiap pita frekuensi penting secara
 * terpisah — supaya crew bisa cek langsung apakah suatu frekuensi punya
 * lubang cakupan tanpa harus membuka aplikasi dan mengganti-ganti frekuensi.
 */
export interface ReportHeatmapSpec {
  key: string;
  label: string;
  frequency: number;
  bandwidth: SubwooferSettings['bandwidth'];
}

export const REPORT_HEATMAP_SPECS: ReportHeatmapSpec[] = [
  { key: '30', label: '30 Hz', frequency: 30, bandwidth: 'Single' },
  { key: '45', label: '45 Hz', frequency: 45, bandwidth: 'Single' },
  { key: '50', label: '50 Hz', frequency: 50, bandwidth: 'Single' },
  { key: '63', label: '63 Hz', frequency: 63, bandwidth: 'Single' },
  { key: '70', label: '70 Hz', frequency: 70, bandwidth: 'Single' },
  { key: '80', label: '80 Hz', frequency: 80, bandwidth: 'Single' },
  { key: '90', label: '90 Hz', frequency: 90, bandwidth: 'Single' },
  { key: '100', label: '100 Hz', frequency: 100, bandwidth: 'Single' },
  { key: 'broadband', label: 'Broadband (25–125 Hz)', frequency: 63, bandwidth: 'Broadband' },
  // frequency diisi ulang saat render dari settings.frequency proyek (lihat generateReportHeatmapImage).
  { key: 'third-octave', label: '1/3 Oktaf', frequency: 63, bandwidth: '1/3 Octave' },
];

export interface ReportHeatmapImage {
  key: string;
  label: string;
  dataUrl: string;
  maxSplAbsolute: number;
  hasSensitivity: boolean;
}

const DYNAMIC_RANGE = 35;
const IMG_W = 640;
const IMG_H = 420;

const dimensionsOf = (settings: SubwooferSettings) => ({
  dimensionX: settings.orientation === 'Landscape' ? Number(settings.width) || 0 : Number(settings.height) || 0,
  dimensionY: Number(settings.depth) || 0,
});

/** Bingkai kotak-pembatas statis (tanpa pan/zoom) — versi sederhana dari `fit` di Visualizer.tsx. */
function computeFit(groups: BoxGroup[], areas: VenueArea[] | undefined, dimensionX: number, dimensionY: number) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let has = false;
  const add = (x0: number, x1: number, y0: number, y1: number) => {
    minX = Math.min(minX, x0); maxX = Math.max(maxX, x1);
    minY = Math.min(minY, y0); maxY = Math.max(maxY, y1);
    has = true;
  };

  for (const g of groups) {
    for (const b of g.boxes) {
      if (Math.abs(b.x) > SANE_LENGTH_M || Math.abs(b.y) > SANE_LENGTH_M) continue;
      add(b.x - dimensionX / 2, b.x + dimensionX / 2, b.y - dimensionY / 2, b.y + dimensionY / 2);
    }
  }

  for (const area of areas ?? []) {
    const round = area.shape === 'Circle' || area.shape === 'Semicircle';
    const halfW = round
      ? Number(area.radius) || 0
      : Math.max(Number(area.width) || 0, Number(area.topWidth) || 0, Number(area.bottomWidth) || 0) / 2;
    const halfD = round ? Number(area.radius) || 0 : (Number(area.height) || 0) / 2;
    const ax = Number(area.x) || 0;
    const ay = -(Number(area.y) || 0);
    if (Math.abs(ax) > SANE_LENGTH_M || Math.abs(ay) > SANE_LENGTH_M) continue;
    add(ax - halfW, ax + halfW, ay - halfD, ay + halfD);
  }

  if (!has) add(-4, 4, -4, 4);

  const spanX = Math.max(maxX - minX, 3);
  const spanY = Math.max(maxY - minY, 3);
  const MARGIN = 1.25;
  const pad = 44;
  const scale = Math.min((IMG_W - pad * 2) / (spanX * MARGIN), (IMG_H - pad * 2) / (spanY * MARGIN), 160);
  const ccx = (minX + maxX) / 2;
  const ccy = (minY + maxY) / 2;

  return { scale, ccx, ccy };
}

/** Satu gambar peta SPL statis, siap ditempel sebagai <img> di laporan cetak. */
export function generateReportHeatmapImage(
  settings: SubwooferSettings,
  groups: BoxGroup[],
  areas: VenueArea[] | undefined,
  spec: ReportHeatmapSpec
): ReportHeatmapImage {
  const canvas = document.createElement('canvas');
  canvas.width = IMG_W;
  canvas.height = IMG_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { key: spec.key, label: spec.label, dataUrl: '', maxSplAbsolute: 0, hasSensitivity: false };

  const col = canvasColors('light');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, IMG_W, IMG_H);

  const { dimensionX, dimensionY } = dimensionsOf(settings);
  const freq = spec.key === 'third-octave' ? Number(settings.frequency) || 63 : spec.frequency;
  const heatSettings: SubwooferSettings = {
    ...settings,
    showHeatmap: true,
    frequency: freq,
    bandwidth: spec.bandwidth,
  };

  const { scale, ccx, ccy } = computeFit(groups, areas, dimensionX, dimensionY);
  const angleRad = facingAngle(settings.arrayFacing);
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  // Sama seperti fit.offset di Visualizer.tsx: pusatkan konten (bukan titik nol array).
  const originX = IMG_W / 2 - (ccx * cos - ccy * sin) * scale;
  const originY = IMG_H / 2 - (ccx * sin + ccy * cos) * scale;

  const data = calculate2DSpatialHeatmap(heatSettings, groups, {
    widthPx: IMG_W,
    heightPx: IMG_H,
    cx: originX,
    cy: originY,
    scale,
    offsetX: 0,
    offsetY: 0,
    minBlockSize: 2,
  });

  if (data.heatmap.length > 0 && groups.length > 0) {
    const hCanvas = document.createElement('canvas');
    hCanvas.width = data.cols;
    hCanvas.height = data.rows;
    const hCtx = hCanvas.getContext('2d');
    if (hCtx) {
      hCtx.putImageData(renderHeatmapToImageData(data, hCtx, data.maxSpl, DYNAMIC_RANGE, 0), 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(hCanvas, 0, 0, IMG_W, IMG_H);
    }
  }

  // Grid meter tipis untuk konteks skala.
  const MIN_LABEL_PX = 70;
  const rawStep = MIN_LABEL_PX / Math.max(scale, 1e-6);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const gridStep = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const gridSize = gridStep * scale;
  ctx.strokeStyle = 'rgba(0,0,0,0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = originX % gridSize; x <= IMG_W; x += gridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, IMG_H); }
  for (let y = originY % gridSize; y <= IMG_H; y += gridSize) { ctx.moveTo(0, y); ctx.lineTo(IMG_W, y); }
  ctx.stroke();

  // Area venue (rotasi sama seperti box, di bawah).
  ctx.save();
  ctx.translate(originX, originY);
  ctx.rotate(angleRad);
  for (const area of areas ?? []) {
    ctx.save();
    ctx.translate((Number(area.x) || 0) * scale, -(Number(area.y) || 0) * scale);
    ctx.rotate(((Number(area.rotation) || 0) * Math.PI) / 180);
    const w = (Number(area.width) || 0) * scale;
    const h = (Number(area.height) || 0) * scale;
    const r = (Number(area.radius) || 0) * scale;
    ctx.beginPath();
    if (area.shape === 'Rectangle' || area.shape === 'Triangle' || area.shape === 'Trapezoid') {
      ctx.rect(-w / 2, -h / 2, w, h);
    } else {
      ctx.moveTo(r, 0);
      ctx.arc(0, 0, r, 0, Math.PI * 2);
    }
    ctx.strokeStyle = area.color || '#333';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // Box subwoofer — penanda ringkas (posisi + label), bukan render lengkap
  // seperti Denah interaktif; cukup untuk konteks visual di laporan cetak.
  ctx.save();
  ctx.translate(originX, originY);
  ctx.rotate(angleRad);
  const rectW = Math.max(dimensionX * scale, 6);
  const rectH = Math.max(dimensionY * scale, 6);
  ctx.font = '700 9px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (const group of groups) {
    for (const box of group.boxes) {
      const footprintY = box.y - (box.reversed ? dimensionY : 0);
      const rx = box.x * scale - rectW / 2;
      const ry = footprintY * scale - rectH / 2;
      ctx.fillStyle = box.muted ? col.boxFillMuted : box.reversed ? col.boxFillReversed : col.boxFill;
      ctx.fillRect(rx, ry, rectW, rectH);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx, ry, rectW, rectH);
    }
    if (rectW >= 16) {
      ctx.fillStyle = '#111';
      ctx.fillText(group.label, group.x * scale, group.y * scale - rectH / 2 - 2);
    }
  }

  // Penanda Sub Gap & Central Gap — sama seperti Denah interaktif. Masih di
  // dalam transform yang sama dengan box (ikut rotasi arah hadap array),
  // jadi teksnya dilawan-putar supaya tetap tegak.
  if (groups.length >= 2 && dimensionX > 0) {
    const { sorted, regularPairIdx, centralPairIdx, isEvenArray } = findGapPairs(
      groups,
      dimensionX,
      Number(settings.gap) || 0
    );

    if (regularPairIdx >= 0) {
      const a = sorted[regularPairIdx];
      const b = sorted[regularPairIdx + 1];
      const x0 = a.x * scale + rectW / 2;
      const x1 = b.x * scale - rectW / 2;
      const y = Math.max(a.y, b.y) * scale + rectH / 2 + 16;
      const trueGap = b.x - a.x - dimensionX;
      drawGapDimensionLine(ctx, x0, x1, y, `Sub Gap ${formatMeters(trueGap, 3)}`, col.dimensionLine, '#ffffff', -angleRad);
    }

    if (isEvenArray) {
      const a = sorted[centralPairIdx];
      const b = sorted[centralPairIdx + 1];
      const x0 = a.x * scale;
      const x1 = b.x * scale;
      const y = Math.max(a.y, b.y) * scale + rectH / 2 + 34;
      const trueGap = b.x - a.x;
      drawGapDimensionLine(ctx, x0, x1, y, `Central Gap ${formatMeters(trueGap, 3)}`, col.dimensionLineAccent, '#ffffff', -angleRad);
    }

    const rowPair = findRowSpacingPair(groups);
    if (rowPair) {
      const rx = rowPair.groupX * scale - rectW / 2 - 20;
      const ry0 = rowPair.yFront * scale;
      const ry1 = rowPair.yRear * scale;
      drawVerticalDimensionLine(
        ctx, rx, ry0, ry1,
        `Jarak Baris ${formatMeters(rowPair.spacing, 3)}`,
        col.dimensionLine, '#ffffff', -angleRad
      );
    }
  }

  ctx.restore();

  // Judul frekuensi di pojok kiri-atas, dengan halo agar tetap terbaca di atas warna apa pun.
  ctx.font = '700 15px Arial, sans-serif';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const title = spec.key === 'third-octave' ? `${spec.label} @ ${freq} Hz` : spec.label;
  ctx.strokeText(title, 10, 8);
  ctx.fillStyle = '#111';
  ctx.fillText(title, 10, 8);

  return {
    key: spec.key,
    label: title,
    dataUrl: canvas.toDataURL('image/png'),
    maxSplAbsolute: data.maxSplAbsolute,
    hasSensitivity: Number(settings.boxSensitivity) > 0,
  };
}

export function generateAllReportHeatmaps(
  settings: SubwooferSettings,
  groups: BoxGroup[],
  areas: VenueArea[] | undefined
): ReportHeatmapImage[] {
  return REPORT_HEATMAP_SPECS.map((spec) => generateReportHeatmapImage(settings, groups, areas, spec));
}
