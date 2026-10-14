import { Validator } from '@cfworker/json-schema';
import type { JsonSchemaObject, UiFieldOptions, UiSchema } from '@mcp-ui-kit/view-spec';
import { useId, useState, type FormEvent } from 'react';
import { useUi } from './context';
import type { Translate } from './i18n';
import { Button } from './primitives';

type Prop = Record<string, unknown>;
export type FormValues = Record<string, unknown>;
export type FormErrors = Record<string, string>;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function fieldOptions(ui: UiSchema | undefined, key: string): UiFieldOptions {
  const o = ui?.[key];
  return o && !Array.isArray(o) ? o : {};
}

function orderOf(schema: JsonSchemaObject, ui: UiSchema | undefined): string[] {
  const props = Object.keys(schema.properties ?? {});
  const order = (ui?.['ui:order'] ?? []).filter((k) => props.includes(k));
  return [...order, ...props.filter((k) => !order.includes(k))].filter((k) => fieldOptions(ui, k)['ui:widget'] !== 'hidden');
}

const typeOf = (p: Prop): string | undefined => (Array.isArray(p.type) ? (p.type as string[]).find((t) => t !== 'null') : (p.type as string | undefined));

/** Converts raw form strings into typed values (numbers, booleans); empty strings are omitted. */
export function coerce(schema: JsonSchemaObject, raw: FormValues): FormValues {
  const out: FormValues = {};
  for (const [k, p] of Object.entries(schema.properties ?? {})) {
    const v = raw[k];
    if (v === undefined || v === '') continue;
    const t = typeOf(p);
    if ((t === 'number' || t === 'integer') && typeof v === 'string') out[k] = Number(v);
    else out[k] = v;
  }
  return out;
}

/**
 * Field-level validation with friendly, localized messages; then the full schema is checked
 * with an eval-free validator (safe under a strict CSP). The server validates again anyway.
 */
export function validateForm(schema: JsonSchemaObject, values: FormValues, t: Translate): FormErrors {
  const errors: FormErrors = {};
  const required = new Set(schema.required ?? []);
  for (const [k, p] of Object.entries(schema.properties ?? {})) {
    const v = values[k];
    const tp = typeOf(p);
    if (v === undefined || v === '') {
      if (required.has(k) && tp !== 'boolean') errors[k] = t('required');
      continue;
    }
    if (tp === 'number' || tp === 'integer') {
      if (typeof v !== 'number' || Number.isNaN(v)) errors[k] = t('number');
      else if (tp === 'integer' && !Number.isInteger(v)) errors[k] = t('integer');
      else if (typeof p.minimum === 'number' && v < p.minimum) errors[k] = t('min', { n: p.minimum });
      else if (typeof p.maximum === 'number' && v > p.maximum) errors[k] = t('max', { n: p.maximum });
    } else if (typeof v === 'string') {
      if (typeof p.minLength === 'number' && v.length < p.minLength) errors[k] = t('minLength', { n: p.minLength });
      else if (typeof p.maxLength === 'number' && v.length > p.maxLength) errors[k] = t('maxLength', { n: p.maxLength });
      else if (p.format === 'email' && !EMAIL.test(v)) errors[k] = t('email');
      else if (typeof p.pattern === 'string' && !safeTest(p.pattern, v)) errors[k] = typeof p.description === 'string' ? p.description : t('pattern');
    }
  }
  if (Object.keys(errors).length) return errors;
  const r = new Validator(schema as never, '2020-12', false).validate(values);
  if (!r.valid) {
    for (const e of r.errors) {
      const field = e.instanceLocation.replace(/^#\/?/, '').split('/')[0] || '';
      if (field && !errors[field]) errors[field] = t('invalid');
    }
    if (!Object.keys(errors).length) errors[''] = t('invalid');
  }
  return errors;
}

function safeTest(pattern: string, v: string): boolean {
  try {
    return new RegExp(pattern, 'u').test(v);
  } catch {
    return true;
  }
}

export function SchemaForm({
  schema,
  uiSchema,
  initial,
  serverErrors,
  submitLabel,
  submitVariant = 'primary',
  onSubmit,
  onCancel,
  busy,
}: {
  schema: JsonSchemaObject;
  uiSchema?: UiSchema;
  initial?: FormValues;
  serverErrors?: FormErrors;
  submitLabel?: string;
  submitVariant?: 'primary' | 'danger';
  onSubmit: (values: FormValues) => void;
  onCancel?: () => void;
  busy?: boolean;
}) {
  const { t } = useUi();
  const id = useId().replace(/:/g, '');
  const [raw, setRaw] = useState<FormValues>(() => {
    const v: FormValues = {};
    for (const [k, p] of Object.entries(schema.properties ?? {})) {
      const init = initial?.[k] ?? p.default;
      if (init !== undefined) v[k] = typeof init === 'number' ? String(init) : init;
    }
    return v;
  });
  const [errors, setErrors] = useState<FormErrors>(serverErrors ?? {});
  const required = new Set(schema.required ?? []);
  const set = (k: string, v: unknown) => {
    setRaw((r) => ({ ...r, [k]: v }));
    // an edited field drops its error (server or local) until the next submit
    setErrors((e) => {
      if (!e[k]) return e;
      const { [k]: _gone, ...rest } = e;
      return rest;
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const values = coerce(schema, raw);
    const errs = validateForm(schema, values, t);
    setErrors(errs);
    if (!Object.keys(errs).length) onSubmit(values);
  };

  return (
    <form className="mui-form" noValidate onSubmit={submit}>
      <div className="mui-form-grid">
        {orderOf(schema, uiSchema).map((k) => {
          const p = (schema.properties ?? {})[k]!;
          const o = fieldOptions(uiSchema, k);
          const fid = `${id}-${k}`;
          const label = (typeof p.title === 'string' && p.title) || k;
          const help = o['ui:help'] ?? (typeof p.description === 'string' ? p.description : undefined);
          const err = errors[k];
          const tp = typeOf(p);
          const full = o['ui:full'] || o['ui:widget'] === 'textarea';
          const common = { id: fid, name: k, 'aria-invalid': Boolean(err) || undefined, 'aria-describedby': err ? `${fid}-err` : help ? `${fid}-help` : undefined };
          let control;
          if (Array.isArray(p.enum)) {
            const names = o['ui:enumNames'] ?? (p.enum as unknown[]).map(String);
            control =
              o['ui:widget'] === 'radio' ? (
                <div className="mui-radios" role="radiogroup" aria-labelledby={`${fid}-label`}>
                  {(p.enum as unknown[]).map((ev, i) => (
                    <label key={String(ev)}>
                      <input type="radio" name={k} value={String(ev)} checked={raw[k] === ev} onChange={() => set(k, ev)} />
                      {names[i] ?? String(ev)}
                    </label>
                  ))}
                </div>
              ) : (
                <select className="mui-input" {...common} value={raw[k] === undefined ? '' : String(raw[k])} onChange={(e) => set(k, (p.enum as unknown[]).find((ev) => String(ev) === e.target.value) ?? '')}>
                  <option value="">{t('select')}</option>
                  {(p.enum as unknown[]).map((ev, i) => (
                    <option key={String(ev)} value={String(ev)}>
                      {names[i] ?? String(ev)}
                    </option>
                  ))}
                </select>
              );
          } else if (tp === 'boolean') {
            return (
              <div key={k} className={`mui-field${full ? ' full' : ''}`}>
                <label className="mui-check">
                  <input type="checkbox" {...common} checked={Boolean(raw[k])} onChange={(e) => set(k, e.target.checked)} />
                  {label}
                </label>
                {help && <span id={`${fid}-help`} className="mui-help">{help}</span>}
              </div>
            );
          } else if (o['ui:widget'] === 'textarea') {
            control = <textarea className="mui-input" {...common} value={String(raw[k] ?? '')} placeholder={o['ui:placeholder']} onChange={(e) => set(k, e.target.value)} />;
          } else {
            const type = tp === 'number' || tp === 'integer' ? 'number' : p.format === 'email' ? 'email' : p.format === 'date' ? 'date' : 'text';
            control = (
              <input
                className="mui-input"
                {...common}
                type={type}
                value={String(raw[k] ?? '')}
                placeholder={o['ui:placeholder']}
                step={tp === 'integer' ? 1 : tp === 'number' ? 'any' : undefined}
                onChange={(e) => set(k, e.target.value)}
              />
            );
          }
          return (
            <div key={k} className={`mui-field${full ? ' full' : ''}${err ? ' bad' : ''}`}>
              <label id={`${fid}-label`} htmlFor={fid}>
                {label}
                {required.has(k) && <span className="mui-req" aria-hidden>*</span>}
              </label>
              {control}
              {help && !err && <span id={`${fid}-help`} className="mui-help">{help}</span>}
              {err && <span id={`${fid}-err`} className="mui-err">{err}</span>}
            </div>
          );
        })}
      </div>
      {errors[''] && <p className="mui-err">{errors['']}</p>}
      <div className="mui-form-actions">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {t('cancel')}
          </Button>
        )}
        <Button type="submit" variant={submitVariant} disabled={busy}>
          {busy ? t('running') : (submitLabel ?? t('submit'))}
        </Button>
      </div>
    </form>
  );
}
