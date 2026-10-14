import { rowSchema, schemaAt } from './validate';
import {
  VIEW_SPEC_VERSION,
  type ChartView,
  type Column,
  type FieldFormat,
  type InputView,
  type JsonSchemaObject,
  type ResultView,
  type ToolLike,
  type ToolViews,
  type UiSchema,
} from './types';

type Schema = Record<string, unknown>;
const isObj = (v: unknown): v is Schema => v !== null && typeof v === 'object' && !Array.isArray(v);
const propsOf = (s: Schema | undefined): Record<string, Schema> => (s && isObj(s.properties) ? (s.properties as Record<string, Schema>) : {});

const MAX_COLUMNS = 6;
const MAX_CARD_FIELDS = 8;
/** Preferred names for the collection inside a wrapped result (`{ items: [...] }`). */
const COLLECTION_KEYS = ['items', 'data', 'results', 'rows', 'records', 'content', 'list'];

const LAT = /^(lat|latitude)$/i;
const LNG = /^(lng|lon|long|longitude)$/i;
/** Names that usually hold a period on the x axis (pt/en/es). */
const TEMPORAL_NAME = /(^|_)(date|data|fecha|dia|day|mes|month|ano|year|semana|week|periodo|period|time|hora|competencia)($|_)/i;
/** Technical identifiers: useful as action arguments, rarely worth a column. */
const ID_LIKE = (name: string, s: Schema) => /^(id|uuid)$|_(id|uuid)$/i.test(name) || s.format === 'uuid';
/** Human-readable labels: they lead tables and cards. */
const NAME_LIKE = /^(nome|name|nombre|title|titulo|título|razao_social|descricao|description|label)$/i;
const LONG_TEXT = /(descri|observ|mensagem|message|mensaje|body|corpo|cuerpo|coment|comment|notes?|motivo|reason)/i;

function scalarType(s: Schema): string | undefined {
  const t = Array.isArray(s.type) ? s.type.find((x) => x !== 'null') : s.type;
  return typeof t === 'string' && ['string', 'number', 'integer', 'boolean'].includes(t) ? t : undefined;
}

function formatOf(s: Schema): FieldFormat | undefined {
  const t = scalarType(s);
  if (t === 'integer') return 'integer';
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'boolean';
  if (s.format === 'date') return 'date';
  if (s.format === 'date-time') return 'datetime';
  if (s.format === 'email') return 'email';
  if (s.format === 'uri' || s.format === 'url') return 'url';
  return undefined;
}

function humanize(name: string): string {
  const s = name.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function titleOf(name: string, s: Schema): string {
  return typeof s.title === 'string' && s.title ? s.title : humanize(name);
}

function scalarFields(s: Schema | undefined): Array<[string, Schema]> {
  return Object.entries(propsOf(s)).filter(([, p]) => scalarType(p) !== undefined);
}

/** Path of the array that holds the rows: the root, or a (preferably well-known) array property. */
function collectionPath(out: Schema): string | undefined {
  if (out.type === 'array') return '';
  const arrays = Object.entries(propsOf(out)).filter(([, p]) => p.type === 'array' && isObj(p.items));
  if (!arrays.length) return undefined;
  const preferred = arrays.find(([k]) => COLLECTION_KEYS.includes(k.toLowerCase()));
  return (preferred ?? arrays[0])![0];
}

function columnOf([name, s]: [string, Schema]): Column {
  const format = formatOf(s);
  const numeric = format === 'number' || format === 'integer';
  return { field: name, title: titleOf(name, s), ...(format && format !== 'boolean' ? { format } : {}), ...(numeric ? { align: 'end' } : {}) };
}

/** A small series (one label + numeric measures) reads better as a chart than as a table. */
function chartFor(data: string, row: Schema): ChartView | undefined {
  const fields = scalarFields(row);
  if (fields.length < 2 || fields.length > 4) return undefined;
  const numeric = fields.filter(([, s]) => ['number', 'integer'].includes(scalarType(s)!));
  const labels = fields.filter(([, s]) => scalarType(s) === 'string');
  if (numeric.length < 1 || labels.length !== 1) return undefined;
  const [xName, xs] = labels[0]!;
  const [yName, ys] = numeric[0]!;
  const temporal = xs.format === 'date' || xs.format === 'date-time';
  const periodLike = temporal || TEMPORAL_NAME.test(xName);
  if (!periodLike && numeric.length > 1) return undefined;
  return {
    kind: 'chart',
    data,
    mark: temporal ? 'line' : 'bar',
    encoding: {
      x: { field: xName, type: temporal ? 'temporal' : 'ordinal', title: titleOf(xName, xs) },
      y: { field: yName, type: 'quantitative', title: titleOf(yName, ys), ...(formatOf(ys) ? { format: formatOf(ys)! } : {}) },
    },
    highlight: 'max',
  };
}

function resultFor(out: Schema | undefined): ResultView | undefined {
  if (!out) return undefined;
  const data = collectionPath(out);
  if (data !== undefined) {
    const row = rowSchema(out, data);
    if (!row) return undefined;
    const fields = scalarFields(row);
    const lat = fields.find(([k]) => LAT.test(k));
    const lng = fields.find(([k]) => LNG.test(k));
    if (lat && lng) {
      const label = fields.find(([k, s]) => scalarType(s) === 'string' && !LAT.test(k) && !LNG.test(k));
      return { kind: 'map', data, lat: lat[0], lng: lng[0], ...(label ? { label: label[0] } : {}) };
    }
    const chart = chartFor(data, row);
    if (chart) return chart;
    if (!fields.length) return undefined;
    const named = fields.filter(([k]) => NAME_LIKE.test(k));
    const rest = fields.filter(([k, s]) => !NAME_LIKE.test(k) && !ID_LIKE(k, s));
    const ordered = [...named, ...rest, ...fields.filter(([k, s]) => ID_LIKE(k, s))];
    return { kind: 'table', data, columns: ordered.slice(0, MAX_COLUMNS).map(columnOf) };
  }
  const fields = scalarFields(schemaAt(out, ''));
  if (!fields.length) return undefined;
  return { kind: 'card', fields: fields.slice(0, MAX_CARD_FIELDS).map(([k, s]) => ({ field: k, title: titleOf(k, s), ...(formatOf(s) ? { format: formatOf(s)! } : {}) })) };
}

/** uiSchema for a tool input: required first, short enums as radios, long texts as textareas. */
export function inferUiSchema(schema: JsonSchemaObject): UiSchema {
  const props = propsOf(schema);
  const required = new Set(schema.required ?? []);
  const order = [...Object.keys(props).filter((k) => required.has(k)), ...Object.keys(props).filter((k) => !required.has(k))];
  const ui: UiSchema = { 'ui:order': order };
  for (const [k, p] of Object.entries(props)) {
    if (Array.isArray(p.enum) && p.enum.length <= 4) ui[k] = { 'ui:widget': 'radio' };
    else if (scalarType(p) === 'string' && (LONG_TEXT.test(k) || (typeof p.maxLength === 'number' && p.maxLength > 200))) {
      ui[k] = { 'ui:widget': 'textarea', 'ui:full': true };
    }
  }
  return ui;
}

function inputFor(tool: ToolLike): InputView | undefined {
  const a = tool.annotations ?? {};
  // read-only tools (and tools that declare nothing) run straight away: no input view
  if (a.readOnlyHint !== false && !a.destructiveHint) return undefined;
  const schema = isObj(tool.inputSchema) && tool.inputSchema.type === 'object' ? (tool.inputSchema as JsonSchemaObject) : undefined;
  if (a.destructiveHint) {
    return {
      kind: 'plan',
      tool: tool.name,
      title: tool.title ?? humanize(tool.name),
      steps: [{ title: tool.title ?? humanize(tool.name), effect: a.openWorldHint ? 'external' : 'write' }],
      danger: true,
    };
  }
  if (!schema || !Object.keys(propsOf(schema)).length) return undefined;
  return { kind: 'form', tool: tool.name, title: tool.title ?? humanize(tool.name), schema, uiSchema: inferUiSchema(schema) };
}

/**
 * Suggests the views of a tool from its contract alone (schemas and annotations). The result
 * is a suggestion for a human to review and activate, never applied automatically.
 */
export function infer(tool: ToolLike): ToolViews | undefined {
  const input = inputFor(tool);
  const result = resultFor(isObj(tool.outputSchema) ? tool.outputSchema : undefined);
  if (!input && !result) return undefined;
  return { version: VIEW_SPEC_VERSION, ...(input ? { input } : {}), ...(result ? { result } : {}) };
}
