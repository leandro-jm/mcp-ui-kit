import type { McpUiHost, MountedView, MountRequest } from './index';

/**
 * `<mcp-app-view>`: framework-agnostic wrapper (Vue, Angular, plain HTML). Set `host` and then
 * `call` (tool, args, result); it dispatches `mcp-app-unavailable` when the tool has no view.
 */
export class McpAppViewElement extends HTMLElement {
  host?: McpUiHost;
  private mounted: MountedView | null = null;
  private current?: MountRequest;

  set call(req: MountRequest) {
    const sameTool = this.current?.tool.name === req.tool.name;
    this.current = req;
    if (sameTool && this.mounted) void this.mounted.update(req.result);
    else void this.render();
  }

  get call(): MountRequest | undefined {
    return this.current;
  }

  connectedCallback(): void {
    if (this.current && !this.mounted) void this.render();
  }

  disconnectedCallback(): void {
    void this.mounted?.destroy();
    this.mounted = null;
  }

  private async render(): Promise<void> {
    if (!this.host || !this.current || !this.isConnected) return;
    await this.mounted?.destroy();
    this.mounted = await this.host.mount(this, this.current).catch(() => null);
    if (!this.mounted) this.dispatchEvent(new CustomEvent('mcp-app-unavailable', { bubbles: true }));
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('mcp-app-view')) {
  customElements.define('mcp-app-view', McpAppViewElement);
}
