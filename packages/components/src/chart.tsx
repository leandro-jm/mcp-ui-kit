import { resolvePath, resolveRows, type ChartView, type Column, type TokenColor } from '@mcp-ui-kit/view-spec';
import { useId, useMemo, useState } from 'react';
import { useUi } from './context';
import { niceMax } from './format';
import { ActionBar, Block, Empty, Segmented } from './primitives';
import { DataTable, useFormat } from './result-views';

const W = 640;
const H = 260;
const M = { top: 22, right: 12, bottom: 30, left: 52 };
const MAX_CATEGORIES = 60;
const MAX_SERIES = 8;

const STATUS_VAR: Record<string, string> = { ok: 'success', warn: 'warning', danger: 'danger', info: 'info' };

/** CSS value of a theme color token. */
function tokenVar(c: TokenColor): string {
  if (c === 'muted') return 'var(--color-text-tertiary)';
  if (c === 'accent') return 'var(--mcp-ui-accent)';
  if (c.startsWith('chart-')) return `var(--mcp-ui-${c})`;
  return `var(--color-text-${STATUS_VAR[c]})`;
}

interface Model {
  categories: string[];
  series: string[];
  /** values[series][category] */
  values: Map<string, Map<string, number>>;
  max: number;
}

function buildModel(view: ChartView, rows: Record<string, unknown>[]): Model {
  const { x, y, color } = view.encoding;
  const categories: string[] = [];
  const series: string[] = [];
  const values = new Map<string, Map<string, number>>();
  let max = 0;
  for (const r of rows) {
    const cat = String(resolvePath(r, x.field) ?? '');
    const s = color ? String(resolvePath(r, color.field) ?? '') : '*';
    const v = Number(resolvePath(r, y.field));
    if (!Number.isFinite(v)) continue;
    if (!categories.includes(cat)) {
      if (categories.length >= MAX_CATEGORIES) continue;
      categories.push(cat);
    }
    // series keep first-seen order: color follows the entity, never its rank
    if (!series.includes(s)) {
      if (series.length >= MAX_SERIES) continue;
      series.push(s);
    }
    const m = values.get(s) ?? new Map<string, number>();
    m.set(cat, (m.get(cat) ?? 0) + v);
    values.set(s, m);
    max = Math.max(max, m.get(cat)!);
  }
  return { categories, series, values, max };
}

function highlightIndex(view: ChartView, model: Model): number {
  const h = view.highlight;
  if (h === undefined || model.series.length !== 1) return -1;
  const vals = model.categories.map((c) => model.values.get(model.series[0]!)?.get(c) ?? 0);
  if (typeof h === 'object') return h.index < vals.length ? h.index : -1;
  if (h === 'last') return vals.length - 1;
  const target = h === 'max' ? Math.max(...vals) : Math.min(...vals);
  return vals.indexOf(target);
}

/** Bars rounded only at the data end (4px), anchored square on the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function ChartResult({ view, data }: { view: ChartView; data: unknown }) {
  const { t } = useUi();
  const fmt = useFormat();
  const [mode, setMode] = useState<'chart' | 'table'>('chart');
  const [hover, setHover] = useState<number | null>(null);
  const id = useId().replace(/:/g, '');
  const rows = useMemo(() => resolveRows(data, view.data), [data, view.data]);
  const model = useMemo(() => buildModel(view, rows), [view, rows]);
  const columns: Column[] = [
    { field: view.encoding.x.field, title: view.encoding.x.title ?? view.encoding.x.field, ...(view.encoding.x.format ? { format: view.encoding.x.format } : {}) },
    ...(view.encoding.color ? [{ field: view.encoding.color.field, title: view.encoding.color.title ?? view.encoding.color.field }] : []),
    { field: view.encoding.y.field, title: view.encoding.y.title ?? view.encoding.y.field, format: view.encoding.y.format ?? 'number', align: 'end' as const },
  ];
  const title = view.title ?? view.encoding.y.title ?? view.encoding.y.field;
  const toggle = (
    <Segmented
      label={title}
      value={mode}
      onChange={setMode}
      options={[
        ['chart', t('showChart')],
        ['table', t('showTable')],
      ]}
    />
  );

  if (!model.categories.length) {
    return (
      <Block title={title} subtitle={view.subtitle}>
        <Empty />
      </Block>
    );
  }

  const top = niceMax(model.max);
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const step = iw / model.categories.length;
  const yOf = (v: number) => M.top + ih - (v / top) * ih;
  const xOf = (i: number) => M.left + step * i + step / 2;
  const colorOf = (s: string, i: number) => tokenVar(view.colors?.[s] ?? view.colors?.['*'] ?? (`chart-${(i % 8) + 1}` as TokenColor));
  const hi = highlightIndex(view, model);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const labelEvery = Math.ceil(model.categories.length / 12);
  const yFmt = (v: number) => fmt(v, view.encoding.y.format ?? 'number');
  const multi = model.series.length > 1;
  const groupW = step * 0.64;
  const barW = Math.max(2, groupW / model.series.length - (multi ? 2 : 0));

  return (
    <Block title={title} subtitle={view.subtitle} right={toggle}>
      {mode === 'table' ? (
        <DataTable columns={columns} rows={rows} />
      ) : (
        <figure className="mui-chart" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t`}>
            <title id={`${id}-t`}>{title}</title>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={M.left} x2={W - M.right} y1={yOf(v)} y2={yOf(v)} className="mui-grid" />
                <text x={M.left - 8} y={yOf(v) + 4} textAnchor="end" className="mui-axis">
                  {yFmt(v)}
                </text>
              </g>
            ))}
            {model.categories.map((c, i) =>
              i % labelEvery === 0 ? (
                <text key={c} x={xOf(i)} y={H - 10} textAnchor="middle" className="mui-axis">
                  {c.length > 12 ? `${c.slice(0, 11)}…` : c}
                </text>
              ) : null,
            )}
            {model.series.map((s, si) => {
              const vals = model.categories.map((c) => model.values.get(s)?.get(c));
              if (view.mark === 'bar') {
                return vals.map((v, i) => {
                  if (v === undefined || v <= 0) return null;
                  const x = xOf(i) - groupW / 2 + si * (barW + (multi ? 2 : 0));
                  const y = yOf(v);
                  return <path key={`${s}-${i}`} d={barPath(x, y, barW, M.top + ih - y)} fill={colorOf(s, si)} opacity={hi >= 0 && hi !== i ? 0.82 : 1} />;
                });
              }
              const pts = vals.map((v, i) => (v === undefined ? null : ([xOf(i), yOf(v)] as const))).filter((p): p is readonly [number, number] => p !== null);
              const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join('');
              return (
                <g key={s}>
                  {view.mark === 'area' && pts.length > 1 && (
                    <path d={`${d}L${pts[pts.length - 1]![0]},${M.top + ih}L${pts[0]![0]},${M.top + ih}Z`} fill={colorOf(s, si)} opacity={0.18} />
                  )}
                  {view.mark !== 'point' && <path d={d} fill="none" stroke={colorOf(s, si)} strokeWidth={2} strokeLinejoin="round" />}
                  {pts.map(([x, y], i) =>
                    view.mark === 'point' || i === hi || i === hover ? <circle key={i} cx={x} cy={y} r={4} fill={colorOf(s, si)} stroke="var(--color-background-primary)" strokeWidth={2} /> : null,
                  )}
                </g>
              );
            })}
            {hi >= 0 && (
              <text x={xOf(hi)} y={yOf(model.values.get(model.series[0]!)!.get(model.categories[hi]!)!) - 6} textAnchor="middle" className="mui-direct-label">
                {yFmt(model.values.get(model.series[0]!)!.get(model.categories[hi]!)!)}
              </text>
            )}
            {hover !== null && <line x1={xOf(hover)} x2={xOf(hover)} y1={M.top} y2={M.top + ih} className="mui-crosshair" />}
            {model.categories.map((c, i) => (
              <rect key={c} x={M.left + step * i} y={M.top} width={step} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
            ))}
          </svg>
          {hover !== null && (
            <div className="mui-tooltip" style={{ left: `${(xOf(hover) / W) * 100}%` }} role="status">
              <strong>{model.categories[hover]}</strong>
              {model.series.map((s, si) => {
                const v = model.values.get(s)?.get(model.categories[hover]!);
                return v === undefined ? null : (
                  <span key={s} className="mui-tooltip-row">
                    {multi && <i style={{ background: colorOf(s, si) }} />}
                    {multi ? `${s}: ` : ''}
                    {yFmt(v)}
                  </span>
                );
              })}
            </div>
          )}
          {multi && (
            <figcaption className="mui-legend">
              {model.series.map((s, si) => (
                <span key={s}>
                  <i style={{ background: colorOf(s, si) }} />
                  {s}
                </span>
              ))}
            </figcaption>
          )}
        </figure>
      )}
      <ActionBar actions={view.actions} scope={data} />
    </Block>
  );
}
