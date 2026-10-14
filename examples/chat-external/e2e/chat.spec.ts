import { expect, test, type Page } from '@playwright/test';

/** The view runs two iframes deep: sandbox proxy (other origin) → MCP App (opaque origin). */
const view = (page: Page, n: number) => page.getByTestId('tool-call').nth(n).frameLocator('iframe').frameLocator('iframe');

async function run(page: Page, tool: string, args: Record<string, unknown>) {
  await page.getByLabel('Tool').selectOption(tool);
  await page.getByLabel('Arguments').fill(JSON.stringify(args));
  await page.getByRole('button', { name: 'Run' }).click();
}

test('table, form and human-confirmed plan render inside the chat through MCP Apps', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Tool')).toContainText('rh_colaboradores_list');

  // 1. a list becomes a table, with the PII already masked by the gateway
  await run(page, 'rh_colaboradores_list', { size: 3 });
  const table = view(page, 0);
  await expect(table.getByRole('row')).toHaveCount(4);
  await expect(table.getByText('Gabriela Pereira')).toBeVisible();
  await expect(table.getByText(/\*\*\*/).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/1-table.png', fullPage: true });

  // 2. invalid arguments come back as a prefilled form; submitting runs the tool through the relay
  await run(page, 'rh_marcacao_create', { tipo: 'entrada' });
  const form = view(page, 1);
  await expect(form.getByText('Required field.').first()).toBeVisible();
  await form.getByLabel(/colaborador_id/).fill('col-00001');
  await form.getByLabel(/data_hora/).fill('2026-10-09T08:00:00-03:00');
  await expect(form.getByText('Required field.')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/2-form.png', fullPage: true });
  await form.getByRole('button', { name: 'Submit' }).click();
  // the created marcação comes back as a card with its id
  const created = form.locator('dd', { hasText: /^mar-/ }).first();
  await expect(created).toBeVisible();
  const id = (await created.textContent())!.trim();
  await page.screenshot({ path: 'test-results/3-card.png', fullPage: true });

  // 3. a destructive tool does not run until a human confirms the plan
  await run(page, 'rh_marcacao_delete', { id });
  const plan = view(page, 2);
  await expect(plan.getByText('irreversible')).toBeVisible();
  await expect(page.getByTestId('tool-call').nth(2)).toBeVisible();
  const before = await page.request.post('/api/tool', { data: { name: 'rh_marcacoes_list', arguments: { colaborador: 'col-00001', desde: '2026-10-09' } } }).then((r) => r.json());
  const stillThere = JSON.stringify(before.result.structuredContent).includes(id);
  expect(stillThere).toBe(true);
  await page.screenshot({ path: 'test-results/4-plan.png', fullPage: true });
  await plan.getByRole('button', { name: 'Confirm' }).click();
  await expect(plan.getByText('irreversible')).toBeHidden();
  const after = await page.request.post('/api/tool', { data: { name: 'rh_marcacoes_list', arguments: { colaborador: 'col-00001', desde: '2026-10-09' } } }).then((r) => r.json());
  expect(JSON.stringify(after.result.structuredContent).includes(id)).toBe(false);
  await page.screenshot({ path: 'test-results/5-confirmed.png', fullPage: true });
});
