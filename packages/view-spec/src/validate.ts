import type { Issue } from './parse';
import type { DataPath, Field, ResultView, ToolLike, ToolViews } from './types';

type Schema = Record<string, unknown>;
const isObj = (v: unknown): v is Schema => v !== null && typeof v === 'object' && !Array.isArray(v);

function props(s: Schema | undefined): Record<string, Schema> | undefined {
  if (!s) return undefined;
  if (isObj(s.properties)) return s.properties as Record<string, Schema>;
  // `allOf` / `anyOf` of objects: merge what is visible, never guess beyond it
  for (const k of ['allOf', 'anyOf', 'oneOf']) {
    const list = s[k];
    if (Array.isArray(list)) {
      const merged: Record<string, Schema> = {};
      for (const sub of list) Object.assign(merged, props(isObj(sub) ? sub : undefined) ?? {});
      if (Object.keys(merged).length) return merged;
    }
  }
  return undefined;
}

/** Schema at a dotted path; `undefined` when the schema does not describe it. */
export function schemaAt(schema: Schema | undefined, path: DataPath | undefined): Schema | undefined {
  if (!path) return schema;
  let cur = schema;
  for (const key of path.split('.')) {
    cur = props(cur)?.[key];
    if (!cur) return undefined;
  }
  return cur;
}

/** Schema of the rows of an array path. */
export function rowSchema(schema: Schema | undefined, path: DataPath | undefined): Schema | undefined {
  const s = schemaAt(schema, path);
  return s && isObj(s.items) ? (s.items as Schema) : undefined;
}

function checkFields(issues: Issue[], scope: Schema | undefined, fields: Array<Pick<Field, 'field'>> | undefined, at: string): void {
  const known = props(scope);
  // an open/undescribed schema cannot be checked: absence is not an error
  if (!known) return;
  fields?.forEach((f, i) => {
    if (!schemaAt(scope, f.field)) issues.push({ code: 'unknown_field', path: `${at}[${i}].field` });
  });
}

function checkResult(issues: Issue[], v: ResultView, out: Schema | undefined): void {
  const at = '$.result';
  const needArray = (path: DataPath, key: string) => {
    const s = schemaAt(out, path);
    if (out && props(out) && !s) issues.push({ code: 'unknown_path', path: `${at}.${key}` });
    else if (s && s.type !== undefined && s.type !== 'array') issues.push({ code: 'not_an_array', path: `${at}.${key}` });
  };
  switch (v.kind) {
    case 'table':
      needArray(v.data, 'data');
      checkFields(issues, rowSchema(out, v.data), v.columns, `${at}.columns`);
      return;
    case 'chart': {
      needArray(v.data, 'data');
      const row = rowSchema(out, v.data);
      const enc = [v.encoding.x, v.encoding.y, ...(v.encoding.color ? [v.encoding.color] : [])];
      checkFields(issues, row, enc, `${at}.encoding`);
      const y = schemaAt(row, v.encoding.y.field);
      if (v.encoding.y.type === 'quantitative' && y && y.type !== undefined && y.type !== 'number' && y.type !== 'integer') {
        issues.push({ code: 'not_numeric', path: `${at}.encoding.y.field` });
      }
      return;
    }
    case 'card': {
      const obj = schemaAt(out, v.data);
      if (v.data && out && props(out) && !obj) issues.push({ code: 'unknown_path', path: `${at}.data` });
      checkFields(issues, obj, v.fields, `${at}.fields`);
      checkFields(issues, obj, v.stats, `${at}.stats`);
      return;
    }
    case 'map':
      if ('data' in v) {
        needArray(v.data, 'data');
        checkFields(issues, rowSchema(out, v.data), [{ field: v.lat }, { field: v.lng }], `${at}.coordinates`);
      }
      return;
    case 'diagram':
      if ('nodes' in v) {
        needArray(v.nodes, 'nodes');
        needArray(v.edges, 'edges');
      }
      return;
  }
}

/**
 * Checks the views of a tool against its contract: result fields must exist in the output
 * schema and form fields in the input schema. Structural validity is `parseToolViews`'s job.
 */
export function validateSpec(views: ToolViews, tool: ToolLike): Issue[] {
  const issues: Issue[] = [];
  if (views.result) checkResult(issues, views.result, tool.outputSchema);
  const input = views.input;
  if (input) {
    if (input.tool !== tool.name) issues.push({ code: 'tool_mismatch', path: '$.input.tool' });
    const schema = input.kind === 'form' ? (input.schema ?? (tool.inputSchema as Schema | undefined)) : input.fields;
    const known = props(schema);
    const order = input.uiSchema?.['ui:order'];
    if (known && Array.isArray(order)) {
      order.forEach((k, i) => {
        if (!known[k]) issues.push({ code: 'unknown_field', path: `$.input.uiSchema.ui:order[${i}]` });
      });
    }
  }
  return issues;
}
