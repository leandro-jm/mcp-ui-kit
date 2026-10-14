import type { Issue } from './parse';

export type ThemeMode = 'light' | 'dark';
export interface ModePair {
  light: string;
  dark: string;
}

/**
 * Branding a server (e.g. a gateway tenant) may apply to its views. Only tokens: no CSS, no
 * scripts, no URLs. Fonts must already be available to the page (host fonts or CSP-allowed).
 */
export interface ThemeTokens {
  accent?: ModePair;
  /** Categorical palette, in fixed slot order (1..8). */
  chartPalette?: { light: string[]; dark: string[] };
  semantic?: Partial<Record<'ok' | 'warn' | 'danger' | 'info', ModePair>>;
  fonts?: { sans?: string; mono?: string };
  /** Base corner radius in px (0–24). */
  radius?: number;
  density?: 'compact' | 'comfortable';
}

interface BaseMode {
  bg: string;
  surface: string;
  surface2: string;
  text: string;
  text2: string;
  text3: string;
  border: string;
  border2: string;
  accent: string;
  ok: string;
  warn: string;
  danger: string;
  info: string;
  palette: string[];
}

/**
 * Default look. The chart palette is the validated reference categorical palette (fixed order,
 * CVD-checked on these surfaces); in light mode three slots sit under 3:1, so charts always
 * offer the table view and direct labels.
 */
export const DEFAULT_THEME: Record<ThemeMode, BaseMode> = {
  light: {
    bg: '#f3f5f4',
    surface: '#ffffff',
    surface2: '#ecefed',
    text: '#15201b',
    text2: '#46544d',
    text3: '#6b7871',
    border: '#d6ddd9',
    border2: '#c3ccc7',
    accent: '#0b7a64',
    ok: '#1b7a3a',
    warn: '#9a6212',
    danger: '#b42318',
    info: '#2a5db0',
    palette: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  },
  dark: {
    bg: '#0e1412',
    surface: '#151d1a',
    surface2: '#1b2522',
    text: '#e4ebe7',
    text2: '#a7b4ad',
    text3: '#8a978f',
    border: '#29342f',
    border2: '#36433d',
    accent: '#3bc09f',
    ok: '#4cc775',
    warn: '#e0a94a',
    danger: '#f07166',
    info: '#78a2ec',
    palette: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  },
};

// ---------------------------------------------------------------------------------------------
// Color math (sRGB → linear → OKLab), enough for contrast and perceptual distance checks.

const HEX = /^#[0-9a-f]{6}$/i;

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
function linear(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex);
  return [lin(r), lin(g), lin(b)];
}

/** WCAG 2 contrast ratio between two colors. */
export function contrast(a: string, b: string): number {
  const L = (h: string) => {
    const [r, g, bl] = linear(h);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [L(a), L(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

function oklab([r, g, b]: [number, number, number]): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Machado et al. (2009) full-severity simulation matrices, applied in linear RGB. */
const CVD: Record<'protan' | 'deutan', number[][]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.107216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
};

function simulate(c: [number, number, number], m: number[][]): [number, number, number] {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [0, 1, 2].map((i) => clamp(m[i]![0]! * c[0] + m[i]![1]! * c[1] + m[i]![2]! * c[2])) as [number, number, number];
}

/** Perceptual distance (OKLab ΔE ×100) under normal vision, or the worst of protan/deutan. */
export function deltaE(a: string, b: string, vision: 'normal' | 'cvd' = 'normal'): number {
  const d = (x: [number, number, number], y: [number, number, number]) => {
    const [p, q] = [oklab(x), oklab(y)];
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * 100;
  };
  const [la, lb] = [linear(a), linear(b)];
  if (vision === 'normal') return d(la, lb);
  return Math.min(...Object.values(CVD).map((m) => d(simulate(la, m), simulate(lb, m))));
}

// ---------------------------------------------------------------------------------------------

const FONT = /^[\p{L}\p{N} _-]{1,64}$/u;
/** Thresholds of the palette gate: normal-vision floor 15, CVD floor 6 (target 8), marks 3:1 for accent. */
const NORMAL_FLOOR = 15;
const CVD_FLOOR = 6;

export interface ThemeReport {
  errors: Issue[];
  /** Legal but needs relief (direct labels / table view); shown to the person editing the theme. */
  warnings: Issue[];
}

/** Gate for tenant themes: rejects invalid tokens and unreadable or indistinguishable colors. */
export function validateTheme(tokens: ThemeTokens): ThemeReport {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const hexOk = (v: unknown, path: string): v is string => {
    if (typeof v === 'string' && HEX.test(v)) return true;
    errors.push({ code: 'invalid_color', path });
    return false;
  };
  for (const mode of ['light', 'dark'] as const) {
    const surface = DEFAULT_THEME[mode].surface;
    if (tokens.accent && hexOk(tokens.accent[mode], `$.accent.${mode}`) && contrast(tokens.accent[mode], surface) < 3) {
      errors.push({ code: 'low_contrast', path: `$.accent.${mode}` });
    }
    for (const [k, pair] of Object.entries(tokens.semantic ?? {})) {
      if (pair && hexOk(pair[mode], `$.semantic.${k}.${mode}`) && contrast(pair[mode], surface) < 4.5) {
        errors.push({ code: 'low_contrast', path: `$.semantic.${k}.${mode}` });
      }
    }
    const palette = tokens.chartPalette?.[mode];
    if (tokens.chartPalette) {
      if (!Array.isArray(palette) || palette.length < 1 || palette.length > 8) {
        errors.push({ code: 'invalid_list', path: `$.chartPalette.${mode}` });
        continue;
      }
      if (!palette.every((c, i) => hexOk(c, `$.chartPalette.${mode}[${i}]`))) continue;
      palette.forEach((c, i) => {
        if (contrast(c, surface) < 3) warnings.push({ code: 'low_contrast', path: `$.chartPalette.${mode}[${i}]` });
        if (i === 0) return;
        const prev = palette[i - 1]!;
        const at = `$.chartPalette.${mode}[${i}]`;
        if (deltaE(prev, c) < NORMAL_FLOOR) errors.push({ code: 'indistinct_colors', path: at });
        const cvd = deltaE(prev, c, 'cvd');
        if (cvd < CVD_FLOOR) errors.push({ code: 'cvd_indistinct_colors', path: at });
        else if (cvd < 8) warnings.push({ code: 'cvd_close_colors', path: at });
      });
    }
  }
  if (tokens.chartPalette && tokens.chartPalette.light?.length !== tokens.chartPalette.dark?.length) {
    errors.push({ code: 'palette_mode_mismatch', path: '$.chartPalette' });
  }
  for (const k of ['sans', 'mono'] as const) {
    const f = tokens.fonts?.[k];
    if (f !== undefined && (typeof f !== 'string' || !FONT.test(f))) errors.push({ code: 'invalid_font', path: `$.fonts.${k}` });
  }
  if (tokens.radius !== undefined && !(Number.isInteger(tokens.radius) && tokens.radius >= 0 && tokens.radius <= 24)) {
    errors.push({ code: 'invalid_value', path: '$.radius' });
  }
  if (tokens.density !== undefined && tokens.density !== 'compact' && tokens.density !== 'comfortable') {
    errors.push({ code: 'invalid_value', path: '$.density' });
  }
  return { errors, warnings };
}

/** Readable text color on top of a fill (for buttons and selected chips). */
export function onColor(fill: string): string {
  return contrast(fill, '#ffffff') >= contrast(fill, '#111111') ? '#ffffff' : '#111111';
}

/**
 * CSS variables of a theme. Surface, text, border, font and radius use the MCP Apps standard
 * host variable names, so a host's `styles.variables` overrides them naturally; accent, chart
 * palette and density are kit extensions (`--mcp-ui-*`).
 */
export function themeVariables(mode: ThemeMode, tokens: ThemeTokens = {}): Record<string, string> {
  const b = DEFAULT_THEME[mode];
  const accent = tokens.accent?.[mode] ?? b.accent;
  const sem = (k: 'ok' | 'warn' | 'danger' | 'info') => tokens.semantic?.[k]?.[mode] ?? b[k];
  const palette = tokens.chartPalette?.[mode] ?? b.palette;
  const radius = tokens.radius ?? 8;
  const vars: Record<string, string> = {
    '--color-background-primary': b.surface,
    '--color-background-secondary': b.bg,
    '--color-background-tertiary': b.surface2,
    '--color-background-success': `color-mix(in srgb, ${sem('ok')} 14%, ${b.surface})`,
    '--color-background-warning': `color-mix(in srgb, ${sem('warn')} 14%, ${b.surface})`,
    '--color-background-danger': `color-mix(in srgb, ${sem('danger')} 14%, ${b.surface})`,
    '--color-background-info': `color-mix(in srgb, ${sem('info')} 14%, ${b.surface})`,
    '--color-text-primary': b.text,
    '--color-text-secondary': b.text2,
    '--color-text-tertiary': b.text3,
    '--color-text-success': sem('ok'),
    '--color-text-warning': sem('warn'),
    '--color-text-danger': sem('danger'),
    '--color-text-info': sem('info'),
    '--color-border-primary': b.border2,
    '--color-border-secondary': b.border,
    '--color-ring-primary': accent,
    '--border-radius-sm': `${Math.max(0, radius - 4)}px`,
    '--border-radius-md': `${radius}px`,
    '--border-radius-lg': `${radius + 4}px`,
    '--font-sans': `${tokens.fonts?.sans ? `"${tokens.fonts.sans}", ` : ''}ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
    '--font-mono': `${tokens.fonts?.mono ? `"${tokens.fonts.mono}", ` : ''}ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`,
    '--mcp-ui-accent': accent,
    '--mcp-ui-accent-contrast': onColor(accent),
    '--mcp-ui-density': tokens.density === 'compact' ? '0.8' : '1',
  };
  palette.forEach((c, i) => (vars[`--mcp-ui-chart-${i + 1}`] = c));
  for (let i = palette.length; i < 8; i++) vars[`--mcp-ui-chart-${i + 1}`] = b.palette[i]!;
  return vars;
}

/**
 * Final variables of a view: kit defaults, then the server's tokens (tenant branding), then the
 * host's `styles.variables` (the host has the last word on what it defines, ADR-022).
 */
export function resolveTheme(mode: ThemeMode, server?: ThemeTokens, hostVariables?: Record<string, string | undefined>): Record<string, string> {
  const vars = themeVariables(mode, server);
  for (const [k, v] of Object.entries(hostVariables ?? {})) if (typeof v === 'string' && v) vars[k] = v;
  return vars;
}
