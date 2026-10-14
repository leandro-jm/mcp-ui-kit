// @vitest-environment happy-dom
import { META_KEYS, infer, type ToolViews, type ViewPayload } from '@mcp-ui-kit/view-spec';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { layout, ToolView, type ToolResultLike, type ViewHost } from '../src';

afterEach(cleanup);

function result(payload: ViewPayload, structuredContent?: unknown, extra: Partial<ToolResultLike> = {}): ToolResultLike {
  return { content: [{ type: 'text', text: JSON.stringify(structuredContent ?? {}) }], structuredContent, _meta: { [META_KEYS.views]: payload }, ...extra };
}

function host(over: Partial<ViewHost> = {}): ViewHost {
  return { callTool: vi.fn(async () => ({ content: [] })), sendMessage: vi.fn(), ...over };
}

const salesViews: ToolViews = {
  version: 1,
  result: {
    kind: 'chart',
    title: 'Faturamento mensal 2026',
    data: 'items',
    mark: 'bar',
    encoding: { x: { field: 'mes', type: 'ordinal' }, y: { field: 'valor', type: 'quantitative', format: 'number' } },
    highlight: 'max',
    actions: [{ label: 'Comparar com 2025', message: 'Compare com 2025' }],
  },
};
const sales = { items: [{ mes: 'Jan', valor: 182.4 }, { mes: 'Fev', valor: 171.9 }, { mes: 'Ago', valor: 249.1 }] };

const createTool = {
  name: 'clientes_create',
  title: 'Cadastrar cliente',
  inputSchema: {
    type: 'object',
    required: ['nome', 'email', 'segmento'],
    properties: {
      nome: { type: 'string', title: 'Nome completo', minLength: 3 },
      email: { type: 'string', format: 'email', title: 'E-mail' },
      segmento: { type: 'string', enum: ['varejo', 'atacado', 'servicos'], title: 'Segmento' },
      limite_credito: { type: 'number', title: 'Limite', minimum: 0 },
    },
  },
  outputSchema: { type: 'object', properties: { id: { type: 'string' }, nome: { type: 'string' } } },
  annotations: { readOnlyHint: false },
};

describe('ToolView', () => {
  it('renders a chart with one bar per category, a direct label on the max and a table toggle', () => {
    render(<ToolView result={result({ views: salesViews, phase: 'result' }, sales)} host={host()} locale="pt-BR" />);
    expect(screen.getByRole('heading', { name: 'Faturamento mensal 2026' })).toBeTruthy();
    expect(document.querySelectorAll('.mui-chart path[d^="M"]').length).toBe(3);
    expect(screen.getByText('249,1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tabela' }));
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });

  it('a message action posts text back to the conversation', () => {
    const h = host();
    render(<ToolView result={result({ views: salesViews, phase: 'result' }, sales)} host={h} locale="en" />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparar com 2025' }));
    expect(h.sendMessage).toHaveBeenCalledWith('Compare com 2025');
  });

  it('renders a table with locale formatting', () => {
    const views: ToolViews = { version: 1, result: { kind: 'table', data: 'items', columns: [{ field: 'nome', title: 'Cliente' }, { field: 'limite', format: { currency: 'BRL' } }] } };
    render(<ToolView result={result({ views, phase: 'result' }, { items: [{ nome: 'Mercearia Bela Vista', limite: 1284.9 }] })} host={host()} locale="pt-BR" />);
    expect(screen.getByText('Mercearia Bela Vista')).toBeTruthy();
    expect(screen.getByText(/R\$\s?1\.284,90/)).toBeTruthy();
  });

  it('a form validates in the viewer language, calls the tool with typed values and shows the new result', async () => {
    const views = infer(createTool)!;
    const created = result({ views, phase: 'result' }, { id: 'c-2291', nome: 'Marina Tavares' });
    const h = host({ callTool: vi.fn(async () => created) });
    render(<ToolView result={result({ views, phase: 'input' })} args={{ nome: 'Marina Tavares' }} host={h} locale="pt-BR" />);
    expect((screen.getByLabelText(/Nome completo/) as HTMLInputElement).value).toBe('Marina Tavares');

    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(screen.getAllByText('Campo obrigatório.')).toHaveLength(2);
    expect(h.callTool).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: 'marina@x' } });
    fireEvent.click(screen.getByRole('radio', { name: 'varejo' }));
    fireEvent.change(screen.getByLabelText(/Limite/), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(screen.getByText('E-mail inválido.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: 'marina@tavares.com.br' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Enviar' })));
    expect(h.callTool).toHaveBeenCalledWith('clientes_create', { nome: 'Marina Tavares', email: 'marina@tavares.com.br', segmento: 'varejo', limite_credito: 5000 });
    await waitFor(() => expect(screen.getByText('c-2291')).toBeTruthy());
  });

  it('server-side errors are shown on their fields', () => {
    const views = infer(createTool)!;
    render(<ToolView result={result({ views, phase: 'input', errors: { email: 'E-mail já cadastrado.' } })} host={host()} locale="pt-BR" />);
    expect(screen.getByText('E-mail já cadastrado.')).toBeTruthy();
  });

  it('a plan runs only on a human click and sends the confirmation token in _meta', async () => {
    const views: ToolViews = {
      version: 1,
      input: { kind: 'plan', tool: 'wf_cancelar_pedido', title: 'Cancelar pedido', danger: true, steps: [{ title: 'Estornar R$ 1.284,90', effect: 'external' }] },
    };
    const h = host();
    render(<ToolView result={result({ views, phase: 'input', confirmToken: 'tok-1' })} args={{ pedido_id: 10482 }} host={h} locale="en" />);
    expect(screen.getByText('irreversible')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Confirm' })));
    expect(h.callTool).toHaveBeenCalledWith('wf_cancelar_pedido', { pedido_id: 10482 }, { [META_KEYS.confirm]: 'tok-1' });
  });

  it('declining a plan sends nothing', () => {
    const views: ToolViews = { version: 1, input: { kind: 'plan', tool: 't', steps: [{ title: 's', effect: 'write' }] } };
    const h = host();
    render(<ToolView result={result({ views, phase: 'input' })} host={h} locale="es" />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText('No se ejecutó nada.')).toBeTruthy();
    expect(h.callTool).not.toHaveBeenCalled();
  });

  it('without a valid payload it falls back to the text content, never as markup', () => {
    render(<ToolView result={{ content: [{ type: 'text', text: '<img src=x onerror=alert(1)>' }], _meta: { [META_KEYS.views]: { phase: 'result' } } }} host={host()} />);
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });

  it('a map without the map renderer falls back instead of failing', () => {
    const views: ToolViews = { version: 1, result: { kind: 'map', data: '', lat: 'lat', lng: 'lng' } };
    render(<ToolView result={result({ views, phase: 'result' }, [{ lat: -23.5, lng: -46.6 }])} host={host()} />);
    expect(document.querySelector('.mui-pre')).toBeTruthy();
  });
});

describe('diagram layout', () => {
  it('ranks nodes by longest path and survives cycles', () => {
    const view = { kind: 'diagram' as const, nodes: 'nodes', edges: 'edges', nodeId: 'id', nodeLabel: 'name', edgeFrom: 'from', edgeTo: 'to' };
    const data = {
      nodes: [{ id: 'a', name: 'Pedido pago' }, { id: 'b', name: 'Emitir NF' }, { id: 'c', name: 'Reservar estoque' }, { id: 'd', name: 'Avisar cliente' }],
      edges: [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'b', to: 'd' }, { from: 'c', to: 'd' }, { from: 'd', to: 'a' }],
    };
    const g = layout(view, data);
    const x = Object.fromEntries(g.nodes.map((n) => [n.id, n.x]));
    expect(x.a).toBeLessThan(x.b!);
    expect(x.b).toBe(x.c);
    expect(x.d).toBeGreaterThan(x.b!);
    expect(g.edges).toHaveLength(5);
  });
});
