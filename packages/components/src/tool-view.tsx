import {
  META_KEYS,
  parseViewPayload,
  resolveTheme,
  type JsonSchemaObject,
  type MapView,
  type DiagramView,
  type ThemeMode,
  type ThemeTokens,
  type ViewPayload,
} from '@mcp-ui-kit/view-spec';
import { useEffect, useMemo, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import { ChartResult } from './chart';
import { UiProvider, useUi, type ToolResultLike, type ViewHost } from './context';
import { DiagramResult } from './diagram';
import { FormInput, PlanInput } from './input-views';
import { Badge, Block } from './primitives';
import { CardResult, TableResult } from './result-views';

export interface ExtraRenderers {
  /** Map view (`@mcp-ui-kit/components/map`), kept out of the main bundle (Leaflet). */
  map?: ComponentType<{ view: MapView; data: unknown; tiles?: ViewPayload['mapTiles'] }>;
  /** Mermaid diagrams (`@mcp-ui-kit/components/mermaid`), kept out of the main bundle. */
  mermaid?: ComponentType<{ view: Extract<DiagramView, { mermaid: string }>; data: unknown }>;
}

/** Plain text of a tool result, for fallbacks and errors (never interpreted as markup). */
export function resultText(r: ToolResultLike): string {
  return (r.content ?? [])
    .map((c) => (c && typeof c === 'object' && (c as { type?: string }).type === 'text' ? String((c as { text?: unknown }).text ?? '') : ''))
    .filter(Boolean)
    .join('\n');
}

export function payloadOf(r: ToolResultLike): ViewPayload | undefined {
  const p = parseViewPayload(r._meta?.[META_KEYS.views]);
  return p.ok ? p.value : undefined;
}

function Fallback({ result }: { result: ToolResultLike }) {
  const { t } = useUi();
  const text = resultText(result);
  return (
    <Block right={result.isError ? <Badge tone="danger">{t('failed')}</Badge> : undefined}>
      {text ? <pre className="mui-pre">{text}</pre> : <p className="mui-muted mui-small">{t('unsupported')}</p>}
    </Block>
  );
}

function Body({ result, args, toolSchema, renderers, onResult }: { result: ToolResultLike; args: Record<string, unknown>; toolSchema?: JsonSchemaObject; renderers?: ExtraRenderers; onResult: (r: ToolResultLike) => void }) {
  const { t } = useUi();
  const payload = payloadOf(result);
  if (!payload) return <Fallback result={result} />;
  if (payload.phase === 'input') {
    const input = payload.views.input!;
    const common = { args, onResult, ...(payload.errors ? { errors: payload.errors } : {}), ...(toolSchema ? { toolSchema } : {}), ...(payload.confirmToken ? { confirmToken: payload.confirmToken } : {}) };
    return input.kind === 'form' ? <FormInput view={input} {...common} /> : <PlanInput view={input} {...common} />;
  }
  if (result.isError) return <Fallback result={result} />;
  const view = payload.views.result!;
  const data = result.structuredContent;
  let body: ReactNode;
  switch (view.kind) {
    case 'table':
      body = <TableResult view={view} data={data} />;
      break;
    case 'chart':
      body = <ChartResult view={view} data={data} />;
      break;
    case 'card':
      body = <CardResult view={view} data={data} />;
      break;
    case 'map':
      body = renderers?.map ? <renderers.map view={view} data={data} tiles={payload.mapTiles} /> : <Fallback result={result} />;
      break;
    case 'diagram':
      if ('nodes' in view) body = <DiagramResult view={view} data={data} />;
      else body = renderers?.mermaid ? <renderers.mermaid view={view} data={data} /> : <Fallback result={result} />;
      break;
  }
  return (
    <>
      {payload.truncated && <p className="mui-notice">{t('truncated')}</p>}
      {body}
    </>
  );
}

export interface ToolViewProps {
  /** Latest result of the tool (its `_meta` carries the `ViewPayload`). */
  result: ToolResultLike;
  /** Arguments of the call that produced it (prefill for input views). */
  args?: Record<string, unknown>;
  host: ViewHost;
  locale?: string;
  /** Input schema from the host's `toolInfo`, when the payload does not carry one. */
  toolSchema?: JsonSchemaObject;
  renderers?: ExtraRenderers;
}

/**
 * Renders a tool result with the views the server attached. Input views (form, plan) call the
 * tool through the host and then show the new result in place.
 */
export function ToolView({ result, args = {}, host, locale, toolSchema, renderers }: ToolViewProps) {
  const [current, setCurrent] = useState(result);
  useEffect(() => {
    setCurrent(result);
  }, [result]);
  return (
    <UiProvider host={host} locale={locale}>
      <Body result={current} args={args} toolSchema={toolSchema} renderers={renderers} onResult={setCurrent} />
    </UiProvider>
  );
}

/**
 * Applies the resolved theme (kit defaults → server tokens → host variables) to a subtree.
 * MCP App shells apply the same variables to `<html>` instead.
 */
export function ThemeScope({ mode, tokens, hostVariables, children }: { mode: ThemeMode; tokens?: ThemeTokens; hostVariables?: Record<string, string | undefined>; children: ReactNode }) {
  const style = useMemo(() => resolveTheme(mode, tokens, hostVariables) as CSSProperties, [mode, tokens, hostVariables]);
  return (
    <div className="mui-root" data-theme={mode} style={{ ...style, colorScheme: mode }}>
      {children}
    </div>
  );
}
