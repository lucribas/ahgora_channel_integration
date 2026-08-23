import {
  expect,
  test,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';
import { resolve } from 'node:path';

interface ExtensionHarness {
  readonly context: BrowserContext;
  readonly serviceWorker: Worker;
  readonly panel: Page;
  readonly source: Page;
  readonly target: Page;
}

async function launchExtension(): Promise<ExtensionHarness> {
  const extensionPath = resolve(import.meta.dirname, '../../dist');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  let [serviceWorker] = context.serviceWorkers();
  serviceWorker ??= await context.waitForEvent('serviceworker');
  const extensionId = new URL(serviceWorker.url()).host;
  const source = await context.newPage();
  await source.goto('http://127.0.0.1:4174/tests/fixtures/e2e/ahgora.html');
  const target = await context.newPage();
  await target.goto('http://127.0.0.1:4174/tests/fixtures/e2e/channel.html');
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/src/ui/side-panel.html`);
  await expect(
    panel.getByText('Registre as duas abas e configure a operação.'),
  ).toBeVisible();
  return { context, serviceWorker, panel, source, target };
}

test('carrega duas páginas sintéticas/iframe e mantém a prévia inicialmente vazia', async () => {
  const harness = await launchExtension();
  try {
    await expect(harness.source.locator('#mirror')).toBeVisible();
    await expect(
      harness.source.frameLocator('#mirror').getByText('Horas Trabalhadas'),
    ).toBeVisible();
    await expect(
      harness.target.getByRole('heading', { name: 'Channel sintético' }),
    ).toBeVisible();
    await seedPreview(harness.serviceWorker);
    await harness.panel.reload();

    await expect(
      harness.panel.getByRole('heading', { name: 'Ahgora para Channel' }),
    ).toBeVisible();
    await expect(harness.panel.locator('#month-field')).toBeHidden();
    await expect(harness.panel.locator('#start-field')).toBeHidden();
    await expect(harness.panel.locator('#end-field')).toBeHidden();
    await harness.panel.locator('#period-kind').selectOption('month');
    await expect(harness.panel.locator('#month-field')).toBeVisible();
    await expect(harness.panel.locator('#start-field')).toBeHidden();
    await expect(harness.panel.locator('#end-field')).toBeHidden();
    await harness.panel.locator('#period-kind').selectOption('range');
    await expect(harness.panel.locator('#month-field')).toBeHidden();
    await expect(harness.panel.locator('#start-field')).toBeVisible();
    await expect(harness.panel.locator('#end-field')).toBeVisible();
    await harness.panel.locator('#period-kind').selectOption('default');
    await expect(
      harness.panel.getByText('Enviado', { exact: false }),
    ).toBeVisible();
    await expect(harness.panel.getByText('indisponível')).toBeVisible();
    await expect(
      harness.panel.getByRole('checkbox', { name: /2026-07-26/ }),
    ).not.toBeChecked();
    await expect(
      harness.panel.getByRole('button', { name: 'Aplicar selecionados' }),
    ).toBeDisabled();
    await expect(harness.panel.locator('#total-captured')).toHaveText(
      '08:00 · 1 registro',
    );
    await expect(harness.panel.locator('#total-review')).toHaveText(
      '08:00 · 1 item',
    );
    await expect(harness.panel.locator('#total-selected')).toHaveText(
      '00:00 · 0 itens',
    );

    const itemCheckbox = harness.panel.getByRole('checkbox', {
      name: /2026-07-26/,
    });
    await itemCheckbox.check();
    await expect(harness.panel.locator('#total-selected')).toHaveText(
      '08:00 · 1 item',
    );
    await expect(
      harness.panel.getByRole('button', { name: 'Aplicar selecionados' }),
    ).toBeEnabled();
    await harness.panel.getByRole('button', { name: 'Recusar' }).click();
    await expect(harness.panel.locator('#total-selected')).toHaveText(
      '00:00 · 0 itens',
    );
    await expect(itemCheckbox).not.toBeChecked();
    await expect(harness.panel.locator('button[type="submit"]')).toHaveCount(0);
  } finally {
    await harness.context.close();
  }
});

test('duplo clique em dry-run dispara uma ação, não altera/submete Channel e reidrata', async () => {
  const harness = await launchExtension();
  try {
    await seedPreview(harness.serviceWorker);
    await harness.panel.reload();
    const before = await harness.target.locator('body').innerHTML();
    await harness.panel
      .getByRole('button', { name: 'Executar dry-run' })
      .dblclick();
    await expect(harness.panel.getByText(/Dry-run concluído/)).toBeVisible();
    const operation = await harness.serviceWorker.evaluate(async () => {
      const stored = await chrome.storage.session.get('operationData');
      return stored.operationData as { phase: string; revision: number };
    });
    expect(operation).toMatchObject({
      phase: 'dry-run',
      revision: 2,
    });
    await harness.panel.reload();
    await expect(harness.panel.getByText(/Dry-run concluído/)).toBeVisible();
    expect(await harness.target.locator('body').innerHTML()).toBe(before);
    expect(
      await harness.target.evaluate(
        () =>
          (globalThis as typeof globalThis & { __submitCount?: number })
            .__submitCount,
      ),
    ).toBe(0);
  } finally {
    await harness.context.close();
  }
});

async function seedPreview(worker: Worker): Promise<void> {
  await worker.evaluate(async () => {
    await chrome.storage.session.set({
      operationData: {
        version: 1,
        revision: 1,
        operationId: 'e2e-operation',
        phase: 'preview',
        sourceTab: { id: 1, origin: 'http://127.0.0.1:4174' },
        targetTab: { id: 2, origin: 'http://127.0.0.1:4174' },
        resolvedPeriod: {
          mode: 'month',
          start: '2026-06-26',
          end: '2026-07-25',
          mirrorMonths: ['2026-07'],
        },
        sourceRows: [
          { date: '2026-07-26', duration: '08:00', durationMinutes: 480 },
        ],
        targetRows: [],
        items: [
          {
            id: '2026-07-26',
            date: '2026-07-26',
            ahgoraDuration: '08:00',
            status: 'missing',
            decision: 'pending',
          },
        ],
        queue: [],
        queueIndex: 0,
        message: 'Prévia pronta. Nenhum item foi selecionado automaticamente.',
      },
    });
  });
}
