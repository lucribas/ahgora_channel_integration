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
  await expect(panel.locator('#operation-status')).toHaveText(
    'Registre as duas abas e configure a operação.',
  );
  return { context, serviceWorker, panel, source, target };
}

test('carrega duas páginas sintéticas/iframe e mantém a prévia inicialmente vazia', async () => {
  const harness = await launchExtension();
  try {
    const now = new Date();
    const currentMonth = `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    await expect(harness.panel.locator('#period-kind')).toHaveValue('month');
    await expect(harness.panel.locator('#month')).toHaveValue(currentMonth);
    await harness.panel.locator('#capture-card > summary').click();
    await expect(harness.panel.locator('#capture-card')).toHaveAttribute(
      'open',
      '',
    );
    await expect(harness.panel.locator('#login-card')).not.toHaveAttribute(
      'open',
      '',
    );
    await expect(harness.panel.locator('#month-field')).toBeVisible();
    await harness.panel.locator('#config-card > summary').click();
    await expect(harness.panel.locator('#config-card')).toHaveAttribute(
      'open',
      '',
    );
    await expect(harness.panel.locator('#capture-card')).not.toHaveAttribute(
      'open',
      '',
    );
    await harness.panel.locator('#login-card > summary').click();
    await expect(harness.source.locator('#mirror')).toBeVisible();
    await expect(
      harness.source.frameLocator('#mirror').getByText('Horas Trabalhadas'),
    ).toBeVisible();
    await expect(
      harness.target.getByRole('heading', { name: 'Channel sintético' }),
    ).toBeVisible();
    await seedPreview(harness.serviceWorker);
    await harness.panel.reload();
    await expect(harness.panel.locator('#font-scale')).toHaveText('130%');

    await expect(
      harness.panel.getByRole('heading', { name: 'Ahgora para Channel' }),
    ).toBeVisible();
    await expect(harness.panel.locator('.hero-logo')).toBeVisible();
    await expect(
      harness.panel.getByRole('heading', {
        name: '1. Abrir, autenticar e conectar',
      }),
    ).toBeVisible();
    await expect(
      harness.panel.getByRole('heading', {
        name: '2. Definição de marcações de ponto no Channel',
      }),
    ).toBeVisible();
    await expect(
      harness.panel.getByRole('heading', {
        name: '5. Revisar e selecionar dias',
      }),
    ).toBeVisible();
    await expect(
      harness.panel.getByRole('heading', { name: '6. Enviar ao Channel' }),
    ).toBeVisible();
    await expect(harness.panel.locator('#login-card')).not.toHaveAttribute(
      'open',
      '',
    );
    await expect(harness.panel.locator('#login-summary')).toHaveText(
      'Concluído',
    );
    await expect(harness.panel.locator('#flow-login')).toHaveClass(/done/);
    await expect(harness.panel.locator('#flow-review')).toHaveClass(/current/);
    await harness.panel.locator('#login-card > summary').click();
    await expect(harness.panel.locator('#login-card')).toHaveAttribute(
      'open',
      '',
    );
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
    await harness.panel.locator('#capture-card > summary').click();
    await harness.panel.locator('#period-kind').selectOption('month');
    await expect(harness.panel.locator('#month-field')).toBeVisible();
    await expect(harness.panel.locator('#start-field')).toBeHidden();
    await expect(harness.panel.locator('#end-field')).toBeHidden();
    await harness.panel.locator('#period-kind').selectOption('range');
    await expect(harness.panel.locator('#month-field')).toBeHidden();
    await expect(harness.panel.locator('#start-field')).toBeVisible();
    await expect(harness.panel.locator('#end-field')).toBeVisible();
    await harness.panel.locator('#period-kind').selectOption('default');
    await harness.panel.locator('#review-card > summary').click();
    await expect(
      harness.panel.getByRole('heading', { name: '6. Enviar ao Channel' }),
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
    const deleteEqual = equalRow.getByRole('button', {
      name: /Excluir marcação 08:00/,
    });
    await expect(deleteEqual).toBeVisible();
    const dialogPromise = harness.panel.waitForEvent('dialog');
    const deleteClick = deleteEqual.click();
    const dialog = await dialogPromise;
    expect(dialog.message()).toContain('Excluir definitivamente do Channel');
    await dialog.dismiss();
    await deleteClick;
    await expect(equalRow).toContainText('Já igual');
    await expect(equalRow).toHaveClass(/status-success/);
    const divergentRow = harness.panel
      .getByRole('listitem')
      .filter({ hasText: 'Divergente' });
    await expect(divergentRow).toHaveClass(/status-divergent/);
    await expect(
      divergentRow.getByRole('button', { name: /Excluir marcação 07:30/ }),
    ).toBeVisible();
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
    const itemTag = harness.panel.getByRole('combobox', {
      name: /TAG da marcação 1 para 2026-07-26/,
    });
    const firstMarking = updatableRow.getByRole('group', {
      name: /Marcação 1/,
    });
    await expect(itemTag).toHaveValue('tag-default');
    await expect(itemTag.locator('option').first()).toContainText('Padrão');
    const sourceSelect = harness.panel.getByRole('combobox', {
      name: /Origem da marcação 1 para 2026-07-26/,
    });
    await expect(sourceSelect).toHaveValue('tags');
    await sourceSelect.selectOption('reunioes-por-area');
    const ragSelect = harness.panel.locator('.allocation-rag-select');
    await expect(ragSelect).toBeVisible();
    await harness.panel
      .getByPlaceholder('Nome, grupo ou destino')
      .fill('Lightning Talk');
    await expect(ragSelect.locator('option')).toHaveCount(2);
    await expect(ragSelect.locator('option')).toContainText([
      'CERTI Informa — Projeto',
      'Lightning Talk — Avulso',
    ]);
    await ragSelect.selectOption({ label: 'Lightning Talk — Avulso' });
    await expect(firstMarking).toContainText(
      'Destino: Avulso · CERTI · 13. Formação/Capacitação',
    );
    await expect(
      firstMarking.getByText('TAG de projeto/atividade contextual'),
    ).toHaveCount(0);
    await sourceSelect.selectOption('tags');
    await expect(itemTag).toBeVisible();
    await itemTag.selectOption('tag-secondary');
    await expect(itemTag).toHaveValue('tag-secondary');

    await firstMarking
      .getByRole('combobox', { name: /Forma/ })
      .selectOption('duration');
    await updatableRow
      .getByRole('textbox', { name: /Duração.*marcação 1/ })
      .fill('03:00');
    await updatableRow
      .getByRole('textbox', { name: /Duração.*marcação 1/ })
      .press('Tab');
    await expect(updatableRow.getByRole('group')).toHaveCount(2);
    await expect(updatableRow.getByText('Saldo restante')).toBeVisible();
    await expect(updatableRow).toContainText('05:00 · 62.5% do dia');
    await expect(
      updatableRow.getByRole('textbox', { name: /Duração.*marcação 2/ }),
    ).toHaveValue('05:00');
    await expect(
      updatableRow.getByRole('combobox', {
        name: /TAG da marcação 2 para 2026-07-26/,
      }),
    ).toHaveValue('tag-default');

    await updatableRow
      .getByRole('group', { name: /Marcação 2/ })
      .getByRole('combobox', { name: /Forma/ })
      .selectOption('percentage');
    await updatableRow
      .getByRole('textbox', { name: /Percentual.*marcação 2/ })
      .fill('25');
    await updatableRow
      .getByRole('textbox', { name: /Percentual.*marcação 2/ })
      .press('Tab');
    await expect(updatableRow.getByRole('group')).toHaveCount(3);
    await expect(updatableRow).toContainText('03:00 · 37.5% do dia');
    await expect(
      updatableRow.getByRole('textbox', { name: /Percentual.*marcação 3/ }),
    ).toHaveValue('37.5');
    await expect(updatableRow).toContainText(
      '3 marcação(ões) · Total 08:00 · Distribuído 08:00 · Falta 00:00',
    );
    await itemCheckbox.check();
    await expect(harness.panel.locator('#flow-review')).toHaveClass(/done/);
    await expect(harness.panel.locator('#flow-send')).toHaveClass(/current/);
    await expect(harness.panel.locator('#total-selected')).toHaveText(
      '08:00 · 1 item',
    );
    await expect(
      harness.panel.getByRole('button', { name: 'Selecionar restantes' }),
    ).toBeVisible();
    await expect(harness.panel.locator('#review-actions')).toBeVisible();
    await expect(
      harness.panel.locator('#review-actions #select-remaining'),
    ).toBeVisible();
    await expect(
      harness.panel.getByRole('button', { name: /Recusar|Recusado/ }),
    ).toHaveCount(0);
    await harness.panel.locator('#send-card > summary').click();
    await expect(
      harness.panel.getByRole('button', { name: 'Enviar selecionados' }),
    ).toBeEnabled();
    await expect(harness.panel.locator('#send-actions')).toBeVisible();
    await expect(harness.panel.locator('#send-actions #apply')).toBeVisible();
    await expect(harness.panel.locator('#review-card')).not.toHaveAttribute(
      'open',
      '',
    );
    await harness.panel.locator('#review-card > summary').click();
    await itemCheckbox.uncheck();
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
    await harness.panel.locator('#review-card > summary').click();
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
    await harness.panel.locator('#review-card > summary').click();
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
    await harness.panel.locator('#review-card > summary').click();
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

test('nova operação preserva conexões concluídas e limpa somente o trabalho anterior', async () => {
  const harness = await launchExtension();
  try {
    await seedPreview(harness.serviceWorker);
    await harness.serviceWorker.evaluate(async () => {
      const stored = await chrome.storage.session.get('operationData');
      const operation = stored.operationData as Record<string, unknown>;
      await chrome.storage.session.set({
        operationData: {
          ...operation,
          phase: 'completed',
          loginPreparation: {
            ahgora: 'ready',
            channel: 'ready',
            ahgoraDetail: 'Ahgora conectado.',
            channelDetail: 'Channel conectado.',
            autoSubmit: true,
            sourceTabId: 1,
            targetTabId: 2,
          },
        },
      });
    });
    await harness.panel.reload();
    await expect(harness.panel.locator('#login-summary')).toHaveText(
      'Concluído',
    );

    await harness.panel.getByRole('button', { name: 'Nova operação' }).click();

    await expect(harness.panel.locator('#login-summary')).toHaveText(
      'Concluído',
    );
    await expect(harness.panel.locator('#login-card')).not.toHaveAttribute(
      'open',
      '',
    );
    await expect(harness.panel.locator('#operation-status')).toContainText(
      'conexões Ahgora e Channel preservadas',
    );
    await expect(harness.panel.locator('#preview')).toBeEmpty();
    const persisted = await harness.serviceWorker.evaluate(async () => {
      const stored = await chrome.storage.session.get('operationData');
      return stored.operationData as {
        operationId: string;
        phase: string;
        sourceTab: { id: number; origin: string };
        targetTab: { id: number; origin: string };
        items: unknown[];
        queue: unknown[];
        queueIndex: number;
      };
    });
    expect(persisted).toMatchObject({
      phase: 'setup',
      sourceTab: { id: 1, origin: 'http://127.0.0.1:4174' },
      targetTab: { id: 2, origin: 'http://127.0.0.1:4174' },
      items: [],
      queue: [],
      queueIndex: 0,
    });
    expect(persisted.operationId).not.toBe('e2e-operation');
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

test('permite parar login, captura e envio somente enquanto estão em execução', async () => {
  const harness = await launchExtension();
  try {
    await harness.serviceWorker.evaluate(async () => {
      const stored = await chrome.storage.session.get('operationData');
      const operation = stored.operationData as Record<string, unknown>;
      await chrome.storage.session.set({
        operationData: {
          ...operation,
          revision: Number(operation.revision) + 1,
          phase: 'capturing',
          inFlight: 'capture',
          captureProgress: {
            ahgora: { status: 'running', detail: 'Consultando Ahgora…' },
            channel: { status: 'waiting', detail: 'Aguardando Ahgora.' },
          },
        },
      });
    });
    await harness.panel.reload();
    await harness.panel.locator('#capture-card > summary').click();
    await expect(
      harness.panel.getByRole('button', { name: 'Parar captura' }),
    ).toBeVisible();
    await harness.panel.getByRole('button', { name: 'Parar captura' }).click();
    await expect(harness.panel.locator('#ahgora-progress-state')).toHaveText(
      'Interrompido',
    );
    await expect(
      harness.panel.getByRole('button', { name: 'Parar captura' }),
    ).toBeHidden();

    await harness.serviceWorker.evaluate(async () => {
      const stored = await chrome.storage.session.get('operationData');
      const operation = stored.operationData as Record<string, unknown>;
      await chrome.storage.session.set({
        operationData: {
          ...operation,
          revision: Number(operation.revision) + 1,
          phase: 'preview',
          inFlight: 'apply',
          writeProgress: {
            status: 'running',
            completedItems: 1,
            totalItems: 3,
            detail: 'Enviando a segunda marcação…',
          },
        },
      });
    });
    await harness.panel.reload();
    await harness.panel.locator('#send-card > summary').click();
    await expect(
      harness.panel.getByRole('button', { name: 'Parar envio' }),
    ).toBeVisible();
    await harness.panel.getByRole('button', { name: 'Parar envio' }).click();
    await expect(harness.panel.locator('#write-progress-state')).toContainText(
      'Parado · 1 de 3',
    );
    await expect(
      harness.panel.getByRole('button', { name: 'Parar envio' }),
    ).toBeHidden();

    await harness.serviceWorker.evaluate(async () => {
      const stored = await chrome.storage.session.get('operationData');
      const operation = stored.operationData as Record<string, unknown>;
      await chrome.storage.session.set({
        operationData: {
          ...operation,
          revision: Number(operation.revision) + 1,
          phase: 'setup',
          inFlight: undefined,
          loginPreparation: {
            ahgora: 'opening',
            channel: 'submitted',
            ahgoraDetail: 'Abrindo Ahgora…',
            channelDetail: 'Confirmando Channel…',
            autoSubmit: true,
          },
        },
      });
    });
    await harness.panel.reload();
    await expect(
      harness.panel.getByRole('button', { name: 'Parar login' }),
    ).toBeVisible();
    await harness.panel.getByRole('button', { name: 'Parar login' }).click();
    await expect(harness.panel.locator('#login-source-state')).toHaveText(
      'Interrompido',
    );
    await expect(harness.panel.locator('#login-target-state')).toHaveText(
      'Interrompido',
    );
    await expect(
      harness.panel.getByRole('button', { name: 'Parar login' }),
    ).toBeHidden();
  } finally {
    await harness.context.close();
  }
});

test('gerencia TAGs dependentes, padrão e tamanho persistente das letras', async () => {
  const harness = await launchExtension();
  try {
    await harness.serviceWorker.evaluate(async () => {
      await chrome.storage.local.set({
        extensionSettings: {
          version: 1,
          tags: [],
          fontScale: 1,
          catalog: {
            fetchedAt: '2026-08-23T12:00:00.000Z',
            projects: [
              {
                id: '11',
                label: 'P11 PROJETO TESTE',
                activities: [
                  { id: '111', label: '1.1 ATIVIDADE A' },
                  { id: '112', label: '1.2 ATIVIDADE B' },
                ],
              },
              {
                id: '22',
                label: 'P22 OUTRO PROJETO',
                activities: [{ id: '221', label: '2.1 ATIVIDADE C' }],
              },
            ],
          },
        },
      });
    });
    await harness.panel.reload();
    await harness.panel.locator('#config-card > summary').click();

    const projectSelect = harness.panel.locator('#tag-project');
    await projectSelect.selectOption('11');
    await expect(harness.panel.locator('#tag-activity')).toBeEnabled();
    await expect(harness.panel.locator('#tag-activity option')).toHaveText([
      'Escolha uma atividade',
      '1.1 ATIVIDADE A',
      '1.2 ATIVIDADE B',
    ]);
    await projectSelect.selectOption('22');
    await expect(harness.panel.locator('#tag-activity option')).toHaveText([
      'Escolha uma atividade',
      '2.1 ATIVIDADE C',
    ]);
    await projectSelect.selectOption('11');
    await expect(harness.panel.locator('#tag-activity option')).toHaveText([
      'Escolha uma atividade',
      '1.1 ATIVIDADE A',
      '1.2 ATIVIDADE B',
    ]);

    const tagName = 'P11 PROJETO TESTE — 1.2 ATIVIDADE B';
    await expect(harness.panel.locator('#tag-name')).toBeEmpty();
    await expect(harness.panel.locator('#tag-name')).toHaveAttribute(
      'readonly',
      '',
    );
    await harness.panel.locator('#tag-activity').selectOption('112');
    await expect(harness.panel.locator('#tag-name')).toHaveValue(tagName);
    await harness.panel
      .getByText('Opções avançadas desta TAG', { exact: true })
      .click();
    await harness.panel.locator('#activity-type').fill('Consultoria');
    await harness.panel.locator('#task').fill('Desenvolvimento');
    await harness.panel.locator('#save-tag').click();

    const tagCard = harness.panel
      .getByRole('listitem')
      .filter({ hasText: tagName });
    await expect(tagCard).toContainText('P11 PROJETO TESTE');
    await expect(tagCard).toContainText('1.2 ATIVIDADE B');
    await expect(tagCard).toContainText('Tipo: Consultoria');
    await expect(tagCard).toContainText('Tarefa: Desenvolvimento');
    await expect(tagCard.getByRole('radio', { name: 'Padrão' })).toBeChecked();

    await harness.panel
      .getByRole('button', { name: 'Aumentar letras' })
      .click();
    await expect(harness.panel.locator('#font-scale')).toHaveText('140%');
    await harness.panel.reload();
    await harness.panel.locator('#config-card > summary').click();
    await expect(harness.panel.locator('#font-scale')).toHaveText('140%');
    await expect(
      harness.panel.getByRole('listitem').filter({ hasText: tagName }),
    ).toBeVisible();
    await expect(
      harness.panel.getByRole('listitem').filter({ hasText: tagName }),
    ).toContainText('Tipo: Consultoria · Tarefa: Desenvolvimento');
  } finally {
    await harness.context.close();
  }
});

test('salva conjuntos, ajusta estouro e cria regra semanal com múltiplos templates', async () => {
  const harness = await launchExtension();
  try {
    await seedPreview(harness.serviceWorker);
    await harness.serviceWorker.evaluate(async () => {
      await chrome.storage.local.set({
        extensionSettings: {
          version: 1,
          tags: [
            {
              id: 'tag-default',
              name: 'Padrão',
              projectId: '11',
              project: 'PROJETO PADRÃO',
              activityId: '111',
              activity: 'ATIVIDADE PADRÃO',
            },
            {
              id: 'tag-secondary',
              name: 'Secundária',
              projectId: '22',
              project: 'PROJETO SECUNDÁRIO',
              activityId: '222',
              activity: 'ATIVIDADE SECUNDÁRIA',
            },
          ],
          defaultTagId: 'tag-default',
          fontScale: 1.3,
          fontScaleCustomized: false,
          markingTemplates: [
            {
              id: 'nine-hours',
              name: 'Dia original de nove horas',
              sourceDurationMinutes: 540,
              createdAt: '2026-08-24T12:00:00.000Z',
              entries: [
                {
                  id: 'nine-hours::1',
                  tagId: 'tag-default',
                  percentage: 66.6667,
                  durationMinutes: 360,
                },
                {
                  id: 'nine-hours::2',
                  tagId: 'tag-secondary',
                  percentage: 33.3333,
                  durationMinutes: 180,
                },
              ],
            },
          ],
          templateRules: [],
        },
      });
    });
    await harness.panel.reload();
    await harness.panel.locator('#review-card > summary').click();
    const newDay = harness.panel
      .getByRole('listitem')
      .filter({ hasText: '26/07/2026' });
    await newDay
      .locator('.template-application select')
      .nth(1)
      .selectOption('duration');
    await expect(newDay.locator('.template-overflow')).toContainText(
      'excedem o dia em 01:00',
    );
    await newDay.getByRole('button', { name: 'Ajustar e aplicar' }).click();
    await expect(newDay.locator('.allocation-effective')).toHaveText([
      '05:20 · 66.67% do dia',
      '02:40 · 33.33% do dia',
    ]);

    await newDay
      .getByRole('button', { name: /Salvar marcações.*como conjunto/ })
      .click();
    await newDay.locator('.template-save input').fill('Domingo ajustado');
    await newDay.getByRole('button', { name: 'Salvar conjunto' }).click();

    await harness.panel.locator('#template-manager-card > summary').click();
    await expect(
      harness.panel.locator('#template-list').getByText('Domingo ajustado'),
    ).toBeVisible();
    await expect(harness.panel.locator('#template-list')).toContainText(
      '66.67% (05:20)',
    );
    await expect(harness.panel.locator('#template-list')).toContainText(
      '33.33% (02:40)',
    );

    await harness.panel.locator('#rule-name').fill('Segundas alternadas');
    await harness.panel.locator('#rule-every').fill('2');
    await harness.panel.locator('.weekday-picker input[value="1"]').check();
    await harness.panel.locator('#rule-start').fill('2026-08-24');
    await harness.panel
      .locator('input[name="rule-end"][value="after"]')
      .check();
    await expect(harness.panel.locator('#rule-end-count')).toBeEnabled();
    await harness.panel.locator('#rule-end-count').fill('4');
    await harness.panel
      .getByRole('button', { name: 'Adicionar conjunto' })
      .click();
    const shares = harness.panel.locator('.rule-template-share');
    await expect(shares).toHaveCount(2);
    await shares.nth(0).locator('input[type="number"]').fill('40');
    await shares
      .nth(1)
      .locator('select')
      .selectOption({ label: 'Domingo ajustado' });
    await shares.nth(1).locator('input[type="number"]').fill('60');
    await expect(harness.panel.locator('#rule-share-total')).toHaveText(
      'Total: 100%',
    );
    await harness.panel.getByRole('button', { name: 'Salvar regra' }).click();

    const rule = harness.panel
      .locator('#rule-list')
      .getByRole('listitem')
      .filter({ hasText: 'Segundas alternadas' });
    await expect(rule).toContainText(
      'A cada 2 semanas, em seg., a partir de 24/08/2026, por 4 ocorrência(s).',
    );
    await expect(rule).toContainText('40%');
    await expect(rule).toContainText('Domingo ajustado 60%');

    const stored = await harness.serviceWorker.evaluate(async () =>
      chrome.storage.local.get('extensionSettings'),
    );
    const saved = stored.extensionSettings as {
      markingTemplates: {
        name: string;
        entries: { percentage: number; durationMinutes: number }[];
      }[];
      templateRules: { name: string; templates: unknown[] }[];
    };
    expect(saved.markingTemplates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Domingo ajustado',
          entries: [
            expect.objectContaining({
              percentage: 66.6667,
              durationMinutes: 320,
            }),
            expect.objectContaining({
              percentage: 33.3333,
              durationMinutes: 160,
            }),
          ],
        }),
      ]),
    );
    expect(saved.templateRules).toEqual([
      expect.objectContaining({
        name: 'Segundas alternadas',
        templates: expect.arrayContaining([
          expect.objectContaining({ percentage: 40 }),
          expect.objectContaining({ percentage: 60 }),
        ]),
      }),
    ]);
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
        config: {
          project: 'PROJETO PADRÃO',
          activity: 'ATIVIDADE PADRÃO',
          activityType: 'Nenhum',
          task: 'Nenhum',
          period: { kind: 'default' },
          overrides: [],
          tags: [
            {
              id: 'tag-default',
              name: 'Padrão',
              projectId: '11',
              project: 'PROJETO PADRÃO',
              activityId: '111',
              activity: 'ATIVIDADE PADRÃO',
            },
            {
              id: 'tag-secondary',
              name: 'Secundária',
              projectId: '22',
              project: 'PROJETO SECUNDÁRIO',
              activityId: '222',
              activity: 'ATIVIDADE SECUNDÁRIA',
            },
          ],
          defaultTagId: 'tag-default',
        },
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
            tagId: 'tag-default',
            allocations: [
              {
                id: '2026-07-26',
                mode: 'percentage',
                value: '100',
                durationMinutes: 480,
                duration: '08:00',
                tagId: 'tag-default',
                isRemainder: true,
              },
            ],
          },
          {
            id: '2026-07-27',
            date: '2026-07-27',
            ahgoraDuration: '08:00',
            channelDuration: '08:00',
            channelMarkings: [
              {
                id: 'channel-27',
                duration: '08:00',
                durationMinutes: 480,
                project: 'PROJETO PADRÃO',
                activity: 'ATIVIDADE PADRÃO',
                canDelete: true,
              },
            ],
            status: 'equal',
            decision: 'pending',
          },
          {
            id: '2026-07-28',
            date: '2026-07-28',
            ahgoraDuration: '08:00',
            channelDuration: '07:30',
            channelMarkings: [
              {
                id: 'channel-28',
                duration: '07:30',
                durationMinutes: 450,
                project: 'PROJETO SECUNDÁRIO',
                activity: 'ATIVIDADE SECUNDÁRIA',
                canDelete: true,
              },
            ],
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
