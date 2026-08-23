import type {
  OperationConfig,
  PublicOperationState,
  TabRole,
} from '../application/types';

export type { TabRole } from '../application/types';

export type IncomingMessage =
  | { readonly type: 'GET_STATE' }
  | { readonly type: 'START_OPERATION'; readonly operationId: string }
  | {
      readonly type: 'OPEN_LOGIN_PAGES';
      readonly operationId: string;
      readonly autoSubmit: boolean;
    }
  | {
      readonly type: 'SET_PENDING_ROLE';
      readonly operationId: string;
      readonly role: TabRole;
    }
  | {
      readonly type: 'REGISTER_ACTIVE_TAB';
      readonly operationId: string;
      readonly role: TabRole;
    }
  | {
      readonly type: 'CAPTURE_AND_COMPARE';
      readonly operationId: string;
      readonly config: OperationConfig;
    }
  | { readonly type: 'CAPTURE_SOURCE'; readonly operationId: string }
  | {
      readonly type: 'SHOW_PREVIEW';
      readonly operationId: string;
      readonly dryRun: boolean;
    }
  | {
      readonly type: 'SET_ITEM_DECISION';
      readonly operationId: string;
      readonly itemId: string;
      readonly decision: 'selected' | 'refused';
    }
  | { readonly type: 'SELECT_REMAINING'; readonly operationId: string }
  | { readonly type: 'RUN_DRY_RUN'; readonly operationId: string }
  | { readonly type: 'APPLY_SELECTED'; readonly operationId: string }
  | { readonly type: 'ADVANCE_QUEUE'; readonly operationId: string }
  | { readonly type: 'CANCEL_OPERATION'; readonly operationId: string };

export type OutgoingMessage =
  | {
      readonly type: 'FILL_TARGET';
      readonly operationId: string;
      readonly itemId: string;
    }
  | {
      readonly type: 'OPERATION_STATE';
      readonly operationId: string;
      readonly phase: string;
    }
  | {
      readonly type: 'OPERATION_ERROR';
      readonly operationId: string;
      readonly code: string;
    };

export type UiResponse =
  | { readonly ok: true; readonly state: PublicOperationState }
  | { readonly ok: false; readonly code: string; readonly message?: string };
