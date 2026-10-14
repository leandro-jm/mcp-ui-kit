import { resolvePath, resolveRows, type CardView, type Column, type TableView } from '@mcp-ui-kit/view-spec';
import { useUi } from './context';
import { formatValue, isNumericFormat } from './format';
import { ActionBar, Block, Empty } from './primitives';

export function useFormat() {
  const { formatLocale, t } = useUi();
  return (v: unknown, f?: Column['format']) => formatValue(v, f, formatLocale, [t('yes'), t('no')]);
}

export function DataTable({ columns, rows, rowActions }: { columns: Column[]; rows: Record<string, unknown>[]; rowActions?: TableView['rowActions'] }) {
  const fmt = useFormat();
  if (!rows.length) return <Empty />;
  return (
    <div className="mui-table-wrap">
      <table className="mui-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.field} className={c.align === 'end' || isNumericFormat(c.format) ? 'num' : undefined}>
                {c.title ?? c.field}
              </th>
            ))}
            {rowActions?.length ? <th aria-hidden /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.field} className={c.align === 'end' || isNumericFormat(c.format) ? 'num' : c.format === 'code' ? 'mono' : undefined}>
                  {fmt(resolvePath(r, c.field), c.format)}
                </td>
              ))}
              {rowActions?.length ? (
                <td className="mui-row-actions">
                  <ActionBar actions={rowActions} scope={r} />
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TableResult({ view, data }: { view: TableView; data: unknown }) {
  const { t } = useUi();
  const rows = resolveRows(data, view.data);
  return (
    <Block title={view.title} subtitle={view.subtitle ?? (rows.length ? t('rows', { n: rows.length }) : undefined)}>
      <DataTable columns={view.columns} rows={rows} rowActions={view.rowActions} />
      <ActionBar actions={view.actions} scope={data} />
    </Block>
  );
}

export function CardResult({ view, data }: { view: CardView; data: unknown }) {
  const fmt = useFormat();
  const obj = resolvePath(data, view.data);
  if (!obj || typeof obj !== 'object') {
    return (
      <Block title={view.title}>
        <Empty />
      </Block>
    );
  }
  return (
    <Block title={view.title} subtitle={view.subtitle}>
      {view.stats?.length ? (
        <div className="mui-stats">
          {view.stats.map((s) => (
            <div key={s.field} className="mui-stat">
              <span className="mui-stat-value">{fmt(resolvePath(obj, s.field), s.format)}</span>
              <span className="mui-stat-label">{s.title ?? s.field}</span>
            </div>
          ))}
        </div>
      ) : null}
      <dl className="mui-kv">
        {view.fields.map((f) => (
          <div key={f.field} className="mui-kv-row">
            <dt>{f.title ?? f.field}</dt>
            <dd className={f.format === 'code' ? 'mono' : undefined}>{fmt(resolvePath(obj, f.field), f.format)}</dd>
          </div>
        ))}
      </dl>
      <ActionBar actions={view.actions} scope={obj} />
    </Block>
  );
}
