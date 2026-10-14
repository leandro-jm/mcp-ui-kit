import { META_KEYS, type FormView, type JsonSchemaObject, type PlanView } from '@mcp-ui-kit/view-spec';
import { useState } from 'react';
import { useUi, type ToolResultLike } from './context';
import { SchemaForm, type FormValues } from './form';
import { Badge, Block, Button } from './primitives';

interface InputProps<V> {
  view: V;
  args: Record<string, unknown>;
  errors?: Record<string, string>;
  /** Input schema of the tool from the host (`toolInfo`), used when the view does not carry one. */
  toolSchema?: JsonSchemaObject;
  confirmToken?: string;
  onResult: (r: ToolResultLike) => void;
}

/** Collects the tool input; submitting calls the tool through the host (server policy applies). */
export function FormInput({ view, args, errors, toolSchema, onResult }: InputProps<FormView>) {
  const ui = useUi();
  const [state, setState] = useState<'editing' | 'busy' | 'discarded'>('editing');
  const schema = view.schema ?? toolSchema;
  if (!schema) return null;
  if (state === 'discarded') {
    return (
      <Block title={view.title}>
        <p className="mui-muted mui-small">{ui.t('discarded')}</p>
      </Block>
    );
  }
  return (
    <Block title={view.title} subtitle={view.subtitle}>
      <SchemaForm
        schema={schema}
        uiSchema={view.uiSchema}
        initial={args}
        serverErrors={errors}
        submitLabel={view.submitLabel}
        busy={state === 'busy'}
        onCancel={() => setState('discarded')}
        onSubmit={async (values: FormValues) => {
          setState('busy');
          try {
            onResult(await ui.callTool(view.tool, values));
          } finally {
            setState((s) => (s === 'busy' ? 'editing' : s));
          }
        }}
      />
    </Block>
  );
}

const EFFECT_TONE = { read: 'info', write: 'warn', external: 'danger', notify: 'neutral' } as const;
const EFFECT_KEY = { read: 'effectRead', write: 'effectWrite', external: 'effectExternal', notify: 'effectNotify' } as const;

/**
 * Shows what a destructive call will do and runs it only on a human click: the one-time
 * confirmation token travels in `_meta`, which the model never sees.
 */
export function PlanInput({ view, args, errors, confirmToken, onResult }: InputProps<PlanView>) {
  const ui = useUi();
  const [state, setState] = useState<'idle' | 'busy' | 'declined'>('idle');
  const confirm = async (extra: FormValues = {}) => {
    setState('busy');
    try {
      onResult(await ui.callTool(view.tool, { ...args, ...extra }, confirmToken ? { [META_KEYS.confirm]: confirmToken } : undefined));
    } finally {
      setState((s) => (s === 'busy' ? 'idle' : s));
    }
  };
  const label = view.confirmLabel ?? ui.t('confirm');
  return (
    <Block title={view.title} subtitle={view.subtitle} danger={view.danger} right={view.danger ? <Badge tone="danger">{ui.t('irreversible')}</Badge> : undefined}>
      <ol className="mui-steps">
        {view.steps.map((s, i) => (
          <li key={i} className="mui-step">
            <span className="mui-step-n">{i + 1}</span>
            <div>
              <div className="mui-step-title">{s.title}</div>
              {s.detail && <div className="mui-step-detail">{s.detail}</div>}
            </div>
            <Badge tone={EFFECT_TONE[s.effect]}>{ui.t(EFFECT_KEY[s.effect])}</Badge>
          </li>
        ))}
      </ol>
      {state === 'declined' ? (
        <p className="mui-muted mui-small">{ui.t('notExecuted')}</p>
      ) : view.fields && Object.keys(view.fields.properties ?? {}).length ? (
        <SchemaForm
          schema={view.fields}
          uiSchema={view.uiSchema}
          initial={args}
          serverErrors={errors}
          submitLabel={label}
          submitVariant={view.danger ? 'danger' : 'primary'}
          busy={state === 'busy'}
          onCancel={() => setState('declined')}
          onSubmit={(v) => void confirm(v)}
        />
      ) : (
        <div className="mui-form-actions">
          <Button variant="ghost" disabled={state === 'busy'} onClick={() => setState('declined')}>
            {ui.t('cancel')}
          </Button>
          <Button variant={view.danger ? 'danger' : 'primary'} disabled={state === 'busy'} onClick={() => void confirm()}>
            {state === 'busy' ? ui.t('running') : label}
          </Button>
        </div>
      )}
    </Block>
  );
}
