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
import { LOGIN_PERMISSION_ORIGINS } from '../sites/login';

// A única conversão DOM fica concentrada nesta fronteira; cada chamada informa o tipo nativo esperado.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
const byId = <T extends HTMLElement>(id: string): T => {
  const value = document.getElementById(id);
  if (value === null) throw new Error(`Elemento ausente: ${id}`);
  return value as T;
};

let state: PublicOperationState | undefined;
let requestPending = false;
let loginPermissionPending = false;
let transientMessage: string | undefined;

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
  const busy =
    requestPending || loginPermissionPending || state.inFlight !== undefined;
  document
    .querySelectorAll<HTMLButtonElement>('button')
    .forEach((button) => (button.disabled = busy));
  byId<HTMLButtonElement>('cancel').disabled =
    state.phase === 'cancelled' ||
    state.phase === 'completed' ||
    state.phase === 'dry-run';
  renderConfig();
  renderLoginPreparation();
  renderCaptureProgress();
  renderWriteProgress();
  renderTab('source', state.sourceTab?.id, state.pendingRole);
  renderTab('target', state.targetTab?.id, state.pendingRole);
  const bothRegistered = state.sourceTab && state.targetTab;
  const loginAttempted =
    state.loginPreparation !== undefined &&
    (state.loginPreparation.ahgora !== 'idle' ||
      state.loginPreparation.channel !== 'idle');
  byId<HTMLElement>('manual-registration').hidden =
    !loginAttempted || Boolean(bothRegistered);
  byId<HTMLElement>('registration-hint').textContent = bothRegistered
    ? 'Abas registradas automaticamente pela permissão opcional concedida na etapa anterior.'
    : 'Se alguma aba não foi registrada automaticamente, escolha Registrar, vá até ela e clique no ícone da extensão.';
  byId<HTMLButtonElement>('apply').disabled = busy || !state.canApply;
  const advance = byId<HTMLButtonElement>('advance');
  advance.hidden =
    state.inFlight !== undefined ||
    (state.phase !== 'waiting-review' && state.phase !== 'partial');
  const currentItemId = state.queue[state.queueIndex];
  const currentResult = state.items.find(
    (item) => item.id === currentItemId,
  )?.result;
  advance.textContent =
    currentResult === 'filled'
      ? 'Continuar após confirmação'
      : currentResult === 'already-correct'
        ? 'Item já correto — avançar'
        : 'Ignorar falha e avançar';
  renderPreviewActions(advance);
  renderPreviewStatus();
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
  markStep('step-sent', state.phase === 'completed');
  renderPreview();
}

function renderPreviewActions(advance: HTMLButtonElement): void {
  if (!state) return;
  const selectedSendable = state.items.some(
    (item) =>
      item.status === 'missing' &&
      item.decision === 'selected' &&
      item.result === undefined,
  );
  const showBatchActions = state.phase === 'preview' && selectedSendable;
  for (const id of ['select-remaining', 'dry-run', 'apply'] as const)
    byId<HTMLButtonElement>(id).hidden = !showBatchActions;
  const showCancel =
    selectedSendable &&
    state.phase !== 'cancelled' &&
    state.phase !== 'completed' &&
    state.phase !== 'dry-run';
  byId<HTMLButtonElement>('cancel').hidden = !showCancel;
  byId<HTMLElement>('preview-actions').hidden =
    !showBatchActions && !showCancel && advance.hidden;
  byId<HTMLElement>('send-warning').hidden = !showBatchActions;
}

function renderPreviewStatus(): void {
  if (!state) return;
  const currentState = state;
  const output = byId<HTMLOutputElement>('preview-status');
  const confirmed = currentState.items.filter(
    (item) => item.result === 'filled' || item.result === 'already-correct',
  ).length;
  const errors = currentState.items.filter(
    (item) =>
      item.result === 'failed' ||
      item.result === 'not-found' ||
      item.result === 'validation-error',
  ).length;
  const sending = currentState.inFlight === 'apply';
  const allQueuedConfirmed =
    currentState.queue.length > 0 &&
    currentState.queue.every((itemId) => {
      const result = currentState.items.find(
        (item) => item.id === itemId,
      )?.result;
      return result === 'filled' || result === 'already-correct';
    });
  output.hidden =
    !sending &&
    confirmed === 0 &&
    errors === 0 &&
    currentState.phase !== 'completed' &&
    currentState.phase !== 'partial';
  output.classList.toggle(
    'success',
    errors === 0 && confirmed > 0 && (!sending || allQueuedConfirmed),
  );
  output.classList.toggle(
    'error',
    errors > 0 || currentState.phase === 'partial',
  );
  output.classList.toggle('running', sending && !allQueuedConfirmed);
  output.textContent =
    errors > 0 || currentState.phase === 'partial'
      ? `Envio interrompido: ${String(confirmed)} confirmado(s) e ${String(errors)} com erro. Revise as linhas em vermelho.`
      : allQueuedConfirmed
        ? `Envio concluído com sucesso: ${String(confirmed)} apontamento(s) confirmado(s) pelo Channel.`
        : sending
          ? (currentState.writeProgress?.detail ??
            `Enviando ao Channel: ${String(confirmed)} confirmado(s)…`)
          : confirmed > 0 || currentState.phase === 'completed'
            ? `Envio concluído com sucesso: ${String(confirmed)} apontamento(s) confirmado(s) pelo Channel.`
            : '';
}

function renderLoginPreparation(): void {
  const preparation = state?.loginPreparation;
  renderLoginStatus(
    'source',
    preparation?.ahgora ?? 'idle',
    preparation?.ahgoraDetail ?? 'A página do Ahgora ainda não foi aberta.',
  );
  renderLoginStatus(
    'target',
    preparation?.channel ?? 'idle',
    preparation?.channelDetail ?? 'A página do Channel ainda não foi aberta.',
  );
  const denied = preparation?.permissionDenied === true;
  const loginPending =
    preparation?.ahgora === 'awaiting-user' ||
    preparation?.ahgora === 'submitted' ||
    preparation?.channel === 'awaiting-user' ||
    preparation?.channel === 'submitted';
  byId<HTMLButtonElement>('open-logins').textContent = denied
    ? 'Permitir acesso e tentar novamente'
    : loginPending
      ? 'Verificar logins novamente'
      : 'Abrir páginas e tentar login';
  byId<HTMLElement>('login-permission-hint').textContent = preparation
    ? denied
      ? 'A permissão aos hosts do Ahgora e Channel é necessária para detectar o preenchimento, acionar o login e conectar as páginas automaticamente. Clique no botão acima para solicitá-la novamente.'
      : preparation.autoSubmit
        ? 'Acesso opcional concedido: tentativa automática habilitada somente nestas páginas de login.'
        : preparation.ahgora !== 'idle' || preparation.channel !== 'idle'
          ? 'Sem acesso opcional: conclua o login manualmente nas páginas abertas.'
          : ''
    : '';
}

function renderLoginStatus(
  role: 'source' | 'target',
  status: NonNullable<PublicOperationState['loginPreparation']>[
    'ahgora' | 'channel'],
  detail: string,
): void {
  const output = byId<HTMLOutputElement>(`login-${role}-state`);
  output.textContent = {
    idle: 'Não aberto',
    opening: 'Abrindo…',
    'awaiting-user': 'Aguardando login',
    submitted: 'Login acionado',
    ready: 'Página de trabalho aberta',
    failed: 'Falha ao abrir',
  }[status];
  const bar = byId<HTMLProgressElement>(`login-${role}-progress`);
  if (status === 'opening' || status === 'submitted')
    bar.removeAttribute('value');
  else
    bar.value =
      status === 'ready' || status === 'failed'
        ? 100
        : status === 'awaiting-user'
          ? 50
          : 0;
  bar.classList.toggle('failed', status === 'failed');
  byId<HTMLElement>(`login-${role}-detail`).textContent = detail;
}

function renderCaptureProgress(): void {
  const progress = state?.captureProgress;
  renderSystemProgress(
    'ahgora',
    progress?.ahgora ?? {
      status: 'waiting',
      detail: 'A captura ainda não começou.',
    },
  );
  renderSystemProgress(
    'channel',
    progress?.channel ?? {
      status: 'waiting',
      detail: 'A consulta ainda não começou.',
    },
  );
}

function renderWriteProgress(): void {
  const progress = state?.writeProgress;
  const bar = byId<HTMLProgressElement>('write-progress');
  const completed = progress?.completedItems ?? 0;
  const total = progress?.totalItems ?? 0;
  bar.value = total > 0 ? Math.round((completed / total) * 100) : 0;
  bar.classList.toggle('failed', progress?.status === 'failed');
  byId<HTMLOutputElement>('write-progress-state').textContent = progress
    ? progress.status === 'done'
      ? 'Concluído'
      : progress.status === 'failed'
        ? `Interrompido · ${String(completed)} de ${String(total)}`
        : `${String(completed)} de ${String(total)}`
    : 'Aguardando';
  byId<HTMLElement>('write-progress-detail').textContent =
    progress?.detail ?? 'Selecione os dias que deseja enviar.';
}

function renderSystemProgress(
  system: 'ahgora' | 'channel',
  progress: NonNullable<PublicOperationState['captureProgress']>[
    'ahgora' | 'channel'],
): void {
  const bar = byId<HTMLProgressElement>(`${system}-progress`);
  if (progress.status === 'running') bar.removeAttribute('value');
  else
    bar.value =
      progress.status === 'done' || progress.status === 'failed' ? 100 : 0;
  bar.classList.toggle('failed', progress.status === 'failed');
  byId<HTMLOutputElement>(`${system}-progress-state`).textContent = {
    waiting: 'Aguardando',
    running: 'Em andamento',
    done: 'Concluído',
    failed: 'Falhou',
  }[progress.status];
  byId<HTMLElement>(`${system}-progress-detail`).textContent = progress.detail;
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
  byId<HTMLButtonElement>(`register-${role}`).hidden = tabId !== undefined;
}

function renderPreview(): void {
  const container = byId<HTMLElement>('preview');
  container.replaceChildren(
    ...(state?.items ?? []).map((item) => {
      const row = document.createElement('article');
      row.className = `item ${itemVisualClass(item)}`;
      row.setAttribute('role', 'listitem');
      const body = document.createElement('div');
      const title = document.createElement('p');
      title.textContent = `${formatBrazilianDate(item.date)} · Ahgora ${item.ahgoraDuration}`;
      const meta = document.createElement('p');
      meta.className = 'meta';
      const displayStatus =
        item.result === 'filled' || item.result === 'already-correct'
          ? 'equal'
          : item.status;
      meta.textContent = `${statusLabel(displayStatus)}${item.channelDuration ? ` · Channel ${item.channelDuration}` : ''}${item.result ? ` · ${resultLabel(item.result)}` : ''}${item.warning ? ` · ${item.warning}` : ''}`;
      body.append(title, meta);
      if (item.status !== 'missing' || item.result !== undefined) {
        row.classList.add('readonly');
        row.append(body);
        return row;
      }
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = item.decision === 'selected';
      checkbox.disabled =
        requestPending ||
        state?.inFlight !== undefined ||
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
      const action = document.createElement('button');
      action.type = 'button';
      action.textContent = item.decision === 'refused' ? 'Recusado' : 'Recusar';
      action.disabled =
        requestPending ||
        state?.inFlight !== undefined ||
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
      row.append(checkbox, body, action);
      return row;
    }),
  );
}

function itemVisualClass(item: PublicOperationState['items'][number]): string {
  if (item.status === 'divergent') return 'status-divergent';
  if (
    item.status === 'blocked' ||
    item.result === 'failed' ||
    item.result === 'not-found' ||
    item.result === 'validation-error'
  )
    return 'status-error';
  if (
    item.status === 'equal' ||
    item.result === 'filled' ||
    item.result === 'already-correct'
  )
    return 'status-success';
  if (item.result === undefined) return 'status-updatable';
  return 'status-neutral';
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
      'waiting-review': 'Apontamento confirmado pelo Channel.',
      partial:
        'Fila parcial. Revise o resultado e avance quando o formulário estiver pronto.',
      completed: 'Fila enviada e confirmada pelo Channel.',
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
        filled: 'Enviado e confirmado',
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
byId('open-logins').addEventListener('click', () => void openLoginPages());
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
    logPanelFailure('REGISTER_AHGORA', error);
    render();
  }
}

async function openLoginPages(): Promise<void> {
  if (loginPermissionPending) return;
  loginPermissionPending = true;
  render();
  let autoSubmit = false;
  try {
    autoSubmit = await chrome.permissions.request({
      origins: [...LOGIN_PERMISSION_ORIGINS],
    });
  } catch (error: unknown) {
    logPanelFailure('REQUEST_LOGIN_PERMISSION', error);
  } finally {
    loginPermissionPending = false;
  }
  await act({
    type: 'OPEN_LOGIN_PAGES',
    operationId: operationId(),
    autoSubmit,
  });
}

void (async () => {
  await refresh().catch(() => undefined);
  if (state === undefined)
    await send({ type: 'START_OPERATION', operationId: crypto.randomUUID() });
})();
