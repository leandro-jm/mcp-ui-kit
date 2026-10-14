import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME,
  infer,
  parseToolViews,
  parseViewSpec,
  parseViewPayload,
  resolveArgs,
  resolvePath,
  resolveRows,
  resolveTheme,
  validateSpec,
  validateTheme,
  VIEW_SPEC_VERSION,
  type ToolViews,
} from '../src';
import { cancelarPedido, clientesCreate, clientesSearch, faturamentoMensal, lojas } from './fixtures';

describe('infer', () => {
  it('a monthly series becomes a bar chart highlighting the max', () => {
    const v = infer(faturamentoMensal)!;
    expect(v.input).toBeUndefined();
    expect(v.result).toEqual({
      kind: 'chart',
      data: 'items',
      mark: 'bar',
      encoding: {
        x: { field: 'mes', type: 'ordinal', title: 'Mes' },
        y: { field: 'valor', type: 'quantitative', title: 'R$ mil', format: 'number' },
      },
      highlight: 'max',
    });
  });

  it('a list of records becomes a table with at most 6 typed columns', () => {
    const v = infer(clientesSearch)!.result!;
    expect(v.kind).toBe('table');
    if (v.kind !== 'table') return;
    expect(v.data).toBe('items');
    expect(v.columns).toHaveLength(6);
    expect(v.columns[0]!.field).toBe('nome');
    expect(v.columns.find((c) => c.field === 'email')).toMatchObject({ format: 'email' });
    expect(v.columns.find((c) => c.field === 'limite_credito')).toMatchObject({ format: 'number', align: 'end' });
  });

  it('a write tool gets a form (required first, short enum as radio, long text as textarea) and a result card', () => {
    const v = infer(clientesCreate)!;
    expect(v.input).toMatchObject({ kind: 'form', tool: 'clientes_create', title: 'Cadastrar cliente' });
    if (v.input?.kind !== 'form') throw new Error('expected form');
    expect(v.input.uiSchema!['ui:order']).toEqual(['nome', 'email', 'segmento', 'telefone', 'observacao']);
    expect(v.input.uiSchema!.segmento).toEqual({ 'ui:widget': 'radio' });
    expect(v.input.uiSchema!.observacao).toEqual({ 'ui:widget': 'textarea', 'ui:full': true });
    expect(v.result).toMatchObject({ kind: 'card' });
  });

  it('a destructive tool gets a confirmation plan', () => {
    const v = infer(cancelarPedido)!;
    expect(v.input).toMatchObject({ kind: 'plan', tool: 'wf_cancelar_pedido', danger: true, steps: [{ effect: 'external' }] });
    expect(v.result).toBeUndefined();
  });

  it('rows with coordinates become a map', () => {
    expect(infer(lojas)!.result).toEqual({ kind: 'map', data: '', lat: 'latitude', lng: 'longitude', label: 'nome' });
  });

  it('a read-only tool without output schema gets no view', () => {
    expect(infer({ name: 'ping', annotations: { readOnlyHint: true } })).toBeUndefined();
  });

  it('every inferred view parses and validates against its tool', () => {
    for (const tool of [faturamentoMensal, clientesSearch, clientesCreate, cancelarPedido, lojas]) {
      const v = infer(tool)!;
      const parsed = parseToolViews(v);
      expect(parsed.ok, `${tool.name}: ${JSON.stringify(!parsed.ok && parsed.issues)}`).toBe(true);
      expect(validateSpec(v, tool)).toEqual([]);
    }
  });
});

describe('parseToolViews', () => {
  const table: ToolViews = { version: VIEW_SPEC_VERSION, result: { kind: 'table', data: 'items', columns: [{ field: 'nome' }] } };

  it('accepts a valid spec', () => {
    expect(parseToolViews(table)).toEqual({ ok: true, value: table });
  });

  it('rejects unknown versions, kinds and empty views', () => {
    expect(parseToolViews({ ...table, version: 2 })).toMatchObject({ ok: false, issues: [{ code: 'unsupported_version' }] });
    expect(parseToolViews({ version: 1, result: { kind: 'iframe' } })).toMatchObject({ ok: false, issues: [{ code: 'unknown_kind' }] });
    expect(parseToolViews({ version: 1 })).toMatchObject({ ok: false, issues: [{ code: 'empty_views' }] });
  });

  it('rejects field paths that could smuggle markup', () => {
    const r = parseViewSpec({ kind: 'table', data: 'items', columns: [{ field: '<img src=x onerror=alert(1)>' }] });
    expect(r).toMatchObject({ ok: false, issues: [{ code: 'invalid_path', path: '$.columns[0].field' }] });
  });

  it('rejects raw colors and out-of-subset chart options', () => {
    const r = parseViewSpec({
      kind: 'chart',
      data: 'items',
      mark: 'arc',
      encoding: { x: { field: 'mes', type: 'ordinal' }, y: { field: 'valor', type: 'quantitative' } },
      colors: { '*': '#ff0000' },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.map((i) => i.code).sort()).toEqual(['invalid_color', 'invalid_value']);
  });

  it('an action is either a tool call or a message, never both', () => {
    const r = parseViewSpec({ kind: 'card', fields: [{ field: 'id' }], actions: [{ label: 'x', tool: 't', message: 'm' }] });
    expect(r).toMatchObject({ ok: false, issues: [{ code: 'action_tool_or_message' }] });
  });

  it('rejects non-object values', () => {
    expect(parseToolViews('table')).toMatchObject({ ok: false });
    expect(parseViewSpec(null)).toMatchObject({ ok: false });
  });
});

describe('validateSpec', () => {
  it('flags fields that the output schema does not have', () => {
    const v: ToolViews = {
      version: 1,
      result: { kind: 'table', data: 'items', columns: [{ field: 'nome' }, { field: 'salario' }] },
    };
    expect(validateSpec(v, clientesSearch)).toEqual([{ code: 'unknown_field', path: '$.result.columns[1].field' }]);
  });

  it('flags a chart measure that is not numeric and a data path that is not an array', () => {
    const v: ToolViews = {
      version: 1,
      result: {
        kind: 'chart',
        data: 'total',
        mark: 'bar',
        encoding: { x: { field: 'mes', type: 'ordinal' }, y: { field: 'mes', type: 'quantitative' } },
      },
    };
    expect(validateSpec(v, faturamentoMensal).map((i) => i.code)).toEqual(['unknown_path']);
    const w: ToolViews = { ...v, result: { ...(v.result as object), data: 'items' } as never };
    expect(validateSpec(w, faturamentoMensal)).toEqual([{ code: 'not_numeric', path: '$.result.encoding.y.field' }]);
  });

  it('flags a form bound to another tool or ordering unknown fields', () => {
    const v: ToolViews = { version: 1, input: { kind: 'form', tool: 'other', uiSchema: { 'ui:order': ['nome', 'cpf'] } } };
    expect(validateSpec(v, clientesCreate)).toEqual([
      { code: 'tool_mismatch', path: '$.input.tool' },
      { code: 'unknown_field', path: '$.input.uiSchema.ui:order[1]' },
    ]);
  });
});

describe('paths', () => {
  const data = { items: [{ id: 1, nome: 'A' }, null, { id: 2 }], summary: { total: 3 } };
  it('resolves dotted paths and rows', () => {
    expect(resolvePath(data, 'summary.total')).toBe(3);
    expect(resolvePath(data, '')).toBe(data);
    expect(resolvePath(data, 'summary.missing.deep')).toBeUndefined();
    expect(resolveRows(data, 'items')).toEqual([{ id: 1, nome: 'A' }, { id: 2 }]);
    expect(resolveRows(data, 'summary')).toEqual([]);
  });
  it('resolves $field references in action arguments', () => {
    expect(resolveArgs({ cliente_id: { $field: 'id' }, origem: 'chat' }, { id: 'c1' })).toEqual({ cliente_id: 'c1', origem: 'chat' });
  });
});

describe('theme', () => {
  it('the default theme passes its own gate', () => {
    const t = {
      accent: { light: DEFAULT_THEME.light.accent, dark: DEFAULT_THEME.dark.accent },
      chartPalette: { light: DEFAULT_THEME.light.palette, dark: DEFAULT_THEME.dark.palette },
    };
    const r = validateTheme(t);
    expect(r.errors).toEqual([]);
    // three light slots under 3:1 need relief (labels / table view)
    expect(r.warnings.filter((w) => w.code === 'low_contrast')).toHaveLength(3);
  });

  it('rejects an unreadable accent, look-alike series and unsafe font names', () => {
    const r = validateTheme({
      accent: { light: '#f5f5f5', dark: '#3bc09f' },
      chartPalette: { light: ['#d62728', '#d8302f'], dark: ['#e66767', '#3987e5'] },
      fonts: { sans: 'Inter"; } body { background: url(x)' },
      radius: 99,
    });
    expect(r.errors.map((e) => `${e.code}@${e.path}`)).toEqual(
      expect.arrayContaining([
        'low_contrast@$.accent.light',
        'indistinct_colors@$.chartPalette.light[1]',
        'invalid_font@$.fonts.sans',
        'invalid_value@$.radius',
      ]),
    );
  });

  it('rejects malformed colors', () => {
    expect(validateTheme({ accent: { light: 'red', dark: '#3bc09f' } }).errors).toEqual([{ code: 'invalid_color', path: '$.accent.light' }]);
  });

  it('resolves defaults, then server branding, then host variables', () => {
    const vars = resolveTheme('dark', { accent: { light: '#0b5cad', dark: '#5aa2f0' }, radius: 4 }, { '--color-background-primary': '#000000', '--font-sans': '' });
    expect(vars['--mcp-ui-accent']).toBe('#5aa2f0');
    expect(vars['--border-radius-md']).toBe('4px');
    expect(vars['--color-background-primary']).toBe('#000000');
    expect(vars['--font-sans']).toMatch(/system-ui/);
    expect(vars['--mcp-ui-chart-1']).toBe(DEFAULT_THEME.dark.palette[0]);
  });
});

describe('parseViewPayload', () => {
  const views = infer(clientesCreate)!;
  it('accepts an input phase with errors and a result phase', () => {
    expect(parseViewPayload({ views, phase: 'input', errors: { email: 'Invalid e-mail.' } }).ok).toBe(true);
    expect(parseViewPayload({ views, phase: 'result' }).ok).toBe(true);
  });
  it('requires the view of the phase and well-formed extras', () => {
    const resultOnly = { version: 1, result: views.result };
    expect(parseViewPayload({ views: resultOnly, phase: 'input' })).toMatchObject({ ok: false, issues: [{ code: 'required', path: '$.views.input' }] });
    expect(parseViewPayload({ views, phase: 'later', errors: { a: 1 } })).toMatchObject({
      ok: false,
      issues: [{ code: 'invalid_value', path: '$.phase' }, { code: 'invalid_object', path: '$.errors' }],
    });
  });
});

describe('map tiles', () => {
  const views = infer(lojas)!;
  it('accepts an https tile template and rejects anything else', () => {
    expect(parseViewPayload({ views, phase: 'result', mapTiles: { url: 'https://tile.example.com/{z}/{x}/{y}.png' } }).ok).toBe(true);
    for (const url of ['http://tile.example.com/{z}/{x}/{y}.png', 'javascript:alert(1)//{z}{x}{y}', 'https://tile.example.com/static.png']) {
      expect(parseViewPayload({ views, phase: 'result', mapTiles: { url } }).ok).toBe(false);
    }
  });
});
