import { useEffect, useState } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'subforge-theme';

function readStoredMode(): ThemeMode {
  if (typeof localStorage === 'undefined') return 'system';
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * Tema efektif selalu distempel ke <html data-theme="light|dark">, termasuk
 * ketika pengguna memilih "ikuti sistem". Dengan begitu CSS hanya perlu
 * membaca satu atribut, dan kanvas (yang warnanya digambar manual) bisa
 * memakai nilai yang sama persis dengan komponen HTML.
 */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(readStoredMode);
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    readStoredMode() === 'system' ? systemTheme() : (readStoredMode() as ResolvedTheme)
  );

  useEffect(() => {
    const apply = () => {
      const next: ResolvedTheme = mode === 'system' ? systemTheme() : mode;
      setResolved(next);
      document.documentElement.dataset.theme = next;
      // Selaraskan warna bilah browser di iOS/Android dengan tema aktif.
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', next === 'light' ? '#f6f7f9' : '#0e0f11');
    };

    apply();

    if (mode !== 'system' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [mode]);

  const changeMode = (next: ThemeMode) => {
    setMode(next);
    if (next === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  };

  return { mode, resolved, setMode: changeMode };
}

/** Warna yang dipakai untuk menggambar kanvas peta, mengikuti tema aktif. */
export interface CanvasColors {
  grid: string;
  gridOverMap: string;
  axis: string;
  axisOverMap: string;
  rulerText: string;
  rulerTextOverMap: string;
  rulerShadow: string;
  boxFill: string;
  boxFillMuted: string;
  boxFillHover: string;
  boxFillReversed: string;
  boxStroke: string;
  boxStrokeHover: string;
  arcLine: string;
  areaLabel: string;
  polarityInverted: string;
  baffle: string;
  baffleReversed: string;
  muteCross: string;
}

export function canvasColors(theme: ResolvedTheme): CanvasColors {
  const dark = theme === 'dark';
  return {
    grid: dark ? 'rgba(255,255,255,0.07)' : 'rgba(20,23,28,0.10)',
    gridOverMap: 'rgba(0,0,0,0.22)',
    axis: dark ? 'rgba(255,255,255,0.24)' : 'rgba(20,23,28,0.35)',
    axisOverMap: 'rgba(0,0,0,0.55)',
    rulerText: dark ? 'rgba(231,234,238,0.6)' : 'rgba(20,23,28,0.65)',
    rulerTextOverMap: '#ffffff',
    rulerShadow: dark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)',
    boxFill: dark ? '#272c33' : '#3c434e',
    boxFillMuted: dark ? '#1a1d22' : '#9aa2ad',
    boxFillHover: dark ? '#2f4a69' : '#2a78d6',
    // Box yang dibalik fisik (reversed) — coklat/amber gelap, senada dengan
    // baffleReversed, supaya beda terlihat dari kejauhan tanpa perlu
    // membaca strip tipis atau simbol kecil di dalamnya.
    boxFillReversed: dark ? '#3d2f14' : '#4a3a1c',
    boxStroke: dark ? '#4a515c' : '#1b1f26',
    boxStrokeHover: dark ? '#5598e7' : '#123a6b',
    arcLine: dark ? 'rgba(85,152,231,0.55)' : 'rgba(28,92,171,0.6)',
    areaLabel: dark ? 'rgba(231,234,238,0.92)' : 'rgba(20,23,28,0.92)',
    polarityInverted: dark ? '#c98500' : '#9a6800',
    baffle: dark ? '#5598e7' : '#7db4f0',
    baffleReversed: dark ? '#c98500' : '#e0a53a',
    muteCross: dark ? '#e66767' : '#c93b3b',
  };
}
