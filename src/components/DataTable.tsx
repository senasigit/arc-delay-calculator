import { useMemo, useState } from 'react';
import type { BoxGroup, SubwooferSettings } from '../types';
import { formatMeters, boxKey } from '../utils';

interface DataTableProps {
  groups: BoxGroup[];
  settings: SubwooferSettings;
  onToggleMute: (positionId: number) => void;
  onToggleCardioid: (positionId: number) => void;
  onToggleGlobalMute?: (type: 'front' | 'rear', mute: boolean) => void;
  /** Override manual per box (kunci "positionId:stackIndex"), independen dari toggle per posisi di atas. */
  invertedBoxes?: Set<string>;
  onToggleBoxInvert?: (key: string) => void;
  disabledCardioidBoxes?: Set<string>;
  onToggleBoxCardioid?: (key: string) => void;
  mutedBoxes?: Set<string>;
  onToggleBoxMute?: (key: string) => void;
}

export function DataTable({
  groups,
  settings,
  onToggleMute,
  onToggleCardioid,
  onToggleGlobalMute,
  invertedBoxes,
  onToggleBoxInvert,
  disabledCardioidBoxes,
  onToggleBoxCardioid,
  mutedBoxes,
  onToggleBoxMute,
}: DataTableProps) {
  const [copied, setCopied] = useState(false);

  const totals = useMemo(() => {
    let total = 0;
    let front = 0;
    let rear = 0;
    let inverted = 0;
    let maxDelay = 0;
    for (const g of groups) {
      for (const b of g.boxes) {
        total++;
        if (b.isRear) rear++;
        else front++;
        if (b.polarity === -1) inverted++;
        if (b.delayMs > maxDelay) maxDelay = b.delayMs;
      }
    }
    return { total, front, rear, inverted, maxDelay };
  }, [groups]);

  const cardioidEnabled = settings.cardioid || settings.setupType.includes('Gradient') || settings.setupType === 'Cardioid L/R';

  /** Salin sebagai TSV agar bisa langsung ditempel ke spreadsheet atau catatan tuning. */
  const handleCopy = async () => {
    const rows = [['Posisi', 'X (m)', 'Y (m)', 'Baris', 'Stack', 'Peran', 'Delay (ms)', 'Polaritas', 'Status']];
    for (const g of groups) {
      for (const b of g.boxes) {
        rows.push([
          g.label,
          b.x.toFixed(3),
          b.y.toFixed(3),
          String(b.rowIndex + 1),
          String(b.stackLevel + 1),
          b.positionLabel,
          b.delayMs.toFixed(2),
          b.polarity === -1 ? 'INV' : 'NORM',
          g.muted || b.muted ? 'MUTE' : 'ON',
        ]);
      }
    }
    try {
      await navigator.clipboard.writeText(rows.map((r) => r.join('\t')).join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      alert('Browser menolak akses clipboard.');
    }
  };

  return (
    <div className="w-full h-full flex flex-col min-h-0 bg-panel print:bg-white">
      <div className="flex-none p-3 border-b border-line bg-panel print:border-gray-300">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div>
            <h2 className="text-sm font-semibold">Tabel DSP</h2>
            <p className="text-[11px] text-ink-3">Delay, polaritas, dan posisi fisik tiap box</p>
          </div>
          {groups.length > 0 && (
            <button className="btn print-hide" onClick={handleCopy}>
              {copied ? 'Tersalin' : 'Salin'}
            </button>
          )}
        </div>

        {groups.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            <div className="panel bg-raised px-2 py-1.5">
              <div className="text-[10px] uppercase tracking-wide text-ink-3">Total box</div>
              <div className="text-lg font-semibold tnum leading-tight">{totals.total}</div>
            </div>

            <div className="panel bg-raised px-2 py-1.5 relative">
              <div className="text-[10px] uppercase tracking-wide text-ink-3">Front</div>
              <div className="text-lg font-semibold tnum leading-tight">{totals.front}</div>
              {onToggleGlobalMute && totals.front > 0 && (
                <button
                  className={`absolute top-1 right-1 chip print-hide ${settings.muteFront ? 'chip-danger' : ''}`}
                  onClick={() => onToggleGlobalMute('front', !settings.muteFront)}
                >
                  {settings.muteFront ? 'Muted' : 'Mute'}
                </button>
              )}
            </div>

            <div className="panel bg-raised px-2 py-1.5 relative">
              <div className="text-[10px] uppercase tracking-wide text-ink-3">Rear</div>
              <div className="text-lg font-semibold tnum leading-tight text-warn">{totals.rear}</div>
              {onToggleGlobalMute && totals.rear > 0 && (
                <button
                  className={`absolute top-1 right-1 chip print-hide ${settings.muteRear ? 'chip-danger' : ''}`}
                  onClick={() => onToggleGlobalMute('rear', !settings.muteRear)}
                >
                  {settings.muteRear ? 'Muted' : 'Mute'}
                </button>
              )}
            </div>
          </div>
        )}

        {groups.length > 0 && (
          <div className="flex gap-3 mt-2 text-[11px] text-ink-2 tnum">
            <span>
              Delay maks <strong className="text-ink">{totals.maxDelay.toFixed(2)} ms</strong>
            </span>
            <span>
              Polaritas terbalik <strong className="text-ink">{totals.inverted}</strong>
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 scroll-y p-3 space-y-2 print:overflow-visible">
        {groups.length === 0 && (
          <p className="section-note">Belum ada box. Isi jumlah titik dan dimensi di panel setup.</p>
        )}

        {groups.map((group) => (
          <article
            key={group.positionId}
            className={`panel px-2.5 py-2 ${group.muted ? 'opacity-55 border-danger/40' : ''}`}
          >
            <header className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-xs font-semibold">{group.label}</span>
              <div className="flex items-center gap-1 print-hide">
                {cardioidEnabled && (
                  <button
                    className={`chip ${group.cardioidDisabled ? '' : 'chip-accent'}`}
                    onClick={() => onToggleCardioid(group.positionId)}
                    title="Nonaktifkan pola cardioid hanya untuk posisi ini"
                  >
                    {group.cardioidDisabled ? 'C-off' : 'C-on'}
                  </button>
                )}
                <button
                  className={`chip ${group.muted ? 'chip-danger' : ''}`}
                  onClick={() => onToggleMute(group.positionId)}
                >
                  {group.muted ? 'Muted' : 'Mute'}
                </button>
              </div>
              {group.muted && <span className="chip chip-danger hidden print:inline-flex">Muted</span>}
            </header>

            <div className="flex justify-between text-[11px] text-ink-2 tnum pb-1.5 mb-1.5 border-b border-line">
              <span>
                X {group.x >= 0 ? '+' : ''}
                {formatMeters(group.x, 3)}
              </span>
              {group.arcOffset > 0.0005 && <span>mundur {formatMeters(group.arcOffset, 3)}</span>}
            </div>

            <table className="w-full text-[11px] tnum">
              <tbody>
                {[...group.boxes].reverse().map((box) => {
                  const key = boxKey(group.positionId, box.stackIndex);
                  const manualInvert = invertedBoxes?.has(key) ?? false;
                  const cardioidOffForBox = disabledCardioidBoxes?.has(key) ?? false;
                  const manualMute = mutedBoxes?.has(key) ?? false;
                  return (
                    <tr
                      key={box.stackIndex}
                      className={`border-b border-line/60 last:border-0 ${box.muted ? 'opacity-50' : ''}`}
                    >
                      <td className="py-1 text-ink-3 whitespace-nowrap w-[22%]">
                        B{box.rowIndex + 1}·S{box.stackLevel + 1}
                      </td>
                      <td className={`py-1 font-medium ${box.isRear ? 'text-warn' : 'text-ink-2'}`}>
                        {box.positionLabel}
                        {box.reversed && <span className="text-ink-3"> · dibalik</span>}
                      </td>
                      <td className="py-1 text-right font-semibold w-[18%] whitespace-nowrap">
                        {box.delayMs.toFixed(2)} ms
                      </td>
                      <td className="py-1 pl-1.5 print-hide">
                        <div className="flex flex-wrap justify-end gap-1">
                          {onToggleBoxMute && (
                            <button
                              className={`chip px-1.5 min-h-0 py-0.5 text-[10px] ${manualMute ? 'chip-danger' : ''}`}
                              onClick={() => onToggleBoxMute(key)}
                              title="Bisukan box ini saja (tidak ikut dihitung ke SPL)"
                            >
                              {manualMute ? 'Muted' : 'Mute'}
                            </button>
                          )}
                          {onToggleBoxCardioid && cardioidEnabled && box.cardioidCandidate && (
                            <button
                              className={`chip px-1.5 min-h-0 py-0.5 text-[10px] ${cardioidOffForBox ? '' : 'chip-accent'}`}
                              onClick={() => onToggleBoxCardioid(key)}
                              title="Nyalakan/matikan efek cardioid untuk box ini saja"
                            >
                              {cardioidOffForBox ? 'C-off' : 'C-on'}
                            </button>
                          )}
                          {onToggleBoxInvert && (
                            <button
                              className={`chip px-1.5 min-h-0 py-0.5 text-[10px] ${box.polarity === -1 ? 'chip-danger' : ''} ${manualInvert ? 'ring-1 ring-accent' : ''}`}
                              onClick={() => onToggleBoxInvert(key)}
                              title="Balik polaritas box ini secara manual"
                            >
                              {box.polarity === -1 ? 'INV' : '+'}
                            </button>
                          )}
                        </div>
                      </td>
                      {/* Kolom polaritas versi cetak — tombol di atas disembunyikan saat print. */}
                      <td className="py-1 text-right hidden print:table-cell w-[14%]">
                        {box.muted ? 'MUTE' : box.polarity === -1 ? <span className="font-semibold">INV</span> : <span>+</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </article>
        ))}
      </div>
    </div>
  );
}
