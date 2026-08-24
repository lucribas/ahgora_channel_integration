import {
  civilDate,
  defaultPeriod,
  formatDurationMinutes,
  formatBrazilianDate,
  monthPeriod,
  parseDurationMinutes,
  rangePeriod,
} from '../domain';
import type { PunchOverride } from '../domain';
import type {
  OperationConfig,
  PublicOperationState,
  TabRole,
} from '../application/types';
import {
  findRagItem,
  ragCatalogs,
  type RagCatalog,
  type RagItem,
} from '../application/rag';
import {
  createMarkingTemplate,
  describeTemplateRule,
  totalTemplateDuration,
} from '../application/marking-templates';
import {
  defaultExtensionSettings,
  loadExtensionSettings,
  saveExtensionSettings,
  type ChannelCatalogProject,
  type ChannelTag,
  type ExtensionSettings,
  type MarkingTemplate,
  type RuleTemplateShare,
  type TemplateApplicationRule,
  type Weekday,
} from '../application/settings';
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
let settings: ExtensionSettings = defaultExtensionSettings();
let catalogPending = false;
let tagEditorMessage = '';
let loginMonitorPending = false;
let loginCompletionObserved = false;
let deletingMarkingId: string | undefined;
let templateManagerMessage = '';
let templateSaveEditorItemId: string | undefined;
let ruleShareCounter = 0;

function logPanelFailure(messageType: string, error: unknown): void {
  console.error('[AhgoraChannel][Panel]', {
    status: 'failed',
    messageType,
    ...toSafeDiagnostic(error, 'ui'),
  });
}

async function send(message: IncomingMessage): Promise<void> {
  const isCancellation =
    message.type === 'CANCEL_OPERATION' ||
    message.type === 'STOP_CURRENT_ACTION';
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
  const defaultTag =
    settings.tags.find((tag) => tag.id === settings.defaultTagId) ??
    settings.tags[0];
  if (!defaultTag)
    throw new Error('Crie ao menos uma TAG de projeto e atividade.');
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
    project: defaultTag.project,
    activity: defaultTag.activity,
    activityType: defaultTag.activityType?.trim() || 'Nenhum',
    task: defaultTag.task?.trim() || 'Nenhum',
    period,
    overrides: parseOverrides(byId<HTMLTextAreaElement>('overrides').value),
    tags: settings.tags,
    defaultTagId: defaultTag.id,
    markingTemplates: settings.markingTemplates,
    templateRules: settings.templateRules,
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

function currentMonthValue(now: Date = new Date()): string {
  return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function resetCapturePeriodToCurrentMonth(): void {
  byId<HTMLSelectElement>('period-kind').value = 'month';
  byId<HTMLInputElement>('month').value = currentMonthValue();
  byId('month-field').hidden = false;
  byId('start-field').hidden = true;
  byId('end-field').hidden = true;
}

async function startNewOperation(): Promise<void> {
  await act({
    type: 'START_OPERATION',
    operationId: crypto.randomUUID(),
  });
  resetCapturePeriodToCurrentMonth();
}

function render(): void {
  if (state === undefined) return;
  const busy =
    requestPending ||
    loginPermissionPending ||
    catalogPending ||
    state.inFlight !== undefined;
  document
    .querySelectorAll<HTMLButtonElement>('button')
    .forEach((button) => (button.disabled = busy));
  byId<HTMLButtonElement>('cancel').disabled =
    state.phase === 'cancelled' ||
    state.phase === 'completed' ||
    state.phase === 'dry-run';
  renderConfig();
  renderSettings();
  renderTemplateManager();
  renderLoginPreparation();
  renderFlowOverview();
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
  const currentResult = state.items
    .flatMap((item) => item.allocations ?? [])
    .find((allocation) => allocation.id === currentItemId)?.result;
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
  byId<HTMLElement>('review-actions').hidden = !showBatchActions;
  byId<HTMLElement>('send-actions').hidden =
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
  const allocationResults = currentState.items.flatMap(
    (item) => item.allocations?.map((allocation) => allocation.result) ?? [],
  );
  const confirmedMarkings = allocationResults.filter(
    (result) => result === 'filled' || result === 'already-correct',
  ).length;
  const errors = allocationResults.filter(
    (result) =>
      result === 'failed' ||
      result === 'not-found' ||
      result === 'validation-error',
  ).length;
  const sending = currentState.inFlight === 'apply';
  const allQueuedConfirmed =
    currentState.queue.length > 0 &&
    currentState.queue.every((itemId) => {
      const result = currentState.items
        .flatMap((item) => item.allocations ?? [])
        .find((allocation) => allocation.id === itemId)?.result;
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
      ? `Envio interrompido: ${String(confirmedMarkings)} marcação(ões) confirmada(s) e ${String(errors)} com erro. Revise as linhas em vermelho.`
      : allQueuedConfirmed
        ? `Envio concluído com sucesso: ${String(confirmedMarkings)} marcação(ões) confirmada(s) pelo Channel em ${String(confirmed)} dia(s).`
        : sending
          ? (currentState.writeProgress?.detail ??
            `Enviando ao Channel: ${String(confirmedMarkings)} confirmado(s)…`)
          : confirmed > 0 || currentState.phase === 'completed'
            ? `Envio concluído com sucesso: ${String(confirmedMarkings)} marcação(ões) confirmada(s) pelo Channel.`
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
  const connected = Boolean(state?.sourceTab && state.targetTab);
  const loginCard = byId<HTMLDetailsElement>('login-card');
  if (connected && !loginCompletionObserved) loginCard.open = false;
  if (!connected && loginCompletionObserved) loginCard.open = true;
  loginCompletionObserved = connected;
  const summary = byId<HTMLOutputElement>('login-summary');
  const needsAttention =
    preparation?.permissionDenied === true ||
    preparation?.ahgora === 'failed' ||
    preparation?.channel === 'failed';
  const inProgress =
    preparation !== undefined &&
    (preparation.ahgora !== 'idle' || preparation.channel !== 'idle');
  summary.textContent = connected
    ? 'Concluído'
    : needsAttention
      ? 'Atenção'
      : inProgress
        ? 'Em andamento'
        : 'Pendente';
  summary.classList.toggle('ready', connected);
  summary.classList.toggle('attention', needsAttention && !connected);
  const loginRunning =
    preparation?.autoSubmit === true &&
    ([preparation.ahgora, preparation.channel] as const).some(
      (status) =>
        status === 'opening' ||
        status === 'submitted' ||
        status === 'awaiting-user',
    );
  const stop = byId<HTMLButtonElement>('stop-login');
  stop.hidden = !loginRunning;
  stop.disabled = !loginRunning;
}

function renderFlowOverview(): void {
  if (!state) return;
  const connected = Boolean(state.sourceTab && state.targetTab);
  const configured = settings.tags.length > 0;
  const templatesReady = true;
  const captured =
    state.sourceRows !== undefined && state.phase !== 'capturing';
  const reviewed =
    state.selectedCount > 0 ||
    state.phase === 'dry-run' ||
    state.phase === 'waiting-review' ||
    state.phase === 'partial' ||
    state.phase === 'completed';
  const sent = state.phase === 'completed';
  const completed = [
    connected,
    configured,
    templatesReady,
    captured,
    reviewed,
    sent,
  ];
  const currentIndex = completed.findIndex((value) => !value);
  const ids = [
    'flow-login',
    'flow-config',
    'flow-templates',
    'flow-capture',
    'flow-review',
    'flow-send',
  ] as const;
  ids.forEach((id, index) => {
    const item = byId<HTMLElement>(id);
    item.classList.toggle('done', completed[index] === true);
    item.classList.toggle('current', index === currentIndex);
    if (index === currentIndex) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  });
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
    stopped: 'Interrompido',
  }[status];
  const bar = byId<HTMLProgressElement>(`login-${role}-progress`);
  if (status === 'opening' || status === 'submitted')
    bar.removeAttribute('value');
  else
    bar.value =
      status === 'ready' || status === 'failed' || status === 'stopped'
        ? 100
        : status === 'awaiting-user'
          ? 50
          : 0;
  bar.classList.toggle('failed', status === 'failed');
  bar.classList.toggle('stopped', status === 'stopped');
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
  const running = state?.inFlight === 'capture';
  const stop = byId<HTMLButtonElement>('stop-capture');
  stop.hidden = !running;
  stop.disabled = !running;
}

function renderWriteProgress(): void {
  const progress = state?.writeProgress;
  const bar = byId<HTMLProgressElement>('write-progress');
  const completed = progress?.completedItems ?? 0;
  const total = progress?.totalItems ?? 0;
  bar.value = total > 0 ? Math.round((completed / total) * 100) : 0;
  bar.classList.toggle('failed', progress?.status === 'failed');
  bar.classList.toggle('stopped', progress?.status === 'stopped');
  byId<HTMLOutputElement>('write-progress-state').textContent = progress
    ? progress.status === 'done'
      ? 'Concluído'
      : progress.status === 'failed'
        ? `Interrompido · ${String(completed)} de ${String(total)}`
        : progress.status === 'stopped'
          ? `Parado · ${String(completed)} de ${String(total)}`
          : `${String(completed)} de ${String(total)}`
    : 'Aguardando';
  byId<HTMLElement>('write-progress-detail').textContent =
    progress?.detail ?? 'Selecione os dias que deseja enviar.';
  const running =
    (state?.inFlight === 'apply' || state?.inFlight === 'advance') &&
    progress?.status === 'running';
  const stop = byId<HTMLButtonElement>('stop-write');
  stop.hidden = !running;
  stop.disabled = !running;
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
      progress.status === 'done' ||
      progress.status === 'failed' ||
      progress.status === 'stopped'
        ? 100
        : 0;
  bar.classList.toggle('failed', progress.status === 'failed');
  bar.classList.toggle('stopped', progress.status === 'stopped');
  byId<HTMLOutputElement>(`${system}-progress-state`).textContent = {
    waiting: 'Aguardando',
    running: 'Em andamento',
    done: 'Concluído',
    failed: 'Falhou',
    stopped: 'Interrompido',
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

function renderSettings(): void {
  const uiBusy =
    requestPending ||
    loginPermissionPending ||
    catalogPending ||
    state?.inFlight !== undefined;
  document.documentElement.style.setProperty(
    '--font-scale',
    String(settings.fontScale),
  );
  byId<HTMLOutputElement>('font-scale').textContent =
    `${String(Math.round(settings.fontScale * 100))}%`;
  byId<HTMLButtonElement>('font-decrease').disabled =
    uiBusy || settings.fontScale <= 0.8;
  byId<HTMLButtonElement>('font-increase').disabled =
    uiBusy || settings.fontScale >= 1.4;

  const catalog = settings.catalog;
  byId<HTMLElement>('catalog-status').textContent = catalog
    ? `${String(catalog.projects.length)} projeto(s), ${String(catalog.projects.reduce((total, project) => total + project.activities.length, 0))} atividade(s) · atualizado em ${new Date(catalog.fetchedAt).toLocaleString('pt-BR')}`
    : 'Cache ainda não consultado.';
  byId<HTMLButtonElement>('fetch-catalog').textContent = catalogPending
    ? 'Consultando Channel…'
    : catalog
      ? 'Atualizar cache'
      : 'Obter do Channel';
  const projectSelect = byId<HTMLSelectElement>('tag-project');
  const previousProjectId = projectSelect.value;
  const projectPlaceholder = document.createElement('option');
  projectPlaceholder.value = '';
  projectPlaceholder.textContent = catalog
    ? 'Escolha um projeto'
    : 'Obtenha o catálogo do Channel';
  projectSelect.replaceChildren(
    projectPlaceholder,
    ...(catalog?.projects ?? []).map((project) => {
      const option = document.createElement('option');
      option.value = project.id;
      option.textContent = project.label;
      return option;
    }),
  );
  projectSelect.disabled =
    uiBusy || catalog === undefined || catalog.projects.length === 0;
  if (catalog?.projects.some((project) => project.id === previousProjectId))
    projectSelect.value = previousProjectId;
  byId<HTMLOutputElement>('tag-editor-status').textContent = tagEditorMessage;

  const list = byId<HTMLElement>('tag-list');
  if (settings.tags.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent =
      'Nenhuma TAG salva. Obtenha o catálogo e crie a primeira.';
    list.replaceChildren(empty);
    return;
  }
  const disabled = uiBusy;
  list.replaceChildren(
    ...settings.tags.map((tag) => {
      const card = document.createElement('article');
      card.className = 'tag-card';
      card.setAttribute('role', 'listitem');
      const content = document.createElement('div');
      const heading = document.createElement('strong');
      heading.className = 'tag-chip';
      heading.textContent = tag.name;
      const detail = document.createElement('p');
      detail.className = 'meta';
      detail.textContent = `${tag.project} · ${tag.activity} · Tipo: ${tag.activityType ?? 'Nenhum'} · Tarefa: ${tag.task ?? 'Nenhum'}`;
      content.append(heading, detail);
      const defaultLabel = document.createElement('label');
      defaultLabel.className = 'tag-default';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'default-tag';
      radio.value = tag.id;
      radio.checked = tag.id === settings.defaultTagId;
      radio.disabled = disabled;
      radio.addEventListener('change', () => void setDefaultTag(tag.id));
      defaultLabel.append(radio, document.createTextNode('Padrão'));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'tag-remove';
      remove.textContent = 'Excluir';
      remove.disabled = disabled;
      remove.setAttribute('aria-label', `Excluir TAG ${tag.name}`);
      remove.addEventListener('click', () => void removeTag(tag.id));
      card.append(content, defaultLabel, remove);
      return card;
    }),
  );
}

function renderTemplateManager(): void {
  const busy =
    requestPending ||
    loginPermissionPending ||
    catalogPending ||
    state?.inFlight !== undefined;
  const templates = settings.markingTemplates;
  const rules = settings.templateRules;
  byId<HTMLOutputElement>('template-manager-summary').textContent =
    `${String(templates.length)} conjunto(s) · ${String(rules.filter((rule) => rule.enabled).length)} regra(s) ativa(s)`;
  byId<HTMLOutputElement>('template-manager-status').textContent =
    templateManagerMessage;

  const templateList = byId<HTMLElement>('template-list');
  if (templates.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent =
      'Nenhum conjunto salvo. Na etapa de revisão, distribua um dia e escolha “Salvar como conjunto”.';
    templateList.replaceChildren(empty);
  } else {
    templateList.replaceChildren(
      ...templates.map((template) => {
        const item = document.createElement('article');
        item.className = 'manager-item';
        item.setAttribute('role', 'listitem');
        const content = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = template.name;
        const summary = document.createElement('p');
        summary.className = 'meta';
        summary.textContent = `${String(template.entries.length)} marcação(ões) · dia original ${formatDurationMinutes(template.sourceDurationMinutes)} · ${template.entries.map(templateEntrySummary).join(' + ')}`;
        content.append(name, summary);
        const actions = document.createElement('div');
        actions.className = 'manager-item-actions';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Excluir';
        remove.className = 'danger';
        remove.disabled = busy;
        remove.setAttribute('aria-label', `Excluir conjunto ${template.name}`);
        remove.addEventListener(
          'click',
          () => void removeMarkingTemplate(template.id),
        );
        actions.append(remove);
        item.append(content, actions);
        return item;
      }),
    );
  }

  const ruleList = byId<HTMLElement>('rule-list');
  if (rules.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'Nenhuma regra automática salva.';
    ruleList.replaceChildren(empty);
  } else {
    ruleList.replaceChildren(
      ...rules.map((rule) => {
        const item = document.createElement('article');
        item.className = 'manager-item';
        item.setAttribute('role', 'listitem');
        const content = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = rule.name;
        const recurrence = document.createElement('p');
        recurrence.className = 'meta';
        recurrence.textContent = describeTemplateRule(rule);
        const composition = document.createElement('p');
        composition.className = 'meta';
        composition.textContent = rule.templates
          .map((share) => {
            const template = templates.find(
              (candidate) => candidate.id === share.templateId,
            );
            return `${template?.name ?? 'Conjunto removido'} ${String(share.percentage)}%`;
          })
          .join(' + ');
        content.append(name, recurrence, composition);
        const actions = document.createElement('div');
        actions.className = 'manager-item-actions';
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.textContent = rule.enabled ? 'Desativar' : 'Ativar';
        toggle.disabled = busy;
        toggle.setAttribute('aria-pressed', String(rule.enabled));
        toggle.addEventListener(
          'click',
          () => void toggleTemplateRule(rule.id),
        );
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Excluir';
        remove.className = 'danger';
        remove.disabled = busy;
        remove.addEventListener(
          'click',
          () => void removeTemplateRule(rule.id),
        );
        actions.append(toggle, remove);
        item.append(content, actions);
        return item;
      }),
    );
  }

  renderRuleTemplateOptions();
  byId<HTMLButtonElement>('add-rule-template').disabled =
    busy || templates.length === 0;
  byId<HTMLButtonElement>('save-rule').disabled =
    busy || templates.length === 0;
  if (
    templates.length > 0 &&
    byId<HTMLElement>('rule-template-shares').childElementCount === 0
  )
    addRuleTemplateShare(templates[0]?.id, 100);
  updateRuleShareTotal();
}

function templateEntrySummary(
  entry: MarkingTemplate['entries'][number],
): string {
  const tag = settings.tags.find((candidate) => candidate.id === entry.tagId);
  const rag = findRagItem(entry.ragCatalogId, entry.ragItemId);
  const destination = rag?.event ?? tag?.name ?? 'Destino indisponível';
  return `${String(Number(entry.percentage.toFixed(2)))}% (${formatDurationMinutes(entry.durationMinutes)}) ${destination}`;
}

function addRuleTemplateShare(
  selectedTemplateId?: string,
  percentage = 0,
): void {
  const container = byId<HTMLElement>('rule-template-shares');
  const row = document.createElement('div');
  row.className = 'rule-template-share';
  row.dataset.rowId = String(++ruleShareCounter);
  const templateLabel = document.createElement('label');
  templateLabel.textContent = 'Conjunto';
  const select = document.createElement('select');
  select.className = 'rule-template-select';
  templateLabel.append(select);
  const shareLabel = document.createElement('label');
  shareLabel.textContent = 'Participação (%)';
  const share = document.createElement('input');
  share.className = 'rule-template-percentage';
  share.type = 'number';
  share.min = '0.01';
  share.max = '100';
  share.step = '0.01';
  share.value = String(percentage);
  shareLabel.append(share);
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remover';
  remove.setAttribute('aria-label', 'Remover conjunto da composição');
  remove.addEventListener('click', () => {
    row.remove();
    updateRuleShareTotal();
  });
  share.addEventListener('input', updateRuleShareTotal);
  row.append(templateLabel, shareLabel, remove);
  container.append(row);
  renderRuleTemplateOptions();
  if (selectedTemplateId) select.value = selectedTemplateId;
  updateRuleShareTotal();
}

function renderRuleTemplateOptions(): void {
  document
    .querySelectorAll<HTMLSelectElement>('.rule-template-select')
    .forEach((select) => {
      const previous = select.value;
      select.replaceChildren(
        ...settings.markingTemplates.map(
          (template) => new Option(template.name, template.id),
        ),
      );
      if (
        settings.markingTemplates.some((template) => template.id === previous)
      )
        select.value = previous;
    });
}

function updateRuleShareTotal(): void {
  const total = [
    ...document.querySelectorAll<HTMLInputElement>('.rule-template-percentage'),
  ].reduce((sum, input) => sum + (Number(input.value) || 0), 0);
  const output = byId<HTMLOutputElement>('rule-share-total');
  output.textContent = `Total: ${String(Number(total.toFixed(2)))}%`;
  output.classList.toggle('valid', Math.abs(total - 100) < 0.001);
  output.classList.toggle('invalid', Math.abs(total - 100) >= 0.001);
}

function readRuleTemplateShares(): readonly RuleTemplateShare[] {
  const rows = [
    ...document.querySelectorAll<HTMLElement>('.rule-template-share'),
  ];
  const shares = rows.map((row) => ({
    templateId: row.querySelector<HTMLSelectElement>('select')?.value ?? '',
    percentage: Number(
      row.querySelector<HTMLInputElement>('input[type="number"]')?.value ?? 0,
    ),
  }));
  if (shares.length === 0) throw new Error('Adicione ao menos um conjunto.');
  if (shares.some((share) => !share.templateId || share.percentage <= 0))
    throw new Error('Escolha os conjuntos e informe participações positivas.');
  if (new Set(shares.map((share) => share.templateId)).size !== shares.length)
    throw new Error('Use cada conjunto apenas uma vez na composição.');
  const total = shares.reduce((sum, share) => sum + share.percentage, 0);
  if (Math.abs(total - 100) >= 0.001)
    throw new Error('A participação dos conjuntos precisa totalizar 100%.');
  return shares;
}

async function saveTemplateRule(): Promise<void> {
  try {
    const name = byId<HTMLInputElement>('rule-name').value.trim();
    if (!name) throw new Error('Informe um nome para a regra.');
    const repeatEveryWeeks = Number(byId<HTMLInputElement>('rule-every').value);
    if (
      !Number.isInteger(repeatEveryWeeks) ||
      repeatEveryWeeks < 1 ||
      repeatEveryWeeks > 52
    )
      throw new Error('A repetição deve estar entre 1 e 52 semanas.');
    const weekdays = [
      ...document.querySelectorAll<HTMLInputElement>(
        '.weekday-picker input:checked',
      ),
    ].map((input) => Number(input.value) as Weekday);
    if (weekdays.length === 0)
      throw new Error('Escolha ao menos um dia da semana.');
    const startsOn = civilDate(byId<HTMLInputElement>('rule-start').value);
    const endKind =
      document.querySelector<HTMLInputElement>('input[name="rule-end"]:checked')
        ?.value ?? 'never';
    const ends: TemplateApplicationRule['ends'] =
      endKind === 'on'
        ? {
            kind: 'on',
            date: civilDate(byId<HTMLInputElement>('rule-end-date').value),
          }
        : endKind === 'after'
          ? {
              kind: 'after',
              occurrences: Number(
                byId<HTMLInputElement>('rule-end-count').value,
              ),
            }
          : { kind: 'never' };
    if (ends.kind === 'on' && ends.date < startsOn)
      throw new Error('A data final não pode ser anterior à inicial.');
    if (
      ends.kind === 'after' &&
      (!Number.isInteger(ends.occurrences) ||
        ends.occurrences < 1 ||
        ends.occurrences > 730)
    )
      throw new Error('Informe de 1 a 730 ocorrências.');
    const rule: TemplateApplicationRule = {
      id: crypto.randomUUID(),
      name,
      enabled: byId<HTMLInputElement>('rule-enabled').checked,
      repeatEveryWeeks,
      weekdays,
      startsOn,
      ends,
      templates: readRuleTemplateShares(),
    };
    settings = {
      ...settings,
      templateRules: [...settings.templateRules, rule],
    };
    await saveExtensionSettings(settings);
    resetRuleEditor();
    templateManagerMessage = `Regra ${name} salva.`;
    render();
  } catch (error) {
    templateManagerMessage =
      error instanceof Error
        ? error.message
        : 'Não foi possível salvar a regra.';
    render();
  }
}

function resetRuleEditor(): void {
  byId<HTMLInputElement>('rule-name').value = '';
  byId<HTMLInputElement>('rule-every').value = '1';
  document
    .querySelectorAll<HTMLInputElement>('.weekday-picker input')
    .forEach((input) => (input.checked = false));
  byId<HTMLInputElement>('rule-start').value = currentDateValue();
  const never = document.querySelector<HTMLInputElement>(
    'input[name="rule-end"][value="never"]',
  );
  if (never) never.checked = true;
  syncRuleEndControls();
  byId<HTMLInputElement>('rule-enabled').checked = true;
  byId<HTMLElement>('rule-template-shares').replaceChildren();
  if (settings.markingTemplates[0])
    addRuleTemplateShare(settings.markingTemplates[0].id, 100);
}

async function removeMarkingTemplate(templateId: string): Promise<void> {
  const template = settings.markingTemplates.find(
    (candidate) => candidate.id === templateId,
  );
  if (!template) return;
  if (
    settings.templateRules.some((rule) =>
      rule.templates.some((share) => share.templateId === templateId),
    )
  ) {
    templateManagerMessage =
      'Este conjunto está sendo usado por uma regra. Exclua ou ajuste a regra primeiro.';
    render();
    return;
  }
  settings = {
    ...settings,
    markingTemplates: settings.markingTemplates.filter(
      (candidate) => candidate.id !== templateId,
    ),
  };
  await saveExtensionSettings(settings);
  templateManagerMessage = `Conjunto ${template.name} excluído.`;
  render();
}

async function toggleTemplateRule(ruleId: string): Promise<void> {
  settings = {
    ...settings,
    templateRules: settings.templateRules.map((rule) =>
      rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule,
    ),
  };
  await saveExtensionSettings(settings);
  templateManagerMessage = 'Estado da regra atualizado.';
  render();
}

async function removeTemplateRule(ruleId: string): Promise<void> {
  settings = {
    ...settings,
    templateRules: settings.templateRules.filter((rule) => rule.id !== ruleId),
  };
  await saveExtensionSettings(settings);
  templateManagerMessage = 'Regra excluída.';
  render();
}

function syncRuleEndControls(): void {
  const value =
    document.querySelector<HTMLInputElement>('input[name="rule-end"]:checked')
      ?.value ?? 'never';
  byId<HTMLInputElement>('rule-end-date').disabled = value !== 'on';
  byId<HTMLInputElement>('rule-end-count').disabled = value !== 'after';
}

function currentDateValue(now = new Date()): string {
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function selectedCatalogProject(): ChannelCatalogProject | undefined {
  const projectId = byId<HTMLSelectElement>('tag-project').value;
  return settings.catalog?.projects.find((project) => project.id === projectId);
}

function renderActivityOptions(): void {
  const project = selectedCatalogProject();
  const select = byId<HTMLSelectElement>('tag-activity');
  const previous = select.value;
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = project
    ? 'Escolha uma atividade'
    : 'Escolha primeiro um projeto';
  select.replaceChildren(
    placeholder,
    ...(project?.activities ?? []).map((activity) => {
      const option = document.createElement('option');
      option.value = activity.id;
      option.textContent = activity.label;
      return option;
    }),
  );
  select.disabled = project === undefined;
  if (project?.activities.some((activity) => activity.id === previous))
    select.value = previous;
  renderAutomaticTagName();
}

function renderAutomaticTagName(): void {
  const project = selectedCatalogProject();
  const activity = project?.activities.find(
    (candidate) =>
      candidate.id === byId<HTMLSelectElement>('tag-activity').value,
  );
  byId<HTMLInputElement>('tag-name').value =
    project && activity ? `${project.label} — ${activity.label}` : '';
}

function renderConfig(): void {
  const config = state?.config;
  if (!config) return;
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
      body.className = 'item-body';
      const title = document.createElement('p');
      title.className = 'item-title';
      title.textContent = `${formatBrazilianDate(item.date)} · Ahgora ${item.ahgoraDuration}`;
      const meta = document.createElement('p');
      meta.className = 'meta';
      const displayStatus =
        item.result === 'filled' || item.result === 'already-correct'
          ? 'equal'
          : item.status;
      meta.textContent = `${statusLabel(displayStatus)}${item.channelDuration ? ` · Channel ${item.channelDuration}` : ''}${item.result ? ` · ${resultLabel(item.result)}` : ''}${item.warning ? ` · ${item.warning}` : ''}`;
      body.append(title, meta);
      if (item.appliedRuleName) {
        const appliedRule = document.createElement('span');
        appliedRule.className = 'applied-rule';
        appliedRule.textContent = `Aplicado automaticamente · ${item.appliedRuleName}`;
        body.append(appliedRule);
      }
      if (item.channelProject || item.channelActivity) {
        const channelAssignment = document.createElement('p');
        channelAssignment.className = 'assignment-meta';
        channelAssignment.textContent = `Channel · Projeto: ${item.channelProject ?? 'não informado'} · Atividade: ${item.channelActivity ?? 'não informada'}`;
        body.append(channelAssignment);
      }
      if ((item.channelMarkings?.length ?? 0) > 0) {
        const markings = document.createElement('div');
        markings.className = 'channel-marking-list';
        markings.setAttribute(
          'aria-label',
          `Marcações existentes no Channel em ${formatBrazilianDate(item.date)}`,
        );
        markings.append(
          ...(item.channelMarkings ?? []).map((marking, index) => {
            const existing = document.createElement('div');
            existing.className = 'channel-marking';
            const details = document.createElement('div');
            const heading = document.createElement('strong');
            heading.textContent = `Marcação ${String(index + 1)} · ${marking.duration}`;
            const assignment = document.createElement('p');
            assignment.className = 'meta';
            assignment.textContent = `${marking.project ?? 'Projeto não informado'} · ${marking.activity ?? 'Atividade não informada'}`;
            details.append(heading, assignment);
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'channel-marking-delete';
            remove.textContent =
              deletingMarkingId === marking.id ? 'Excluindo…' : 'Excluir';
            remove.disabled =
              !marking.canDelete ||
              requestPending ||
              state?.inFlight !== undefined;
            remove.setAttribute(
              'aria-label',
              `Excluir marcação ${marking.duration} de ${item.date} no Channel`,
            );
            if (!marking.canDelete)
              remove.title = 'O Channel não permite excluir esta marcação.';
            remove.addEventListener(
              'click',
              () =>
                void deleteChannelMarking(
                  item.id,
                  marking.id,
                  marking.duration,
                  item.date,
                ),
            );
            existing.append(details, remove);
            return existing;
          }),
        );
        body.append(markings);
      }
      if (item.status !== 'missing' || item.result !== undefined) {
        row.classList.add('readonly');
        row.append(body);
        return row;
      }
      const tags = [...(state?.config?.tags ?? [])].sort((left, right) =>
        left.id === state?.config?.defaultTagId
          ? -1
          : right.id === state?.config?.defaultTagId
            ? 1
            : left.name.localeCompare(right.name, 'pt-BR'),
      );
      const allocations = item.allocations ?? [];
      const editable =
        !requestPending &&
        state?.inFlight === undefined &&
        state?.phase === 'preview';
      const templateApplication = createTemplateApplicationEditor(
        item,
        editable,
      );
      const allocationList = document.createElement('div');
      allocationList.className = 'allocation-list';
      allocationList.setAttribute(
        'aria-label',
        `Marcações de ${formatBrazilianDate(item.date)}`,
      );
      allocationList.append(
        ...allocations.map((allocation, index) => {
          const marking = document.createElement('fieldset');
          marking.className = 'allocation';
          const legend = document.createElement('legend');
          legend.textContent = `Marcação ${String(index + 1)}`;
          if (allocation.isRemainder) {
            const remainder = document.createElement('span');
            remainder.className = 'remainder-badge';
            remainder.textContent =
              index === 0 ? 'Total do dia' : 'Saldo restante';
            legend.append(' ', remainder);
          }

          const selectedRagItem = findRagItem(
            allocation.ragCatalogId,
            allocation.ragItemId,
          );

          const sourceLabel = document.createElement('label');
          sourceLabel.textContent = 'Origem da marcação';
          const sourceSelect = document.createElement('select');
          sourceSelect.className = 'allocation-source-select';
          sourceSelect.append(new Option('Minhas TAGs', 'tags'));
          sourceSelect.append(
            ...ragCatalogs.map(
              (catalog) => new Option(catalog.name, catalog.id),
            ),
          );
          sourceSelect.value = allocation.ragCatalogId ?? 'tags';
          sourceSelect.disabled = !editable;
          sourceSelect.setAttribute(
            'aria-label',
            `Origem da marcação ${String(index + 1)} para ${item.date}`,
          );
          sourceSelect.addEventListener('change', () => {
            if (sourceSelect.value === 'tags') {
              const tagId =
                allocation.tagId ?? state?.config?.defaultTagId ?? tags[0]?.id;
              if (tagId)
                void act({
                  type: 'SET_ALLOCATION_TAG',
                  operationId: operationId(),
                  itemId: item.id,
                  allocationId: allocation.id,
                  tagId,
                });
              return;
            }
            const catalog = ragCatalogs.find(
              (candidate) => candidate.id === sourceSelect.value,
            );
            const first = catalog?.items.find(
              (candidate) => candidate.kind !== 'SKIP',
            );
            if (catalog && first)
              void act({
                type: 'SET_ALLOCATION_RAG',
                operationId: operationId(),
                itemId: item.id,
                allocationId: allocation.id,
                catalogId: catalog.id,
                ragItemId: first.id,
              });
          });
          sourceLabel.append(sourceSelect);

          const ragPicker = document.createElement('div');
          ragPicker.className = 'rag-picker';
          const selectedCatalog = ragCatalogs.find(
            (catalog) => catalog.id === allocation.ragCatalogId,
          );
          if (selectedCatalog) {
            const searchLabel = document.createElement('label');
            searchLabel.textContent = 'Filtrar opções';
            const search = document.createElement('input');
            search.type = 'search';
            search.placeholder = 'Nome, grupo ou destino';
            search.disabled = !editable;
            searchLabel.append(search);

            const itemLabel = document.createElement('label');
            itemLabel.textContent = 'Item da fonte';
            const itemSelect = document.createElement('select');
            itemSelect.className = 'allocation-rag-select';
            itemSelect.disabled = !editable;
            const renderOptions = (query = ''): void => {
              const normalizedQuery = normalizeUiSearch(query);
              itemSelect.replaceChildren();
              appendRagOptions(
                itemSelect,
                selectedCatalog,
                normalizedQuery,
                allocation.ragItemId,
              );
            };
            renderOptions();
            search.addEventListener('input', () => renderOptions(search.value));
            itemSelect.addEventListener('change', () => {
              if (!itemSelect.value) return;
              void act({
                type: 'SET_ALLOCATION_RAG',
                operationId: operationId(),
                itemId: item.id,
                allocationId: allocation.id,
                catalogId: selectedCatalog.id,
                ragItemId: itemSelect.value,
              });
            });
            itemLabel.append(itemSelect);
            ragPicker.append(searchLabel, itemLabel);
          }

          const needsTag =
            !selectedRagItem ||
            (selectedRagItem.kind === 'PROJECT' &&
              (selectedRagItem.channel.projectSource === 'TAG' ||
                selectedRagItem.channel.activitySource === 'TAG'));
          const tagLabel = document.createElement('label');
          tagLabel.textContent = selectedRagItem
            ? 'TAG de projeto/atividade contextual'
            : 'TAG';
          const tagSelect = document.createElement('select');
          tagSelect.className = 'allocation-tag-select';
          tagSelect.setAttribute(
            'aria-label',
            `TAG da marcação ${String(index + 1)} para ${item.date}`,
          );
          if (tags.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Nenhuma TAG configurada';
            tagSelect.append(option);
          } else {
            tagSelect.append(
              ...tags.map((tag) => {
                const option = document.createElement('option');
                option.value = tag.id;
                option.textContent = `${tag.name} — ${tag.project} · ${tag.activity}`;
                option.selected =
                  tag.id === (allocation.tagId ?? state?.config?.defaultTagId);
                return option;
              }),
            );
          }
          tagSelect.disabled = !editable || tags.length === 0;
          tagSelect.addEventListener(
            'change',
            () =>
              void act({
                type: 'SET_ALLOCATION_TAG',
                operationId: operationId(),
                itemId: item.id,
                allocationId: allocation.id,
                tagId: tagSelect.value,
              }),
          );
          tagLabel.append(tagSelect);

          const destination = document.createElement('p');
          destination.className = 'allocation-destination';
          destination.textContent = ragDestinationLabel(
            selectedRagItem,
            tags.find(
              (tag) =>
                tag.id === (allocation.tagId ?? state?.config?.defaultTagId),
            ),
          );

          const amountGroup = document.createElement('div');
          amountGroup.className = 'allocation-amount';
          const modeLabel = document.createElement('label');
          modeLabel.textContent = 'Dividir por';
          const modeSelect = document.createElement('select');
          modeSelect.setAttribute(
            'aria-label',
            `Forma da marcação ${String(index + 1)} para ${item.date}`,
          );
          modeSelect.append(
            new Option('Percentual', 'percentage'),
            new Option('Duração', 'duration'),
          );
          modeSelect.value = allocation.mode;
          modeSelect.disabled = !editable;
          modeLabel.append(modeSelect);

          const valueLabel = document.createElement('label');
          valueLabel.textContent =
            allocation.mode === 'percentage'
              ? 'Percentual (%)'
              : 'Duração (HH:MM)';
          const valueInput = document.createElement('input');
          valueInput.value = allocation.value;
          valueInput.inputMode =
            allocation.mode === 'percentage' ? 'decimal' : 'numeric';
          valueInput.placeholder =
            allocation.mode === 'percentage' ? '100' : '08:00';
          valueInput.setAttribute(
            'aria-label',
            `${valueLabel.textContent} da marcação ${String(index + 1)} para ${item.date}`,
          );
          valueInput.disabled = !editable;
          valueLabel.append(valueInput);

          const update = (
            mode: 'percentage' | 'duration',
            value: string,
          ): void => {
            void act({
              type: 'UPDATE_ALLOCATION',
              operationId: operationId(),
              itemId: item.id,
              allocationId: allocation.id,
              mode,
              value,
            });
          };
          modeSelect.addEventListener('change', () => {
            const mode = modeSelect.value as 'percentage' | 'duration';
            update(
              mode,
              mode === 'percentage'
                ? allocationPercentage(
                    allocation.durationMinutes,
                    item.ahgoraDuration,
                  )
                : allocation.duration,
            );
          });
          valueInput.addEventListener('change', () =>
            update(allocation.mode, valueInput.value.trim()),
          );
          amountGroup.append(modeLabel, valueLabel);

          const effective = document.createElement('output');
          effective.className = 'allocation-effective';
          effective.setAttribute('role', 'status');
          effective.setAttribute('aria-atomic', 'true');
          effective.textContent = `${allocation.duration} · ${allocationPercentage(allocation.durationMinutes, item.ahgoraDuration)}% do dia`;

          marking.append(legend, sourceLabel);
          if (selectedCatalog) marking.append(ragPicker);
          if (needsTag) marking.append(tagLabel);
          marking.append(destination, amountGroup, effective);
          if (!allocation.isRemainder && allocations.length > 1) {
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'allocation-remove';
            remove.textContent = 'Remover marcação';
            remove.disabled = !editable;
            remove.addEventListener(
              'click',
              () =>
                void act({
                  type: 'REMOVE_ALLOCATION',
                  operationId: operationId(),
                  itemId: item.id,
                  allocationId: allocation.id,
                }),
            );
            marking.append(remove);
          }
          if (allocation.result) {
            const result = document.createElement('span');
            result.className = 'allocation-result';
            result.textContent = resultLabel(allocation.result);
            marking.append(result);
          }
          return marking;
        }),
      );
      const balance = document.createElement('output');
      balance.className = 'allocation-balance';
      balance.setAttribute('role', 'status');
      balance.setAttribute('aria-live', 'polite');
      balance.setAttribute('aria-atomic', 'true');
      balance.textContent = `${String(allocations.length)} marcação(ões) · Total ${item.ahgoraDuration} · Distribuído ${item.ahgoraDuration} · Falta 00:00`;
      if (templateApplication) body.append(templateApplication);
      body.append(
        allocationList,
        balance,
        createTemplateSaveEditor(item, editable),
      );
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = item.decision === 'selected';
      checkbox.disabled =
        tags.length === 0 ||
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
      row.append(checkbox, body);
      return row;
    }),
  );
}

function createTemplateApplicationEditor(
  item: PublicOperationState['items'][number],
  editable: boolean,
): HTMLElement | undefined {
  if (settings.markingTemplates.length === 0) return undefined;
  const section = document.createElement('section');
  section.className = 'template-application';
  section.setAttribute(
    'aria-label',
    `Aplicar conjunto em ${formatBrazilianDate(item.date)}`,
  );
  const heading = document.createElement('strong');
  heading.textContent = 'Usar um conjunto salvo';
  const controls = document.createElement('div');
  controls.className = 'template-application-controls';
  const templateLabel = document.createElement('label');
  templateLabel.textContent = 'Conjunto';
  const templateSelect = document.createElement('select');
  templateSelect.append(
    ...settings.markingTemplates.map(
      (template) => new Option(template.name, template.id),
    ),
  );
  if (
    item.appliedTemplateIds?.[0] &&
    settings.markingTemplates.some(
      (template) => template.id === item.appliedTemplateIds?.[0],
    )
  )
    templateSelect.value = item.appliedTemplateIds[0];
  templateSelect.disabled = !editable;
  templateLabel.append(templateSelect);
  const basisLabel = document.createElement('label');
  basisLabel.textContent = 'Aplicar usando';
  const basisSelect = document.createElement('select');
  basisSelect.append(
    new Option('Percentuais (adaptar ao dia)', 'percentage'),
    new Option('Horas originais', 'duration'),
  );
  basisSelect.disabled = !editable;
  basisLabel.append(basisSelect);
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.textContent = 'Aplicar';
  apply.disabled = !editable;
  const feedback = document.createElement('p');
  feedback.className = 'template-overflow';
  feedback.hidden = true;
  const updateFeedback = (): void => {
    const template = settings.markingTemplates.find(
      (candidate) => candidate.id === templateSelect.value,
    );
    if (!template) return;
    const dayMinutes = parseDurationMinutes(item.ahgoraDuration);
    const originalMinutes = totalTemplateDuration(template);
    const overflow =
      basisSelect.value === 'duration' && originalMinutes > dayMinutes;
    const remainder =
      basisSelect.value === 'duration' && originalMinutes < dayMinutes;
    feedback.hidden = !overflow && !remainder;
    feedback.textContent = overflow
      ? `As horas originais excedem o dia em ${formatDurationMinutes(originalMinutes - dayMinutes)}. Ao aplicar, as marcações serão reduzidas proporcionalmente para caber.`
      : remainder
        ? `As horas originais deixam ${formatDurationMinutes(dayMinutes - originalMinutes)} livres; esse saldo será criado com a TAG padrão.`
        : '';
    apply.textContent = overflow ? 'Ajustar e aplicar' : 'Aplicar';
  };
  templateSelect.addEventListener('change', updateFeedback);
  basisSelect.addEventListener('change', updateFeedback);
  apply.addEventListener('click', () => {
    const template = settings.markingTemplates.find(
      (candidate) => candidate.id === templateSelect.value,
    );
    if (!template) return;
    const dayMinutes = parseDurationMinutes(item.ahgoraDuration);
    const overflow =
      basisSelect.value === 'duration' &&
      totalTemplateDuration(template) > dayMinutes;
    void act({
      type: 'APPLY_MARKING_TEMPLATE',
      operationId: operationId(),
      itemId: item.id,
      template,
      basis: basisSelect.value === 'duration' ? 'duration' : 'percentage',
      overflowStrategy: overflow ? 'scale' : 'reject',
    });
  });
  controls.append(templateLabel, basisLabel, apply);
  section.append(heading, controls, feedback);
  updateFeedback();
  return section;
}

function createTemplateSaveEditor(
  item: PublicOperationState['items'][number],
  editable: boolean,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'template-save';
  if (templateSaveEditorItemId !== item.id) {
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Salvar como conjunto…';
    open.disabled = !editable || (item.allocations?.length ?? 0) === 0;
    open.setAttribute(
      'aria-label',
      `Salvar marcações de ${item.date} como conjunto`,
    );
    open.addEventListener('click', () => {
      templateSaveEditorItemId = item.id;
      render();
    });
    section.append(open);
    return section;
  }
  const help = document.createElement('p');
  help.className = 'hint';
  help.textContent =
    'Serão salvos os percentuais e as horas atuais de todas as marcações deste dia.';
  const controls = document.createElement('div');
  controls.className = 'template-save-controls';
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Nome do conjunto';
  const name = document.createElement('input');
  name.maxLength = 80;
  name.value = `Distribuição de ${formatBrazilianDate(item.date)}`;
  nameLabel.append(name);
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'primary';
  save.textContent = 'Salvar conjunto';
  save.disabled = !editable;
  save.addEventListener(
    'click',
    () => void saveMarkingTemplate(item, name.value),
  );
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancelar';
  cancel.addEventListener('click', () => {
    templateSaveEditorItemId = undefined;
    render();
  });
  controls.append(nameLabel, save, cancel);
  section.append(help, controls);
  return section;
}

async function saveMarkingTemplate(
  item: PublicOperationState['items'][number],
  name: string,
): Promise<void> {
  try {
    if (
      settings.markingTemplates.some(
        (template) =>
          template.name.toLocaleLowerCase('pt-BR') ===
          name.trim().toLocaleLowerCase('pt-BR'),
      )
    )
      throw new Error('Já existe um conjunto com este nome.');
    const template = createMarkingTemplate(
      crypto.randomUUID(),
      name,
      item.ahgoraDuration,
      item.allocations ?? [],
      new Date().toISOString(),
    );
    settings = {
      ...settings,
      markingTemplates: [...settings.markingTemplates, template],
    };
    await saveExtensionSettings(settings);
    templateSaveEditorItemId = undefined;
    templateManagerMessage = `Conjunto ${template.name} salvo com percentuais e horas originais.`;
    render();
  } catch (error) {
    transientMessage =
      error instanceof Error
        ? error.message
        : 'Não foi possível salvar o conjunto.';
    render();
  }
}

async function deleteChannelMarking(
  itemId: string,
  markingId: string,
  duration: string,
  date: string,
): Promise<void> {
  const confirmed = globalThis.confirm(
    `Excluir definitivamente do Channel a marcação de ${duration} em ${formatBrazilianDate(civilDate(date))}?`,
  );
  if (!confirmed) return;
  deletingMarkingId = markingId;
  render();
  try {
    await act({
      type: 'DELETE_CHANNEL_MARKING',
      operationId: operationId(),
      itemId,
      markingId,
    });
  } finally {
    deletingMarkingId = undefined;
    render();
  }
}

function normalizeUiSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function appendRagOptions(
  select: HTMLSelectElement,
  catalog: RagCatalog,
  normalizedQuery: string,
  selectedId: string | undefined,
): void {
  const matching = catalog.items.filter((item) => {
    if (item.id === selectedId) return true;
    if (!normalizedQuery) return true;
    return normalizeUiSearch(
      `${item.group} ${item.event} ${JSON.stringify(item.channel)}`,
    ).includes(normalizedQuery);
  });
  const groups = new Map<string, RagItem[]>();
  for (const item of matching) {
    const values = groups.get(item.group) ?? [];
    values.push(item);
    groups.set(item.group, values);
  }
  for (const [group, items] of groups) {
    const optionGroup = document.createElement('optgroup');
    optionGroup.label = group;
    for (const item of items) {
      const option = new Option(
        `${item.event} — ${item.kind === 'PROJECT' ? 'Projeto' : item.kind === 'AD_HOC' ? 'Avulso' : 'Não apontar'}`,
        item.id,
      );
      option.disabled = item.kind === 'SKIP';
      option.selected = item.id === selectedId;
      optionGroup.append(option);
    }
    select.append(optionGroup);
  }
  if (matching.length === 0)
    select.append(new Option('Nenhum item encontrado', '', true, true));
}

function ragDestinationLabel(
  item: RagItem | undefined,
  tag: ChannelTag | undefined,
): string {
  if (!item)
    return tag
      ? `Destino: Projeto · ${tag.project} · ${tag.activity}`
      : 'Destino: selecione uma TAG válida.';
  if (item.kind === 'SKIP') return 'Destino: não apontar no Channel.';
  if (item.kind === 'AD_HOC')
    return `Destino: Avulso · ${item.channel.client} · ${item.channel.operationNature} · ${item.channel.activityType}`;
  return `Destino: Projeto · ${item.channel.project ?? tag?.project ?? 'TAG pendente'} · ${item.channel.activity ?? tag?.activity ?? 'TAG pendente'}`;
}

function allocationPercentage(minutes: number, totalDuration: string): string {
  const [hours = '0', minutePart = '0'] = totalDuration.split(':');
  const totalMinutes = Number(hours) * 60 + Number(minutePart);
  return totalMinutes > 0
    ? String(Number(((minutes * 100) / totalMinutes).toFixed(2)))
    : '0';
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

function phaseLabel(phase: PublicOperationState['phase']): string {
  return (
    {
      setup: 'Registre as duas abas e configure a operação.',
      capturing: 'Capturando e comparando…',
      preview:
        'Prévia pronta. Revise os conjuntos aplicados e os itens selecionados.',
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
    if (state?.message?.toLocaleLowerCase('pt-BR').includes('interrompid')) {
      transientMessage = undefined;
      render();
      return;
    }
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
    if (state?.message?.toLocaleLowerCase('pt-BR').includes('interrompid')) {
      transientMessage = undefined;
      render();
      return;
    }
    transientMessage =
      error instanceof Error ? error.message : 'Configuração inválida.';
    logPanelFailure('CAPTURE_AND_COMPARE', error);
    render();
  }
}

const workflowCards = [
  ...document.querySelectorAll<HTMLDetailsElement>(
    'details.workflow-card.collapsible-card',
  ),
];
for (const card of workflowCards) {
  card.addEventListener('toggle', () => {
    if (!card.open) return;
    for (const other of workflowCards) {
      if (other !== card) other.open = false;
    }
  });
}

byId('new-operation').addEventListener('click', () => void startNewOperation());
byId('fetch-catalog').addEventListener('click', () => void fetchCatalog());
byId('tag-project').addEventListener('change', () => renderActivityOptions());
byId('tag-activity').addEventListener('change', () => renderAutomaticTagName());
byId('save-tag').addEventListener('click', () => void saveTagFromEditor());
byId('add-rule-template').addEventListener('click', () =>
  addRuleTemplateShare(settings.markingTemplates[0]?.id, 0),
);
byId('save-rule').addEventListener('click', () => void saveTemplateRule());
document
  .querySelectorAll<HTMLInputElement>('input[name="rule-end"]')
  .forEach((input) => input.addEventListener('change', syncRuleEndControls));
byId('font-decrease').addEventListener('click', () => void adjustFont(-0.1));
byId('font-increase').addEventListener('click', () => void adjustFont(0.1));
byId('open-logins').addEventListener('click', () => void openLoginPages());
for (const [id, action] of [
  ['stop-login', 'login'],
  ['stop-capture', 'capture'],
  ['stop-write', 'write'],
] as const)
  byId(id).addEventListener(
    'click',
    () =>
      void act({
        type: 'STOP_CURRENT_ACTION',
        operationId: operationId(),
        action,
      }),
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
  if (area === 'local')
    void loadExtensionSettings().then((loaded) => {
      settings = loaded;
      render();
    });
});

async function fetchCatalog(): Promise<void> {
  if (catalogPending) return;
  catalogPending = true;
  tagEditorMessage = '';
  render();
  try {
    const response: UiResponse = await chrome.runtime.sendMessage({
      type: 'FETCH_CHANNEL_CATALOG',
      operationId: operationId(),
    });
    if (!response.ok) throw new Error(response.message ?? response.code);
    state = response.state;
    settings = await loadExtensionSettings();
    tagEditorMessage = `${String(settings.catalog?.projects.length ?? 0)} projeto(s) disponíveis para criar TAGs.`;
    renderActivityOptions();
  } catch (error) {
    tagEditorMessage =
      error instanceof Error
        ? error.message
        : 'Não foi possível atualizar o catálogo.';
    logPanelFailure('FETCH_CHANNEL_CATALOG', error);
  } finally {
    catalogPending = false;
    render();
  }
}

async function saveTagFromEditor(): Promise<void> {
  try {
    const project = selectedCatalogProject();
    if (!project)
      throw new Error('Escolha um projeto disponível no cache do Channel.');
    const activityId = byId<HTMLSelectElement>('tag-activity').value;
    const activity = project.activities.find(
      (candidate) => candidate.id === activityId,
    );
    if (!activity) throw new Error('Escolha uma atividade permitida.');
    const name = `${project.label} — ${activity.label}`;
    if (
      settings.tags.some(
        (tag) =>
          tag.name.toLocaleLowerCase('pt-BR') ===
          name.toLocaleLowerCase('pt-BR'),
      )
    )
      throw new Error('Já existe uma TAG para este projeto e atividade.');
    const tag: ChannelTag = {
      id: crypto.randomUUID(),
      name,
      projectId: project.id,
      project: project.label,
      activityId: activity.id,
      activity: activity.label,
      activityType:
        byId<HTMLInputElement>('activity-type').value.trim() || 'Nenhum',
      task: byId<HTMLInputElement>('task').value.trim() || 'Nenhum',
    };
    const makeDefault =
      byId<HTMLInputElement>('tag-default').checked ||
      settings.tags.length === 0;
    settings = {
      ...settings,
      tags: [...settings.tags, tag],
      ...(makeDefault ? { defaultTagId: tag.id } : {}),
    };
    await saveExtensionSettings(settings);
    byId<HTMLInputElement>('tag-name').value = '';
    byId<HTMLSelectElement>('tag-project').value = '';
    byId<HTMLInputElement>('tag-default').checked = false;
    byId<HTMLInputElement>('activity-type').value = 'Nenhum';
    byId<HTMLInputElement>('task').value = 'Nenhum';
    renderActivityOptions();
    tagEditorMessage = `TAG ${name} salva.`;
    render();
  } catch (error) {
    tagEditorMessage =
      error instanceof Error ? error.message : 'Não foi possível salvar a TAG.';
    render();
  }
}

async function setDefaultTag(tagId: string): Promise<void> {
  settings = { ...settings, defaultTagId: tagId };
  await saveExtensionSettings(settings);
  tagEditorMessage = 'TAG padrão atualizada.';
  render();
}

async function removeTag(tagId: string): Promise<void> {
  if (
    settings.markingTemplates.some((template) =>
      template.entries.some((entry) => entry.tagId === tagId),
    )
  ) {
    tagEditorMessage =
      'Esta TAG está sendo usada por um conjunto. Exclua o conjunto antes de remover a TAG.';
    render();
    return;
  }
  const tags = settings.tags.filter((tag) => tag.id !== tagId);
  const defaultTagId =
    settings.defaultTagId === tagId ? tags[0]?.id : settings.defaultTagId;
  const withoutDefault: Omit<ExtensionSettings, 'defaultTagId'> = {
    version: 1,
    tags,
    fontScale: settings.fontScale,
    markingTemplates: settings.markingTemplates,
    templateRules: settings.templateRules,
    ...(settings.fontScaleCustomized === undefined
      ? {}
      : { fontScaleCustomized: settings.fontScaleCustomized }),
    ...(settings.catalog === undefined ? {} : { catalog: settings.catalog }),
  };
  settings =
    defaultTagId === undefined
      ? { ...withoutDefault, tags }
      : { ...withoutDefault, tags, defaultTagId };
  await saveExtensionSettings(settings);
  tagEditorMessage = 'TAG excluída.';
  render();
}

async function adjustFont(delta: number): Promise<void> {
  const fontScale = Math.min(
    1.4,
    Math.max(0.8, Math.round((settings.fontScale + delta) * 10) / 10),
  );
  settings = { ...settings, fontScale, fontScaleCustomized: true };
  await saveExtensionSettings(settings);
  render();
}

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

async function monitorLoginStatus(): Promise<void> {
  const preparation = state?.loginPreparation;
  const pending =
    preparation?.autoSubmit === true &&
    (preparation.ahgora === 'opening' ||
      preparation.ahgora === 'awaiting-user' ||
      preparation.ahgora === 'submitted' ||
      preparation.channel === 'opening' ||
      preparation.channel === 'awaiting-user' ||
      preparation.channel === 'submitted');
  if (
    !pending ||
    !state ||
    loginMonitorPending ||
    requestPending ||
    loginPermissionPending
  )
    return;
  loginMonitorPending = true;
  const monitoredOperationId = state.operationId;
  try {
    const response: UiResponse = await chrome.runtime.sendMessage({
      type: 'CHECK_LOGIN_STATUS',
      operationId: monitoredOperationId,
    });
    if (
      response.ok &&
      response.state.operationId === monitoredOperationId &&
      state.operationId === monitoredOperationId
    ) {
      state = response.state;
      render();
    }
  } catch (error: unknown) {
    logPanelFailure('CHECK_LOGIN_STATUS', error);
  } finally {
    loginMonitorPending = false;
  }
}

globalThis.setInterval(() => void monitorLoginStatus(), 1_500);

resetCapturePeriodToCurrentMonth();
byId<HTMLInputElement>('rule-start').value = currentDateValue();
syncRuleEndControls();
void (async () => {
  settings = await loadExtensionSettings();
  await refresh().catch(() => undefined);
  if (state === undefined)
    await send({ type: 'START_OPERATION', operationId: crypto.randomUUID() });
})();
