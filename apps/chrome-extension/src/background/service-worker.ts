import { loadOperationData, saveOperationData } from '../application/storage';
import {
  loadExtensionSettings,
  saveExtensionSettings,
  type ChannelCatalog,
} from '../application/settings';
import {
  emptyOperation,
  publicState,
  type CaptureProgress,
  type LoginPreparation,
  type LoginSiteStatus,
  type OperationData,
  type RegisteredTab,
  type WriteProgress,
} from '../application/types';
import { civilDate, type Clock } from '../domain';
import type { IncomingMessage, UiResponse } from '../messaging/messages';
import {
  assertCurrentOperation,
  assertExtensionSender,
  isIncomingMessage,
} from '../messaging/validation';
import { toSafeDiagnostic } from '../shared/diagnostics';
import { captureAhgora, ChromeSourceScriptRunner } from '../sites/source';
import {
  executeChannelCatalog,
  executeChannelDelete,
  executeChannelFill,
  executeChannelRead,
} from '../sites/target';
import {
  LOGIN_PERMISSION_ORIGINS,
  LOGIN_SITES,
  probeLoginDocument,
  submitAutofilledLogin,
  type LoginSiteDefinition,
} from '../sites/login';
import {
  advanceQueue,
  applyTemplateToItem,
  cancelOperation,
  captureAndCompareOperation,
  completeDryRun,
  decideItem,
  fillCurrentQueueItem,
  fillSelectedQueue,
  prepareSelectedQueue,
  removeAllocation,
  setAllocationRag,
  setAllocationTag,
  selectItemTag,
  selectRemainingItems,
  updateAllocation,
  type CoordinatorAdapters,
} from './coordinator';
import {
  OperationBusyError,
  OperationDisplayError,
  OperationEffectLock,
  type OperationStateStore,
} from './operation-lock';
import { executeValidatedChannelFill } from './validated-write';
import {
  CancellationRegistry,
  createCancellationAwareHandler,
} from './cancellation';

class OperationalError extends Error {}

const effectLock = new OperationEffectLock();
const cancellationRegistry = new CancellationRegistry();
let loginProgressWrites: Promise<void> = Promise.resolve();
const activeLoginAttempts = new Set<number>();
const operationStore: OperationStateStore = {
  load: loadOperationData,
  save: saveOperationData,
};

async function configureSidePanel(): Promise<void> {
  // O listener da action precisa observar o gesto para registrar `activeTab`.
  // Ele próprio abre o painel; o comportamento automático poderia consumir o clique.
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
}

chrome.runtime.onInstalled.addListener(() => void configureSidePanel());
chrome.runtime.onStartup.addListener(() => void configureSidePanel());

chrome.action.onClicked.addListener((tab) => {
  void registerGestureAndOpen(tab).catch(() => updateBadge('!'));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void invalidateTab(
    tabId,
    'A aba registrada foi fechada. Registre-a novamente.',
  );
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url !== undefined) {
    void invalidateChangedOrigin(tabId, changeInfo.url);
  }
  if (changeInfo.url !== undefined || changeInfo.status === 'complete') {
    void resumePreparedLogin(tabId).catch((error: unknown) => {
      console.warn('[AhgoraChannel][LoginResume]', {
        status: 'failed',
        tabId,
        reason: error instanceof Error ? error.message : 'unknown-error',
      });
    });
  }
});

async function registerGestureAndOpen(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id !== undefined) await chrome.sidePanel.open({ tabId: tab.id });
  const state = await loadOperationData();
  if (
    state === undefined ||
    state.pendingRole === undefined ||
    tab.id === undefined ||
    tab.url === undefined
  )
    return;
  const origin = pageOrigin(tab.url);
  const binding: RegisteredTab = { id: tab.id, origin };
  const next: OperationData =
    state.pendingRole === 'source'
      ? {
          ...state,
          revision: state.revision + 1,
          sourceTab: binding,
          pendingRole: undefined,
          message:
            'Aba Ahgora registrada. O acesso será revalidado na captura.',
        }
      : {
          ...state,
          revision: state.revision + 1,
          targetTab: binding,
          pendingRole: undefined,
          message:
            'Aba Channel registrada. O acesso será revalidado na captura.',
        };
  await saveOperationData(next);
  console.info('[AhgoraChannel][TabRegistration]', {
    status: 'ok',
    role: state.pendingRole,
    tabId: tab.id,
    origin,
  });
  await updateBadge(next.sourceTab && next.targetTab ? '' : '1');
}

const handleMessage = createCancellationAwareHandler(
  cancellationRegistry,
  (sender: chrome.runtime.MessageSender) =>
    assertExtensionSender(sender, chrome.runtime.id),
  processMessage,
);

async function processMessage(message: IncomingMessage): Promise<UiResponse> {
  if (message.type === 'GET_STATE') {
    const state = await loadOperationData();
    return state ? success(state) : { ok: false, code: 'NO_ACTIVE_OPERATION' };
  }
  if (message.type === 'START_OPERATION') {
    const previous = await loadOperationData();
    const empty = emptyOperation(message.operationId);
    const connectionsReady = Boolean(previous?.sourceTab && previous.targetTab);
    const state: OperationData = connectionsReady
      ? {
          ...empty,
          sourceTab: previous?.sourceTab,
          targetTab: previous?.targetTab,
          loginPreparation: previous?.loginPreparation ?? {
            ahgora: 'ready',
            channel: 'ready',
            ahgoraDetail: 'Conexão preservada da operação anterior.',
            channelDetail: 'Conexão preservada da operação anterior.',
            autoSubmit: false,
          },
          message:
            'Nova operação iniciada com as conexões Ahgora e Channel preservadas.',
        }
      : empty;
    await saveOperationData(state);
    cancellationRegistry.resetAfterOperationStarted();
    return success(state);
  }

  const state = await loadOperationData();
  if (state === undefined) return { ok: false, code: 'NO_ACTIVE_OPERATION' };
  assertCurrentOperation(message, state.operationId);

  if (message.type === 'STOP_CURRENT_ACTION') {
    const stopped = stopCurrentAction(state, message.action);
    await saveOperationData(stopped);
    return success(stopped);
  }

  if (message.type === 'CHECK_LOGIN_STATUS') {
    return success(await monitorPreparedLogins(state));
  }

  if (message.type === 'FETCH_CHANNEL_CATALOG') {
    if (!state.targetTab)
      throw new OperationalError('Conecte a aba Channel antes de consultar.');
    await assertTabBinding(state.targetTab);
    const result = await executeChannelCatalog(state.targetTab.id);
    if (!result.ok)
      throw new OperationalError(
        `Não foi possível obter projetos e atividades do Channel: ${result.code}.`,
      );
    const catalog: ChannelCatalog = {
      fetchedAt: new Date().toISOString(),
      projects: result.projects,
    };
    const settings = await loadExtensionSettings();
    await saveExtensionSettings({ ...settings, catalog });
    const latest = await loadOperationData();
    if (
      latest?.operationId !== state.operationId ||
      latest.revision !== state.revision
    )
      throw new OperationalError('A operação mudou durante a consulta.');
    const committed: OperationData = {
      ...latest,
      revision: latest.revision + 1,
      message: `${String(catalog.projects.length)} projeto(s) e ${String(catalog.projects.reduce((total, project) => total + project.activities.length, 0))} atividade(s) armazenados no cache local.`,
    };
    await saveOperationData(committed);
    return success(committed, catalog);
  }

  if (message.type === 'OPEN_LOGIN_PAGES') {
    if (state.inFlight !== undefined)
      throw new OperationalError('Aguarde a ação atual terminar ou cancele.');
    cancellationRegistry.clear(state.operationId);
    return success(await openLoginPages(state, message.autoSubmit));
  }

  if (message.type === 'CANCEL_OPERATION') {
    const committed = {
      ...cancelOperation(state),
      revision: state.revision + 1,
    };
    await saveOperationData(committed);
    await updateBadge('!');
    return success(committed);
  }

  if (message.type === 'CAPTURE_AND_COMPARE') {
    cancellationRegistry.clear(state.operationId);
    const prepared: OperationData = {
      ...state,
      config: message.config,
      phase: 'capturing',
      captureProgress: {
        ahgora: {
          status: 'running',
          detail: 'Preparando a consulta autenticada do Ahgora…',
        },
        channel: {
          status: 'waiting',
          detail: 'Aguardando a captura do Ahgora.',
        },
      },
      message: 'Captura iniciada. Acompanhe Ahgora e Channel separadamente.',
    };
    return runEffect(prepared, 'capture', async (locked) => {
      await assertRegisteredTabs(locked);
      const result = await captureAndCompareOperation(
        locked,
        coordinatorAdapters((progress) =>
          persistCaptureProgress(locked, progress),
        ),
      );
      await updateBadge(
        String(
          Math.min(
            result.items.filter((item) => item.status === 'missing').length,
            99,
          ),
        ),
      );
      return result;
    });
  }
  if (message.type === 'DELETE_CHANNEL_MARKING') {
    const item = state.items.find(
      (candidate) => candidate.id === message.itemId,
    );
    const marking = item?.channelMarkings?.find(
      (candidate) => candidate.id === message.markingId,
    );
    if (!item || !marking)
      throw new OperationalError(
        'A marcação não pertence mais à prévia. Capture e compare novamente.',
      );
    if (!marking.canDelete)
      throw new OperationalError(
        'O Channel não permite excluir esta marcação.',
      );
    const prepared: OperationData = {
      ...state,
      message: `Excluindo a marcação ${marking.duration} de ${formatDateForMessage(item.date)} no Channel…`,
    };
    return runEffect(prepared, 'delete', async (locked) => {
      await assertRegisteredTabs(locked);
      if (!locked.targetTab)
        throw new Error('A aba Channel não está registrada.');
      const deleted = await executeChannelDelete(locked.targetTab.id, {
        id: marking.id,
        date: item.date,
      });
      if (!deleted.ok)
        throw new Error(channelDeleteFailureMessage(deleted.code));
      let refreshed: OperationData;
      try {
        refreshed = await captureAndCompareOperation(
          locked,
          coordinatorAdapters(),
        );
      } catch {
        throw new Error(
          'A marcação foi excluída do Channel, mas não foi possível atualizar a prévia. Capture e compare novamente.',
        );
      }
      await updateBadge(
        String(
          Math.min(
            refreshed.items.filter(
              (candidate) => candidate.status === 'missing',
            ).length,
            99,
          ),
        ),
      );
      return {
        ...refreshed,
        message: `Marcação ${marking.duration} de ${formatDateForMessage(item.date)} excluída do Channel e prévia atualizada.`,
      };
    });
  }
  if (message.type === 'APPLY_SELECTED') {
    cancellationRegistry.clear(state.operationId);
    return runEffect(prepareSelectedQueue(state), 'apply', async (locked) => {
      await assertRegisteredTabs(locked);
      const result = await fillSelectedQueue(
        locked,
        coordinatorAdapters(undefined, (progressState, progress) =>
          persistWriteProgress(locked, progressState, progress),
        ),
      );
      await updateQueueBadge(result);
      return result;
    });
  }
  if (message.type === 'ADVANCE_QUEUE') {
    return runEffect(advanceQueue(state), 'advance', async (locked) => {
      await assertRegisteredTabs(locked);
      const result = await fillCurrentQueueItem(locked, coordinatorAdapters());
      await updateQueueBadge(result);
      return result;
    });
  }
  if (state.inFlight !== undefined) {
    throw new OperationalError('Aguarde a ação atual terminar ou cancele.');
  }

  let next: OperationData;
  switch (message.type) {
    case 'SET_PENDING_ROLE':
    case 'REGISTER_ACTIVE_TAB':
      next = {
        ...state,
        pendingRole: message.role,
        message: `Vá até a aba ${message.role === 'source' ? 'Ahgora' : 'Channel'} e clique no ícone da extensão.`,
      };
      break;
    case 'SET_ITEM_DECISION':
      next = decideItem(state, message.itemId, message.decision);
      break;
    case 'SET_ITEM_TAG':
      next = selectItemTag(state, message.itemId, message.tagId);
      break;
    case 'SET_ALLOCATION_TAG':
      next = setAllocationTag(
        state,
        message.itemId,
        message.allocationId,
        message.tagId,
      );
      break;
    case 'SET_ALLOCATION_RAG':
      next = setAllocationRag(
        state,
        message.itemId,
        message.allocationId,
        message.catalogId,
        message.ragItemId,
      );
      break;
    case 'UPDATE_ALLOCATION':
      next = updateAllocation(
        state,
        message.itemId,
        message.allocationId,
        message.mode,
        message.value,
      );
      break;
    case 'REMOVE_ALLOCATION':
      next = removeAllocation(state, message.itemId, message.allocationId);
      break;
    case 'APPLY_MARKING_TEMPLATE':
      next = applyTemplateToItem(
        state,
        message.itemId,
        message.template,
        message.basis,
        message.overflowStrategy,
      );
      break;
    case 'SELECT_REMAINING':
      next = selectRemainingItems(state);
      break;
    case 'RUN_DRY_RUN':
      next = completeDryRun(state);
      await updateBadge('✓');
      break;
    case 'CAPTURE_SOURCE':
    case 'SHOW_PREVIEW':
      return { ok: false, code: 'LEGACY_COMMAND_NOT_AVAILABLE' };
  }
  const current = await loadOperationData();
  if (
    current?.operationId !== state.operationId ||
    current.revision !== state.revision
  ) {
    throw new OperationalError(
      'A operação mudou enquanto esta ação era executada; o resultado antigo foi descartado.',
    );
  }
  const committed = { ...next, revision: state.revision + 1 };
  await saveOperationData(committed);
  return success(committed);
}

function formatDateForMessage(date: string): string {
  const [year, month, day] = date.split('-');
  return year && month && day ? `${day}/${month}/${year}` : date;
}

function channelDeleteFailureMessage(code: string): string {
  return (
    (
      {
        'login-required': 'Conclua o login do Channel e tente novamente.',
        'marking-not-found':
          'A marcação não existe mais no Channel. Capture e compare novamente.',
        'marking-delete-not-permitted':
          'O Channel não permite excluir esta marcação.',
        'delete-not-confirmed':
          'O Channel recebeu a exclusão, mas ainda mantém a marcação. Capture e compare antes de tentar novamente.',
        'channel-participant-unavailable':
          'O Channel não informou o participante necessário para confirmar a exclusão.',
        'channel-delete-api-unavailable':
          'A API de exclusão não está disponível na aba Channel registrada.',
      } as Readonly<Record<string, string>>
    )[code] ?? `Não foi possível excluir a marcação no Channel: ${code}.`
  );
}

async function openLoginPages(
  state: OperationData,
  autoSubmit: boolean,
): Promise<OperationData> {
  assertActionNotStopped(state.operationId);
  let current = await commitLoginPreparation(
    state,
    {
      ahgora: 'opening',
      channel: 'opening',
      ahgoraDetail: 'Abrindo ou reutilizando a página de login do Ahgora…',
      channelDetail: 'Abrindo ou reutilizando a página de login do Channel…',
      autoSubmit,
      permissionDenied: !autoSubmit,
      ...(state.loginPreparation?.sourceTabId === undefined
        ? {}
        : { sourceTabId: state.loginPreparation.sourceTabId }),
      ...(state.loginPreparation?.targetTabId === undefined
        ? {}
        : { targetTabId: state.loginPreparation.targetTabId }),
    },
    'Abrindo as páginas de autenticação…',
  );
  const [sourceResult, targetResult] = await Promise.allSettled([
    getOrCreateLoginTab(
      state.loginPreparation?.sourceTabId,
      LOGIN_SITES[0].loginUrl,
    ),
    getOrCreateLoginTab(
      state.loginPreparation?.targetTabId,
      LOGIN_SITES[1].loginUrl,
    ),
  ] as const);
  const sourceTabId =
    sourceResult.status === 'fulfilled' ? sourceResult.value.id : undefined;
  const targetTabId =
    targetResult.status === 'fulfilled' ? targetResult.value.id : undefined;
  assertActionNotStopped(state.operationId);
  current = await commitLoginPreparation(
    current,
    {
      ahgora: sourceTabId === undefined ? 'failed' : 'awaiting-user',
      channel: targetTabId === undefined ? 'failed' : 'awaiting-user',
      ahgoraDetail:
        sourceTabId === undefined
          ? 'Não foi possível abrir a página do Ahgora.'
          : autoSubmit
            ? 'Aguardando o formulário e o preenchimento automático…'
            : 'Permissão recusada. Faça login manualmente ou tente concedê-la novamente.',
      channelDetail:
        targetTabId === undefined
          ? 'Não foi possível abrir a página do Channel.'
          : autoSubmit
            ? 'Aguardando o formulário e o preenchimento automático…'
            : 'Permissão recusada. Faça login manualmente ou tente concedê-la novamente.',
      autoSubmit,
      permissionDenied: !autoSubmit,
      ...(sourceTabId === undefined ? {} : { sourceTabId }),
      ...(targetTabId === undefined ? {} : { targetTabId }),
    },
    autoSubmit
      ? 'Páginas abertas. Aguardando o preenchimento automático para tentar o login…'
      : 'A permissão foi recusada. Ela é necessária para detectar e concluir os logins automaticamente; conceda-a na nova tentativa ou faça o processo manual.',
  );
  if (!autoSubmit) return current;
  assertActionNotStopped(state.operationId);

  const [ahgora, channel] = await Promise.all([
    sourceTabId === undefined
      ? Promise.resolve<LoginSiteStatus>('failed')
      : attemptAutomaticLogin(LOGIN_SITES[0], sourceTabId, state.operationId),
    targetTabId === undefined
      ? Promise.resolve<LoginSiteStatus>('failed')
      : attemptAutomaticLogin(LOGIN_SITES[1], targetTabId, state.operationId),
  ]);
  assertActionNotStopped(state.operationId);
  const ready = ahgora === 'ready' && channel === 'ready';
  const latestProgress = await loadOperationData();
  const latestPreparation =
    latestProgress?.operationId === state.operationId
      ? latestProgress.loginPreparation
      : undefined;
  const prepared = await commitLoginPreparation(
    current,
    {
      ahgora,
      channel,
      ahgoraDetail:
        latestPreparation?.ahgoraDetail ?? loginDetail('Ahgora', ahgora),
      channelDetail:
        latestPreparation?.channelDetail ?? loginDetail('Channel', channel),
      autoSubmit,
      permissionDenied: false,
      ...(sourceTabId === undefined ? {} : { sourceTabId }),
      ...(targetTabId === undefined ? {} : { targetTabId }),
    },
    ready
      ? 'Logins detectados e páginas de trabalho abertas. Conectando as abas automaticamente…'
      : 'Uma ou mais sessões ainda não foram confirmadas. Conclua o login indicado e tente novamente.',
  );
  return registerPreparedTabs(prepared);
}

async function registerPreparedTabs(
  state: OperationData,
): Promise<OperationData> {
  assertActionNotStopped(state.operationId);
  const preparation = state.loginPreparation;
  if (!preparation?.autoSubmit) return state;
  const permissionGranted = await chrome.permissions.contains({
    origins: [...LOGIN_PERMISSION_ORIGINS],
  });
  if (!permissionGranted) return state;
  const sourceTab =
    preparation.ahgora === 'ready' && preparation.sourceTabId !== undefined
      ? {
          id: preparation.sourceTabId,
          origin: new URL(LOGIN_SITES[0].destinationUrl).origin,
        }
      : undefined;
  const targetTab =
    preparation.channel === 'ready' && preparation.targetTabId !== undefined
      ? {
          id: preparation.targetTabId,
          origin: new URL(LOGIN_SITES[1].destinationUrl).origin,
        }
      : undefined;
  if (!sourceTab && !targetTab) return state;
  const latest = await loadOperationData();
  if (latest?.operationId !== state.operationId)
    throw new OperationalError('A operação foi substituída.');
  const next: OperationData = {
    ...latest,
    revision: latest.revision + 1,
    ...(sourceTab === undefined ? {} : { sourceTab }),
    ...(targetTab === undefined ? {} : { targetTab }),
    message:
      sourceTab && targetTab
        ? 'Logins e registro automático concluídos. Configure a operação.'
        : 'Uma aba foi registrada automaticamente. Use o registro manual somente na aba pendente.',
  };
  await saveOperationData(next);
  console.info('[AhgoraChannel][AutomaticTabRegistration]', {
    status: sourceTab && targetTab ? 'complete' : 'partial',
    sourceRegistered: sourceTab !== undefined,
    targetRegistered: targetTab !== undefined,
  });
  await updateBadge(sourceTab && targetTab ? '' : '1');
  return next;
}

async function commitLoginPreparation(
  expected: OperationData,
  loginPreparation: LoginPreparation,
  message: string,
): Promise<OperationData> {
  assertActionNotStopped(expected.operationId);
  const latest = await loadOperationData();
  if (latest?.operationId !== expected.operationId)
    throw new OperationalError('A operação foi substituída.');
  const next: OperationData = {
    ...latest,
    revision: latest.revision + 1,
    loginPreparation,
    message,
  };
  await saveOperationData(next);
  return next;
}

async function attemptAutomaticLogin(
  site: LoginSiteDefinition,
  tabId: number,
  operationId: string,
): Promise<LoginSiteStatus> {
  assertActionNotStopped(operationId);
  if (activeLoginAttempts.has(tabId)) return 'submitted';
  activeLoginAttempts.add(tabId);
  try {
    await reportLoginProgress(
      operationId,
      site.role,
      'opening',
      'Carregando o formulário e aguardando o preenchimento automático…',
    );
    await waitForTabReady(tabId, 15_000);
    assertActionNotStopped(operationId);
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: submitAutofilledLogin,
      args: [
        {
          formSelector: site.formSelector,
          usernameSelector: site.usernameSelector,
          passwordSelector: site.passwordSelector,
          timeoutMs: 15_000,
          loginPathnames: [new URL(site.loginUrl).pathname],
        },
      ],
    });
    if (execution?.result === 'not-filled') {
      await reportLoginProgress(
        operationId,
        site.role,
        'awaiting-user',
        'O gerenciador de senhas ainda não preencheu os campos. Preencha-os e tente novamente.',
      );
      return 'awaiting-user';
    }
    if (execution?.result === 'submitted') {
      await reportLoginProgress(
        operationId,
        site.role,
        'submitted',
        'Login enviado; confirmando a sessão…',
      );
      const authenticated = await waitForLoginCompletion(site, tabId, 15_000);
      assertActionNotStopped(operationId);
      if (!authenticated) {
        await reportLoginProgress(
          operationId,
          site.role,
          'submitted',
          'O formulário foi enviado, mas a navegação ainda não confirmou o login.',
        );
        return 'submitted';
      }
    }
    if (execution?.result === 'already-authenticated') {
      await reportLoginProgress(
        operationId,
        site.role,
        'submitted',
        'Sessão detectada; carregando e confirmando a página de trabalho…',
      );
    }
    const confirmed = await openAndConfirmWorkPage(site, tabId);
    assertActionNotStopped(operationId);
    if (!confirmed) {
      await reportLoginProgress(
        operationId,
        site.role,
        'awaiting-user',
        'A página de trabalho retornou ao login. Confira as credenciais e tente novamente.',
      );
      return 'awaiting-user';
    }
    await reportLoginProgress(
      operationId,
      site.role,
      'ready',
      'Login confirmado; página de trabalho aberta.',
    );
    return 'ready';
  } catch (error: unknown) {
    console.warn('[AhgoraChannel][LoginPreparation]', {
      status: 'manual-required',
      role: site.role,
      code: error instanceof Error ? error.name : 'UnknownError',
      reason: error instanceof Error ? error.message : 'unknown-error',
    });
    await reportLoginProgress(
      operationId,
      site.role,
      'awaiting-user',
      'Não foi possível confirmar automaticamente. Conclua o login e tente novamente.',
    );
    return 'awaiting-user';
  } finally {
    activeLoginAttempts.delete(tabId);
  }
}

async function resumePreparedLogin(
  tabId: number,
  passive = false,
): Promise<void> {
  if (activeLoginAttempts.has(tabId)) return;
  const state = await loadOperationData();
  const preparation = state?.loginPreparation;
  if (!state || !preparation?.autoSubmit) return;
  const role =
    preparation.sourceTabId === tabId
      ? 'source'
      : preparation.targetTabId === tabId
        ? 'target'
        : undefined;
  if (role === undefined) return;
  const status = role === 'source' ? preparation.ahgora : preparation.channel;
  if (
    status === 'ready' ||
    status === 'failed' ||
    status === 'idle' ||
    status === 'stopped'
  )
    return;
  const permissionGranted = await chrome.permissions.contains({
    origins: [...LOGIN_PERMISSION_ORIGINS],
  });
  if (!permissionGranted) return;

  const site = role === 'source' ? LOGIN_SITES[0] : LOGIN_SITES[1];
  if (passive) {
    try {
      const [probe] = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: probeLoginDocument,
        args: [site.formSelector],
      });
      if (!probe?.result?.ready || probe.result.formVisible) return;
    } catch {
      return;
    }
  }
  const result = await attemptAutomaticLogin(site, tabId, state.operationId);
  const latest = await loadOperationData();
  if (latest?.operationId !== state.operationId || !latest.loginPreparation)
    return;
  const nextPreparation: LoginPreparation = {
    ...latest.loginPreparation,
    ...(role === 'source'
      ? {
          ahgora: result,
          ahgoraDetail:
            result === 'ready'
              ? 'Login do Ahgora detectado automaticamente; página de trabalho aberta.'
              : latest.loginPreparation.ahgoraDetail,
        }
      : {
          channel: result,
          channelDetail:
            result === 'ready'
              ? 'Login do Channel detectado automaticamente; página de trabalho aberta.'
              : latest.loginPreparation.channelDetail,
        }),
  };
  const updated = await commitLoginPreparation(
    latest,
    nextPreparation,
    result === 'ready'
      ? `Login do ${role === 'source' ? 'Ahgora' : 'Channel'} detectado. Conectando a aba automaticamente…`
      : (latest.message ?? 'Aguardando a conclusão do login.'),
  );
  if (result === 'ready') await registerPreparedTabs(updated);
}

async function monitorPreparedLogins(
  state: OperationData,
): Promise<OperationData> {
  const preparation = state.loginPreparation;
  if (!preparation?.autoSubmit) return state;
  const pendingTabIds = [
    preparation.ahgora === 'ready' ? undefined : preparation.sourceTabId,
    preparation.channel === 'ready' ? undefined : preparation.targetTabId,
  ];
  for (const tabId of pendingTabIds) {
    if (tabId !== undefined) await resumePreparedLogin(tabId, true);
  }
  const latest = await loadOperationData();
  return latest?.operationId === state.operationId ? latest : state;
}

async function openAndConfirmWorkPage(
  site: LoginSiteDefinition,
  tabId: number,
): Promise<boolean> {
  await chrome.tabs.update(tabId, { url: site.destinationUrl });
  const destination = new URL(site.destinationUrl);
  const deadline = Date.now() + 12_000;
  while (Date.now() <= deadline) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.url) {
        const current = new URL(tab.url);
        if (
          current.origin === destination.origin &&
          current.pathname === destination.pathname
        ) {
          const [probe] = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: probeLoginDocument,
            args: [site.formSelector, site.workSelector],
          });
          if (
            probe?.result?.ready &&
            !probe.result.formVisible &&
            (probe.result.workMarkerPresent || tab.status === 'complete')
          )
            return true;
        }
      }
    } catch {
      // A navegação substitui o documento; tente novamente no próximo ciclo.
    }
    await delay(100);
  }
  return false;
}

async function getOrCreateLoginTab(
  existingTabId: number | undefined,
  loginUrl: string,
): Promise<chrome.tabs.Tab> {
  if (existingTabId !== undefined) {
    try {
      const tab = await chrome.tabs.get(existingTabId);
      await chrome.tabs.update(existingTabId, { active: true });
      return tab;
    } catch {
      // A aba anterior foi fechada; uma nova será criada abaixo.
    }
  }
  return chrome.tabs.create({ url: loginUrl });
}

function loginDetail(siteName: string, status: LoginSiteStatus): string {
  return {
    idle: `${siteName} ainda não foi aberto.`,
    opening: `Carregando ${siteName}…`,
    'awaiting-user': `Aguardando a conclusão manual do login no ${siteName}.`,
    submitted: `Login enviado ao ${siteName}; a sessão ainda não foi confirmada.`,
    ready: `Login do ${siteName} confirmado; página de trabalho aberta.`,
    failed: `Não foi possível abrir ${siteName}.`,
    stopped: `Login do ${siteName} interrompido pelo usuário.`,
  }[status];
}

async function reportLoginProgress(
  operationId: string,
  role: LoginSiteDefinition['role'],
  status: LoginSiteStatus,
  detail: string,
): Promise<void> {
  if (cancellationRegistry.isRequested(operationId)) return;
  const write = loginProgressWrites.then(async () => {
    if (cancellationRegistry.isRequested(operationId)) return;
    const current = await loadOperationData();
    if (current?.operationId !== operationId || !current.loginPreparation)
      return;
    const loginPreparation: LoginPreparation = {
      ...current.loginPreparation,
      ...(role === 'source'
        ? { ahgora: status, ahgoraDetail: detail }
        : { channel: status, channelDetail: detail }),
    };
    await saveOperationData({
      ...current,
      revision: current.revision + 1,
      loginPreparation,
      message: detail,
    });
  });
  loginProgressWrites = write.catch(() => undefined);
  await write;
}

async function waitForTabReady(tabId: number, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') return;
    try {
      const [probe] = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => document.readyState !== 'loading',
      });
      if (probe?.result) return;
    } catch {
      // O documento pode estar sendo substituído durante o redirecionamento.
    }
    await delay(100);
  }
  throw new Error('tab-load-timeout');
}

async function waitForLoginCompletion(
  site: LoginSiteDefinition,
  tabId: number,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    try {
      const [probe] = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: probeLoginDocument,
        args: [site.formSelector],
      });
      if (probe?.result?.ready && !probe.result.formVisible) return true;
    } catch {
      // Durante a navegação o frame pode ficar temporariamente indisponível.
    }
    await delay(100);
  }
  return false;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function assertActionNotStopped(operationId: string): void {
  if (cancellationRegistry.isRequested(operationId))
    throw new OperationalError('Ação interrompida pelo usuário.');
}

function stopCurrentAction(
  state: OperationData,
  action: 'login' | 'capture' | 'write',
): OperationData {
  const stopSystem = (progress: CaptureProgress['ahgora']) =>
    progress.status === 'running'
      ? {
          ...progress,
          status: 'stopped' as const,
          detail: 'Interrompido pelo usuário.',
        }
      : progress;
  const preparation = state.loginPreparation;
  const loginPreparation =
    action === 'login' && preparation
      ? {
          ...preparation,
          ahgora:
            preparation.ahgora === 'ready'
              ? ('ready' as const)
              : ('stopped' as const),
          channel:
            preparation.channel === 'ready'
              ? ('ready' as const)
              : ('stopped' as const),
          ahgoraDetail:
            preparation.ahgora === 'ready'
              ? preparation.ahgoraDetail
              : 'Login interrompido pelo usuário.',
          channelDetail:
            preparation.channel === 'ready'
              ? preparation.channelDetail
              : 'Login interrompido pelo usuário.',
          autoSubmit: false,
        }
      : preparation;
  return {
    ...state,
    revision: state.revision + 1,
    inFlight: undefined,
    ...(loginPreparation === undefined ? {} : { loginPreparation }),
    ...(action === 'capture' && state.captureProgress
      ? {
          captureProgress: {
            ahgora: stopSystem(state.captureProgress.ahgora),
            channel: stopSystem(state.captureProgress.channel),
          },
        }
      : {}),
    ...(action === 'write' && state.writeProgress
      ? {
          writeProgress: {
            ...state.writeProgress,
            status: 'stopped' as const,
            detail:
              'Envio interrompido. Capture e compare novamente antes de retomar.',
          },
        }
      : {}),
    phase:
      action === 'capture'
        ? 'setup'
        : action === 'write'
          ? 'failed'
          : state.phase,
    message:
      action === 'login'
        ? 'Login interrompido pelo usuário.'
        : action === 'capture'
          ? 'Captura interrompida pelo usuário.'
          : 'Envio interrompido. Capture e compare novamente para reconciliar o Channel.',
  };
}

async function runEffect(
  state: OperationData,
  kind: NonNullable<OperationData['inFlight']>,
  effect: (locked: OperationData) => Promise<OperationData>,
): Promise<UiResponse> {
  try {
    const result = await effectLock.run(
      state,
      kind,
      operationStore,
      async (locked) => {
        try {
          return await effect(locked);
        } catch (error) {
          if (error instanceof Error)
            throw new OperationDisplayError(error.message);
          throw error;
        }
      },
    );
    return success(result);
  } catch (error) {
    if (error instanceof OperationBusyError || error instanceof Error) {
      throw new OperationalError(error.message);
    }
    throw error;
  }
}

function coordinatorAdapters(
  reportCaptureProgress?: (progress: CaptureProgress) => Promise<void>,
  reportWriteProgress?: (
    state: OperationData,
    progress: WriteProgress,
  ) => Promise<void>,
): CoordinatorAdapters {
  const today = browserClock().today();
  return {
    today,
    captureSource: (tabId, period) =>
      captureAhgora(new ChromeSourceScriptRunner(), {
        tabId,
        today,
        period,
      }),
    readTarget: executeChannelRead,
    cancellationRequested: (operationId) =>
      cancellationRegistry.isRequested(operationId),
    writeTarget: (state, assignment) =>
      executeValidatedChannelFill(state, assignment, {
        validateTab: assertTabBinding,
        loadState: loadOperationData,
        cancellationRequested: (operationId) =>
          cancellationRegistry.isRequested(operationId),
        dispatchFill: executeChannelFill,
      }),
    ...(reportCaptureProgress === undefined ? {} : { reportCaptureProgress }),
    ...(reportWriteProgress === undefined ? {} : { reportWriteProgress }),
  };
}

async function persistWriteProgress(
  expected: OperationData,
  progressState: OperationData,
  progress: WriteProgress,
): Promise<void> {
  const current = await loadOperationData();
  if (
    current?.operationId !== expected.operationId ||
    current.revision !== expected.revision ||
    current.inFlight !== 'apply'
  )
    return;
  await saveOperationData({
    ...current,
    phase: progressState.phase,
    items: progressState.items,
    queue: progressState.queue,
    queueIndex: progressState.queueIndex,
    ...(progressState.targetRows === undefined
      ? {}
      : { targetRows: progressState.targetRows }),
    writeProgress: progress,
    message: progressState.message ?? progress.detail,
  });
}

async function persistCaptureProgress(
  expected: OperationData,
  progress: CaptureProgress,
): Promise<void> {
  const current = await loadOperationData();
  if (
    current?.operationId !== expected.operationId ||
    current.revision !== expected.revision ||
    current.inFlight !== 'capture'
  )
    return;
  const active =
    progress.ahgora.status === 'running'
      ? progress.ahgora.detail
      : progress.channel.status === 'running'
        ? progress.channel.detail
        : progress.channel.status === 'failed'
          ? progress.channel.detail
          : 'Captura e consulta concluídas; preparando a prévia.';
  await saveOperationData({
    ...current,
    captureProgress: progress,
    message: active,
  });
}

async function assertRegisteredTabs(state: OperationData): Promise<void> {
  if (!state.sourceTab || !state.targetTab) {
    throw new OperationalError('Registre as duas abas novamente.');
  }
  await assertTabBinding(state.sourceTab);
  await assertTabBinding(state.targetTab);
}

async function updateQueueBadge(state: OperationData): Promise<void> {
  if (state.phase === 'completed') {
    await updateBadge('✓');
    return;
  }
  if (state.phase !== 'waiting-review') {
    await updateBadge('!');
    return;
  }
  await updateBadge(
    String(Math.min(state.queue.length - state.queueIndex - 1, 99)),
  );
}

async function assertTabBinding(binding: RegisteredTab): Promise<void> {
  const tab = await chrome.tabs.get(binding.id);
  if (!tab.url || pageOrigin(tab.url) !== binding.origin)
    throw new OperationalError(
      'A aba navegou ou perdeu a origem registrada. Registre-a novamente.',
    );
}

function pageOrigin(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    throw new OperationalError(
      'A action deve ser usada em uma página HTTP(S).',
    );
  return parsed.origin;
}

function browserClock(): Clock {
  return {
    today: () => {
      const now = new Date();
      return civilDate(
        `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
      );
    },
  };
}

async function invalidateTab(tabId: number, message: string): Promise<void> {
  const state = await loadOperationData();
  if (!state) return;
  let next = state;
  if (state.sourceTab?.id === tabId)
    next = { ...next, sourceTab: undefined, message };
  if (state.targetTab?.id === tabId)
    next = { ...next, targetTab: undefined, message };
  if (next !== state) {
    await saveOperationData({ ...next, revision: state.revision + 1 });
    await updateBadge('!');
  }
}

async function invalidateChangedOrigin(
  tabId: number,
  url: string,
): Promise<void> {
  const state = await loadOperationData();
  if (!state) return;
  const binding =
    state.sourceTab?.id === tabId
      ? state.sourceTab
      : state.targetTab?.id === tabId
        ? state.targetTab
        : undefined;
  if (!binding) return;
  try {
    if (pageOrigin(url) === binding.origin) return;
  } catch {
    /* invalidate below */
  }
  await invalidateTab(
    tabId,
    'A aba registrada navegou para outra origem. Conceda acesso novamente.',
  );
}

async function updateBadge(text: string): Promise<void> {
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({
    color: text === '!' ? '#9a3030' : '#075d8c',
  });
  await chrome.action.setTitle({
    title:
      text === '!'
        ? 'Ahgora para Channel: atenção necessária'
        : text === '✓'
          ? 'Ahgora para Channel: operação concluída'
          : text === ''
            ? 'Abrir Ahgora para Channel'
            : `Ahgora para Channel: ${text} item(ns) pendente(s)`,
  });
}

function success(state: OperationData, catalog?: ChannelCatalog): UiResponse {
  return {
    ok: true,
    state: publicState(state),
    ...(catalog === undefined ? {} : { catalog }),
  };
}

chrome.runtime.onMessage.addListener(
  (candidate: unknown, sender, sendResponse) => {
    if (!isIncomingMessage(candidate)) {
      sendResponse({ ok: false, code: 'INVALID_MESSAGE' });
      return false;
    }
    void handleMessage(candidate, sender)
      .then(sendResponse)
      .catch((error: unknown) => {
        const diagnostic = toSafeDiagnostic(error, 'background');
        console.error('[AhgoraChannel][Background]', {
          status: 'failed',
          messageType: candidate.type,
          ...diagnostic,
          message:
            error instanceof OperationalError
              ? error.message
              : 'Falha inesperada.',
        });
        sendResponse({
          ok: false,
          ...diagnostic,
          message:
            error instanceof OperationalError
              ? error.message
              : 'Falha inesperada. Registre novamente as abas e tente outra vez.',
        });
      });
    return true;
  },
);
