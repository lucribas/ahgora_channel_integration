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
    await expect(
      harness.panel.getByRole('heading', {
        name: '1. Abrir, autenticar e conectar',
      }),
    ).toBeVisible();
    await expect(harness.panel.locator('#manual-registration')).toBeHidden();
    await expect(harness.panel.locator('#ahgora-progress')).toHaveAttribute(
      'value',
      '0',
    );
    await expect(harness.panel.locator('#channel-progress')).toHaveAttribute(
      'value',
      '0',
    );
    await expect(
      harness.panel.locator('#login-source-progress'),
    ).toHaveAttribute('value', '0');
    await expect(
      harness.panel.locator('#login-target-progress'),
    ).toHaveAttribute('value', '0');
    await expect(harness.panel.locator('#write-progress')).toHaveAttribute(
      'value',
      '0',
    );
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
    await expect(
      harness.panel.getByRole('checkbox', { name: /2026-07-26/ }),
    ).not.toBeChecked();
    const updatableRow = harness.panel
      .getByRole('listitem')
      .filter({ hasText: '26/07/2026' });
    await expect(updatableRow).toHaveClass(/status-updatable/);
    const equalRow = harness.panel
      .getByRole('listitem')
      .filter({ hasText: 'Já igual' });
    await expect(equalRow).toBeVisible();
    await expect(equalRow.locator('input[type="checkbox"]')).toHaveCount(0);
    await expect(equalRow.getByRole('button')).toHaveCount(0);
    await expect(equalRow).toHaveClass(/status-success/);
    await expect(
      harness.panel.getByRole('listitem').filter({ hasText: 'Divergente' }),
    ).toHaveClass(/status-divergent/);
    await expect(
      harness.panel.getByRole('listitem').filter({ hasText: 'Bloqueado' }),
    ).toHaveClass(/status-error/);
    await expect(
      harness.panel.getByRole('button', { name: 'Enviar selecionados' }),
    ).toBeHidden();
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
      harness.panel.getByRole('button', { name: 'Enviar selecionados' }),
    ).toBeEnabled();
    await expect(
      harness.panel.getByRole('button', { name: 'Selecionar restantes' }),
    ).toBeVisible();
    await harness.panel.getByRole('button', { name: 'Recusar' }).click();
    await expect(harness.panel.locator('#total-selected')).toHaveText(
      '00:00 · 0 itens',
    );
    await expect(itemCheckbox).not.toBeChecked();
    await expect(
      harness.panel.getByRole('button', { name: 'Enviar selecionados' }),
    ).toBeHidden();

    await harness.serviceWorker.evaluate(async () => {
      const stored = await chrome.storage.session.get('operationData');
      const operation = stored.operationData as {
        items: Array<Record<string, unknown>>;
      };
      await chrome.storage.session.set({
        operationData: {
          ...operation,
          phase: 'completed',
          queue: ['2026-07-26'],
          queueIndex: 1,
          items: operation.items.map((item) =>
            item.id === '2026-07-26'
              ? {
                  ...item,
                  decision: 'selected',
                  result: 'filled',
                  channelDuration: '08:00',
                }
              : item,
          ),
          writeProgress: {
            status: 'done',
            completedItems: 1,
            totalItems: 1,
            detail: '1 de 1 apontamento enviado e confirmado pelo Channel.',
          },
        },
      });
    });
    await harness.panel.reload();
    const confirmedRow = harness.panel
      .getByRole('listitem')
      .filter({ hasText: '26/07/2026' });
    await expect(confirmedRow).toHaveClass(/status-success/);
    await expect(confirmedRow).toContainText('Já igual');
    await expect(confirmedRow).toContainText('Enviado e confirmado');
    await expect(harness.panel.locator('#preview-status')).toHaveClass(
      /success/,
    );
    await expect(harness.panel.locator('#preview-status')).toContainText(
      'Envio concluído com sucesso',
    );
    for (const buttonName of [
      'Selecionar restantes',
      'Executar dry-run',
      'Enviar selecionados',
      'Cancelar operação',
    ])
      await expect(
        harness.panel.getByRole('button', { name: buttonName }),
      ).toBeHidden();
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
    await harness.panel.getByRole('checkbox', { name: /2026-07-26/ }).check();
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
      revision: 3,
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

test('explica a permissão recusada e oferece nova tentativa', async () => {
  const harness = await launchExtension();
  try {
    await harness.serviceWorker.evaluate(async () => {
      const stored = await chrome.storage.session.get('operationData');
      const operation = stored.operationData as Record<string, unknown>;
      await chrome.storage.session.set({
        operationData: {
          ...operation,
          revision: 1,
          loginPreparation: {
            ahgora: 'awaiting-user',
            channel: 'awaiting-user',
            ahgoraDetail:
              'Permissão recusada. Faça login manualmente ou tente concedê-la novamente.',
            channelDetail:
              'Permissão recusada. Faça login manualmente ou tente concedê-la novamente.',
            autoSubmit: false,
            permissionDenied: true,
          },
        },
      });
    });
    await harness.panel.reload();

    await expect(
      harness.panel.getByRole('button', {
        name: 'Permitir acesso e tentar novamente',
      }),
    ).toBeVisible();
    await expect(harness.panel.locator('#login-permission-hint')).toContainText(
      'é necessária',
    );
    await expect(
      harness.panel.locator('#login-source-progress'),
    ).toHaveAttribute('value', '50');
    await expect(
      harness.panel.locator('#login-target-progress'),
    ).toHaveAttribute('value', '50');

    await harness.serviceWorker.evaluate(async () => {
      const stored = await chrome.storage.session.get('operationData');
      const operation = stored.operationData as {
        loginPreparation: Record<string, unknown>;
      };
      await chrome.storage.session.set({
        operationData: {
          ...operation,
          loginPreparation: {
            ...operation.loginPreparation,
            autoSubmit: true,
            permissionDenied: false,
          },
        },
      });
    });
    await harness.panel.reload();
    await expect(
      harness.panel.getByRole('button', {
        name: 'Verificar logins novamente',
      }),
    ).toBeVisible();
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
          {
            id: '2026-07-27',
            date: '2026-07-27',
            ahgoraDuration: '08:00',
            channelDuration: '08:00',
            status: 'equal',
            decision: 'pending',
          },
          {
            id: '2026-07-28',
            date: '2026-07-28',
            ahgoraDuration: '08:00',
            channelDuration: '07:30',
            status: 'divergent',
            decision: 'pending',
          },
          {
            id: '2026-07-29',
            date: '2026-07-29',
            ahgoraDuration: '—',
            status: 'blocked',
            decision: 'pending',
            warning: 'Batidas inválidas.',
          },
        ],
        queue: [],
        queueIndex: 0,
        message: 'Prévia pronta. Nenhum item foi selecionado automaticamente.',
      },
    });
  });
}
