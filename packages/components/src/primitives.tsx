import { resolveArgs, type ViewAction } from '@mcp-ui-kit/view-spec';
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useUi } from './context';

export function Button({ variant = 'default', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'ghost' | 'danger' }) {
  return <button type="button" {...props} className={`mui-btn mui-btn-${variant} ${props.className ?? ''}`} />;
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'info'; children: ReactNode }) {
  return <span className={`mui-badge mui-badge-${tone}`}>{children}</span>;
}

/** Frame of every view: title row (with optional controls) and body. */
export function Block({
  title,
  subtitle,
  right,
  danger,
  children,
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`mui-block${danger ? ' mui-block-danger' : ''}`}>
      {(title || subtitle || right) && (
        <header className="mui-block-head">
          {title && <h2 className="mui-block-title">{title}</h2>}
          {subtitle && <span className="mui-muted mui-small">{subtitle}</span>}
          <span className="mui-spacer" />
          {right}
        </header>
      )}
      <div className="mui-block-body">{children}</div>
    </section>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="mui-seg" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" aria-pressed={v === value} className={v === value ? 'on' : undefined} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children }: { children?: ReactNode }) {
  const { t } = useUi();
  return <p className="mui-empty mui-muted">{children ?? t('noData')}</p>;
}

/**
 * Buttons for `ViewAction`s. A tool action calls the tool through the host (the server's
 * policy decides); a message action posts text back to the conversation.
 */
export function ActionBar({ actions, scope, onResult }: { actions?: ViewAction[]; scope?: unknown; onResult?: (name: string, r: Awaited<ReturnType<ReturnType<typeof useUi>['callTool']>>) => void }) {
  const ui = useUi();
  const [busy, setBusy] = useState<number | null>(null);
  if (!actions?.length) return null;
  return (
    <div className="mui-actions">
      {actions.map((a, i) => (
        <Button
          key={i}
          variant={a.style ?? 'default'}
          disabled={busy !== null}
          onClick={async () => {
            if ('message' in a) return void ui.sendMessage(a.message);
            setBusy(i);
            try {
              onResult?.(a.tool, await ui.callTool(a.tool, resolveArgs(a.args, scope)));
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === i ? ui.t('running') : a.label}
        </Button>
      ))}
    </div>
  );
}
