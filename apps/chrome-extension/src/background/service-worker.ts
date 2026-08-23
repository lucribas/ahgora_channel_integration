import { loadOperationData, saveOperationData } from '../application/storage';
import {
  emptyOperation,
  publicState,
  type OperationData,
  type RegisteredTab,
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
import { executeChannelFill, executeChannelRead } from '../sites/target';
import {
  advanceQueue,
  cancelOperation,
  captureAndCompareOperation,
  completeDryRun,
  decideItem,
  fillCurrentQueueItem,
  prepareSelectedQueue,
  selectRemainingItems,
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
    const state = emptyOperation(message.operationId);
    await saveOperationData(state);
    cancellationRegistry.resetAfterOperationStarted();
    return success(state);
  }

  const state = await loadOperationData();
  if (state === undefined) return { ok: false, code: 'NO_ACTIVE_OPERATION' };
  assertCurrentOperation(message, state.operationId);

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
    const prepared: OperationData = {
      ...state,
      config: message.config,
      phase: 'capturing',
      message: 'Capturando Ahgora e consultando Channel…',
    };
    return runEffect(prepared, 'capture', async (locked) => {
      await assertRegisteredTabs(locked);
      const result = await captureAndCompareOperation(
        locked,
        coordinatorAdapters(),
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
  if (message.type === 'APPLY_SELECTED') {
    return runEffect(prepareSelectedQueue(state), 'apply', async (locked) => {
      await assertRegisteredTabs(locked);
      const result = await fillCurrentQueueItem(locked, coordinatorAdapters());
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

function coordinatorAdapters(): CoordinatorAdapters {
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
    writeTarget: (state, assignment) =>
      executeValidatedChannelFill(state, assignment, {
        validateTab: assertTabBinding,
        loadState: loadOperationData,
        cancellationRequested: (operationId) =>
          cancellationRegistry.isRequested(operationId),
        dispatchFill: executeChannelFill,
      }),
  };
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
          ? 'Ahgora para Channel: operação concluída sem envio'
          : text === ''
            ? 'Abrir Ahgora para Channel'
            : `Ahgora para Channel: ${text} item(ns) pendente(s)`,
  });
}

function success(state: OperationData): UiResponse {
  return { ok: true, state: publicState(state) };
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
