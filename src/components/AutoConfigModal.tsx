import { useEffect, useMemo, useState } from 'react';
import type { SubwooferSettings, SetupType, VenueArea, SubwooferPreset } from '../types';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { DEFAULT_SPEED_OF_SOUND } from '../utils';

interface AutoConfigModalProps {
  onClose: () => void;
  onApply: (updates: Partial<SubwooferSettings>) => void;
  currentSettings: SubwooferSettings;
  areas: VenueArea[];
}

type Priority = 'Balanced' | 'Coverage' | 'Throw' | 'Rejection' | 'Gradient' | 'Cardioid';

const PRIORITIES: { id: Priority; label: string; hint: string }[] = [
  { id: 'Balanced', label: 'Seimbang', hint: 'Even spread + stage rejection' },
  { id: 'Coverage', label: 'Even spread', hint: 'Prioritas kerataan sisi ke sisi' },
  { id: 'Throw', label: 'Lempar jauh', hint: 'Energi maksimum lurus ke depan' },
  { id: 'Rejection', label: 'End-Fire', hint: 'Stage rejection, butuh ruang ke depan' },
  { id: 'Gradient', label: 'Gradient', hint: 'Stage rejection, hemat ruang' },
  { id: 'Cardioid', label: 'Cardioid tumpuk', hint: 'Stage rejection tanpa tambah baris' },
];

const areaWidthOf = (a: VenueArea) =>
  a.shape === 'Circle' || a.shape === 'Semicircle'
    ? (Number(a.radius) || 0) * 2
    : Math.max(Number(a.width) || 0, Number(a.topWidth) || 0, Number(a.bottomWidth) || 0);

const areaDepthOf = (a: VenueArea) =>
  a.shape === 'Circle' || a.shape === 'Semicircle' ? (Number(a.radius) || 0) * 2 : Number(a.height) || 0;

export function AutoConfigModal({ onClose, onApply, currentSettings, areas }: AutoConfigModalProps) {
  const [boxCount, setBoxCount] = useState(Math.max(2, Number(currentSettings.count) || 8));
  const [priority, setPriority] = useState<Priority>('Balanced');
  const [alignment, setAlignment] = useState<'Monarchy' | 'Democracy'>('Democracy');
  const [areaWidth, setAreaWidth] = useState(20);
  const [areaDepth, setAreaDepth] = useState(30);
  const [targetFreq, setTargetFreq] = useState(Number(currentSettings.targetFrequency) || 63);
  const [isLR, setIsLR] = useState(currentSettings.setupType.includes('L/R'));
  const [audienceAreaIds, setAudienceAreaIds] = useState<string[]>([]);
  const [stageAreaId, setStageAreaId] = useState('');
  const [savedPresets, setSavedPresets] = useState<SubwooferPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState(currentSettings.preset);
  const [result, setResult] = useState<{ updates: Partial<SubwooferSettings>; notes: string[] } | null>(null);
  // Hasil hitung yang tampil bisa jadi BASI: dihitung dari kombinasi target
  // sebelumnya, sementara pengguna sudah mengubah pilihan tanpa menekan ulang
  // "Hitung rekomendasi". Tanpa penanda ini, tombol "Terapkan ke project" bisa
  // menerapkan angka yang tidak lagi cocok dengan target yang terlihat di layar.
  const [resultStale, setResultStale] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'presets'),
      (snap) => setSavedPresets(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SubwooferPreset)),
      (err) => console.error(err)
    );
    return () => unsubscribe();
  }, []);

  // Deteksi otomatis: SEMUA area bernama audience/penonton dijadikan target,
  // area bernama stage/panggung dijadikan sumber.
  useEffect(() => {
    const audience = areas.filter((a) => /audience|penonton/i.test(a.name));
    if (audience.length) setAudienceAreaIds(audience.map((a) => a.id));
    const stage = areas.find((a) => /stage|panggung/i.test(a.name));
    if (stage) setStageAreaId(stage.id);
  }, [areas]);

  /**
   * Beberapa area target digabung menjadi satu kotak pembatas: array harus
   * menutupi seluruhnya, jadi yang menentukan adalah rentang terluar — bukan
   * ukuran satu area saja.
   */
  const targetBounds = useMemo(() => {
    const picked = areas.filter((a) => audienceAreaIds.includes(a.id));
    if (picked.length === 0) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const a of picked) {
      const halfW = areaWidthOf(a) / 2;
      const halfD = areaDepthOf(a) / 2;
      minX = Math.min(minX, (Number(a.x) || 0) - halfW);
      maxX = Math.max(maxX, (Number(a.x) || 0) + halfW);
      minY = Math.min(minY, (Number(a.y) || 0) - halfD);
      maxY = Math.max(maxY, (Number(a.y) || 0) + halfD);
    }
    return { width: maxX - minX, depth: maxY - minY, nearest: minY, farthest: maxY, count: picked.length };
  }, [areas, audienceAreaIds]);

  // Ukuran manual mengikuti area terpilih. areaDepth BUKAN ukuran fisik area
  // (itu targetBounds.depth) — ia adalah jarak array→audiens yang dipakai
  // untuk menghitung sudut coverage, jadi diisi dari TITIK TENGAH audiens
  // (rata-rata tepi terdekat & terjauh), bukan tepi terjauh saja. Memakai
  // tepi terjauh akan membuat sudut yang dihitung terlalu sempit untuk
  // penonton di baris depan.
  useEffect(() => {
    if (!targetBounds) return;
    if (targetBounds.width > 0) setAreaWidth(Number(targetBounds.width.toFixed(1)));
    const midDistance = (targetBounds.nearest + targetBounds.farthest) / 2;
    if (midDistance > 0) setAreaDepth(Number(midDistance.toFixed(1)));
  }, [targetBounds]);

  // Tandai hasil sebagai basi begitu SATU SAJA parameter target berubah —
  // mencegah tombol "Terapkan" mengirim angka yang dihitung dari kombinasi
  // target yang lama.
  useEffect(() => {
    setResultStale(true);
  }, [
    boxCount, priority, alignment, areaWidth, areaDepth, targetFreq, isLR,
    audienceAreaIds, stageAreaId, selectedPresetId,
  ]);

  const c = Number(currentSettings.speedOfSound) || DEFAULT_SPEED_OF_SOUND;
  const preset = savedPresets.find((p) => p.id === selectedPresetId);

  // Rotasi Landscape↔Portrait menukar Width dan Height box (berputar pada
  // sumbu depth-nya) — BUKAN Width dan Depth. Depth (jarak box ke audiens)
  // tidak pernah berubah oleh rotasi ini. Mengikuti persis kalkulator arc
  // delay resmi (lihat utils.ts calculateArcDelay untuk penjelasan lengkap).
  const boxWidth = useMemo(() => {
    const w = preset ? preset.width : Number(currentSettings.width) || 0;
    const h = preset ? preset.height : Number(currentSettings.height) || 0;
    const dim = currentSettings.orientation === 'Landscape' ? w : h;
    return dim > 0 ? dim : 1.1;
  }, [preset, currentSettings]);

  const boxDepth = useMemo(() => {
    const d = preset ? preset.depth : Number(currentSettings.depth) || 0;
    return d > 0 ? d : 0.6;
  }, [preset, currentSettings]);

  /** Lebar & kedalaman ruang pasang yang benar-benar tersedia. */
  const geometry = useMemo(() => {
    const stage = areas.find((a) => a.id === stageAreaId);

    let installWidth = areaWidth;
    let freeDepth = Infinity;

    if (stage) {
      const sw = areaWidthOf(stage);
      if (sw > 0) installWidth = sw;
      if (targetBounds) {
        // Ruang kosong antara bibir panggung dan baris penonton terdepan.
        const stageFront = (Number(stage.y) || 0) + areaDepthOf(stage) / 2;
        freeDepth = Math.max(0, targetBounds.nearest - stageFront);
      }
    }
    return { installWidth, freeDepth };
  }, [areas, targetBounds, stageAreaId, areaWidth]);

  const compute = () => {
    const lambda = c / Math.max(targetFreq, 1);
    const quarter = lambda / 4;
    const half = lambda / 2;
    const notes: string[] = [];

    // --- Jarak antar kolom -------------------------------------------------
    // λ/4 menjaga koherensi sampai 2× frekuensi target; λ/2 sampai target itu
    // sendiri. Pilih yang lebih rapat selama box masih muat.
    let spacing = Math.max(quarter, boxWidth);
    let spacingLabel = '¼ λ';
    if (spacing > quarter + 1e-6) {
      spacing = Math.max(half, boxWidth);
      spacingLabel = spacing > half + 1e-6 ? 'rapat maksimum (box bersentuhan)' : '½ λ';
      notes.push(
        `Box selebar ${boxWidth.toFixed(2)} m tidak muat pada jarak ¼ λ (${quarter.toFixed(2)} m); dipakai ${spacingLabel}.`
      );
    }
    const aliasing = c / (2 * spacing);

    // --- Baris & tumpukan per prioritas ------------------------------------
    let setup: SetupType;
    let rows = 1;
    let rowSpacing = 0;
    let cardioid = false;
    let invertRear = false;
    let reversed: boolean[] | undefined;
    let reason: string;

    switch (priority) {
      case 'Rejection':
        rows = 4;
        rowSpacing = quarter;
        setup = isLR ? 'End-Fire L/R' : 'End-Fire';
        reason = `End-Fire ${rows} elemen dengan jarak ¼ λ. Tiap elemen di-delay ${((quarter / c) * 1000).toFixed(2)} ms agar muka gelombang menumpuk ke depan.`;
        if (geometry.freeDepth < rows * quarter) {
          rows = Math.max(2, Math.floor(geometry.freeDepth / quarter));
          if (geometry.freeDepth < 2 * quarter) {
            setup = isLR ? 'Cardioid L/R' : 'Gradient In-Line';
            rows = 2;
            cardioid = true;
            invertRear = true;
            reason = `Ruang depan panggung hanya ${geometry.freeDepth.toFixed(1)} m — tidak cukup untuk End-Fire. Dialihkan ke ${setup} yang hanya butuh ${quarter.toFixed(2)} m.`;
          } else {
            reason = `End-Fire dipangkas jadi ${rows} elemen agar muat di ruang ${geometry.freeDepth.toFixed(1)} m.`;
          }
        }
        break;

      case 'Gradient':
        setup = isLR ? 'Cardioid L/R' : 'Gradient In-Line';
        rows = 2;
        rowSpacing = quarter;
        cardioid = true;
        invertRear = true;
        reason = `Gradient 2 baris: baris belakang dibalik polaritas dan di-delay ${((quarter / c) * 1000).toFixed(2)} ms sehingga energi ke arah panggung saling meniadakan.`;
        break;

      case 'Cardioid':
        // Straight, bukan Curved: susunan cardioid tumpuk tetap lurus di
        // depan panggung — rejection datang dari pembalikan polaritas antar
        // tumpukan, bukan dari melengkungkan barisnya.
        setup = isLR ? 'Cardioid L/R' : 'Straight Delayed Array';
        rows = 1;
        cardioid = true;
        invertRear = true;
        reversed = [true, false, false];
        reason = `Cardioid tumpuk: box paling bawah diputar menghadap belakang, dibalik polaritas, dan di-delay ${((boxDepth / c) * 1000).toFixed(2)} ms. Tidak menambah kedalaman panggung.`;
        break;

      case 'Throw':
        setup = isLR ? 'L/R' : 'Straight Delayed Array';
        reason = 'Array lurus tanpa busur — seluruh energi terfokus lurus ke depan, jangkauan maksimum di sumbu tengah.';
        break;

      case 'Coverage':
        // Box tetap lurus di depan panggung (praktik standar); busur coverage
        // dibentuk lewat delay per box, bukan menggeser posisi fisiknya.
        setup = isLR ? 'L/R' : 'Straight Delayed Array';
        reason = 'Box tetap lurus di depan panggung — busur coverage dibentuk lewat delay (Arc Delay), bukan dengan membengkokkan posisi fisik.';
        break;

      default: // Balanced
        setup = isLR ? 'Cardioid L/R' : 'Straight Delayed Array';
        rows = 2;
        rowSpacing = quarter;
        cardioid = true;
        invertRear = true;
        reason = `Kombinasi: busur ditiru lewat delay (array tetap lurus, mudah dipasang) plus baris kedua sebagai gradient untuk membersihkan panggung.`;
    }

    // --- Sudut busur -------------------------------------------------------
    // Asisten tidak pernah merekomendasikan 'Curved Array' (bengkok fisik) —
    // hanya 'Straight Delayed Array', sesuai praktik lapangan.
    const audienceAngle = Math.round(2 * Math.atan(areaWidth / 2 / Math.max(areaDepth, 1)) * (180 / Math.PI));
    const supportsArc = setup === 'Straight Delayed Array';
    let theta = 0;
    if (supportsArc) {
      if (alignment === 'Democracy') {
        theta = audienceAngle;
        notes.push(
          `Democracy: busur dibuka ${theta}° mengikuti sudut penonton, error fase dibagi rata ke seluruh area.`
        );
      } else {
        theta = 0;
        notes.push('Monarchy: busur ditutup (0°) agar seluruh box sefase sempurna di sumbu tengah — pinggiran dikorbankan.');
      }
    }

    // --- Bagi jumlah box ---------------------------------------------------
    // N kolom berjarak `spacing` (pusat-ke-pusat) butuh lebar fisik
    // (N-1)*spacing + lebar box (box terluar menonjol separuh lebarnya di
    // tiap ujung) — lebar box HARUS dikurangi dulu sebelum dibagi, kalau
    // tidak jumlah kolom yang direkomendasikan bisa kelebihan dan tidak
    // muat di lebar panggung yang sebenarnya.
    const maxColumnsByWidth = Math.max(1, Math.floor((geometry.installWidth - boxWidth) / spacing) + 1);
    let columns = Math.max(1, Math.floor(boxCount / rows));
    if (columns > maxColumnsByWidth) {
      columns = maxColumnsByWidth;
      notes.push(`Lebar pasang ${geometry.installWidth.toFixed(1)} m hanya memuat ${columns} kolom.`);
    }
    if (isLR) columns = Math.max(2, Math.floor(columns / 2) * 2);

    let stack = Math.max(1, Math.floor(boxCount / (columns * rows)));
    if (priority === 'Cardioid' && stack < 3) {
      stack = 3;
      columns = Math.max(1, Math.floor(boxCount / (stack * rows)));
      if (isLR) columns = Math.max(2, Math.floor(columns / 2) * 2);
      notes.push('Cardioid tumpuk butuh minimal 3 box per kolom (1 menghadap belakang, 2 ke depan).');
    }

    const used = columns * rows * stack;
    if (used < boxCount) notes.push(`${boxCount - used} box tersisa tidak terpakai pada susunan ini.`);
    if (aliasing < 100) notes.push(`Spatial aliasing mulai di ${aliasing.toFixed(0)} Hz.`);

    const cardioidDelay =
      priority === 'Cardioid'
        ? (boxDepth / c) * 1000
        : rows > 1
          ? (rowSpacing / c) * 1000
          : Number(currentSettings.cardioidDelay) || 0;

    const updates: Partial<SubwooferSettings> = {
      setupType: setup,
      count: columns,
      rows,
      stack,
      theta,
      // gap = celah tepi-ke-tepi; centralGap = jarak pusat-ke-pusat (celah +
      // lebar box) — disamakan sebagai array seragam secara default.
      gap: Number(Math.max(0, spacing - boxWidth).toFixed(3)),
      centralGap: Number(spacing.toFixed(3)),
      rowSpacing: Number(rowSpacing.toFixed(3)),
      targetFrequency: targetFreq,
      cardioid,
      invertRearPolarity: invertRear,
      cardioidDelay: Number(cardioidDelay.toFixed(2)),
    };
    if (reversed) updates.cardioidReversedBoxes = reversed;
    if (isLR && !Number(currentSettings.stageWidth)) {
      updates.stageWidth = Number(geometry.installWidth.toFixed(1)) || 12;
    }
    if (preset) {
      updates.preset = preset.id;
      updates.width = preset.width;
      updates.height = preset.height;
      updates.depth = preset.depth;
      if (preset.defaultCardioidDelay !== undefined && priority === 'Cardioid') {
        updates.cardioidDelay = preset.defaultCardioidDelay;
      }
    }

    setResult({ updates, notes: [reason, ...notes] });
    setResultStale(false);
  };

  const apply = () => {
    if (!result || resultStale) return;
    onApply(result.updates);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm">
      <div className="panel w-full max-w-lg max-h-[88dvh] flex flex-col shadow-2xl">
        <header className="flex-none flex items-center justify-between px-4 py-3 border-b border-line">
          <div>
            <h2 className="text-sm font-semibold">Asisten konfigurasi</h2>
            <p className="text-[11px] text-ink-3">Usulan susunan dari geometri venue dan jumlah box</p>
          </div>
          <button className="btn btn-ghost px-2" onClick={onClose} aria-label="Tutup">
            ✕
          </button>
        </header>

        <div className="flex-1 scroll-y px-4 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="acCount" className="field-label">
                Total box tersedia
              </label>
              <input
                id="acCount"
                type="number"
                inputMode="numeric"
                className="input"
                min={2}
                value={boxCount}
                onChange={(e) => setBoxCount(Math.max(1, Number(e.target.value) || 0))}
              />
            </div>
            <div>
              <label htmlFor="acFreq" className="field-label">
                Frekuensi target (Hz)
              </label>
              <input
                id="acFreq"
                type="number"
                inputMode="decimal"
                className="input"
                value={targetFreq}
                onChange={(e) => setTargetFreq(Math.max(1, Number(e.target.value) || 0))}
              />
            </div>
          </div>

          <div>
            <label htmlFor="acPreset" className="field-label">
              Preset box
            </label>
            <select id="acPreset" className="select" value={selectedPresetId} onChange={(e) => setSelectedPresetId(e.target.value)}>
              <option value="Custom">Pakai dimensi saat ini</option>
              {savedPresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="field-label mb-0">Area target penyebaran</span>
              {areas.length > 1 && (
                <button
                  className="btn min-h-0 py-0.5 px-2 text-[10px]"
                  onClick={() =>
                    setAudienceAreaIds((prev) => (prev.length === areas.length ? [] : areas.map((a) => a.id)))
                  }
                >
                  {audienceAreaIds.length === areas.length ? 'Kosongkan' : 'Pilih semua'}
                </button>
              )}
            </div>
            {areas.length === 0 ? (
              <p className="section-note">Belum ada area — isi ukuran manual di bawah.</p>
            ) : (
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {areas.map((area) => {
                  const checked = audienceAreaIds.includes(area.id);
                  return (
                    <li key={area.id}>
                      <label
                        className={`flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer text-[11px] ${
                          checked ? 'border-accent bg-accent/12 text-ink' : 'border-line bg-raised text-ink-2'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setAudienceAreaIds((prev) =>
                              e.target.checked ? [...prev, area.id] : prev.filter((id) => id !== area.id)
                            )
                          }
                        />
                        <span className="w-2.5 h-2.5 rounded-sm flex-none" style={{ backgroundColor: area.color }} />
                        <span className="truncate flex-1">{area.name}</span>
                        <span className="text-ink-3 tnum flex-none">
                          {areaWidthOf(area).toFixed(0)}×{areaDepthOf(area).toFixed(0)} m
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {targetBounds && (
              <p className="section-note mt-1">
                {targetBounds.count} area digabung → rentang {targetBounds.width.toFixed(1)} m ×{' '}
                {targetBounds.depth.toFixed(1)} m, terjauh {targetBounds.farthest.toFixed(1)} m.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="acStage" className="field-label">
              Area panggung (sumber rejection)
            </label>
            <select id="acStage" className="select" value={stageAreaId} onChange={(e) => setStageAreaId(e.target.value)}>
              <option value="">Abaikan</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="acW" className="field-label">
                Lebar area target (m)
              </label>
              <input
                id="acW"
                type="number"
                inputMode="decimal"
                className="input"
                value={areaWidth}
                onChange={(e) => setAreaWidth(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div>
              <label
                htmlFor="acD"
                className="field-label"
                title="Jarak dari array ke titik tengah audiens — dipakai untuk menghitung sudut coverage, BUKAN ukuran fisik area"
              >
                Jarak array → tengah audiens (m)
              </label>
              <input
                id="acD"
                type="number"
                inputMode="decimal"
                className="input"
                value={areaDepth}
                onChange={(e) => setAreaDepth(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
          </div>

          {areas.length === 0 && (
            <p className="section-note">
              Buat area di panel Area Venue — beri nama "Audience" dan "Stage" agar langsung terpilih otomatis.
            </p>
          )}

          <div>
            <span className="field-label">Strategi penyelarasan spasial</span>
            <div className="flex gap-1 p-1 bg-raised border border-line rounded">
              {(['Democracy', 'Monarchy'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setAlignment(mode)}
                  className={`flex-1 py-1.5 rounded text-[11px] font-semibold transition-colors ${
                    alignment === mode ? 'bg-accent-dim text-white' : 'text-ink-2 hover:text-ink'
                  }`}
                >
                  {mode === 'Democracy' ? 'Democracy — merata' : 'Monarchy — fokus tengah'}
                </button>
              ))}
            </div>
            <p className="section-note mt-1">
              {alignment === 'Democracy'
                ? 'Error fase dibagi rata ke seluruh penonton; busur dibuka mengikuti sudut area.'
                : 'Seluruh box sefase sempurna di satu titik (FOH); busur ditutup, pinggiran menerima lebih sedikit.'}
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer bg-raised border border-line rounded px-3 py-2">
            <input type="checkbox" className="checkbox" checked={isLR} onChange={(e) => setIsLR(e.target.checked)} />
            <span className="text-xs font-semibold">Wajib dipisah kiri &amp; kanan panggung</span>
          </label>
          {isLR && (
            <p className="text-[11px] text-warn leading-snug">
              Susunan L/R selalu menghasilkan power alley di tengah penonton. Bila memungkinkan, susunan terpusat
              memberi kerataan yang jauh lebih baik.
            </p>
          )}

          <div>
            <span className="field-label">Prioritas</span>
            <div className="grid grid-cols-2 gap-1.5">
              {PRIORITIES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPriority(p.id)}
                  className={`text-left px-2.5 py-2 rounded border text-[11px] transition-colors ${
                    priority === p.id ? 'border-accent bg-accent/12 text-ink' : 'border-line bg-raised text-ink-2 hover:border-line-strong'
                  }`}
                >
                  <span className="block font-semibold">{p.label}</span>
                  <span className="block text-ink-3 text-[10px]">{p.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <button className="btn btn-primary w-full" onClick={compute}>
            {resultStale && result ? 'Hitung ulang rekomendasi' : 'Hitung rekomendasi'}
          </button>

          {result && (
            <div className={`panel p-3 space-y-3 ${resultStale ? 'bg-raised opacity-50' : 'bg-raised'}`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold">Usulan susunan</h3>
                {resultStale && (
                  <span className="chip chip-warn" title="Target sudah berubah — tekan Hitung ulang sebelum menerapkan">
                    Target berubah
                  </span>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {[
                  ['Tipe setup', String(result.updates.setupType)],
                  ['Kolom × baris × stack', `${result.updates.count} × ${result.updates.rows} × ${result.updates.stack}`],
                  ['Jarak pusat kolom', `${result.updates.centralGap} m`],
                  ...(Number(result.updates.rowSpacing) > 0 ? [['Jarak antar baris', `${result.updates.rowSpacing} m`]] : []),
                  ...(Number(result.updates.theta) > 0 ? [['Sudut busur', `${result.updates.theta}°`]] : []),
                  ...(result.updates.cardioid ? [['Delay rear', `${result.updates.cardioidDelay} ms`]] : []),
                ].map(([label, value]) => (
                  <div key={label} className="stat-row">
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <ul className="space-y-1.5">
                {result.notes.map((note, i) => (
                  <li key={i} className="section-note leading-relaxed">
                    • {note}
                  </li>
                ))}
              </ul>
              <button className="btn btn-primary w-full" onClick={apply} disabled={resultStale}>
                {resultStale ? 'Hitung ulang dulu sebelum menerapkan' : 'Terapkan ke project'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
