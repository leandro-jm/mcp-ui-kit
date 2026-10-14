import {
  VIEW_SPEC_VERSION,
  type InputView,
  type ResultView,
  type ToolViews,
  type ViewSpec,
} from './types';

/** A problem found in a spec or theme. `code` is stable (translate it); `path` points at the offending key. */
export interface Issue {
  code: string;
  path: string;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };

const TOKEN_COLORS = new Set([
  'accent', 'ok', 'warn', 'danger', 'info', 'muted',
  'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6', 'chart-7', 'chart-8',
]);
const FORMATS = new Set(['text', 'number', 'integer', 'percent', 'date', 'datetime', 'boolean', 'email', 'url', 'code']);
const ENCODING_TYPES = new Set(['nominal', 'ordinal', 'temporal', 'quantitative']);
const MARKS = new Set(['bar', 'line', 'area', 'point']);
const EFFECTS = new Set(['read', 'write', 'external', 'notify']);
const STYLES = new Set(['primary', 'ghost', 'danger']);
const WIDGETS = new Set(['radio', 'textarea', 'select', 'hidden']);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const MAX_ITEMS = 64;
const MAX_TEXT = 500;

/** Collects issues while walking an untrusted value. */
class Walker {
  readonly issues: Issue[] = [];
  fail(code: string, path: string): void {
    this.issues.push({ code, path });
  }
  text(o: Obj, key: string, path: string, required = false): void {
    const v = o[key];
    if (v === undefined) {
      if (required) this.fail('required', `${path}.${key}`);
      return;
    }
    if (!isStr(v) || v.length > MAX_TEXT) this.fail('invalid_text', `${path}.${key}`);
  }
  /** Field names and data paths: identifiers and dots only, so they can never smuggle markup. */
  ident(o: Obj, key: string, path: string, required = true, allowEmpty = false): void {
    const v = o[key];
    if (v === undefined) {
      if (required) this.fail('required', `${path}.${key}`);
      return;
    }
    if (!isStr(v) || (!allowEmpty && v === '') || v.length > 200 || !/^[\p{L}\p{N}_$-]*(\.[\p{L}\p{N}_$-]+)*$/u.test(v)) {
      this.fail('invalid_path', `${path}.${key}`);
    }
  }
  oneOf(o: Obj, key: string, allowed: Set<string>, path: string, required = false): void {
    const v = o[key];
    if (v === undefined) {
      if (required) this.fail('required', `${path}.${key}`);
      return;
    }
    if (!isStr(v) || !allowed.has(v)) this.fail('invalid_value', `${path}.${key}`);
  }
  list(o: Obj, key: string, path: string, each: (item: unknown, p: string) => void, required = false): void {
    const v = o[key];
    if (v === undefined) {
      if (required) this.fail('required', `${path}.${key}`);
      return;
    }
    if (!Array.isArray(v) || v.length > MAX_ITEMS) {
      this.fail('invalid_list', `${path}.${key}`);
      return;
    }
    if (required && v.length === 0) this.fail('empty_list', `${path}.${key}`);
    v.forEach((item, i) => each(item, `${path}.${key}[${i}]`));
  }
  format(o: Obj, key: string, path: string): void {
    const v = o[key];
    if (v === undefined) return;
    if (isStr(v) && FORMATS.has(v)) return;
    if (isObj(v) && isStr(v.currency) && /^[A-Z]{3}$/.test(v.currency) && Object.keys(v).length === 1) return;
    this.fail('invalid_format', `${path}.${key}`);
  }
  field(v: unknown, p: string): void {
    if (!isObj(v)) return this.fail('invalid_object', p);
    this.ident(v, 'field', p);
    this.text(v, 'title', p);
    this.format(v, 'format', p);
    if (v.align !== undefined) this.oneOf(v, 'align', new Set(['start', 'end', 'center']), p);
  }
  action(v: unknown, p: string): void {
    if (!isObj(v)) return this.fail('invalid_object', p);
    this.text(v, 'label', p, true);
    this.oneOf(v, 'style', STYLES, p);
    const hasTool = v.tool !== undefined;
    const hasMessage = v.message !== undefined;
    if (hasTool === hasMessage) return this.fail('action_tool_or_message', p);
    if (hasTool) {
      this.ident(v, 'tool', p);
      if (v.args !== undefined && !isObj(v.args)) this.fail('invalid_object', `${p}.args`);
    } else this.text(v, 'message', p, true);
  }
  base(o: Obj, p: string): void {
    this.text(o, 'title', p);
    this.text(o, 'subtitle', p);
    this.list(o, 'actions', p, (a, ap) => this.action(a, ap));
  }
  uiSchema(o: Obj, key: string, p: string): void {
    const ui = o[key];
    if (ui === undefined) return;
    if (!isObj(ui)) return this.fail('invalid_object', `${p}.${key}`);
    for (const [k, v] of Object.entries(ui)) {
      const kp = `${p}.${key}.${k}`;
      if (k === 'ui:order') {
        if (!Array.isArray(v) || !v.every(isStr)) this.fail('invalid_list', kp);
        continue;
      }
      if (!isObj(v)) {
        this.fail('invalid_object', kp);
        continue;
      }
      this.oneOf(v, 'ui:widget', WIDGETS, kp);
      if (v['ui:enumNames'] !== undefined && (!Array.isArray(v['ui:enumNames']) || !v['ui:enumNames'].every(isStr))) {
        this.fail('invalid_list', `${kp}.ui:enumNames`);
      }
      this.text(v, 'ui:placeholder', kp);
      this.text(v, 'ui:help', kp);
      if (v['ui:full'] !== undefined && typeof v['ui:full'] !== 'boolean') this.fail('invalid_value', `${kp}.ui:full`);
    }
  }
  schema(o: Obj, key: string, p: string, required = false): void {
    const s = o[key];
    if (s === undefined) {
      if (required) this.fail('required', `${p}.${key}`);
      return;
    }
    if (!isObj(s) || s.type !== 'object' || (s.properties !== undefined && !isObj(s.properties))) this.fail('invalid_schema', `${p}.${key}`);
  }
}

function walkResult(w: Walker, v: Obj, p: string): void {
  w.base(v, p);
  switch (v.kind) {
    case 'table':
      w.ident(v, 'data', p, true, true);
      w.list(v, 'columns', p, (c, cp) => w.field(c, cp), true);
      w.list(v, 'rowActions', p, (a, ap) => w.action(a, ap));
      return;
    case 'chart': {
      w.ident(v, 'data', p, true, true);
      w.oneOf(v, 'mark', MARKS, p, true);
      const enc = v.encoding;
      if (!isObj(enc)) return w.fail('required', `${p}.encoding`);
      for (const axis of ['x', 'y', 'color'] as const) {
        const e = enc[axis];
        if (e === undefined) {
          if (axis !== 'color') w.fail('required', `${p}.encoding.${axis}`);
          continue;
        }
        if (!isObj(e)) {
          w.fail('invalid_object', `${p}.encoding.${axis}`);
          continue;
        }
        w.ident(e, 'field', `${p}.encoding.${axis}`);
        w.oneOf(e, 'type', ENCODING_TYPES, `${p}.encoding.${axis}`, true);
        w.text(e, 'title', `${p}.encoding.${axis}`);
        if (axis !== 'color') w.format(e, 'format', `${p}.encoding.${axis}`);
      }
      const h = v.highlight;
      if (h !== undefined && !(isStr(h) && ['max', 'min', 'last'].includes(h)) && !(isObj(h) && Number.isInteger(h.index))) {
        w.fail('invalid_value', `${p}.highlight`);
      }
      if (v.colors !== undefined) {
        if (!isObj(v.colors)) w.fail('invalid_object', `${p}.colors`);
        else for (const [k, c] of Object.entries(v.colors)) if (!isStr(c) || !TOKEN_COLORS.has(c)) w.fail('invalid_color', `${p}.colors.${k}`);
      }
      return;
    }
    case 'card':
      w.ident(v, 'data', p, false, true);
      w.list(v, 'fields', p, (f, fp) => w.field(f, fp), true);
      w.list(v, 'stats', p, (f, fp) => w.field(f, fp));
      return;
    case 'map':
      if (v.geojson !== undefined) w.ident(v, 'geojson', p, true, true);
      else {
        w.ident(v, 'data', p, true, true);
        w.ident(v, 'lat', p);
        w.ident(v, 'lng', p);
      }
      w.ident(v, 'label', p, false);
      w.list(v, 'popup', p, (f, fp) => w.field(f, fp));
      return;
    case 'diagram':
      if (v.mermaid !== undefined) w.ident(v, 'mermaid', p, true, true);
      else {
        for (const k of ['nodes', 'edges']) w.ident(v, k, p, true, true);
        for (const k of ['nodeId', 'nodeLabel', 'edgeFrom', 'edgeTo']) w.ident(v, k, p);
        w.ident(v, 'edgeLabel', p, false);
        w.oneOf(v, 'direction', new Set(['LR', 'TB']), p);
      }
      return;
    default:
      w.fail('unknown_kind', `${p}.kind`);
  }
}

function walkInput(w: Walker, v: Obj, p: string): void {
  w.base(v, p);
  w.ident(v, 'tool', p);
  w.uiSchema(v, 'uiSchema', p);
  switch (v.kind) {
    case 'form':
      w.schema(v, 'schema', p);
      w.text(v, 'submitLabel', p);
      w.ident(v, 'errors', p, false);
      return;
    case 'plan':
      w.list(
        v,
        'steps',
        p,
        (s, sp) => {
          if (!isObj(s)) return w.fail('invalid_object', sp);
          w.text(s, 'title', sp, true);
          w.text(s, 'detail', sp);
          w.oneOf(s, 'effect', EFFECTS, sp, true);
        },
        true,
      );
      w.schema(v, 'fields', p);
      w.text(v, 'confirmLabel', p);
      if (v.danger !== undefined && typeof v.danger !== 'boolean') w.fail('invalid_value', `${p}.danger`);
      return;
    default:
      w.fail('unknown_kind', `${p}.kind`);
  }
}

const RESULT_KINDS = new Set(['table', 'chart', 'card', 'map', 'diagram']);
const INPUT_KINDS = new Set(['form', 'plan']);

/**
 * Validates the structure of untrusted `ToolViews` (from storage or a tool result `_meta`).
 * Renderers must only render values that pass; anything unknown is rejected, not ignored.
 */
export function parseToolViews(value: unknown): ParseResult<ToolViews> {
  const w = new Walker();
  if (!isObj(value)) return { ok: false, issues: [{ code: 'invalid_object', path: '$' }] };
  if (value.version !== VIEW_SPEC_VERSION) w.fail('unsupported_version', '$.version');
  if (value.input === undefined && value.result === undefined) w.fail('empty_views', '$');
  if (value.input !== undefined) {
    if (!isObj(value.input) || !INPUT_KINDS.has(value.input.kind as string)) w.fail('unknown_kind', '$.input.kind');
    else walkInput(w, value.input, '$.input');
  }
  if (value.result !== undefined) {
    if (!isObj(value.result) || !RESULT_KINDS.has(value.result.kind as string)) w.fail('unknown_kind', '$.result.kind');
    else walkResult(w, value.result, '$.result');
  }
  return w.issues.length ? { ok: false, issues: w.issues } : { ok: true, value: value as unknown as ToolViews };
}

/** Validates a single view, input or result. */
export function parseViewSpec(value: unknown): ParseResult<ViewSpec> {
  if (!isObj(value)) return { ok: false, issues: [{ code: 'invalid_object', path: '$' }] };
  const isInput = INPUT_KINDS.has(value.kind as string);
  const r = parseToolViews({ version: VIEW_SPEC_VERSION, ...(isInput ? { input: value } : { result: value }) });
  if (!r.ok) return { ok: false, issues: r.issues.map((i) => ({ ...i, path: i.path.replace(/^\$\.(input|result)/, '$') })) };
  return { ok: true, value: (isInput ? r.value.input : r.value.result) as InputView | ResultView };
}
