import { resolvePath, type DiagramView } from '@mcp-ui-kit/view-spec';
import mermaid from 'mermaid';
import { useEffect, useId, useRef, useState } from 'react';
import { useUi } from './context';
import { ActionBar, Block, Empty } from './primitives';

const MAX_SOURCE = 20_000;
let initialized = false;

/**
 * Mermaid diagram from text in the result. `securityLevel: 'strict'` keeps Mermaid's own
 * sanitizer on and disables click handlers; the source is never executed as HTML by us.
 */
export function MermaidResult({ view, data }: { view: Extract<DiagramView, { mermaid: string }>; data: unknown }) {
  const { t } = useUi();
  const id = `mmd-${useId().replace(/[^a-z0-9]/gi, '')}`;
  const el = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const source = resolvePath(data, view.mermaid);
  const text = typeof source === 'string' ? source.slice(0, MAX_SOURCE) : '';
  useEffect(() => {
    if (!text || !el.current) return;
    if (!initialized) {
      const dark = document.documentElement.dataset.theme === 'dark';
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'neutral' });
      initialized = true;
    }
    let cancelled = false;
    mermaid
      .render(id, text)
      .then(({ svg }) => {
        if (!cancelled && el.current) el.current.innerHTML = svg;
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [id, text]);
  return (
    <Block title={view.title} subtitle={view.subtitle}>
      {!text ? <Empty /> : failed ? <pre className="mui-pre">{text}</pre> : <div ref={el} className="mui-diagram" aria-label={view.title ?? t('showChart')} />}
      <ActionBar actions={view.actions} scope={data} />
    </Block>
  );
}
