import {
  civilDate,
  defaultPeriod,
  formatDurationMinutes,
  formatBrazilianDate,
  monthPeriod,
  rangePeriod,
} from '../domain';
import type { PunchOverride } from '../domain';
import type {
  OperationConfig,
  PublicOperationState,
  TabRole,
} from '../application/types';
import type { IncomingMessage, UiResponse } from '../messaging/messages';
import { toSafeDiagnostic } from '../shared/diagnostics';

// A única conversão DOM fica concentrada nesta fronteira; cada chamada informa o tipo nativo esperado.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
const byId = <T extends HTMLElement>(id: string): T => {
  const value = document.getElementById(id);
  if (value === null) throw new Error(`Elemento ausente: ${id}`);
  return value as T;
};

let state: PublicOperationState | undefined;
let requestPending = false;
let transientMessage: string | undefined;
const AHGORA_MIRROR_ORIGIN = 'https://mirror.app.ahgora.com.br/*';

function logPanelFailure(messageType: string, error: unknown): void {
  console.error('[AhgoraChannel][Panel]', {
    status: 'failed',
    messageType,
    ...toSafeDiagnostic(error, 'ui'),
  });
}

async function send(message: IncomingMessage): Promise<void> {
  const isCancellation = message.type === 'CANCEL_OPERATION';
  if (requestPending && !isCancellation)
    throw new Error('Aguarde a ação atual terminar.');
  const ownsPending = !requestPending;
  if (ownsPending) requestPending = true;
  render();
  try {
    const response: UiResponse = await chrome.runtime.sendMessage(message);
    if (!response.ok) throw new Error(response.message ?? response.code);
    state = response.state;
    transientMessage = undefined;
  } finally {
    if (ownsPending) requestPending = false;
    render();
  }
}

async function refresh(): Promise<void> {
  const response: UiResponse = await chrome.runtime.sendMessage({
    type: 'GET_STATE',
  });
  if (!response.ok) throw new Error(response.message ?? response.code);
  state = response.state;
  render();
}

function operationId(): string {
  if (state === undefined) throw new Error('Operação não iniciada.');
  return state.operationId;
}

function readConfig(): OperationConfig {
  const project = byId<HTMLInputElement>('project').value.trim();
  const activity = byId<HTMLInputElement>('activity').value.trim();
  if (!project || !activity) throw new Error('Informe projeto e atividade.');
  const kind = byId<HTMLSelectElement>('period-kind').value;
  const period =
    kind === 'month'
      ? monthPeriod(byId<HTMLInputElement>('month').value)
      : kind === 'range'
        ? rangePeriod(
            civilDate(byId<HTMLInputElement>('start').value),
            civilDate(byId<HTMLInputElement>('end').value),
          )
        : defaultPeriod();
  return {
    project,
    activity,
    activityType:
      byId<HTMLInputElement>('activity-type').value.trim() || 'Nenhum',
    task: byId<HTMLInputElement>('task').value.trim() || 'Nenhum',
    period,
    overrides: parseOverrides(byId<HTMLTextAreaElement>('overrides').value),
  };
}

function parseOverrides(value: string): readonly PunchOverride[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [dateValue, timesValue] = line.split('=', 2);
      if (!dateValue || !timesValue)
        throw new Error(`Override inválido: ${line}`);
      return {
        date: civilDate(dateValue.trim()),
        times: timesValue.split(',').map((time) => time.trim()),
      };
    });
}

function render(): void {
  if (state === undefined) return;
  const busy = requestPending || state.inFlight !== undefined;
  document
    .querySelectorAll<HTMLButtonElement>('button')
    .forEach((button) => (button.disabled = busy));
  byId<HTMLButtonElement>('cancel').disabled =
    state.phase === 'cancelled' ||
    state.phase === 'completed' ||
    state.phase === 'dry-run';
  renderConfig();
  renderTab('source', state.sourceTab?.id, state.pendingRole);
  renderTab('target', state.targetTab?.id, state.pendingRole);
  byId<HTMLButtonElement>('apply').disabled = busy || !state.canApply;
  const advance = byId<HTMLButtonElement>('advance');
  advance.hidden =
    state.phase !== 'waiting-review' && state.phase !== 'partial';
  const currentItemId = state.queue[state.queueIndex];
  const currentResult = state.items.find(
    (item) => item.id === currentItemId,
  )?.result;
  advance.textContent =
    currentResult === 'filled'
      ? 'Revise/salve no Channel e avançar'
      : currentResult === 'already-correct'
        ? 'Item já correto — avançar'
        : 'Ignorar falha e avançar';
  byId<HTMLOutputElement>('operation-status').textContent =
    transientMessage ?? state.message ?? phaseLabel(state.phase);
  byId<HTMLElement>('totals').textContent =
    `${String(state.items.length)} itens · ${String(state.selectedCount)} selecionados`;
  byId<HTMLOutputElement>('total-captured').textContent = totalLabel(
    state.capturedMinutes,
    state.capturedCount,
    'registro',
  );
  byId<HTMLOutputElement>('total-review').textContent = totalLabel(
    state.reviewMinutes,
    state.reviewCount,
    'item',
  );
  byId<HTMLOutputElement>('total-selected').textContent = totalLabel(
    state.selectedMinutes,
    state.selectedCount,
    'item',
  );
  byId<HTMLElement>('effective-period').textContent = state.resolvedPeriod
    ? `Período efetivo: ${formatBrazilianDate(state.resolvedPeriod.start)} a ${formatBrazilianDate(state.resolvedPeriod.end)}`
    : '';
  const captured = state.sourceRows !== undefined;
  markStep('step-captured', captured);
  markStep(
    'step-validated',
    state.phase !== 'setup' && state.phase !== 'capturing' && captured,
  );
  const recognized = state.items.some(
    (item) => item.result === 'filled' || item.result === 'already-correct',
  );
  markStep('step-filled', recognized);
  markStep('step-confirmed', recognized);
  renderPreview();
}

function totalLabel(
  minutes: number,
  count: number,
  unit: 'item' | 'registro',
): string {
  const label = count === 1 ? unit : unit === 'item' ? 'itens' : 'registros';
  return `${formatDurationMinutes(minutes)} · ${String(count)} ${label}`;
}

function renderConfig(): void {
  const config = state?.config;
  if (!config) return;
  byId<HTMLInputElement>('project').value = config.project;
  byId<HTMLInputElement>('activity').value = config.activity;
  byId<HTMLInputElement>('activity-type').value = config.activityType;
  byId<HTMLInputElement>('task').value = config.task;
  const kind = config.period.kind;
  byId<HTMLSelectElement>('period-kind').value = kind;
  byId('month-field').hidden = kind !== 'month';
  byId('start-field').hidden = kind !== 'range';
  byId('end-field').hidden = kind !== 'range';
  if (kind === 'month')
    byId<HTMLInputElement>('month').value = config.period.month;
  if (kind === 'range') {
    byId<HTMLInputElement>('start').value = config.period.start;
    byId<HTMLInputElement>('end').value = config.period.end;
  }
  byId<HTMLTextAreaElement>('overrides').value = config.overrides
    .map((override) => `${override.date}=${override.times.join(',')}`)
    .join('\n');
}

function renderTab(
  role: TabRole,
  tabId: number | undefined,
  pending: TabRole | undefined,
): void {
  const output = byId<HTMLOutputElement>(`${role}-state`);
  output.textContent =
    tabId === undefined
      ? pending === role
        ? 'Clique no ícone nesta aba'
        : 'Não registrado'
      : `Registrado · aba ${String(tabId)}`;
  output.classList.toggle('ready', tabId !== undefined);
}

function renderPreview(): void {
  const container = byId<HTMLElement>('preview');
  container.replaceChildren(
    ...(state?.items ?? []).map((item) => {
      const row = document.createElement('article');
      row.className = 'item';
      row.setAttribute('role', 'listitem');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = item.decision === 'selected';
      checkbox.disabled =
        requestPending ||
        state?.inFlight !== undefined ||
        item.status !== 'missing' ||
        state?.phase !== 'preview';
      checkbox.setAttribute('aria-label', `Selecionar ${item.date}`);
      checkbox.addEventListener(
        'change',
        () =>
          void act({
            type: 'SET_ITEM_DECISION',
            operationId: operationId(),
            itemId: item.id,
            decision: checkbox.checked ? 'selected' : 'refused',
          }),
      );
      const body = document.createElement('div');
      const title = document.createElement('p');
      title.textContent = `${formatBrazilianDate(item.date)} · Ahgora ${item.ahgoraDuration}`;
      const meta = document.createElement('p');
      meta.className = 'meta';
      meta.textContent = `${statusLabel(item.status)}${item.channelDuration ? ` · Channel ${item.channelDuration}` : ''}${item.warning ? ` · ${item.warning}` : ''}`;
      body.append(title, meta);
      const action = document.createElement('button');
      action.type = 'button';
      if (item.result) {
        action.className = 'result';
        action.textContent = resultLabel(item.result);
        action.disabled = true;
      } else {
        action.textContent =
          item.decision === 'refused' ? 'Recusado' : 'Recusar';
        action.disabled =
          requestPending ||
          state?.inFlight !== undefined ||
          item.status !== 'missing' ||
          state?.phase !== 'preview';
        action.addEventListener(
          'click',
          () =>
            void act({
              type: 'SET_ITEM_DECISION',
              operationId: operationId(),
              itemId: item.id,
              decision: 'refused',
            }),
        );
      }
      row.append(checkbox, body, action);
      return row;
    }),
  );
}

function markStep(id: string, done: boolean): void {
  byId(id).classList.toggle('done', done);
}
function phaseLabel(phase: PublicOperationState['phase']): string {
  return (
    {
      setup: 'Registre as duas abas e configure a operação.',
      capturing: 'Capturando e comparando…',
      preview: 'Prévia pronta. Nenhum item foi selecionado automaticamente.',
      'dry-run': 'Dry-run concluído. Nenhuma página foi alterada.',
      'waiting-review':
        'Um item foi preenchido e reconhecido. Revise e salve manualmente no Channel antes de avançar.',
      partial:
        'Fila parcial. Revise o resultado e avance quando o formulário estiver pronto.',
      completed: 'Fila concluída sem envio pela extensão.',
      cancelled: 'Operação cancelada. Resultados anteriores foram preservados.',
      failed:
        'A operação falhou. Revise a mensagem e registre novamente a aba se necessário.',
    } satisfies Record<PublicOperationState['phase'], string>
  )[phase];
}
function statusLabel(status: string): string {
  return (
    (
      {
        missing: 'Novo',
        equal: 'Já igual',
        divergent: 'Divergente — não será alterado',
        blocked: 'Bloqueado',
      } as Record<string, string>
    )[status] ?? status
  );
}
function resultLabel(result: string): string {
  return (
    (
      {
        filled: 'Reconhecido no formulário',
        'already-correct': 'Já correto',
        skipped: 'Ignorado',
        'not-found': 'Não encontrado',
        'validation-error': 'Validação falhou',
        failed: 'Falhou',
      } as Record<string, string>
    )[result] ?? result
  );
}

async function act(message: IncomingMessage): Promise<void> {
  try {
    await send(message);
  } catch (error) {
    transientMessage =
      error instanceof Error ? error.message : 'Falha inesperada.';
    logPanelFailure(message.type, error);
    render();
  }
}

async function captureFromUi(): Promise<void> {
  try {
    await send({
      type: 'CAPTURE_AND_COMPARE',
      operationId: operationId(),
      config: readConfig(),
    });
  } catch (error) {
    transientMessage =
      error instanceof Error ? error.message : 'Configuração inválida.';
    logPanelFailure('CAPTURE_AND_COMPARE', error);
    render();
  }
}

byId('new-operation').addEventListener(
  'click',
  () => void act({ type: 'START_OPERATION', operationId: crypto.randomUUID() }),
);
byId('register-source').addEventListener('click', () => void registerAhgora());
byId('register-target').addEventListener(
  'click',
  () =>
    void act({
      type: 'SET_PENDING_ROLE',
      operationId: operationId(),
      role: 'target',
    }),
);
byId('capture').addEventListener('click', () => void captureFromUi());
byId('select-remaining').addEventListener(
  'click',
  () => void act({ type: 'SELECT_REMAINING', operationId: operationId() }),
);
byId('dry-run').addEventListener(
  'click',
  () => void act({ type: 'RUN_DRY_RUN', operationId: operationId() }),
);
byId('apply').addEventListener(
  'click',
  () => void act({ type: 'APPLY_SELECTED', operationId: operationId() }),
);
byId('advance').addEventListener(
  'click',
  () => void act({ type: 'ADVANCE_QUEUE', operationId: operationId() }),
);
byId('cancel').addEventListener(
  'click',
  () => void act({ type: 'CANCEL_OPERATION', operationId: operationId() }),
);
byId<HTMLSelectElement>('period-kind').addEventListener('change', (event) => {
  const kind = (event.currentTarget as HTMLSelectElement).value;
  byId('month-field').hidden = kind !== 'month';
  byId('start-field').hidden = kind !== 'range';
  byId('end-field').hidden = kind !== 'range';
});
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === 'session') void refresh();
});

async function registerAhgora(): Promise<void> {
  try {
    const granted = await chrome.permissions.request({
      origins: [AHGORA_MIRROR_ORIGIN],
    });
    if (!granted) {
      throw new Error(
        'Conceda acesso ao iframe do espelho Ahgora para continuar.',
      );
    }
    await send({
      type: 'SET_PENDING_ROLE',
      operationId: operationId(),
      role: 'source',
    });
  } catch (error) {
    transientMessage =
      error instanceof Error
        ? error.message
        : 'Não foi possível solicitar acesso ao espelho Ahgora.';
    logPanelFailure('REQUEST_AHGORA_MIRROR_PERMISSION', error);
    render();
  }
}

void (async () => {
  await refresh().catch(() => undefined);
  if (state === undefined)
    await send({ type: 'START_OPERATION', operationId: crypto.randomUUID() });
})();
