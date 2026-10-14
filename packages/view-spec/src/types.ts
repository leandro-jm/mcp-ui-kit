/** Version of the ViewSpec contract. Bumped on breaking changes; renderers reject unknown majors. */
export const VIEW_SPEC_VERSION = 1;

/**
 * Dotted path into the tool result (`structuredContent`), e.g. `items`, `summary.total`.
 * The empty string addresses the root.
 */
export type DataPath = string;

/** Named color from the theme: never a raw hex, so views follow light/dark and tenant branding. */
export type TokenColor =
  | 'accent'
  | 'ok'
  | 'warn'
  | 'danger'
  | 'info'
  | 'muted'
  | 'chart-1'
  | 'chart-2'
  | 'chart-3'
  | 'chart-4'
  | 'chart-5'
  | 'chart-6'
  | 'chart-7'
  | 'chart-8';

export type FieldFormat =
  | 'text'
  | 'number'
  | 'integer'
  | 'percent'
  | 'date'
  | 'datetime'
  | 'boolean'
  | 'email'
  | 'url'
  | 'code'
  | { currency: string };

export interface Field {
  field: string;
  title?: string;
  format?: FieldFormat;
}

export interface Column extends Field {
  align?: 'start' | 'end' | 'center';
}

/** Reference to a value of the current row/object, used inside action arguments. */
export interface FieldRef {
  $field: string;
}

export type ActionArgs = Record<string, unknown | FieldRef>;

/**
 * Something the user can trigger from a view: call a tool (through the host, so the
 * gateway's policy applies) or send a message back to the conversation.
 */
export type ViewAction =
  | { label: string; tool: string; args?: ActionArgs; style?: 'primary' | 'ghost' | 'danger' }
  | { label: string; message: string; style?: 'primary' | 'ghost' | 'danger' };

interface ViewBase {
  title?: string;
  /** Short text shown under the title (unit, period, source). */
  subtitle?: string;
  actions?: ViewAction[];
}

export interface TableView extends ViewBase {
  kind: 'table';
  /** Path to the array of rows. */
  data: DataPath;
  columns: Column[];
  /** Actions offered on each row; `$field` refs resolve against the row. */
  rowActions?: ViewAction[];
}

export type EncodingType = 'nominal' | 'ordinal' | 'temporal' | 'quantitative';

export interface Encoding {
  field: string;
  type: EncodingType;
  title?: string;
  format?: FieldFormat;
}

/**
 * Documented subset of Vega-Lite: one mark, x/y (and optional color) encodings over an
 * array of rows. Anything outside this subset is rejected by `parseViewSpec`.
 */
export interface ChartView extends ViewBase {
  kind: 'chart';
  data: DataPath;
  mark: 'bar' | 'line' | 'area' | 'point';
  encoding: { x: Encoding; y: Encoding; color?: Omit<Encoding, 'format'> };
  /** Emphasized datum: the max/min/last value, or a row index. */
  highlight?: 'max' | 'min' | 'last' | { index: number };
  /** Color per series (value of `encoding.color.field`), or `'*'` for the single series. */
  colors?: Record<string, TokenColor>;
}

export interface CardView extends ViewBase {
  kind: 'card';
  /** Path to the object; defaults to the root. */
  data?: DataPath;
  fields: Field[];
  /** Fields rendered as big numbers (stat tiles) above the field grid. */
  stats?: Field[];
}

/** Subset of the react-jsonschema-form uiSchema understood by the form renderer. */
export interface UiFieldOptions {
  'ui:widget'?: 'radio' | 'textarea' | 'select' | 'hidden';
  'ui:enumNames'?: string[];
  'ui:placeholder'?: string;
  'ui:help'?: string;
  /** Spans the full width of the form grid. */
  'ui:full'?: boolean;
}

export type UiSchema = { 'ui:order'?: string[] } & { [field: string]: UiFieldOptions | string[] | undefined };

export interface JsonSchemaObject {
  type: 'object';
  properties?: Record<string, Record<string, unknown>>;
  required?: string[];
  [key: string]: unknown;
}

export interface FormView extends ViewBase {
  kind: 'form';
  /** Tool called with the submitted values. */
  tool: string;
  /** Input schema of `tool`; when absent the renderer uses the host's `toolInfo`. */
  schema?: JsonSchemaObject;
  uiSchema?: UiSchema;
  submitLabel?: string;
  /** Path to `{ field: message }` validation errors returned by the server, if any. */
  errors?: DataPath;
}

export interface PlanStep {
  title: string;
  detail?: string;
  effect: 'read' | 'write' | 'external' | 'notify';
}

export interface PlanView extends ViewBase {
  kind: 'plan';
  /** Tool called on confirmation, with the original arguments plus `fields` values. */
  tool: string;
  steps: PlanStep[];
  /** Extra inputs asked before confirming (e.g. a reason). */
  fields?: JsonSchemaObject;
  uiSchema?: UiSchema;
  confirmLabel?: string;
  /** Irreversible action: rendered with the danger treatment. */
  danger?: boolean;
}

export type MapView = ViewBase & {
  kind: 'map';
} & (
    | { data: DataPath; lat: string; lng: string; label?: string; popup?: Field[] }
    | { geojson: DataPath; label?: string; popup?: Field[] }
  );

export type DiagramView = ViewBase & {
  kind: 'diagram';
} & (
    | {
        nodes: DataPath;
        edges: DataPath;
        nodeId: string;
        nodeLabel: string;
        edgeFrom: string;
        edgeTo: string;
        edgeLabel?: string;
        direction?: 'LR' | 'TB';
      }
    | { mermaid: DataPath }
  );

/** Views that render a tool result. */
export type ResultView = TableView | ChartView | CardView | MapView | DiagramView;

/** Views that collect input before a tool runs. */
export type InputView = FormView | PlanView;

export type ViewSpec = ResultView | InputView;

export type ViewKind = ViewSpec['kind'];

/**
 * UI attached to one tool: how to collect its input (form/plan) and how to show its result.
 * Either side may be absent.
 */
export interface ToolViews {
  version: typeof VIEW_SPEC_VERSION;
  input?: InputView;
  result?: ResultView;
}

/** The parts of an MCP tool descriptor `infer` and `validateSpec` look at. */
export interface ToolLike {
  name: string;
  title?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };
}
