import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { McpUiHost, MountedView, MountRequest } from './index';

export interface McpAppViewProps extends MountRequest {
  host: McpUiHost;
  /** Shown while loading, when the tool has no MCP App, or if mounting fails. */
  fallback?: ReactNode;
  className?: string;
}

/** Renders the MCP App of a tool result inline in a chat message. */
export function McpAppView({ host, tool, args, result, tools, fallback = null, className }: McpAppViewProps) {
  const el = useRef<HTMLDivElement>(null);
  const view = useRef<MountedView | null>(null);
  const [state, setState] = useState<'loading' | 'mounted' | 'none'>('loading');

  useEffect(() => {
    let cancelled = false;
    const target = el.current;
    if (!target) return;
    host
      .mount(target, { tool, args, result, ...(tools ? { tools } : {}) })
      .then((v) => {
        if (cancelled) return void v?.destroy();
        view.current = v;
        setState(v ? 'mounted' : 'none');
      })
      .catch(() => !cancelled && setState('none'));
    return () => {
      cancelled = true;
      void view.current?.destroy();
      view.current = null;
    };
    // a new tool or host remounts; a new result of the same tool is pushed below
  }, [host, tool.name]);

  useEffect(() => {
    void view.current?.update(result);
  }, [result]);

  return (
    <>
      <div ref={el} className={className} hidden={state === 'none'} />
      {state !== 'mounted' && fallback}
    </>
  );
}
