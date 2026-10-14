import type { ActionArgs, DataPath, FieldRef } from './types';

/** Reads a dotted path (`summary.total`, `items`); the empty path returns the value itself. */
export function resolvePath(value: unknown, path: DataPath | undefined): unknown {
  if (!path) return value;
  let cur: unknown = value;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Rows addressed by a path: the array itself, or an empty list when the path does not hold one. */
export function resolveRows(value: unknown, path: DataPath | undefined): Record<string, unknown>[] {
  const v = resolvePath(value, path);
  return Array.isArray(v) ? (v.filter((r) => r !== null && typeof r === 'object') as Record<string, unknown>[]) : [];
}

export function isFieldRef(v: unknown): v is FieldRef {
  return v !== null && typeof v === 'object' && typeof (v as FieldRef).$field === 'string' && Object.keys(v).length === 1;
}

/** Resolves `{ $field }` references in action arguments against a row/object. */
export function resolveArgs(args: ActionArgs | undefined, scope: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args ?? {})) out[k] = isFieldRef(v) ? resolvePath(scope, v.$field) : v;
  return out;
}
