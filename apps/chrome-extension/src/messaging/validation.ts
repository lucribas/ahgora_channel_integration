import type { IncomingMessage, TabRole } from './messages';
import { BoundaryValidationError } from '../shared/errors';

type UnknownRecord = Record<string, unknown>;

const MESSAGE_TYPES = new Set<IncomingMessage['type']>([
  'GET_STATE',
  'START_OPERATION',
  'SET_PENDING_ROLE',
  'REGISTER_ACTIVE_TAB',
  'CAPTURE_AND_COMPARE',
  'CAPTURE_SOURCE',
  'SHOW_PREVIEW',
  'SET_ITEM_DECISION',
  'SELECT_REMAINING',
  'RUN_DRY_RUN',
  'APPLY_SELECTED',
  'ADVANCE_QUEUE',
  'CANCEL_OPERATION',
]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOperationId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function isTabRole(value: unknown): value is TabRole {
  return value === 'source' || value === 'target';
}

export function isIncomingMessage(value: unknown): value is IncomingMessage {
  if (
    !isRecord(value) ||
    !MESSAGE_TYPES.has(value.type as IncomingMessage['type'])
  )
    return false;
  if (value.type === 'GET_STATE') return true;
  if (!isOperationId(value.operationId)) return false;
  switch (value.type) {
    case 'SET_PENDING_ROLE':
    case 'REGISTER_ACTIVE_TAB':
      return isTabRole(value.role);
    case 'CAPTURE_AND_COMPARE':
      return isRecord(value.config);
    case 'SHOW_PREVIEW':
      return typeof value.dryRun === 'boolean';
    case 'SET_ITEM_DECISION':
      return (
        isOperationId(value.itemId) &&
        (value.decision === 'selected' || value.decision === 'refused')
      );
    case 'START_OPERATION':
    case 'CAPTURE_SOURCE':
    case 'SELECT_REMAINING':
    case 'RUN_DRY_RUN':
    case 'APPLY_SELECTED':
    case 'ADVANCE_QUEUE':
    case 'CANCEL_OPERATION':
      return true;
    default:
      return false;
  }
}

export function assertCurrentOperation(
  message: Exclude<IncomingMessage, { type: 'GET_STATE' }>,
  currentOperationId: string,
): void {
  if (message.operationId !== currentOperationId) {
    throw new BoundaryValidationError('Mensagem de uma operação antiga.');
  }
}

export interface ExpectedContentSender {
  readonly tabId: number;
  readonly frameId: number;
  readonly origin: string;
}

export function assertExtensionSender(
  sender: chrome.runtime.MessageSender,
  extensionId: string,
): void {
  if (sender.id !== extensionId) {
    throw new BoundaryValidationError('Remetente da interface incompatível.');
  }
  // O Chrome omite `url` para algumas páginas internas (inclusive side panel
  // em Chromium headless). O ID próprio + ausência de aba ainda distingue a UI
  // dos content scripts; não há externally_connectable no manifesto.
  if (sender.url === undefined) {
    if (sender.tab !== undefined) {
      throw new BoundaryValidationError('Remetente da interface incompatível.');
    }
    return;
  }
  let url: URL;
  try {
    url = new URL(sender.url);
  } catch {
    throw new BoundaryValidationError('URL da interface inválida.');
  }
  if (url.protocol !== 'chrome-extension:' || url.host !== extensionId) {
    throw new BoundaryValidationError('Origem da interface incompatível.');
  }
}

export function assertContentSender(
  sender: chrome.runtime.MessageSender,
  expected: ExpectedContentSender,
): void {
  if (
    sender.tab?.id !== expected.tabId ||
    sender.frameId !== expected.frameId ||
    sender.url === undefined
  ) {
    throw new BoundaryValidationError('Remetente de conteúdo incompatível.');
  }
  let url: URL;
  try {
    url = new URL(sender.url);
  } catch {
    throw new BoundaryValidationError('URL do remetente inválida.');
  }
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:') ||
    url.origin !== expected.origin
  ) {
    throw new BoundaryValidationError('Origem do remetente incompatível.');
  }
}
