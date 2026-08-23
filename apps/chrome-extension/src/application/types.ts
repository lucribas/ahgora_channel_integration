import type {
  CivilDate,
  ComparableWorkRecord,
  PeriodRequest,
  PunchOverride,
  ResolvedPeriod,
} from '../domain';

export type TabRole = 'source' | 'target';

export interface RegisteredTab {
  readonly id: number;
  readonly origin: string;
}

export interface OperationConfig {
  readonly project: string;
  readonly activity: string;
  readonly activityType: string;
  readonly task: string;
  readonly period: PeriodRequest;
  readonly overrides: readonly PunchOverride[];
}

export type PreviewStatus = 'missing' | 'equal' | 'divergent' | 'blocked';
export type ItemDecision = 'pending' | 'selected' | 'refused';
export type FillResultStatus =
  | 'filled'
  | 'already-correct'
  | 'skipped'
  | 'not-found'
  | 'validation-error'
  | 'failed';

export interface PreviewItem {
  readonly id: string;
  readonly date: CivilDate;
  readonly ahgoraDuration: string;
  readonly channelDuration?: string;
  readonly status: PreviewStatus;
  readonly decision: ItemDecision;
  readonly warning?: string;
  readonly result?: FillResultStatus;
}

export interface OperationData {
  readonly version: 1;
  readonly revision: number;
  readonly operationId: string;
  readonly phase:
    | 'setup'
    | 'capturing'
    | 'preview'
    | 'dry-run'
    | 'waiting-review'
    | 'partial'
    | 'completed'
    | 'cancelled'
    | 'failed';
  readonly pendingRole?: TabRole | undefined;
  readonly inFlight?: 'capture' | 'apply' | 'advance' | undefined;
  readonly sourceTab?: RegisteredTab | undefined;
  readonly targetTab?: RegisteredTab | undefined;
  readonly config?: OperationConfig;
  readonly resolvedPeriod?: ResolvedPeriod;
  readonly sourceRows?: readonly ComparableWorkRecord[];
  readonly targetRows?: readonly ComparableWorkRecord[];
  readonly items: readonly PreviewItem[];
  readonly queue: readonly string[];
  readonly queueIndex: number;
  readonly message?: string;
}

export interface PublicOperationState extends OperationData {
  readonly canApply: boolean;
  readonly capturedMinutes: number;
  readonly capturedCount: number;
  readonly reviewMinutes: number;
  readonly reviewCount: number;
  readonly selectedMinutes: number;
  readonly selectedCount: number;
}

export interface OperationTotals {
  readonly capturedMinutes: number;
  readonly capturedCount: number;
  readonly reviewMinutes: number;
  readonly reviewCount: number;
  readonly selectedMinutes: number;
  readonly selectedCount: number;
}

export function emptyOperation(operationId: string): OperationData {
  return {
    version: 1,
    revision: 0,
    operationId,
    phase: 'setup',
    items: [],
    queue: [],
    queueIndex: 0,
  };
}

export function publicState(state: OperationData): PublicOperationState {
  const totals = operationTotals(state);
  return {
    ...state,
    ...totals,
    canApply: state.phase === 'preview' && totals.selectedCount > 0,
  };
}

export function operationTotals(state: OperationData): OperationTotals {
  const sourceByDate = new Map(
    (state.sourceRows ?? []).map((record) => [record.date, record]),
  );
  const reviewable = state.items.flatMap((item) => {
    const minutes = sourceByDate.get(item.date)?.durationMinutes;
    return item.status === 'missing' && minutes !== undefined && minutes > 0
      ? [{ item, minutes }]
      : [];
  });
  const selected = reviewable.filter(
    ({ item }) => item.decision === 'selected',
  );
  return {
    capturedMinutes: (state.sourceRows ?? []).reduce(
      (total, record) => total + record.durationMinutes,
      0,
    ),
    capturedCount: state.sourceRows?.length ?? 0,
    reviewMinutes: reviewable.reduce(
      (total, { minutes }) => total + minutes,
      0,
    ),
    reviewCount: reviewable.length,
    selectedMinutes: selected.reduce(
      (total, { minutes }) => total + minutes,
      0,
    ),
    selectedCount: selected.length,
  };
}
