import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { toLocale, translator, type Locale, type Translate } from './i18n';

/** The parts of an MCP `CallToolResult` the renderers read. */
export interface ToolResultLike {
  content?: unknown[];
  structuredContent?: unknown;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

/**
 * What a view may do outside itself. In an MCP App these go through the host bridge (so the
 * server's authorization applies to every call); a native embedding wires them to its backend.
 */
export interface ViewHost {
  callTool(name: string, args: Record<string, unknown>, meta?: Record<string, unknown>): Promise<ToolResultLike>;
  sendMessage(text: string): void | Promise<void>;
}

interface UiContextValue extends ViewHost {
  locale: Locale;
  /** BCP 47 tag used for number/date formatting (may be more specific than `locale`). */
  formatLocale: string;
  t: Translate;
}

const UiContext = createContext<UiContextValue | null>(null);

export function UiProvider({ host, locale, children }: { host: ViewHost; locale?: string; children: ReactNode }) {
  const value = useMemo<UiContextValue>(() => {
    const l = toLocale(locale);
    return { ...host, locale: l, formatLocale: locale || l, t: translator(l) };
  }, [host, locale]);
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(): UiContextValue {
  const v = useContext(UiContext);
  if (!v) throw new Error('useUi() outside <UiProvider>');
  return v;
}
