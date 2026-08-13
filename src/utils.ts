import type { SubwooferSettings, BoxGroup, PhysicalBox, ArrayStats, ArrayWarning, VenueArea } from './types';

export const DEFAULT_SPEED_OF_SOUND = 343;
export const DEFAULT_TEMPERATURE_C = 20;

/**
 * Batas bawah praktis untuk kalkulasi otomatis 1/4 λ (Target Freq).
 * Di bawah ini λ/4 tumbuh sangat cepat — pada 1 Hz saja jaraknya sudah 85 m.
 * Tanpa batas ini, nilai transien saat mengetik ulang field (mis. "0.005"
 * sesaat sebelum menjadi "63") membuat sub gap "meledak" ke ratusan ribu
 * meter, dan itu ikut menyeret panjang array serta skala peta.
 */
export const MIN_TARGET_FREQ_HZ = 20;

/** Ambang di atas mana suatu jarak/panjang dianggap tidak masuk akal untuk array subwoofer. */
export const SANE_SPACING_M = 30;
export const SANE_LENGTH_M = 300;

/**
 * Format jarak dalam meter agar selalu enak dibaca: pemisah ribuan dan
 * maksimal 2 desimal, beralih ke km hanya di atas 1000 m.
 */
export function formatMeters(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1000) {
    return `${(value / 1000).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;
  }
  return `${value.toLocaleString('id-ID', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} m`;
}

export interface GapPairs {
  /** BoxGroup terurut naik berdasarkan posisi X. */
  sorted: BoxGroup[];
  /** Indeks (di `sorted`) pasangan bersebelahan yang mewakili Sub Gap biasa; -1 bila tidak ada. */
  regularPairIdx: number;
  /** Indeks (di `sorted`) pasangan bersebelahan paling simetris ke x=0 (kandidat Central Gap). */
  centralPairIdx: number;
  isEvenArray: boolean;
}

/**
 * Cari pasangan box yang mewakili Sub Gap (biasa) dan Central Gap (tengah)
 * dari daftar posisi — dipakai bersama oleh Denah, Tampak Depan (live), dan
 * generator gambar laporan PDF, supaya keempatnya selalu menunjuk pasangan
 * yang sama persis.
 *
 * Pasangan tengah dicari lewat geometri (paling simetris ke x=0), bukan
 * sekadar indeks tengah array, supaya tetap benar untuk setup tak simetris
 * seperti L/R. Pasangan reguler dicari lewat jarak tepi-ke-tepi yang paling
 * dekat ke nilai Sub Gap yang diinput, supaya tidak salah ambil pasangan
 * lintas-cluster (mis. jarak panggung L/R) sebagai representasi Sub Gap.
 */
export function findGapPairs(groups: BoxGroup[], dimensionX: number, targetGap: number): GapPairs {
  const sorted = [...groups].sort((a, b) => a.x - b.x);

  let centralPairIdx = 0;
  let bestSymmetry = Infinity;
  for (let i = 0; i < sorted.length - 1; i++) {
    const symmetry = Math.abs(sorted[i].x + sorted[i + 1].x);
    if (symmetry < bestSymmetry) {
      bestSymmetry = symmetry;
      centralPairIdx = i;
    }
  }
  const isEvenArray = groups.length % 2 === 0;

  let regularPairIdx = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (isEvenArray && i === centralPairIdx) continue;
    const edgeGap = sorted[i + 1].x - sorted[i].x - dimensionX;
    const diff = Math.abs(edgeGap - targetGap);
    if (diff < bestDiff) {
      bestDiff = diff;
      regularPairIdx = i;
    }
  }

  return { sorted, regularPairIdx, centralPairIdx, isEvenArray };
}

/**
 * Gambar satu garis ukur ala CAD (garis + tick di ujung + anak panah ke
 * dalam + label) di antara x0 dan x1 pada ketinggian y — dipakai bersama
 * oleh Denah, Tampak Depan, dan gambar laporan PDF untuk anotasi Sub Gap /
 * Central Gap, supaya gaya visualnya konsisten di semua tempat.
 *
 * `textRotation` melawan-putar teks (dalam radian) supaya label tetap tegak
 * meski garisnya digambar di dalam konteks kanvas yang sudah diputar
 * (mis. mengikuti arah hadap array di Denah) — beri 0 untuk konteks yang
 * memang tidak diputar (Tampak Depan).
 */
export function drawGapDimensionLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  y: number,
  label: string,
  color: string,
  haloColor: string,
  textRotation = 0
): void {
  if (x1 - x0 < 4) return; // box berimpitan/tumpang tindih — garis ukur tidak berguna

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.25;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();

  const tick = 4;
  ctx.beginPath();
  ctx.moveTo(x0, y - tick);
  ctx.lineTo(x0, y + tick);
  ctx.moveTo(x1, y - tick);
  ctx.lineTo(x1, y + tick);
  ctx.stroke();

  ctx.fillStyle = color;
  ([[x0, 1], [x1, -1]] as const).forEach(([x, dir]) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dir * 6, y - 3);
    ctx.lineTo(x + dir * 6, y + 3);
    ctx.closePath();
    ctx.fill();
  });

  ctx.save();
  ctx.translate((x0 + x1) / 2, y);
  ctx.rotate(textRotation);
  ctx.font = '700 9px ui-sans-serif, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = haloColor;
  ctx.strokeText(label, 0, 0);
  ctx.fillStyle = color;
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

/**
 * Perbaiki otomatis project lama yang gap/central gap/row spacing-nya sudah
 * terlanjur tersimpan dengan nilai tidak wajar (dari sebelum MIN_TARGET_FREQ_HZ
 * ditambahkan). Peringatan di calculateArcDelay saja tidak cukup — pengguna
 * yang membuka project lama akan melihat peta meng-zoom ke skala kilometer
 * tanpa tahu sebabnya. Dipanggil sekali saat project dimuat, bukan saat
 * pengguna sedang mengetik (agar tidak melawan input yang sedang berlangsung).
 */
export function sanitizeSettings(settings: SubwooferSettings): { settings: SubwooferSettings; fixed: string[] } {
  const fixed: string[] = [];
  const next = { ...settings };

  const gapNum = Number(next.gap);
  const centralGapNum = Number(next.centralGap);
  if (Number.isFinite(gapNum) && gapNum > SANE_SPACING_M) {
    next.gap = 0.5;
    fixed.push('Sub Gap');
  }
  if (Number.isFinite(centralGapNum) && centralGapNum > SANE_SPACING_M) {
    // Central Gap = jarak pusat-ke-pusat (Sub Gap + lebar box), jadi nilai
    // aman-nya dihitung ulang dari Sub Gap yang sudah bersih di atas, bukan
    // angka tetap yang mengabaikan dimensi box.
    const dimX = settings.orientation === 'Landscape' ? Number(next.width) || 0 : Number(next.height) || 0;
    next.centralGap = Number((Number(next.gap) + dimX).toFixed(3));
    fixed.push('Central Gap');
  }
  const rowSpacingNum = Number(next.rowSpacing);
  if (Number.isFinite(rowSpacingNum) && rowSpacingNum > SANE_SPACING_M) {
    next.rowSpacing = '';
    fixed.push('Jarak Baris');
  }
  if (fixed.length > 0) {
    // Nilai kunci sudah tidak wajar; lepaskan kuncian Target Freq supaya
    // pengguna tidak bingung kenapa gap "tidak ikut" saat mereka mengetik
    // ulang frekuensi (lihat logika retarget di Sidebar.applyChange).
    next.targetFrequency = '';
  }

  return { settings: next, fixed };
}

/**
 * Kecepatan suara di udara kering (m/s) sebagai fungsi suhu.
 * c = 331.3 * sqrt(1 + T/273.15)  — pendekatan standar.
 * Kelembapan menaikkan c < 0.5% pada kondisi ekstrem, jadi dikoreksi ringan
 * dengan pendekatan Cramer yang disederhanakan agar tetap konsisten dengan
 * nilai yang dipakai di lapangan.
 */
export function calculateSpeedOfSound(tempC: number, rh = 50): number {
  const t = Number.isFinite(tempC) ? tempC : DEFAULT_TEMPERATURE_C;
  const cDry = 331.3 * Math.sqrt(1 + t / 273.15);
  // Koreksi uap air: makin panas & lembap, makin cepat (maks ~+0.6 m/s pada 30C/100%).
  const humidityTerm = 1.0059e-3 * (rh / 100) * Math.pow(2, t / 10);
  return cDry * (1 + humidityTerm);
}

/**
 * Serapan udara (dB/m) menurut ISO 9613-1 / ANSI S1.26.
 * f dalam Hz, tempC dalam Celsius, rh dalam persen, tekanan dalam kPa.
 */
export function calculateAirAbsorption(f: number, tempC: number, rh: number, pressureKPa = 101.325): number {
  const T = tempC + 273.15;
  const T01 = 273.16;
  const pa = pressureKPa / 101.325;

  // Tekanan uap jenuh relatif
  const C = -6.8346 * Math.pow(T01 / T, 1.261) + 4.6151;
  const psatRatio = Math.pow(10, C);

  // Konsentrasi molar uap air (%)
  const h = rh * psatRatio / pa;

  const Tr = T / 293.15;

  // Frekuensi relaksasi oksigen & nitrogen
  const frO = pa * (24 + 4.04e4 * h * (0.02 + h) / (0.391 + h));
  const frN = pa * Math.pow(Tr, -0.5) * (9 + 280 * h * Math.exp(-4.17 * (Math.pow(Tr, -1 / 3) - 1)));

  return 8.686 * f * f * (
    1.84e-11 / pa * Math.sqrt(Tr) +
    Math.pow(Tr, -2.5) * (
      0.01275 * Math.exp(-2239.1 / T) * frO / (frO * frO + f * f) +
      0.1068 * Math.exp(-3352.0 / T) * frN / (frN * frN + f * f)
    )
  );
}

/** Jarak transisi near-field → far-field sebuah line source (m). */
export function lineArrayTransition(length: number, freq: number, c = DEFAULT_SPEED_OF_SOUND): number {
  return (length * length * freq) / (2 * c);
}

/**
 * Field kosong ('') harus jatuh ke nilai default, tetapi angka 0 yang memang
 * diisi user harus dipertahankan — misalnya tinggi bidang ukur 0 m (ground
 * plane) atau sudut busur 0°. Menggunakan `Number(v) || default` akan menelan
 * nilai 0 tersebut.
 */
const num = (v: number | '' | null | undefined, fallback = 0): number => {
  if (v === '' || v === null || v === undefined) return fallback;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Kunci unik satu box fisik: posisi (kolom) + index tumpukan di dalamnya. */
export const boxKey = (positionId: number, stackIndex: number) => `${positionId}:${stackIndex}`;

export function calculateArcDelay(
  settings: SubwooferSettings,
  mutedPositions: Set<number> = new Set(),
  disabledCardioidPositions: Set<number> = new Set(),
  invertedBoxes: Set<string> = new Set(),
  disabledCardioidBoxes: Set<string> = new Set(),
  mutedBoxes: Set<string> = new Set()
): { groups: BoxGroup[]; stats: ArrayStats } {
  const { setupType } = settings;
  const count = Math.max(0, Math.round(num(settings.count)));
  const stageWidth = num(settings.stageWidth);
  const width = num(settings.width);
  const depth = num(settings.depth);
  const boxHeight = num(settings.height);
  const gap = num(settings.gap);
  const theta = num(settings.theta);
  const speedOfSound = num(settings.speedOfSound, DEFAULT_SPEED_OF_SOUND) || DEFAULT_SPEED_OF_SOUND;
  const cardioidDelay = num(settings.cardioidDelay);
  const stackCount = Math.max(1, Math.round(num(settings.stack, 1)));
  const rowsCount = Math.max(1, Math.round(num(settings.rows, 1)));

  const isLR = setupType.includes('L/R');
  const isEndFire = setupType.includes('End-Fire');
  const n = isLR ? Math.floor(count / 2) * 2 : count;

  const emptyStats: ArrayStats = {
    acousticCenterSpacing: 0,
    totalArrayLength: 0,
    upperFreqLimit: 0,
    arcRadius: 0,
    maxArcOffset: 0,
    warnings: [],
  };

  if (n < 1) return { groups: [], stats: emptyStats };

  // Sumbu X = sepanjang panggung, sumbu Y = kedalaman (audiens berada di -Y).
  // Landscape ↔ Portrait memutar box 90° pada sumbu depth-nya: dimensi yang
  // menghadap sumbu array TERTUKAR antara Width dan Height (bukan Depth —
  // depth adalah jarak box ke audiens, tidak berubah oleh rotasi ini). Ini
  // mengikuti persis tabel lookup "Subwoofer dimensions" pada kalkulator arc
  // delay resmi (kolom Height/Width bertukar via VLOOKUP orientasi; Depth
  // tidak pernah dipakai di sana sama sekali).
  const dimensionX = settings.orientation === 'Landscape' ? width : boxHeight;
  const dimensionY = depth;
  // Rotasi Landscape↔Portrait menukar Width dan Height sekaligus untuk sumbu
  // array (X) MAUPUN sumbu tumpuk vertikal (Z) — keduanya berputar bersama;
  // hanya Depth yang tidak berubah. dimensionZ dipakai untuk tinggi antar
  // tumpukan (stacking), kebalikan dari dimensionX.
  const dimensionZ = settings.orientation === 'Landscape' ? boxHeight : width;
  const acousticCenterSpacing = dimensionX + gap;
  // Central Gap = jarak PUSAT-ke-PUSAT pasangan box paling tengah (array
  // genap). Ini otomatis mengikuti Sub Gap + lebar box (acousticCenterSpacing)
  // sehingga nilainya SELALU berbeda dari Sub Gap (Sub Gap adalah celah
  // kosong; Central Gap sudah termasuk badan box) — tapi keduanya tetap
  // saling mengikuti lewat Sidebar (lihat applyChange di Sidebar.tsx).
  // Pengguna tetap bisa menimpanya manual untuk celah tengah yang sengaja
  // dilebar/dipersempit dari spacing normal.
  const centralGap = num(settings.centralGap, acousticCenterSpacing) || acousticCenterSpacing;

  const isEven = n % 2 === 0;
  // Total panjang array (tepi-ke-tepi fisik): jumlah semua jarak pusat-ke-
  // pusat antar box berurutan (central gap untuk pasangan tengah, spacing
  // normal untuk sisanya) ditambah satu lebar box (setengah box menonjol di
  // tiap ujung array).
  const totalArrayLength = isEven
    ? centralGap + (n - 2) * acousticCenterSpacing + dimensionX
    : (n - 1) * acousticCenterSpacing + dimensionX;

  const aliasingLimit = (spacing: number) => (spacing > 0 ? speedOfSound / (2 * spacing) : Infinity);
  const upperFreqLimit = Math.min(
    aliasingLimit(acousticCenterSpacing),
    isEven ? aliasingLimit(centralGap) : Infinity
  );

  // Radius busur virtual: setengah jarak antar pusat akustik terluar dibagi sin(theta/2).
  const thetaRad = (theta * Math.PI) / 180;
  const halfChord = (totalArrayLength - dimensionX) / 2;
  const arcRadius = theta > 0 && halfChord > 0 ? halfChord / Math.sin(thetaRad / 2) : 0;

  const rowSpacing = num(settings.rowSpacing, dimensionY + gap) || dimensionY + gap;
  const spacerSize = settings.cardioidSpacers ? num(settings.cardioidSpacerSize) : 0;

  const warnings: ArrayWarning[] = [];
  if (dimensionX <= 0 || dimensionY <= 0) {
    warnings.push({ level: 'error', message: 'Dimensi box belum diisi — semua jarak akustik dihitung dari 0.' });
  }
  if (isEven && centralGap > 0 && centralGap < dimensionX - 1e-6) {
    warnings.push({
      level: 'error',
      message: `Central gap ${formatMeters(centralGap)} lebih kecil dari lebar box ${formatMeters(dimensionX)} — box saling tumpang tindih.`,
    });
  }
  if (rowsCount > 1 && rowSpacing < dimensionY - 1e-6 && dimensionY > 0) {
    warnings.push({
      level: 'error',
      message: `Jarak baris ${rowSpacing.toFixed(2)} m lebih kecil dari kedalaman box ${dimensionY.toFixed(2)} m — baris bertabrakan.`,
    });
  }
  if (isLR && stageWidth <= 0) {
    warnings.push({ level: 'warn', message: 'Lebar panggung 0 m — kedua cluster L/R menumpuk di titik yang sama.' });
  }
  if (isLR && count % 2 !== 0) {
    warnings.push({ level: 'warn', message: `Jumlah box ganjil pada setup L/R — hanya ${n} box yang dipakai.` });
  }
  if (Number.isFinite(upperFreqLimit) && upperFreqLimit > 0 && upperFreqLimit < 80) {
    warnings.push({
      level: 'warn',
      message: `Spatial aliasing mulai di ${upperFreqLimit.toFixed(0)} Hz — masih di dalam pita subwoofer. Rapatkan jarak antar box.`,
    });
  }
  // Jaring pengaman kedua: bila sub gap/central gap terlanjur tersimpan dengan
  // nilai tidak wajar (mis. dari project lama sebelum field Target Freq diberi
  // batas bawah, lihat MIN_TARGET_FREQ_HZ), tandai dengan jelas alih-alih
  // membiarkan panjang array tampil sebagai ratusan ribu meter tanpa keterangan.
  if (acousticCenterSpacing > SANE_SPACING_M || centralGap > SANE_SPACING_M) {
    warnings.push({
      level: 'error',
      message: `Jarak antar box ${formatMeters(Math.max(acousticCenterSpacing, centralGap))} tidak wajar untuk array subwoofer. Periksa Sub Gap / Central Gap — kemungkinan Target Freq sempat terisi angka mendekati 0.`,
    });
  } else if (totalArrayLength > SANE_LENGTH_M) {
    warnings.push({
      level: 'error',
      message: `Panjang array ${formatMeters(totalArrayLength)} tidak wajar. Periksa jumlah box dan jarak antar box.`,
    });
  }

  // Rekomendasi delay cardioid berbasis fisika: waktu tempuh jarak antar elemen.
  const cardioidSpacingM = rowsCount > 1 ? rowSpacing : dimensionY;
  const recommendedCardioidDelay = cardioidSpacingM > 0 ? (cardioidSpacingM / speedOfSound) * 1000 : 0;

  const stats: ArrayStats = {
    acousticCenterSpacing,
    totalArrayLength,
    upperFreqLimit,
    arcRadius,
    maxArcOffset: 0,
    recommendedCardioidDelay,
    warnings,
  };

  const isGradientSetup =
    setupType.includes('Gradient') ||
    setupType === 'Auto-Efficiency' ||
    setupType === 'Pattern Implosion' ||
    setupType === 'Cardioid L/R';

  const cardioidEnabled = settings.cardioid || isGradientSetup;

  const groups: BoxGroup[] = [];

  /**
   * @param x          posisi pusat akustik pada sumbu panggung (m)
   * @param arcOffset  pergeseran fisik ke belakang untuk membentuk busur (m)
   * @param baseDelay  delay elektronik dasar untuk seluruh posisi (ms)
   */
  const createGroup = (id: number, label: string, x: number, arcOffset: number, baseDelay: number) => {
    const isMuted = mutedPositions.has(id);
    const cardioidDisabled = disabledCardioidPositions.has(id);
    const boxes: PhysicalBox[] = [];

    const isRowBased = rowsCount > 1;
    // Cardioid berbasis baris: baris belakang (r > 0) yang dibalik polaritas + delay.
    const rowCardioid = isRowBased && !isEndFire && cardioidEnabled && !cardioidDisabled;
    // Cardioid berbasis tumpukan: box yang dicentang user yang diputar menghadap belakang.
    const stackCardioid = !isRowBased && !isEndFire && cardioidEnabled && !cardioidDisabled;

    const endFireStep =
      settings.endFireDelayStep === '' || settings.endFireDelayStep === undefined
        ? (rowSpacing / speedOfSound) * 1000
        : num(settings.endFireDelayStep);

    for (let r = 0; r < rowsCount; r++) {
      for (let s = 0; s < stackCount; s++) {
        const stackIndex = isRowBased ? r * stackCount + s : s;
        const key = boxKey(id, stackIndex);
        // Cardioid dimatikan manual untuk box INI SAJA (dari tabel DSP) — box
        // ini kembali berperan sebagai elemen depan biasa, terlepas dari
        // konfigurasi baris/tumpukan cardioid di panel Setup.
        const cardioidDisabledForBox = disabledCardioidBoxes.has(key);

        // End-Fire tumbuh ke arah audiens (-Y); baris 0 adalah yang paling belakang.
        // Gradient/array biasa tumbuh ke belakang (+Y) dari baris depan.
        const rowY = (isEndFire ? -r : r) * rowSpacing;

        // Dihitung TANPA cardioidDisabledForBox — kelayakan struktural box ini
        // untuk berperan cardioid, dipakai tabel DSP supaya tombol C-on/C-off
        // tidak muncul di box FRONT yang memang tak pernah ikut cardioid.
        const cardioidCandidate =
          (stackCardioid && settings.cardioidReversedBoxes?.[s] === true) || (rowCardioid && r > 0);

        const isReversedBox = stackCardioid && !cardioidDisabledForBox && settings.cardioidReversedBoxes?.[s] === true;
        const isRearRow = rowCardioid && !cardioidDisabledForBox && r > 0;
        const isRear = isReversedBox || isRearRow;

        // Box yang diputar menghadap belakang: pusat akustiknya bergeser sedalam box.
        const reverseOffset = isReversedBox ? dimensionY : 0;

        let delayMs = baseDelay;
        let positionLabel: string;

        if (isEndFire && isRowBased) {
          // End-Fire: elemen paling belakang bunyi lebih dulu, elemen depan di-delay
          // sebesar waktu tempuh antar elemen agar muka gelombang menumpuk ke depan.
          delayMs += r * endFireStep;
          positionLabel = r === 0 ? 'REAR' : r === rowsCount - 1 ? 'FRONT' : `ROW ${r + 1}`;
        } else if (isRowBased) {
          positionLabel = isRearRow ? (r === rowsCount - 1 ? 'REAR' : `ROW ${r + 1}`) : 'FRONT';
        } else {
          positionLabel = isRear ? 'REAR' : 'FRONT';
        }

        if (isRear) delayMs += cardioidDelay;

        let polarity: 1 | -1 = isRear && settings.invertRearPolarity ? -1 : 1;
        // Balik manual dari tabel DSP — independen dari logika cardioid di
        // atas, jadi pengguna bisa membalik box mana pun, kapan pun.
        if (invertedBoxes.has(key)) polarity = polarity === 1 ? -1 : 1;

        const isBoxMuted =
          (isRear && settings.muteRear) || (!isRear && settings.muteFront) || mutedBoxes.has(key) || false;

        boxes.push({
          stackIndex,
          rowIndex: r,
          stackLevel: s,
          x,
          y: arcOffset + rowY + reverseOffset,
          z: s * (dimensionZ + spacerSize) + dimensionZ / 2,
          delayMs,
          polarity,
          isRear,
          reversed: isReversedBox,
          muted: isBoxMuted,
          positionLabel,
          cardioidCandidate,
        });
      }
    }

    groups.push({
      positionId: id,
      label,
      x,
      y: arcOffset,
      arcOffset,
      baseDelayMs: baseDelay,
      muted: isMuted,
      cardioidDisabled,
      boxes,
    });
  };

  const usesArcDistribution =
    setupType === 'Curved Array' ||
    setupType === 'Straight Delayed Array' ||
    setupType.includes('Gradient') ||
    setupType === 'Auto-Efficiency' ||
    setupType === 'Pattern Implosion' ||
    setupType === 'End-Fire';

  if (usesArcDistribution) {
    let maxArcOffset = 0;

    for (let i = 0; i < n; i++) {
      let x: number;
      let label: string;

      if (isEven) {
        const halfIndex = i < n / 2 ? n / 2 - 1 - i : i - n / 2;
        const absX = centralGap / 2 + halfIndex * acousticCenterSpacing;
        x = i < n / 2 ? -absX : absX;
        label = `Box ${i < n / 2 ? 'L' : 'R'}${halfIndex + 1}`;
      } else {
        const offsetIndex = i - Math.floor(n / 2);
        x = offsetIndex * acousticCenterSpacing;
        label = offsetIndex === 0 ? 'Box C (Tengah)' : `Box ${offsetIndex < 0 ? 'L' : 'R'}${Math.abs(offsetIndex)}`;
      }

      // Sagitta busur: seberapa jauh box ini harus mundur dari garis lurus agar
      // seluruh elemen duduk pada lingkaran berjari-jari R yang berpusat di belakang.
      let arcOffset = 0;
      let delayMs = 0;
      if (arcRadius > 0 && (setupType === 'Curved Array' || setupType === 'Straight Delayed Array')) {
        const inside = arcRadius * arcRadius - x * x;
        const sagitta = inside > 0 ? arcRadius - Math.sqrt(inside) : arcRadius;
        if (setupType === 'Curved Array') {
          arcOffset = sagitta; // dibengkokkan secara fisik, tanpa delay
        } else {
          delayMs = (sagitta / speedOfSound) * 1000; // array lurus, busur ditiru dengan delay
        }
        maxArcOffset = Math.max(maxArcOffset, sagitta);
      }

      createGroup(i, label, x, arcOffset, delayMs);
    }

    stats.maxArcOffset = maxArcOffset;
  } else if (isLR) {
    const half = n / 2;
    const clusterSpan = (half - 1) * acousticCenterSpacing;
    const sideLabel = setupType.replace(' L/R', '');

    for (let i = 0; i < half; i++) {
      const x = -stageWidth / 2 - clusterSpan / 2 + i * acousticCenterSpacing;
      createGroup(i, `${sideLabel} Kiri ${i + 1}`, x, 0, 0);
    }
    for (let i = 0; i < half; i++) {
      const x = stageWidth / 2 - clusterSpan / 2 + i * acousticCenterSpacing;
      createGroup(half + i, `${sideLabel} Kanan ${i + 1}`, x, 0, 0);
    }
  }

  groups.sort((a, b) => a.positionId - b.positionId);

  // Normalisasi delay agar nilai terkecil = 0 ms (DSP tidak menerima delay negatif,
  // dan offset konstan tidak mengubah pola interferensi).
  let minDelay = Infinity;
  for (const g of groups) for (const b of g.boxes) if (b.delayMs < minDelay) minDelay = b.delayMs;
  if (Number.isFinite(minDelay) && minDelay !== 0) {
    for (const g of groups) {
      g.baseDelayMs -= minDelay;
      for (const b of g.boxes) b.delayMs -= minDelay;
    }
  }

  return { groups, stats };
}

/**
 * Sudut rotasi kanvas untuk tiap arah hadap array. Satu-satunya sumber
 * kebenaran — dipakai Visualizer.tsx (denah interaktif) MAUPUN
 * reportHeatmap.ts (gambar peta statis di laporan PDF), supaya box di kedua
 * tempat selalu tergambar konsisten relatif terhadap peta SPL-nya.
 */
export const facingAngle = (facing: SubwooferSettings['arrayFacing']) =>
  facing === 'Down' ? Math.PI : facing === 'Left' ? -Math.PI / 2 : facing === 'Right' ? Math.PI / 2 : 0;

/** Titik frekuensi yang dirata-ratakan secara daya untuk lebar pita tertentu. */
export function getFrequenciesForBandwidth(fc: number, bandwidth: string): number[] {
  if (bandwidth === '1/3 Octave') {
    return [fc * Math.pow(2, -1 / 6), fc, fc * Math.pow(2, 1 / 6)];
  }
  if (bandwidth === '1 Octave') {
    return [-1 / 2, -1 / 4, 0, 1 / 4, 1 / 2].map((e) => fc * Math.pow(2, e));
  }
  if (bandwidth === 'Broadband') {
    return [25, 31.5, 40, 50, 63, 80, 100, 125];
  }
  return [fc];
}

// Tabel cos/sin untuk mempercepat penjumlahan fasor (galat < 0.001 rad).
const TRIG_STEPS = 8192;
const COS_TABLE = new Float32Array(TRIG_STEPS);
const SIN_TABLE = new Float32Array(TRIG_STEPS);
for (let i = 0; i < TRIG_STEPS; i++) {
  const a = (i / TRIG_STEPS) * Math.PI * 2;
  COS_TABLE[i] = Math.cos(a);
  SIN_TABLE[i] = Math.sin(a);
}
const TWO_PI_INV = TRIG_STEPS / (Math.PI * 2);

export interface HeatmapResult {
  heatmap: Float32Array;
  cols: number;
  rows: number;
  maxSpl: number;
  minSpl: number;
  blockSize: number;
  /** SPL absolut (dB) pada titik terkuat, bila referensi sensitivitas diisi. */
  maxSplAbsolute: number;
}

export interface HeatmapViewport {
  widthPx: number;
  heightPx: number;
  cx: number;
  cy: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  /** Paksa ukuran blok minimum (perangkat mobile). */
  minBlockSize?: number;
}

/**
 * Kumpulan sumber titik aktif, sudah diratakan ke array datar. Dibangun
 * SEKALI lalu dipakai ulang untuk ribuan titik evaluasi — jauh lebih cepat
 * daripada menelusuri struktur groups/boxes di dalam loop.
 */
export interface SourceField {
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  amp: Float64Array;
  /** Delay tiap sumber, sudah dikonversi jadi jarak setara (meter). */
  delayM: Float64Array;
  count: number;
  speedOfSound: number;
}

export function buildSourceField(settings: SubwooferSettings, groups: BoxGroup[]): SourceField {
  const c = num(settings.speedOfSound, DEFAULT_SPEED_OF_SOUND) || DEFAULT_SPEED_OF_SOUND;
  const active: PhysicalBox[] = [];
  for (const group of groups) {
    if (group.muted) continue;
    for (const box of group.boxes) {
      if (box.muted) continue;
      active.push(box);
    }
  }
  const n = active.length;
  const field: SourceField = {
    x: new Float64Array(n), y: new Float64Array(n), z: new Float64Array(n),
    amp: new Float64Array(n), delayM: new Float64Array(n), count: n, speedOfSound: c,
  };
  for (let i = 0; i < n; i++) {
    field.x[i] = active[i].x;
    field.y[i] = active[i].y;
    field.z[i] = active[i].z;
    field.amp[i] = active[i].polarity;
    field.delayM[i] = (active[i].delayMs / 1000) * c;
  }
  return field;
}

/**
 * Level relatif (dB) di satu titik, dirata-ratakan secara daya untuk semua
 * bilangan gelombang `ks`. INI SATU-SATUNYA tempat fisika penjumlahan fasor
 * ditulis — heatmap, respons frekuensi, dan statistik area semuanya memanggil
 * fungsi ini, jadi ketiganya dijamin tidak akan pernah berbeda hasil.
 *
 * Koordinat (x, y, z) memakai sumbu ARRAY, bukan sumbu layar: audiens di −Y.
 */
export function splAtPoint(field: SourceField, ks: number[], x: number, y: number, z: number): number {
  if (field.count === 0 || ks.length === 0) return -240;
  let powerSum = 0;

  for (let fi = 0; fi < ks.length; fi++) {
    const k = ks[fi];
    let re = 0;
    let im = 0;
    for (let i = 0; i < field.count; i++) {
      const dx = x - field.x[i];
      const dy = y - field.y[i];
      const dz = z - field.z[i];
      let dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 0.25) dist = 0.25; // hindari singularitas di dekat driver

      const phase = k * (dist + field.delayM[i]);
      let idx = Math.round(phase * TWO_PI_INV) % TRIG_STEPS;
      if (idx < 0) idx += TRIG_STEPS;

      const amp = field.amp[i] / dist;
      re += amp * COS_TABLE[idx];
      im += amp * SIN_TABLE[idx];
    }
    powerSum += re * re + im * im;
  }

  const rms = Math.sqrt(powerSum / ks.length);
  return rms > 1e-12 ? 20 * Math.log10(rms) : -240;
}

/** Ubah frekuensi (Hz) menjadi bilangan gelombang k = 2πf/c. */
export const waveNumbers = (freqs: number[], c: number) => freqs.map((f) => (2 * Math.PI * f) / c);

/**
 * Peta SPL 2D pada ketinggian telinga.
 *
 * Setiap box dimodelkan sebagai sumber titik (valid di pita subwoofer, di mana
 * dimensi box << panjang gelombang). Tekanan kompleks tiap sumber:
 *     p_i = (polaritas_i / r_i) * e^{ j k (r_i + c * t_i) }
 * dijumlahkan secara koheren per frekuensi, lalu dirata-ratakan secara daya
 * (RMS) antar frekuensi di dalam pita — persis cara analyzer merata-ratakan
 * pita 1/3 oktaf. Level dinyatakan relatif terhadap satu box pada jarak 1 m,
 * sehingga penambahan referensi sensitivitas (dB SPL @1m) langsung memberi
 * SPL absolut.
 */
export function calculate2DSpatialHeatmap(
  settings: SubwooferSettings,
  groups: BoxGroup[],
  viewport: HeatmapViewport
): HeatmapResult {
  const { widthPx, heightPx, cx, cy, scale, offsetX, offsetY, minBlockSize = 1 } = viewport;

  const resMap: Record<string, number> = { Low: 8, Medium: 4, High: 2 };
  const blockSize = Math.max(resMap[settings.resolution] ?? 4, minBlockSize);

  const cols = Math.max(1, Math.ceil(widthPx / blockSize));
  const rows = Math.max(1, Math.ceil(heightPx / blockSize));

  const heatmap = new Float32Array(cols * rows);
  const empty: HeatmapResult = { heatmap, cols, rows, maxSpl: 0, minSpl: 0, blockSize, maxSplAbsolute: 0 };
  if (!settings.showHeatmap) return empty;

  // Ratakan seluruh box aktif ke array datar sekali saja (bukan per piksel).
  const field = buildSourceField(settings, groups);
  if (field.count === 0) return empty;

  const frequencies = getFrequenciesForBandwidth(num(settings.frequency, 63) || 63, settings.bandwidth);
  const ks = waveNumbers(frequencies, field.speedOfSound);
  const earHeight = num(settings.earHeight, 1.6);
  const facing = settings.arrayFacing;

  let maxSpl = -Infinity;
  let minSpl = Infinity;

  for (let r = 0; r < rows; r++) {
    const visualY = (r * blockSize - cy - offsetY) / scale;

    for (let col = 0; col < cols; col++) {
      const visualX = (col * blockSize - cx - offsetX) / scale;

      // Balikkan rotasi tampilan agar kembali ke koordinat array.
      // HARUS cermin persis dari facingAngle() di Visualizer.tsx
      // (Up=0, Down=π, Left=−π/2, Right=+π/2). Untuk sudut θ:
      //   layar = R(θ)·array  →  array = R(−θ)·layar
      //   xm =  cosθ·sx + sinθ·sy
      //   ym = −sinθ·sx + cosθ·sy
      // Jika kedua tabel ini tidak sinkron, peta SPL tergambar berputar
      // terhadap posisi box — mis. zona rejection cardioid muncul di sisi
      // audiens, bukan di sisi panggung.
      let xm: number, ym: number;
      switch (facing) {
        case 'Down': xm = -visualX; ym = -visualY; break;   // θ = π
        case 'Left': xm = -visualY; ym = visualX; break;    // θ = −π/2
        case 'Right': xm = visualY; ym = -visualX; break;   // θ = +π/2
        default: xm = visualX; ym = visualY;                // 'Up', θ = 0
      }

      const spl = splAtPoint(field, ks, xm, ym, earHeight);

      heatmap[r * cols + col] = spl;
      if (spl > maxSpl) maxSpl = spl;
      if (spl < minSpl && spl > -240) minSpl = spl;
    }
  }

  if (!Number.isFinite(maxSpl)) maxSpl = 0;
  if (!Number.isFinite(minSpl)) minSpl = maxSpl;

  return {
    heatmap,
    cols,
    rows,
    maxSpl,
    minSpl,
    blockSize,
    maxSplAbsolute: maxSpl + num(settings.boxSensitivity, 0),
  };
}

/**
 * Skala warna peta SPL — konvensi baku perangkat lunak prediksi akustik:
 * ungu → biru tua → biru → cyan → hijau → kuning → jingga → merah.
 * Urutan ini yang dibaca kolega dan klien pada laporan coverage, sehingga
 * dipertahankan apa adanya sebagai satu-satunya skala aplikasi.
 */
const SPL_RAMP: [number, number, number][] = [
  [75, 0, 130],    // ungu — paling hening
  [0, 0, 200],     // biru tua
  [0, 100, 255],   // biru
  [0, 180, 255],   // biru muda
  [0, 230, 210],   // cyan
  [0, 210, 0],     // hijau
  [150, 230, 0],   // hijau kekuningan
  [255, 255, 0],   // kuning
  [255, 160, 0],   // jingga
  [255, 40, 0],    // merah
  [180, 0, 0],     // merah tua — paling keras
];

/** CSS gradient untuk legenda (urutan: hening → keras). */
export const SPL_RAMP_CSS = SPL_RAMP.map(
  ([r, g, b], i) => `rgb(${r},${g},${b}) ${((i / (SPL_RAMP.length - 1)) * 100).toFixed(1)}%`
).join(', ');

/** Ambil warna ramp pada posisi ternormalisasi 0..1. */
export function splRampColor(t: number): [number, number, number] {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const pos = clamped * (SPL_RAMP.length - 1);
  const i = Math.min(SPL_RAMP.length - 2, Math.floor(pos));
  const f = pos - i;
  const a = SPL_RAMP[i];
  const b = SPL_RAMP[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

/**
 * Render heatmap ke ImageData (jauh lebih cepat daripada ribuan fillRect
 * dengan string warna — penting untuk perangkat mobile).
 *
 * @param bandStep  bila > 0, level dibulatkan ke kelipatan dB ini sehingga
 *                  peta tampil bertingkat dan garis −6 / −12 dB bisa dibaca
 *                  langsung sebagai batas coverage.
 */
export function renderHeatmapToImageData(
  data: HeatmapResult,
  ctx: CanvasRenderingContext2D,
  topSpl: number,
  dynamicRange: number,
  bandStep = 0
): ImageData {
  const { cols, rows, heatmap } = data;
  const image = ctx.createImageData(cols, rows);
  const px = image.data;

  for (let i = 0; i < cols * rows; i++) {
    let level = heatmap[i];
    if (bandStep > 0) level = Math.floor((level - topSpl) / bandStep) * bandStep + topSpl;

    const t = 1 + (level - topSpl) / dynamicRange;
    const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
    const [r, g, b] = splRampColor(clamped);
    const o = i * 4;
    px[o] = r;
    px[o + 1] = g;
    px[o + 2] = b;
    px[o + 3] = 255;
  }

  return image;
}

/* ==========================================================================
   ANALISIS CAKUPAN
   Tiga alat bantu bergaya EASE Focus, semuanya memanggil splAtPoint() yang
   sama dengan heatmap sehingga angkanya dijamin konsisten dengan peta.
   ========================================================================== */

export interface ResponsePoint {
  freq: number;
  /** Level relatif (dB) terhadap satu box pada jarak 1 m. */
  spl: number;
}

/**
 * Respons frekuensi di SATU titik — menjawab pertanyaan yang tidak bisa
 * dijawab peta satu-frekuensi: "pola saya rapi di 63 Hz, tapi bagaimana di
 * 45 Hz atau 90 Hz?". Interferensi antar box sangat bergantung frekuensi,
 * jadi satu titik bisa saja +6 dB di satu frekuensi dan −15 dB di frekuensi
 * lain hanya beberapa Hz jauhnya.
 *
 * Koordinat memakai sumbu ARRAY (audiens di −Y), sama seperti splAtPoint.
 */
export function calculateFrequencyResponse(
  settings: SubwooferSettings,
  groups: BoxGroup[],
  x: number,
  y: number,
  opts: { fMin?: number; fMax?: number; points?: number } = {}
): ResponsePoint[] {
  const { fMin = 20, fMax = 200, points = 96 } = opts;
  const field = buildSourceField(settings, groups);
  if (field.count === 0) return [];

  const z = num(settings.earHeight, 1.6);
  const out: ResponsePoint[] = [];
  // Spread logaritmik: telinga (dan masalah akustik) bekerja per oktaf,
  // bukan per Hz — 20→40 Hz sama pentingnya dengan 100→200 Hz.
  const ratio = Math.log(fMax / fMin) / (points - 1);
  for (let i = 0; i < points; i++) {
    const freq = fMin * Math.exp(ratio * i);
    // Tiap titik dihitung sebagai nada tunggal supaya lekukan interferensi
    // terlihat apa adanya, tidak tersamarkan rata-rata pita.
    out.push({ freq, spl: splAtPoint(field, waveNumbers([freq], field.speedOfSound), x, y, z) });
  }
  return out;
}

/** Uji apakah titik (dalam koordinat AREA, +Y = arah audiens) ada di dalam area. */
export function pointInArea(area: VenueArea, px: number, py: number): boolean {
  const ax = Number(area.x) || 0;
  const ay = Number(area.y) || 0;
  const rot = ((Number(area.rotation) || 0) * Math.PI) / 180;

  // Ubah ke koordinat lokal kanvas area (sumbu Y ke BAWAH, sama seperti
  // cara traceArea menggambarnya), lalu batalkan rotasinya.
  const dx = px - ax;
  const dy = -(py - ay);
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;

  const w = Number(area.width) || 0;
  const h = Number(area.height) || 0;
  const r = Number(area.radius) || 0;

  switch (area.shape) {
    case 'Rectangle':
      return Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2;
    case 'Circle':
      return lx * lx + ly * ly <= r * r;
    case 'Semicircle':
      // Digambar sebagai arc(0,0,r,PI,0): setengah lingkaran sisi ATAS kanvas.
      return ly <= 0 && lx * lx + ly * ly <= r * r;
    case 'Triangle':
      return pointInPolygon(lx, ly, [[0, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]);
    case 'Trapezoid': {
      const tw = Number(area.topWidth) || w;
      const bw = Number(area.bottomWidth) || w;
      return pointInPolygon(lx, ly, [[-tw / 2, -h / 2], [tw / 2, -h / 2], [bw / 2, h / 2], [-bw / 2, h / 2]]);
    }
    default:
      return false;
  }
}

function pointInPolygon(px: number, py: number, poly: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Titik lebih dekat dari ini ke sumber mana pun dibuang dari statistik.
 * Dua alasan: (1) model sumber titik 1/r tidak berlaku di medan dekat, dan
 * (2) area panggung biasanya MENUMPUK dengan posisi array (sub memang ditaruh
 * di bibir panggung) — tanpa pengecualian ini, beberapa titik tepat di atas
 * box akan menenggelamkan rata-rata dan membuat angka rejection depan-belakang
 * tampak nyaris nol padahal cardioid-nya bekerja baik.
 */
export const MIN_SAMPLE_DISTANCE_M = 2;

export interface AreaStatistics {
  areaId: string;
  areaName: string;
  /** Jumlah titik sampel yang benar-benar jatuh di dalam area. */
  samples: number;
  /** Titik yang dibuang karena terlalu dekat ke sumber (medan dekat). */
  excluded: number;
  min: number;
  max: number;
  avg: number;
  /** Deviation baku — makin kecil makin rata. */
  stdDev: number;
  /** Selisih maks−min, ukuran kerataan yang paling langsung dipahami. */
  spread: number;
}

/**
 * Statistik kerataan SPL di dalam satu area venue — mengubah penilaian
 * "kelihatannya rata" menjadi angka yang bisa dibandingkan antar konfigurasi.
 *
 * PENTING: area memakai konvensi +Y = arah audiens, sedangkan mesin akustik
 * memakai −Y = arah audiens. Konversi tandanya dilakukan di sini; salah tanda
 * akan membuat statistik diambil dari sisi panggung, bukan sisi penonton.
 */
export function calculateAreaStatistics(
  settings: SubwooferSettings,
  groups: BoxGroup[],
  area: VenueArea,
  opts: { maxSamples?: number; minSourceDistance?: number } = {}
): AreaStatistics | null {
  const { maxSamples = 900, minSourceDistance = MIN_SAMPLE_DISTANCE_M } = opts;
  const field = buildSourceField(settings, groups);
  if (field.count === 0) return null;

  const frequencies = getFrequenciesForBandwidth(num(settings.frequency, 63) || 63, settings.bandwidth);
  const ks = waveNumbers(frequencies, field.speedOfSound);
  const z = num(settings.earHeight, 1.6);

  // Kotak pembatas area (koordinat area), diperluas sedikit agar bentuk
  // yang diputar tetap tercakup penuh.
  const halfW =
    (area.shape === 'Circle' || area.shape === 'Semicircle'
      ? Number(area.radius) || 0
      : Math.max(Number(area.width) || 0, Number(area.topWidth) || 0, Number(area.bottomWidth) || 0) / 2) || 0;
  const halfH =
    (area.shape === 'Circle' || area.shape === 'Semicircle' ? Number(area.radius) || 0 : (Number(area.height) || 0) / 2) || 0;
  const reach = Math.hypot(halfW, halfH); // aman untuk rotasi berapa pun
  if (reach <= 0) return null;

  const ax = Number(area.x) || 0;
  const ay = Number(area.y) || 0;
  const side = Math.max(4, Math.floor(Math.sqrt(maxSamples)));
  const step = (reach * 2) / (side - 1);

  const minDistSq = minSourceDistance * minSourceDistance;
  const values: number[] = [];
  let excluded = 0;

  for (let i = 0; i < side; i++) {
    const py = ay - reach + i * step;
    for (let j = 0; j < side; j++) {
      const px = ax - reach + j * step;
      if (!pointInArea(area, px, py)) continue;

      // Konversi koordinat area (+Y ke audiens) → koordinat akustik (−Y ke audiens).
      const my = -py;
      let tooClose = false;
      for (let b = 0; b < field.count; b++) {
        const dx = px - field.x[b];
        const dy = my - field.y[b];
        const dz = z - field.z[b];
        if (dx * dx + dy * dy + dz * dz < minDistSq) { tooClose = true; break; }
      }
      if (tooClose) { excluded++; continue; }

      values.push(splAtPoint(field, ks, px, my, z));
    }
  }

  if (values.length === 0) return null;

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  const avg = sum / values.length;
  let variance = 0;
  for (const v of values) variance += (v - avg) ** 2;

  return {
    areaId: area.id,
    areaName: area.name,
    samples: values.length,
    excluded,
    min, max, avg,
    stdDev: Math.sqrt(variance / values.length),
    spread: max - min,
  };
}

export interface CoverageAnalysis {
  areas: AreaStatistics[];
  /** Rata-rata area audiens − rata-rata area panggung (dB). Makin besar makin baik. */
  frontToBack: number | null;
  audienceName?: string;
  stageName?: string;
}

/**
 * Analisis lengkap semua area + rasio rejection depan-belakang.
 * Area audiens/panggung dikenali dari namanya, pola yang sama dengan
 * Asisten Konfigurasi supaya perilakunya konsisten di seluruh aplikasi.
 */
export function calculateCoverageAnalysis(
  settings: SubwooferSettings,
  groups: BoxGroup[],
  areas: VenueArea[]
): CoverageAnalysis {
  const stats = areas
    .map((a) => calculateAreaStatistics(settings, groups, a))
    .filter((s): s is AreaStatistics => s !== null);

  const audience = areas.filter((a) => /audience|penonton/i.test(a.name));
  const stage = areas.filter((a) => /stage|panggung/i.test(a.name));

  let frontToBack: number | null = null;
  if (audience.length && stage.length) {
    const avgOf = (list: VenueArea[]) => {
      const picked = stats.filter((s) => list.some((a) => a.id === s.areaId));
      if (!picked.length) return null;
      // Rata-rata berbobot jumlah sampel agar area besar tidak kalah oleh area kecil.
      const totalSamples = picked.reduce((n, s) => n + s.samples, 0);
      return picked.reduce((acc, s) => acc + s.avg * s.samples, 0) / totalSamples;
    };
    const a = avgOf(audience);
    const s = avgOf(stage);
    if (a !== null && s !== null) frontToBack = a - s;
  }

  return {
    areas: stats,
    frontToBack,
    audienceName: audience[0]?.name,
    stageName: stage[0]?.name,
  };
}
