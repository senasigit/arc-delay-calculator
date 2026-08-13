import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SubwooferSettings, BoxGroup, VenueArea } from '../types';
import { calculate2DSpatialHeatmap, renderHeatmapToImageData, formatMeters, calculateFrequencyResponse, SPL_RAMP_CSS, SANE_LENGTH_M, facingAngle, findGapPairs, drawGapDimensionLine, findRowSpacingPair, drawVerticalDimensionLine } from '../utils';
import { ResponseChart } from './ResponseChart';
import { canvasColors, type ResolvedTheme } from '../theme';

export interface VisualizerProps {
  settings: SubwooferSettings;
  groups: BoxGroup[];
  areas?: VenueArea[];
  activeAreaId?: string | null;
  onSelectArea?: (id: string | null) => void;
  onUpdateArea?: (id: string, updates: Partial<VenueArea>) => void;
  onChangeSettings?: (newSettings: SubwooferSettings) => void;
  onOpenAreaEditor?: () => void;
  areaEditorOpen?: boolean;
  theme?: ResolvedTheme;
}

const DYNAMIC_RANGE = 35;

/** Ubah koordinat layar (relatif titik nol) menjadi koordinat array (meter). */
function screenToWorld(sx: number, sy: number, angle: number, scale: number) {
  const inv = -angle;
  const cos = Math.cos(inv);
  const sin = Math.sin(inv);
  return { x: (sx * cos - sy * sin) / scale, y: (sx * sin + sy * cos) / scale };
}

export function Visualizer({
  settings,
  groups,
  areas,
  activeAreaId,
  onSelectArea,
  onUpdateArea,
  onChangeSettings,
  onOpenAreaEditor,
  areaEditorOpen,
  theme = 'dark',
}: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const heatmapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [size, setSize] = useState({ w: 0, h: 0 });
  const [zoomScale, setZoomScale] = useState(1);
  const [userOffset, setUserOffset] = useState<{ x: number; y: number } | null>(null);
  const [hoveredGroup, setHoveredGroup] = useState<BoxGroup | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [draggingAreaId, setDraggingAreaId] = useState<string | null>(null);
  const [splMode, setSplMode] = useState<'Relative' | 'Absolute'>('Relative');
  // Titik ukur respons frekuensi, disimpan dalam koordinat ARRAY (meter),
  // bukan piksel — supaya tetap menempel di lokasi fisik yang sama saat peta
  // di-zoom, digeser, atau arah pancarnya diubah.
  const [probe, setProbe] = useState<{ x: number; y: number } | null>(null);
  const [probeMode, setProbeMode] = useState(false);
  const [legendOpen, setLegendOpen] = useState(true);
  const [heatmapMeta, setHeatmapMeta] = useState<{ maxSpl: number; maxAbs: number } | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  // Denah (top-down, bisa di-pan/zoom) atau Tampak depan (elevasi statis
  // auto-fit, untuk melihat susunan stack per posisi dari sisi audiens).
  const [viewMode, setViewMode] = useState<'plan' | 'front'>('plan');

  const lastPointer = useRef({ x: 0, y: 0 });
  const pinchDistance = useRef<number | null>(null);

  const angleRad = facingAngle(settings.arrayFacing);
  const col = canvasColors(theme);
  // Rotasi Landscape↔Portrait menukar Width dan Height (bukan Width dan
  // Depth) — lihat penjelasan lengkap di utils.ts calculateArcDelay.
  const dimensionX = settings.orientation === 'Landscape' ? Number(settings.width) || 0 : Number(settings.height) || 0;
  const dimensionY = Number(settings.depth) || 0;
  // Sumbu tumpuk (stack) vertikal — kebalikan dari dimensionX, sama seperti
  // dimensionZ di utils.ts calculateArcDelay. Dipakai hanya oleh Tampak Depan.
  const dimensionZ = settings.orientation === 'Landscape' ? Number(settings.height) || 0 : Number(settings.width) || 0;

  // --- Auto-fit: bingkai KOTAK PEMBATAS konten sesungguhnya ------------------
  // Versi lama memakai jarak terjauh dari titik nol (simetris), sehingga untuk
  // venue yang seluruhnya ada di depan array, separuh layar terbuang untuk
  // ruang kosong di belakang — dan box 1 m menyusut jadi titik ~9 px. Dengan
  // membingkai kotak pembatas lalu menggesernya ke tengah, zoom yang didapat
  // kira-kira dua kali lebih besar untuk konten yang sama persis.
  const fit = useMemo(() => {
    if (!size.w || !size.h) return { scale: 10, offset: { x: 0, y: 0 }, clamped: false };

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let clamped = false;
    let has = false;
    const add = (x0: number, x1: number, y0: number, y1: number) => {
      minX = Math.min(minX, x0); maxX = Math.max(maxX, x1);
      minY = Math.min(minY, y0); maxY = Math.max(maxY, y1);
      has = true;
    };

    for (const g of groups) {
      for (const b of g.boxes) {
        if (Math.abs(b.x) > SANE_LENGTH_M || Math.abs(b.y) > SANE_LENGTH_M) { clamped = true; continue; }
        add(b.x - dimensionX / 2, b.x + dimensionX / 2, b.y - dimensionY / 2, b.y + dimensionY / 2);
      }
    }

    // Area venue ikut dibingkai. Koordinat area memakai +Y ke arah audiens,
    // sedangkan ruang gambar memakai −Y — sama seperti cara traceArea
    // menggambarnya, jadi tandanya dibalik di sini.
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

    // Arah Kiri/Kanan memutar kanvas 90°, jadi sumbu layar tertukar.
    const swapped = settings.arrayFacing === 'Left' || settings.arrayFacing === 'Right';
    const screenSpanX = (swapped ? spanY : spanX) * MARGIN;
    const screenSpanY = (swapped ? spanX : spanY) * MARGIN;

    const pad = 32;
    const scale = Math.min(
      (size.w - pad * 2) / screenSpanX,
      (size.h - pad * 2) / screenSpanY,
      160
    );

    // Geser agar pusat konten jatuh di tengah kanvas (bukan titik nol array).
    const ccx = (minX + maxX) / 2;
    const ccy = (minY + maxY) / 2;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    return {
      scale,
      offset: { x: -(ccx * cos - ccy * sin) * scale, y: -(ccx * sin + ccy * cos) * scale },
      clamped,
    };
  }, [groups, areas, size.w, size.h, dimensionX, dimensionY, angleRad, settings.arrayFacing]);

  const baseScale = fit.scale;
  const viewClamped = fit.clamped;
  // offset = null berarti "ikuti auto-fit"; begitu pengguna menggeser atau
  // zoom, nilainya dikunci sampai tombol Reset ditekan.
  const offset = userOffset ?? fit.offset;

  const scale = baseScale * zoomScale;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      const rect = entry.contentRect;
      setSize({ w: Math.round(rect.width), h: Math.round(rect.height) });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // --- Heatmap: dihitung dengan debounce di kanvas terpisah -----------------
  useEffect(() => {
    if (!settings.showHeatmap || groups.length === 0 || !size.w || !size.h) {
      setHeatmapMeta(null);
      return;
    }
    setIsComputing(true);

    const timeout = setTimeout(() => {
      // Perangkat sentuh: naikkan ukuran blok agar tetap responsif.
      const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
      const data = calculate2DSpatialHeatmap(settings, groups, {
        widthPx: size.w,
        heightPx: size.h,
        cx: size.w / 2,
        cy: size.h / 2,
        scale,
        offsetX: offset.x,
        offsetY: offset.y,
        minBlockSize: coarse ? 4 : 1,
      });

      if (!heatmapCanvasRef.current) heatmapCanvasRef.current = document.createElement('canvas');
      const hCanvas = heatmapCanvasRef.current;
      hCanvas.width = data.cols;
      hCanvas.height = data.rows;
      const hCtx = hCanvas.getContext('2d');
      if (hCtx) {
        // Warna selalu dipetakan relatif terhadap titik terkuat; mode Absolut
        // hanya mengganti label legenda dengan angka dB SPL sesungguhnya.
        hCtx.putImageData(
          renderHeatmapToImageData(
            data,
            hCtx,
            data.maxSpl,
            DYNAMIC_RANGE,
            Number(settings.heatmapBandStep) || 0
          ),
          0,
          0
        );
      }
      setHeatmapMeta({ maxSpl: data.maxSpl, maxAbs: data.maxSplAbsolute });
      setIsComputing(false);
    }, 180);

    return () => {
      clearTimeout(timeout);
      setIsComputing(false);
    };
  }, [settings, groups, offset, scale, size.w, size.h]);

  // --- Menggambar -----------------------------------------------------------
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w || !size.h) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(size.w * dpr) || canvas.height !== Math.round(size.h * dpr)) {
      canvas.width = Math.round(size.w * dpr);
      canvas.height = Math.round(size.h * dpr);
      canvas.style.width = `${size.w}px`;
      canvas.style.height = `${size.h}px`;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    if (viewMode === 'front') {
      // Tampilan elevasi depan: sumbu X layar = posisi array (box.x, sama
      // seperti denah), sumbu Y layar = tinggi tumpukan (box.z, dari lantai
      // ke atas). Tidak ikut rotasi "Sub menghadap ke" (itu murni untuk
      // denah) dan tidak melibatkan heatmap/area venue — auto-fit statis,
      // tanpa pan/zoom, murni untuk melihat susunan stack per posisi.
      let minX = Infinity, maxX = -Infinity, maxZ = 0;
      let hasBoxes = false;
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
      const spanX = Math.max(maxX - minX, 1) * 1.2;
      const spanZ = Math.max(maxZ, 1) * 1.25;
      const padSide = 32, padTop = 36, padBottom = 46;
      const fScale = Math.min(
        (size.w - padSide * 2) / spanX,
        (size.h - padTop - padBottom) / spanZ,
        200
      );
      const contentCX = (minX + maxX) / 2;
      const fOriginX = size.w / 2 - contentCX * fScale;
      const groundY = size.h - padBottom;

      // Lantai
      ctx.strokeStyle = col.axis;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(padSide * 0.3, Math.round(groundY) + 0.5);
      ctx.lineTo(size.w - padSide * 0.3, Math.round(groundY) + 0.5);
      ctx.stroke();

      // Garis bantu tinggi (grid horizontal, langkah 1-2-5) + label di kiri
      const MIN_LABEL_PX_F = 34;
      const rawStepF = MIN_LABEL_PX_F / Math.max(fScale, 1e-6);
      const magF = Math.pow(10, Math.floor(Math.log10(rawStepF)));
      const normF = rawStepF / magF;
      const stepF = (normF <= 1 ? 1 : normF <= 2 ? 2 : normF <= 5 ? 5 : 10) * magF;
      const decF = stepF < 1 ? (stepF < 0.1 ? 2 : 1) : 0;

      ctx.font = '600 10px ui-sans-serif, -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 1;
      for (let h = 0; h <= maxZ + stepF; h += stepF) {
        const y = groundY - h * fScale;
        if (y < padTop - 10) break;
        ctx.strokeStyle = col.grid;
        ctx.beginPath();
        ctx.moveTo(padSide * 0.3, Math.round(y) + 0.5);
        ctx.lineTo(size.w - padSide * 0.3, Math.round(y) + 0.5);
        ctx.stroke();
        ctx.fillStyle = col.rulerText;
        ctx.fillText(`${h.toFixed(decF)} m`, padSide * 0.3 - 6, y);
      }

      // Box per posisi, ditumpuk sesuai box.z (pusat tinggi tiap box)
      const MIN_BOX_PX_F = 14;
      groups.forEach((group) => {
        group.boxes.forEach((box) => {
          const muted = group.muted || box.muted;
          const rawWf = dimensionX * fScale;
          const rawHf = dimensionZ * fScale;
          let wF: number, hF: number;
          if (rawWf > 0 && rawHf > 0) {
            const growF = Math.max(1, MIN_BOX_PX_F / Math.min(rawWf, rawHf));
            wF = rawWf * growF;
            hF = rawHf * growF;
          } else {
            wF = Math.max(rawWf, MIN_BOX_PX_F);
            hF = Math.max(rawHf, MIN_BOX_PX_F);
          }
          const cx = fOriginX + box.x * fScale;
          const cy = groundY - box.z * fScale;
          const rx = cx - wF / 2;
          const ry = cy - hF / 2;

          ctx.fillStyle = muted ? col.boxFillMuted : box.reversed ? col.boxFillReversed : col.boxFill;
          ctx.fillRect(rx, ry, wF, hF);

          ctx.setLineDash([]);
          if (box.polarity === -1) {
            ctx.strokeStyle = col.polarityInverted;
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 3]);
          } else {
            ctx.strokeStyle = col.boxStroke;
            ctx.lineWidth = 1.5;
          }
          ctx.strokeRect(rx, ry, wF, hF);
          ctx.setLineDash([]);

          // Strip baffle di sisi atas — sama seperti denah. Box yang dibalik
          // fisik (reversed) memancar ke belakang panggung, jadi dari sudut
          // pandang depan ini sebenarnya Anda melihat punggung kabinetnya.
          ctx.fillStyle = box.reversed ? col.baffleReversed : col.baffle;
          const markerT = Math.max(2, Math.min(4, hF * 0.12));
          ctx.fillRect(rx, ry, wF, markerT);

          if (muted) {
            ctx.strokeStyle = col.muteCross;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(rx, ry);
            ctx.lineTo(rx + wF, ry + hF);
            ctx.moveTo(rx + wF, ry);
            ctx.lineTo(rx, ry + hF);
            ctx.stroke();
          }

          if (hF >= 16 && wF >= 22) {
            // Isi box (col.boxFill / boxFillReversed) SELALU gelap di kedua
            // tema — teks abu-abu semi-transparan (col.rulerText, dirancang
            // untuk latar kanvas polos) jadi nyaris tak terbaca di atasnya,
            // terutama tema terang. Dipakai warna terang tetap + halo gelap,
            // sama seperti label penggaris di atas peta ramai warna.
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineJoin = 'round';
            const drawTag = (text: string, x: number, y: number) => {
              ctx.lineWidth = 2.5;
              ctx.strokeStyle = 'rgba(0,0,0,0.85)';
              ctx.strokeText(text, x, y);
              ctx.fillStyle = 'rgba(255,255,255,0.96)';
              ctx.fillText(text, x, y);
            };

            // Ukur lebar teks sesungguhnya (bukan tebakan px) supaya lantai
            // "cukup ruang" akurat di font apa pun — box landscape biasa
            // lebih PENDEK (dimensionZ) daripada lebar (dimensionX), jadi
            // ambang tinggi yang terlalu ketat membuat tag tak pernah tampil.
            ctx.font = '700 8px ui-sans-serif, -apple-system, sans-serif';
            const revWidth = ctx.measureText('REVERSED').width;
            const canFitBoth = box.reversed && hF >= 24 && wF >= revWidth + 8;

            if (canFitBoth) {
              ctx.font = '700 9px ui-sans-serif, -apple-system, sans-serif';
              drawTag(`S${box.stackLevel + 1}`, cx, cy - hF * 0.2);
              ctx.font = '700 8px ui-sans-serif, -apple-system, sans-serif';
              drawTag('REVERSED', cx, cy + hF * 0.24);
            } else if (box.reversed && wF >= ctx.measureText('REV').width + 6) {
              drawTag('REV', cx, cy);
            } else {
              ctx.font = '700 9px ui-sans-serif, -apple-system, sans-serif';
              drawTag(`S${box.stackLevel + 1}`, cx, cy);
            }
            ctx.lineWidth = 1;
          }
        });

        // Label posisi (nama grup) di dekat lantai, di bawah kolomnya
        const gx = fOriginX + group.x * fScale;
        ctx.font = '600 10px ui-sans-serif, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3;
        ctx.strokeStyle = theme === 'dark' ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.85)';
        ctx.strokeText(group.label, gx, groundY + 6);
        ctx.fillStyle = col.areaLabel;
        ctx.fillText(group.label, gx, groundY + 6);
        ctx.lineWidth = 1;
      });

      // Penanda Sub Gap & Central Gap — sama seperti di Denah, tapi tanpa
      // rotasi (Tampak Depan selalu tegak) dan ditaruh di atas kolom
      // tertinggi supaya tidak bertabrakan dengan label "S1/S2" di dalam box.
      if (groups.length >= 2 && dimensionX > 0) {
        const haloColorF = theme === 'dark' ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)';
        const { sorted, regularPairIdx, centralPairIdx, isEvenArray } = findGapPairs(
          groups,
          dimensionX,
          Number(settings.gap) || 0
        );
        const dimY = Math.max(padTop + 6, groundY - maxZ * fScale - 18);
        // Sama seperti rectW di dalam loop box: lebar box bisa dibesarkan
        // faktor tetap agar tetap terlihat saat di-zoom sangat jauh — pakai
        // lebar YANG SAMA di sini supaya ujung garis ukur pas dengan tepi
        // box yang benar-benar tergambar, bukan lebar mentahnya.
        const rawWf0 = dimensionX * fScale;
        const rawHf0 = dimensionZ * fScale;
        const wFOuter =
          rawWf0 > 0 && rawHf0 > 0 ? rawWf0 * Math.max(1, MIN_BOX_PX_F / Math.min(rawWf0, rawHf0)) : Math.max(rawWf0, MIN_BOX_PX_F);

        // Nilai LABEL selalu dari geometri fisik asli (bukan dari lebar box
        // yang mungkin sudah dibesarkan di layar), supaya angkanya tetap
        // benar walau tampilan box sedang di-floor demi keterbacaan.
        if (regularPairIdx >= 0) {
          const a = sorted[regularPairIdx];
          const b = sorted[regularPairIdx + 1];
          const x0 = fOriginX + a.x * fScale + wFOuter / 2;
          const x1 = fOriginX + b.x * fScale - wFOuter / 2;
          const trueGap = b.x - a.x - dimensionX;
          drawGapDimensionLine(ctx, x0, x1, dimY, `Sub Gap ${formatMeters(trueGap, 3)}`, col.dimensionLine, haloColorF);
        }

        if (isEvenArray) {
          const a = sorted[centralPairIdx];
          const b = sorted[centralPairIdx + 1];
          const x0 = fOriginX + a.x * fScale;
          const x1 = fOriginX + b.x * fScale;
          const trueGap = b.x - a.x;
          drawGapDimensionLine(ctx, x0, x1, dimY - 16, `Central Gap ${formatMeters(trueGap, 3)}`, col.dimensionLineAccent, haloColorF);
        }
      }

      return;
    }

    const originX = size.w / 2 + offset.x;
    const originY = size.h / 2 + offset.y;

    const traceArea = (area: VenueArea) => {
      ctx.save();
      ctx.translate(area.x * scale, -area.y * scale);
      ctx.rotate((Number(area.rotation) || 0) * Math.PI / 180);
      const w = (Number(area.width) || 0) * scale;
      const h = (Number(area.height) || 0) * scale;
      const r = (Number(area.radius) || 0) * scale;
      if (area.shape === 'Rectangle') {
        ctx.rect(-w / 2, -h / 2, w, h);
      } else if (area.shape === 'Circle') {
        ctx.moveTo(r, 0);
        ctx.arc(0, 0, r, 0, Math.PI * 2);
      } else if (area.shape === 'Semicircle') {
        ctx.moveTo(-r, 0);
        ctx.arc(0, 0, r, Math.PI, 0);
        ctx.closePath();
      } else if (area.shape === 'Triangle') {
        ctx.moveTo(0, -h / 2);
        ctx.lineTo(w / 2, h / 2);
        ctx.lineTo(-w / 2, h / 2);
        ctx.closePath();
      } else if (area.shape === 'Trapezoid') {
        const tw = (Number(area.topWidth) || Number(area.width) || 0) * scale;
        const bw = (Number(area.bottomWidth) || Number(area.width) || 0) * scale;
        ctx.moveTo(-tw / 2, -h / 2);
        ctx.lineTo(tw / 2, -h / 2);
        ctx.lineTo(bw / 2, h / 2);
        ctx.lineTo(-bw / 2, h / 2);
        ctx.closePath();
      }
      ctx.restore();
    };

    // 1. Heatmap (dipotong mengikuti area venue bila ada)
    if (settings.showHeatmap && heatmapCanvasRef.current && heatmapMeta) {
      ctx.save();
      // Memotong peta ke area venue akan MENYEMBUNYIKAN sebagian besar peta,
      // jadi ini hanya berlaku bila pengguna memintanya secara eksplisit.
      if (settings.clipHeatmapToAreas && areas && areas.length > 0) {
        ctx.save();
        ctx.translate(originX, originY);
        ctx.rotate(angleRad);
        ctx.beginPath();
        areas.forEach(traceArea);
        ctx.restore();
        ctx.clip();
      }
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(heatmapCanvasRef.current, 0, 0, size.w, size.h);
      ctx.restore();
    }

    // 2. Grid metrik — langkah dipilih agar label selalu punya jarak minimum,
    // sehingga angka tidak pernah saling menumpuk di zoom mana pun. Nilai
    // dibulatkan ke deret 1-2-5 (0.2 m, 0.5 m, 1 m, 2 m, 5 m, 10 m, …).
    const MIN_LABEL_PX = 76;
    const rawStep = MIN_LABEL_PX / Math.max(scale, 1e-6);
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const normalized = rawStep / magnitude;
    const gridStep = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
    const gridSize = gridStep * scale;
    const gridDecimals = gridStep < 1 ? (gridStep < 0.1 ? 2 : 1) : 0;

    const startX = originX % gridSize;
    const startY = originY % gridSize;

    // Skala EASE menggambar peta solid, jadi grid putih tipis akan hilang di
    // atas kuning/cyan. Di atas peta terang, grid gelap jauh lebih terbaca.
    const overOpaqueMap = settings.showHeatmap && heatmapMeta !== null;
    ctx.strokeStyle = overOpaqueMap ? col.gridOverMap : col.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = startX - gridSize; x <= size.w + gridSize; x += gridSize) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, size.h);
    }
    for (let y = startY - gridSize; y <= size.h + gridSize; y += gridSize) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(size.w, Math.round(y) + 0.5);
    }
    ctx.stroke();

    // 3. Sumbu utama
    ctx.strokeStyle = overOpaqueMap ? col.axisOverMap : col.axis;
    ctx.beginPath();
    ctx.moveTo(Math.round(originX) + 0.5, 0);
    ctx.lineTo(Math.round(originX) + 0.5, size.h);
    ctx.moveTo(0, Math.round(originY) + 0.5);
    ctx.lineTo(size.w, Math.round(originY) + 0.5);
    ctx.stroke();

    // 4. Label penggaris. Di atas peta warnanya bisa apa saja — dari biru tua
    // sampai kuning terang — jadi teks digambar dengan halo (garis luar gelap
    // lalu isi terang), teknik baku pelabelan peta agar selalu terbaca.
    ctx.font = '600 10px ui-sans-serif, -apple-system, sans-serif';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    const haloText = (text: string, x: number, y: number) => {
      if (overOpaqueMap) {
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(text, x, y);
        ctx.fillStyle = col.rulerTextOverMap;
      } else {
        ctx.fillStyle = col.rulerText;
      }
      ctx.fillText(text, x, y);
    };

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let x = startX - gridSize; x <= size.w + gridSize; x += gridSize) {
      if (Math.abs(x - originX) < 1) continue;
      haloText(`${((x - originX) / scale).toFixed(gridDecimals)}`, x, originY + 5);
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let y = startY - gridSize; y <= size.h + gridSize; y += gridSize) {
      if (Math.abs(y - originY) < 1) continue;
      haloText(`${((y - originY) / scale).toFixed(gridDecimals)}`, originX - 6, y);
    }
    ctx.lineWidth = 1;

    // 5. Area venue
    if (areas && areas.length > 0) {
      ctx.save();
      ctx.translate(originX, originY);
      ctx.rotate(angleRad);
      areas.forEach((area) => {
        ctx.beginPath();
        traceArea(area);
        ctx.fillStyle = `${area.color}22`;
        ctx.fill();
        const isActive = area.id === activeAreaId;
        ctx.lineWidth = isActive ? 2 : 1.5;
        ctx.strokeStyle = isActive ? '#ffffff' : area.color;
        ctx.setLineDash(isActive ? [6, 4] : []);
        ctx.stroke();
        ctx.setLineDash([]);
      });
      ctx.restore();

      // Nama area digambar tanpa rotasi agar selalu terbaca
      ctx.font = '600 11px ui-sans-serif, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      areas.forEach((area) => {
        const ax = (Number(area.x) || 0) * scale;
        const ay = -(Number(area.y) || 0) * scale;
        const sx = originX + ax * Math.cos(angleRad) - ay * Math.sin(angleRad);
        const sy = originY + ax * Math.sin(angleRad) + ay * Math.cos(angleRad);
        ctx.strokeStyle = theme === 'dark' ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.85)';
        ctx.strokeText(area.name, sx, sy);
        ctx.fillStyle = col.areaLabel;
        ctx.fillText(area.name, sx, sy);
      });
      ctx.lineWidth = 1;
    }

    // 6. Box subwoofer
    ctx.save();
    ctx.translate(originX, originY);
    ctx.rotate(angleRad);

    // Minimum 12 px pada sisi TERPENDEK supaya box tetap terbaca sebagai kotak
    // (lengkap dengan panah arah hadap) walau di-zoom sangat jauh — tapi kedua
    // sisi dinaikkan dengan FAKTOR yang sama, bukan diberi lantai independen.
    // Lantai independen per sisi (versi lama) merusak rasio W:D asli box saat
    // salah satu sisi jatuh di bawah minimum, sehingga box landscape/portrait
    // yang jelas tidak persegi malah tergambar sebagai kotak bujur sangkar.
    const MIN_BOX_PX = 12;
    const rawW = dimensionX * scale;
    const rawH = dimensionY * scale;
    // Dimensi box kosong (project baru, preset belum dipilih) membuat rawW
    // atau rawH persis 0 — mengalikannya dengan faktor pembesar tetap
    // menghasilkan 0 (kotak pipih tak terlihat), jadi kasus ini jatuh ke
    // lantai 12 px x 12 px per sisi, bukan ikut skala proporsional.
    let rectW: number;
    let rectH: number;
    if (rawW > 0 && rawH > 0) {
      const growFactor = Math.max(1, MIN_BOX_PX / Math.min(rawW, rawH));
      rectW = rawW * growFactor;
      rectH = rawH * growFactor;
    } else {
      rectW = Math.max(rawW, MIN_BOX_PX);
      rectH = Math.max(rawH, MIN_BOX_PX);
    }

    groups.forEach((group) => {
      const isHovered = hoveredGroup?.positionId === group.positionId;

      group.boxes.forEach((box) => {
        const muted = group.muted || box.muted;
        // Box yang diputar menghadap belakang: pusat akustiknya bergeser, tetapi
        // jejak fisik kabinet tetap di posisi semula.
        const footprintY = box.y - (box.reversed ? dimensionY : 0);
        const rx = box.x * scale - rectW / 2;
        const ry = footprintY * scale - rectH / 2;

        ctx.fillStyle = muted
          ? col.boxFillMuted
          : isHovered
          ? col.boxFillHover
          : box.reversed
          ? col.boxFillReversed
          : col.boxFill;
        ctx.fillRect(rx, ry, rectW, rectH);

        ctx.setLineDash([]);
        if (box.polarity === -1) {
          // Polaritas terbalik: garis putus-putus tebal (bukan sekadar warna)
          ctx.strokeStyle = col.polarityInverted;
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
        } else {
          ctx.strokeStyle = isHovered ? col.boxStrokeHover : col.boxStroke;
          ctx.lineWidth = 1.5;
        }
        ctx.strokeRect(rx, ry, rectW, rectH);
        ctx.setLineDash([]);

        // Penanda sisi yang memancar (baffle) — strip warna DAN panah, supaya
        // arah hadap tiap box terbaca sekilas dan jelas mengikuti "Arah
        // pancar array". Keduanya digambar di dalam transform yang sama
        // dengan posisi box, jadi otomatis ikut berputar saat arah diganti.
        const facingColor = box.reversed ? col.baffleReversed : col.baffle;
        ctx.fillStyle = facingColor;
        const markerThickness = Math.max(2, Math.min(4, rectH * 0.14));
        const cx = rx + rectW / 2;
        if (box.reversed) {
          ctx.fillRect(rx, ry + rectH - markerThickness, rectW, markerThickness);
        } else {
          ctx.fillRect(rx, ry, rectW, markerThickness);
        }

        // Panah kecil menonjol keluar dari sisi yang memancar — jauh lebih
        // jelas arahnya dibanding strip warna tipis saja, terutama saat
        // box masih kecil di layar (zoom jauh).
        const arrowW = Math.min(rectW * 0.55, 14);
        const arrowH = Math.min(rectH * 0.4, 8);
        ctx.beginPath();
        if (box.reversed) {
          const baseY = ry + rectH;
          ctx.moveTo(cx - arrowW / 2, baseY);
          ctx.lineTo(cx + arrowW / 2, baseY);
          ctx.lineTo(cx, baseY + arrowH);
        } else {
          const baseY = ry;
          ctx.moveTo(cx - arrowW / 2, baseY);
          ctx.lineTo(cx + arrowW / 2, baseY);
          ctx.lineTo(cx, baseY - arrowH);
        }
        ctx.closePath();
        ctx.fill();

        if (muted) {
          ctx.strokeStyle = col.muteCross;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx + rectW, ry + rectH);
          ctx.moveTo(rx + rectW, ry);
          ctx.lineTo(rx, ry + rectH);
          ctx.stroke();
        }

        // Label teks eksplisit di box yang dibalik fisik — warna beda +
        // strip + panah sudah menandainya, tapi tulisan langsung lebih
        // meyakinkan saat dicek sekilas di lapangan. Ambang pakai lebar teks
        // TERUKUR (bukan tebakan px tetap) supaya tag benar-benar muncul
        // begitu ada ruang, bukan baru di box yang sangat besar saja.
        if (box.reversed && rectH >= 14) {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineJoin = 'round';
          ctx.font = '700 8px ui-sans-serif, -apple-system, sans-serif';
          const revWidth = ctx.measureText('REVERSED').width;
          const text = rectW >= revWidth + 6 ? 'REVERSED' : rectW >= ctx.measureText('REV').width + 6 ? 'REV' : null;
          if (text) {
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = 'rgba(0,0,0,0.85)';
            ctx.strokeText(text, cx, ry + rectH / 2);
            ctx.fillStyle = 'rgba(255,255,255,0.96)';
            ctx.fillText(text, cx, ry + rectH / 2);
          }
          ctx.lineWidth = 1;
        }
      });
    });

    // Penanda dimensi Sub Gap & Central Gap — garis ukur ala CAD supaya jarak
    // tidak perlu dibayangkan dari angka di panel saja. Sub Gap = jarak
    // tepi-ke-tepi pasangan box mana pun (nilainya seragam di seluruh
    // array); Central Gap = jarak PUSAT-ke-pusat khusus pasangan paling
    // tengah (lihat Sidebar.applyChange) — dua metrik beda, digambar beda
    // warna dan posisi supaya tidak tertukar. Logika cari-pasangan & gambar
    // garisnya dipakai bersama dengan Tampak Depan dan gambar laporan PDF
    // (lihat findGapPairs/drawGapDimensionLine di utils.ts).
    if (groups.length >= 2 && dimensionX > 0) {
      const haloColor = theme === 'dark' ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)';
      const { sorted, regularPairIdx, centralPairIdx, isEvenArray } = findGapPairs(
        groups,
        dimensionX,
        Number(settings.gap) || 0
      );

      // Nilai LABEL selalu dari geometri fisik asli (bukan dari rectW yang
      // mungkin sudah dibesarkan demi keterbacaan saat di-zoom sangat jauh),
      // supaya angkanya tetap benar walau ujung garis mengikuti tepi box
      // yang tergambar di layar.
      if (regularPairIdx >= 0) {
        const a = sorted[regularPairIdx];
        const b = sorted[regularPairIdx + 1];
        const x0 = a.x * scale + rectW / 2;
        const x1 = b.x * scale - rectW / 2;
        const y = Math.max(a.y, b.y) * scale + rectH / 2 + 16;
        const trueGap = b.x - a.x - dimensionX;
        drawGapDimensionLine(ctx, x0, x1, y, `Sub Gap ${formatMeters(trueGap, 3)}`, col.dimensionLine, haloColor, -angleRad);
      }

      if (isEvenArray) {
        const a = sorted[centralPairIdx];
        const b = sorted[centralPairIdx + 1];
        const x0 = a.x * scale;
        const x1 = b.x * scale;
        const y = Math.max(a.y, b.y) * scale + rectH / 2 + 34;
        const trueGap = b.x - a.x;
        drawGapDimensionLine(ctx, x0, x1, y, `Central Gap ${formatMeters(trueGap, 3)}`, col.dimensionLineAccent, haloColor, -angleRad);
      }

      // Jarak antar baris (End-Fire, Gradient In-Line, dsb.) — garis vertikal
      // di sisi kiri kolom, hanya muncul kalau setup ini punya lebih dari
      // satu baris (findRowSpacingPair mengembalikan null kalau tidak).
      const rowPair = findRowSpacingPair(groups);
      if (rowPair) {
        const rx = rowPair.groupX * scale - rectW / 2 - 20;
        const ry0 = rowPair.yFront * scale;
        const ry1 = rowPair.yRear * scale;
        drawVerticalDimensionLine(
          ctx, rx, ry0, ry1,
          `Jarak Baris ${formatMeters(rowPair.spacing, 3)}`,
          col.dimensionLine, haloColor, -angleRad
        );
      }
    }

    // Titik ukur respons frekuensi
    if (probe) {
      const px = probe.x * scale;
      const py = probe.y * scale;
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.moveTo(px - 11, py); ctx.lineTo(px - 3, py);
      ctx.moveTo(px + 3, py); ctx.lineTo(px + 11, py);
      ctx.moveTo(px, py - 11); ctx.lineTo(px, py - 3);
      ctx.moveTo(px, py + 3); ctx.lineTo(px, py + 11);
      ctx.stroke();
      ctx.restore();
    }

    // Garis busur yang menghubungkan pusat akustik (memperlihatkan lengkungan)
    if (groups.length > 1) {
      ctx.strokeStyle = col.arcLine;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      groups.forEach((g, i) => {
        const px = g.x * scale;
        const py = g.arcOffset * scale;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }, [
    size.w, size.h, offset, scale, settings, groups, areas, activeAreaId,
    hoveredGroup, angleRad, dimensionX, dimensionY, dimensionZ, heatmapMeta, col, theme, probe, viewMode,
  ]);

  useEffect(() => {
    draw();
  }, [draw]);

  // --- Zoom roda mouse (listener native agar preventDefault berlaku) ---------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (viewMode === 'front') return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const originX = size.w / 2 + offset.x;
      const originY = size.h / 2 + offset.y;

      const factor = Math.exp(-e.deltaY * 0.0015);
      const next = Math.min(20, Math.max(0.1, zoomScale * factor));
      const ratio = next / zoomScale;

      // Jaga titik di bawah kursor tetap diam saat zoom
      setUserOffset({
        x: offset.x + (px - originX) * (1 - ratio),
        y: offset.y + (py - originY) * (1 - ratio),
      });
      setZoomScale(next);
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [zoomScale, offset, size.w, size.h, viewMode]);

  // --- Interaksi pointer ----------------------------------------------------
  const hitTestArea = useCallback(
    (clientX: number, clientY: number): string | null => {
      const canvas = canvasRef.current;
      if (!canvas || !areas?.length) return null;
      const rect = canvas.getBoundingClientRect();
      const originX = size.w / 2 + offset.x;
      const originY = size.h / 2 + offset.y;
      const { x: mx, y: my } = screenToWorld(
        clientX - rect.left - originX,
        clientY - rect.top - originY,
        angleRad,
        1
      );

      for (let i = areas.length - 1; i >= 0; i--) {
        const area = areas[i];
        const ax = (Number(area.x) || 0) * scale;
        const ay = -(Number(area.y) || 0) * scale;
        const w =
          (area.shape === 'Circle' || area.shape === 'Semicircle'
            ? (Number(area.radius) || 0) * 2
            : Math.max(Number(area.width) || 0, Number(area.topWidth) || 0, Number(area.bottomWidth) || 0)) * scale;
        const h =
          (area.shape === 'Circle' || area.shape === 'Semicircle'
            ? (Number(area.radius) || 0) * 2
            : Number(area.height) || 0) * scale;
        if (mx >= ax - w / 2 && mx <= ax + w / 2 && my >= ay - h / 2 && my <= ay + h / 2) return area.id;
      }
      return null;
    },
    [areas, angleRad, scale, offset, size.w, size.h]
  );

  const beginInteraction = (clientX: number, clientY: number) => {
    // Tampak Depan statis: tidak ada pan/zoom/pilih area/titik ukur, jadi
    // koordinat offset/scale milik Denah tidak relevan di sini.
    if (viewMode === 'front') return;
    lastPointer.current = { x: clientX, y: clientY };

    // Mode titik ukur mendahului semua interaksi lain supaya klik tidak
    // terlanjur dipakai untuk memilih area atau menggeser peta.
    if (probeMode) {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const originX = size.w / 2 + offset.x;
        const originY = size.h / 2 + offset.y;
        const p = screenToWorld(clientX - rect.left - originX, clientY - rect.top - originY, angleRad, scale);
        setProbe({ x: p.x, y: p.y });
      }
      return;
    }

    const hit = hitTestArea(clientX, clientY);
    if (hit && onSelectArea) {
      onSelectArea(hit);
      // Area terkunci tetap bisa dipilih (untuk dibuka kuncinya lewat panel
      // Area Venue) tapi tidak ikut ter-drag — mencegah tergeser tak sengaja
      // saat menggeser peta di dekatnya.
      const isLocked = areas?.find((a) => a.id === hit)?.locked;
      setDraggingAreaId(isLocked ? null : hit);
      setIsDragging(false);
      return;
    }
    if (onSelectArea) onSelectArea(null);
    setIsDragging(true);
  };

  const moveInteraction = (clientX: number, clientY: number) => {
    const dx = clientX - lastPointer.current.x;
    const dy = clientY - lastPointer.current.y;

    if (draggingAreaId && onUpdateArea) {
      const delta = screenToWorld(dx, dy, angleRad, scale);
      const area = areas?.find((a) => a.id === draggingAreaId);
      if (area) {
        // Dibulatkan ke 1 cm — tanpa ini, pembagian dengan scale saat geser
        // mouse menumpuk sisa desimal panjang (mis. 4.011403189135647) yang
        // lalu tampil apa adanya di field Posisi X/Y pada Area Venue.
        onUpdateArea(area.id, {
          x: Math.round(((Number(area.x) || 0) + delta.x) * 100) / 100,
          y: Math.round(((Number(area.y) || 0) - delta.y) * 100) / 100,
        });
      }
      lastPointer.current = { x: clientX, y: clientY };
      return true;
    }

    if (isDragging) {
      setUserOffset((prev) => { const cur = prev ?? fit.offset; return { x: cur.x + dx, y: cur.y + dy }; });
      lastPointer.current = { x: clientX, y: clientY };
      return true;
    }
    return false;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (viewMode === 'front') return;
    if (moveInteraction(e.clientX, e.clientY)) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setTooltipPos({ x: e.clientX, y: e.clientY });

    const originX = size.w / 2 + offset.x;
    const originY = size.h / 2 + offset.y;
    const { x: mx, y: my } = screenToWorld(
      e.clientX - rect.left - originX,
      e.clientY - rect.top - originY,
      angleRad,
      scale
    );

    const halfW = dimensionX / 2;
    const halfH = dimensionY / 2;
    let hovered: BoxGroup | null = null;
    for (let i = groups.length - 1; i >= 0 && !hovered; i--) {
      for (const box of groups[i].boxes) {
        const fy = box.y - (box.reversed ? dimensionY : 0);
        if (mx >= box.x - halfW && mx <= box.x + halfW && my >= fy - halfH && my <= fy + halfH) {
          hovered = groups[i];
          break;
        }
      }
    }
    setHoveredGroup(hovered);
  };

  const endInteraction = () => {
    setIsDragging(false);
    setDraggingAreaId(null);
    pinchDistance.current = null;
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      beginInteraction(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      setDraggingAreaId(null);
      pinchDistance.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (viewMode === 'front') return;
    if (e.touches.length === 1) {
      moveInteraction(e.touches[0].clientX, e.touches[0].clientY);
      return;
    }
    if (e.touches.length === 2 && pinchDistance.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (pinchDistance.current > 0) {
        const ratio = dist / pinchDistance.current;
        setZoomScale((z) => Math.min(20, Math.max(0.1, z * ratio)));
      }
      pinchDistance.current = dist;
    }
  };

  const resetView = () => {
    setZoomScale(1);
    setUserOffset(null);
  };

  // Respons frekuensi di titik ukur. Ringan (±96 titik × jumlah box), jadi
  // aman dihitung sinkron tanpa debounce seperti heatmap.
  const response = useMemo(
    () => (probe ? calculateFrequencyResponse(settings, groups, probe.x, probe.y) : []),
    [probe, settings, groups]
  );

  // Tinggi total tumpukan (tepi atas box paling tinggi terhadap lantai) —
  // dipakai di HUD Tampak Depan, sama untuk semua posisi dalam array normal.
  const frontStackHeight = useMemo(() => {
    let maxTop = 0;
    for (const g of groups) {
      for (const b of g.boxes) maxTop = Math.max(maxTop, b.z + dimensionZ / 2);
    }
    return maxTop;
  }, [groups, dimensionZ]);

  // Panjang penggaris skala: angka bulat 1-2-5 yang mendekati 90 px di layar.
  const scaleBar = (() => {
    const target = 90 / Math.max(scale, 1e-6);
    const magnitude = Math.pow(10, Math.floor(Math.log10(target)));
    const n = target / magnitude;
    const meters = (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * magnitude;
    const label = meters >= 1000 ? `${(meters / 1000).toFixed(0)} km` : meters >= 1 ? `${meters.toFixed(0)} m` : `${(meters * 100).toFixed(0)} cm`;
    return { meters, label };
  })();

  // Nilai dB nyata untuk legenda
  const legendTop = heatmapMeta
    ? splMode === 'Absolute'
      ? heatmapMeta.maxAbs
      : 0
    : 0;
  const legendTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    t,
    label: splMode === 'Absolute'
      ? `${(legendTop - DYNAMIC_RANGE * (1 - t)).toFixed(0)} dB`
      : `${(-DYNAMIC_RANGE * (1 - t)).toFixed(0)} dB`,
  }));

  return (
    <div ref={containerRef} className="flex-1 relative bg-canvas w-full h-full overflow-hidden print:bg-white">
      <canvas
        ref={canvasRef}
        onMouseDown={(e) => beginInteraction(e.clientX, e.clientY)}
        onMouseMove={handleMouseMove}
        onMouseUp={endInteraction}
        onMouseLeave={() => {
          endInteraction();
          setHoveredGroup(null);
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={endInteraction}
        onTouchCancel={endInteraction}
        className={`block touch-none ${viewMode === 'plan' ? 'cursor-grab active:cursor-grabbing' : ''}`}
      />

      {/* HUD kiri-atas — penggaris skala jauh lebih mudah dibaca daripada
          angka "lebar x tinggi area tampak" yang berubah-ubah tiap zoom. */}
      <div className="absolute top-2 left-2 z-10 pointer-events-none print-hide">
        <div className="panel px-2.5 py-2 bg-panel/85 backdrop-blur-sm">
          {viewMode === 'plan' ? (
            <>
              <div className="flex items-center gap-2">
                <div
                  className="h-2 border-x-2 border-b-2 border-ink-2"
                  style={{ width: `${Math.round(scaleBar.meters * scale)}px` }}
                />
                <span className="text-[11px] font-semibold tnum">{scaleBar.label}</span>
              </div>
              <div className="text-[10px] text-ink-3 mt-1 tnum">
                Zoom {(zoomScale * 100).toFixed(0)}%
                {settings.showHeatmap
                  ? ` · ${settings.bandwidth} @ ${settings.frequency} Hz${isComputing ? ' · menghitung…' : ''}`
                  : ' · heatmap nonaktif'}
              </div>
            </>
          ) : (
            <>
              <span className="text-[11px] font-semibold">Tampak depan · auto-fit</span>
              <div className="text-[10px] text-ink-3 mt-1 tnum">
                Tinggi total {formatMeters(frontStackHeight, 2)}
                {groups[0]?.boxes.length ? ` · ${groups[0].boxes.length} stack/posisi` : ''}
              </div>
            </>

          )}
          {viewMode === 'plan' && viewClamped && (
            <div className="text-[10px] text-danger mt-1 max-w-[220px] leading-snug pointer-events-auto">
              Ada box di posisi tidak wajar (di luar {formatMeters(SANE_LENGTH_M, 0)}) — periksa Sub Gap / Central
              Gap di panel Setup.
            </div>
          )}
        </div>
      </div>

      {/* Kontrol kanan-atas */}
      <div className="absolute top-2 right-2 z-10 flex gap-1.5 print-hide">
        <div className="flex items-center border border-line rounded-md overflow-hidden">
          <button
            onClick={() => setViewMode('plan')}
            className={`btn rounded-none border-0 border-r border-line px-2.5 ${viewMode === 'plan' ? 'bg-hover' : ''}`}
            title="Denah dari atas — bisa digeser dan di-zoom"
            aria-pressed={viewMode === 'plan'}
          >
            Denah
          </button>
          <button
            onClick={() => setViewMode('front')}
            className={`btn rounded-none border-0 px-2.5 ${viewMode === 'front' ? 'bg-hover' : ''}`}
            title="Tampak depan — lihat susunan stack tiap posisi dari sisi audiens"
            aria-pressed={viewMode === 'front'}
          >
            Depan
          </button>
        </div>
        {viewMode === 'plan' && (
          <>
            <button
              className={`btn ${probeMode ? 'btn-primary' : ''}`}
              onClick={() => setProbeMode((v) => !v)}
              aria-pressed={probeMode}
              title="Klik peta untuk menaruh titik ukur, lalu lihat respons frekuensinya"
            >
              Titik ukur
            </button>
            {!areaEditorOpen && onOpenAreaEditor && (
              <button className="btn" onClick={onOpenAreaEditor}>
                Area Venue
              </button>
            )}
            <button className="btn" onClick={resetView} title="Kembalikan zoom & posisi">
              Reset
            </button>
          </>
        )}
      </div>

      {/* Panel respons frekuensi di titik ukur */}
      {viewMode === 'plan' && probeMode && (
        <div className="absolute top-14 right-2 z-20 panel bg-panel/95 backdrop-blur-sm p-2.5 print-hide">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-2">Respons frekuensi</span>
            {probe && (
              <button className="btn px-1.5 min-h-0 py-0.5 text-[10px]" onClick={() => setProbe(null)}>
                Hapus
              </button>
            )}
          </div>

          {!probe ? (
            <p className="section-note w-[260px]">Klik di peta untuk menaruh titik ukur.</p>
          ) : (
            <>
              <ResponseChart
                data={response}
                sensitivity={splMode === 'Absolute' ? Number(settings.boxSensitivity) || 0 : 0}
              />
              <div className="flex justify-between text-[10px] text-ink-3 tnum mt-1">
                <span>
                  X {probe.x >= 0 ? '+' : ''}{probe.x.toFixed(1)} m · Y {probe.y >= 0 ? '+' : ''}{probe.y.toFixed(1)} m
                </span>
                <span>{splMode === 'Absolute' ? 'dB SPL' : 'dB relatif'}</span>
              </div>
              {response.length > 1 && (
                <p className="section-note mt-1 w-[260px]">
                  Deviation {(Math.max(...response.map((r) => r.spl)) - Math.min(...response.map((r) => r.spl))).toFixed(1)} dB
                  {' '}di rentang 20–200 Hz.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Kontrol kiri-bawah */}
      {viewMode === 'plan' && onChangeSettings && (
        <div className="absolute bottom-2 left-2 z-10 flex flex-col gap-1.5 items-start print-hide">
          <label className="panel bg-panel/90 backdrop-blur-sm flex items-center gap-2 px-2.5 py-2 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox"
              checked={settings.showHeatmap}
              onChange={(e) => onChangeSettings({ ...settings, showHeatmap: e.target.checked })}
            />
            <span className="text-[11px] font-semibold">Heatmap SPL</span>
          </label>
          {settings.showHeatmap && areas && areas.length > 0 && (
            <label className="panel bg-panel/90 backdrop-blur-sm flex items-center gap-2 px-2.5 py-2 cursor-pointer">
              <input
                type="checkbox"
                className="checkbox"
                checked={settings.clipHeatmapToAreas}
                onChange={(e) => onChangeSettings({ ...settings, clipHeatmapToAreas: e.target.checked })}
              />
              <span className="text-[11px] font-semibold">Batasi ke area venue</span>
            </label>
          )}
          <div className="panel bg-panel/90 backdrop-blur-sm px-2.5 py-1.5">
            <label htmlFor="visFacing" className="text-[10px] text-ink-3 block" title="Panah pada tiap box di peta mengikuti arah ini">
              Sub menghadap ke
            </label>
            <select
              id="visFacing"
              className="select mt-1 text-[12px] min-h-0 py-1"
              value={settings.arrayFacing}
              onChange={(e) =>
                onChangeSettings({ ...settings, arrayFacing: e.target.value as SubwooferSettings['arrayFacing'] })
              }
            >
              <option value="Down">↓ Bawah</option>
              <option value="Up">↑ Atas</option>
              <option value="Left">← Kiri</option>
              <option value="Right">→ Kanan</option>
            </select>
          </div>
        </div>
      )}

      {/* Legenda skala SPL */}
      {viewMode === 'plan' && settings.showHeatmap && (
        <div className="absolute bottom-2 right-2 z-10 panel bg-panel/90 backdrop-blur-sm p-2.5 w-[168px] print-hide">
          <div className="flex items-center justify-between mb-2 gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-2">Skala SPL</span>
            <button
              className="btn px-1.5 min-h-0 py-0.5 text-[10px]"
              onClick={() => setLegendOpen((v) => !v)}
              aria-label={legendOpen ? 'Tutup legenda' : 'Buka legenda'}
            >
              {legendOpen ? '−' : '+'}
            </button>
          </div>

          {legendOpen && (
            <>
              <div className="flex gap-2">
                <div
                  className="w-4 rounded-sm border border-line"
                  style={{ height: 96, background: `linear-gradient(to top, ${SPL_RAMP_CSS})` }}
                />
                <div className="flex-1 flex flex-col-reverse justify-between h-24 text-[10px] tnum text-ink-2">
                  {legendTicks.map((tick) => (
                    <span key={tick.t}>{tick.label}</span>
                  ))}
                </div>
              </div>

              <button
                className="btn w-full mt-2 min-h-0 py-1 text-[10px]"
                onClick={() => setSplMode((m) => (m === 'Relative' ? 'Absolute' : 'Relative'))}
                title="Relatif = terhadap titik terkuat. Absolut = memakai sensitivitas box."
              >
                {splMode === 'Relative' ? 'Relatif ke puncak' : 'SPL absolut'}
              </button>
              {splMode === 'Absolute' && (
                <p className="text-[9px] text-ink-3 mt-1 leading-snug">
                  Basis {settings.boxSensitivity || 0} dB @1 m per box, ruang bebas.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Tooltip */}
      {viewMode === 'plan' && hoveredGroup && !isDragging && (
        <div
          className="fixed z-30 pointer-events-none panel bg-panel/95 backdrop-blur-sm px-3 py-2 shadow-lg print-hide"
          style={{
            left: Math.min(tooltipPos.x + 14, (typeof window !== 'undefined' ? window.innerWidth : 0) - 200),
            top: tooltipPos.y + 14,
          }}
        >
          <p className="text-xs font-semibold mb-1 pb-1 border-b border-line flex items-center gap-2">
            {hoveredGroup.label}
            {hoveredGroup.muted && <span className="chip chip-danger">Mute</span>}
          </p>
          <p className="text-[11px] text-ink-2 tnum">
            X {hoveredGroup.x >= 0 ? '+' : ''}
            {formatMeters(hoveredGroup.x)}
            {hoveredGroup.arcOffset > 0.001 && ` · mundur ${formatMeters(hoveredGroup.arcOffset, 3)}`}
          </p>
          <div className="mt-1.5 space-y-0.5">
            {[...hoveredGroup.boxes].reverse().map((box) => (
              <div key={box.stackIndex} className="flex justify-between gap-4 text-[11px] tnum">
                <span className={box.isRear ? 'text-warn' : 'text-ink-2'}>{box.positionLabel}</span>
                <span className="font-semibold">
                  {box.delayMs.toFixed(2)} ms{box.polarity === -1 ? ' · ⌀' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
