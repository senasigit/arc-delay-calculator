import { useMemo } from 'react';
import type { ResponsePoint } from '../utils';

interface ResponseChartProps {
  data: ResponsePoint[];
  /** Level absolut = relatif + sensitivitas box; 0 = tampilkan relatif saja. */
  sensitivity?: number;
  width?: number;
  height?: number;
}

const OCTAVE_TICKS = [20, 31.5, 40, 63, 80, 125, 160, 200];

/**
 * Grafik respons frekuensi di satu titik. Digambar sebagai SVG (bukan canvas)
 * supaya tetap tajam di layar retina, ikut tema terang/gelap lewat
 * currentColor, dan bisa ikut tercetak saat Export PDF.
 */
export function ResponseChart({ data, sensitivity = 0, width = 260, height = 130 }: ResponseChartProps) {
  const geom = useMemo(() => {
    if (data.length < 2) return null;

    const padL = 30;
    const padR = 6;
    const padT = 8;
    const padB = 18;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const fMin = data[0].freq;
    const fMax = data[data.length - 1].freq;
    const logMin = Math.log10(fMin);
    const logSpan = Math.log10(fMax) - logMin;

    const levels = data.map((d) => d.spl + sensitivity);
    const rawMax = Math.max(...levels);
    const rawMin = Math.min(...levels);
    // Kunci ke kelipatan 6 dB dan beri rentang minimum 24 dB supaya riak
    // kecil tidak tampak dramatis hanya karena skala ikut menyempit.
    const top = Math.ceil(rawMax / 6) * 6;
    const bottom = Math.min(Math.floor(rawMin / 6) * 6, top - 24);
    const span = top - bottom;

    const xOf = (f: number) => padL + ((Math.log10(f) - logMin) / logSpan) * plotW;
    const yOf = (v: number) => padT + ((top - v) / span) * plotH;

    const path = data
      .map((d, i) => `${i === 0 ? 'M' : 'L'}${xOf(d.freq).toFixed(2)} ${yOf(d.spl + sensitivity).toFixed(2)}`)
      .join(' ');

    const dbTicks: number[] = [];
    for (let v = top; v >= bottom; v -= 6) dbTicks.push(v);

    return { padL, padR, padT, padB, plotW, plotH, xOf, yOf, path, dbTicks, top, bottom, fMin, fMax };
  }, [data, sensitivity, width, height]);

  if (!geom) {
    return <p className="section-note">Belum ada data — pastikan array sudah terisi.</p>;
  }

  return (
    <svg width={width} height={height} className="block" role="img" aria-label="Grafik respons frekuensi">
      {/* Garis bantu dB */}
      {geom.dbTicks.map((v) => (
        <g key={v}>
          <line
            x1={geom.padL}
            x2={width - geom.padR}
            y1={geom.yOf(v)}
            y2={geom.yOf(v)}
            stroke="currentColor"
            strokeWidth={1}
            className="text-line"
          />
          <text
            x={geom.padL - 4}
            y={geom.yOf(v) + 3}
            textAnchor="end"
            className="fill-current text-ink-3"
            style={{ fontSize: 8 }}
          >
            {v}
          </text>
        </g>
      ))}

      {/* Garis bantu frekuensi */}
      {OCTAVE_TICKS.filter((f) => f >= geom.fMin && f <= geom.fMax).map((f) => (
        <g key={f}>
          <line
            x1={geom.xOf(f)}
            x2={geom.xOf(f)}
            y1={geom.padT}
            y2={height - geom.padB}
            stroke="currentColor"
            strokeWidth={1}
            className="text-line"
          />
          <text
            x={geom.xOf(f)}
            y={height - geom.padB + 10}
            textAnchor="middle"
            className="fill-current text-ink-3"
            style={{ fontSize: 8 }}
          >
            {f}
          </text>
        </g>
      ))}

      <path d={geom.path} fill="none" stroke="currentColor" strokeWidth={1.75} className="text-accent-hi" />
    </svg>
  );
}
