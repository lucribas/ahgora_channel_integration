import type { OperationData, PreviewItem } from '../application/types';
import {
  assignExpertProject,
  calculatePunchDays,
  civilDate,
  compareAhgoraWithChannel,
  formatBrazilianDate,
  lastRowByDate,
  resolvePeriod,
  type CivilDate,
  type ComparableWorkRecord,
  type ProjectAssignment,
} from '../domain';
import type { CaptureAhgoraResult } from '../sites/source';
import type {
  InjectedChannelFillResult,
  InjectedChannelReadInput,
  InjectedChannelReadResult,
} from '../sites/target';

export interface CoordinatorAdapters {
  readonly today: CivilDate;
  captureSource(
    tabId: number,
    period: NonNullable<OperationData['resolvedPeriod']>,
  ): Promise<CaptureAhgoraResult>;
  readTarget(
    tabId: number,
    input: InjectedChannelReadInput,
  ): Promise<InjectedChannelReadResult>;
  writeTarget(
    state: OperationData,
    assignment: ProjectAssignment,
  ): Promise<InjectedChannelFillResult>;
}

export async function captureAndCompareOperation(
  state: OperationData,
  adapters: CoordinatorAdapters,
): Promise<OperationData> {
  if (!state.sourceTab || !state.targetTab || !state.config) {
    throw new Error(
      'Registre as abas Ahgora e Channel e informe a configuração.',
    );
  }
  const period = resolvePeriod(state.config.period, {
    today: () => adapters.today,
  });
  const source = await adapters.captureSource(state.sourceTab.id, period);
  if (!source.ok) throw new Error(source.error.message);
  const calculation = calculatePunchDays(source.days, state.config.overrides);
  const sourceRows: readonly ComparableWorkRecord[] = calculation.records.map(
    ({ date, duration, durationMinutes }) => ({
      date,
      duration,
      durationMinutes,
    }),
  );
  const targetResult = await adapters.readTarget(state.targetTab.id, {
    startDate: formatBrazilianDate(period.start),
    endDate: formatBrazilianDate(period.end),
  });
  if (!targetResult.ok) {
    throw new Error(channelReadFailureMessage(targetResult.code));
  }
  const targetRows = comparableRows(targetResult);
  const comparisons = compareAhgoraWithChannel(sourceRows, targetRows);
  const warningDates = new Set(
    calculation.warnings.map((warning) => warning.date),
  );
  const items: PreviewItem[] = comparisons.map((comparison) => {
    const blocked = comparison.ahgoraMinutes <= 0;
    return {
      id: comparison.date,
      date: comparison.date,
      ahgoraDuration: comparison.ahgoraDuration,
      ...(comparison.status === 'missing'
        ? {}
        : { channelDuration: comparison.channelDuration }),
      status: blocked ? 'blocked' : comparison.status,
      decision: 'pending',
      ...(blocked
        ? { warning: 'Duração não positiva; preenchimento bloqueado.' }
        : warningDates.has(comparison.date)
          ? { warning: 'Batidas com aviso; revise antes de selecionar.' }
          : {}),
    };
  });
  const itemDates = new Set(items.map((item) => item.date));
  for (const warning of calculation.warnings) {
    if (!itemDates.has(warning.date)) {
      itemDates.add(warning.date);
      items.push({
        id: warning.date,
        date: warning.date,
        ahgoraDuration: '—',
        status: 'blocked',
        decision: 'pending',
        warning: 'Dia omitido pela regra Ruby; revise as batidas.',
      });
    }
  }
  items.sort((left, right) => left.date.localeCompare(right.date));
  return {
    ...state,
    phase: 'preview',
    resolvedPeriod: period,
    sourceRows,
    targetRows,
    items,
    queue: [],
    queueIndex: 0,
    message: 'Prévia pronta. Nenhum item foi selecionado automaticamente.',
  };
}

function channelReadFailureMessage(code: string): string {
  return (
    (
      {
        'entry-form-open':
          'O formulário de apontamento está aberto no Channel. Feche ou cancele o formulário, abra o Extrato e tente novamente.',
        'login-required': 'Conclua o login do Channel e tente novamente.',
        'not-channel-page':
          'A aba registrada não está no Extrato do Channel. Abra o Extrato nessa aba e tente novamente.',
        'no-pagination-option-not-found':
          'A opção Não paginar não foi encontrada no Extrato do Channel.',
        'period-fields-not-found':
          'Os campos de período não foram encontrados no Extrato do Channel.',
        'report-not-refreshed':
          'O Extrato do Channel não confirmou a atualização após Filtrar.',
      } as Readonly<Record<string, string>>
    )[code] ?? `Leitura do Channel indisponível: ${code}.`
  );
}

export function decideItem(
  state: OperationData,
  itemId: string,
  decision: 'selected' | 'refused',
): OperationData {
  requirePhase(state, 'preview');
  if (!state.items.some((item) => item.id === itemId)) {
    throw new Error('Item desconhecido.');
  }
  return {
    ...state,
    items: state.items.map((item) =>
      item.id === itemId ? { ...item, decision } : item,
    ),
  };
}

export function selectRemainingItems(state: OperationData): OperationData {
  requirePhase(state, 'preview');
  return {
    ...state,
    items: state.items.map((item) =>
      item.status === 'missing' && item.decision === 'pending'
        ? { ...item, decision: 'selected' }
        : item,
    ),
  };
}

export function prepareSelectedQueue(state: OperationData): OperationData {
  requirePhase(state, 'preview');
  const queue = state.items
    .filter((item) => item.status === 'missing' && item.decision === 'selected')
    .map((item) => item.id);
  if (queue.length === 0) throw new Error('Selecione ao menos um item.');
  return {
    ...state,
    items: state.items.map((item) =>
      item.decision === 'refused' ? { ...item, result: 'skipped' } : item,
    ),
    queue,
    queueIndex: 0,
  };
}

export function completeDryRun(state: OperationData): OperationData {
  requirePhase(state, 'preview');
  return {
    ...state,
    phase: 'dry-run',
    items: state.items.map((item) =>
      item.status === 'missing' && item.result === undefined
        ? { ...item, result: 'skipped' }
        : item,
    ),
    message: 'Dry-run concluído. Nenhuma escrita ou submissão foi executada.',
  };
}

export async function fillCurrentQueueItem(
  state: OperationData,
  adapters: CoordinatorAdapters,
): Promise<OperationData> {
  if (
    !state.targetTab ||
    !state.config ||
    !state.sourceRows ||
    !state.resolvedPeriod
  ) {
    throw new Error('Estado de preenchimento incompleto.');
  }
  if (state.queueIndex >= state.queue.length) {
    return {
      ...state,
      phase: 'completed',
      message: 'Fila classificada. A extensão não enviou formulários.',
    };
  }
  const itemId = state.queue[state.queueIndex];
  if (itemId === undefined) throw new Error('Posição inválida na fila.');
  const record = state.sourceRows.find((row) => row.date === itemId);
  if (!record) throw new Error('Item da fila não está mais disponível.');

  let currentTargetRows = state.targetRows ?? [];
  if (state.queueIndex > 0) {
    const reread = await adapters.readTarget(state.targetTab.id, {
      startDate: formatBrazilianDate(state.resolvedPeriod.start),
      endDate: formatBrazilianDate(state.resolvedPeriod.end),
    });
    if (!reread.ok) {
      return itemResult(
        state,
        itemId,
        'failed',
        'Não foi possível revalidar o extrato; nenhum novo campo foi alterado.',
      );
    }
    currentTargetRows = comparableRows(reread);
  }
  const existing = lastRowByDate(currentTargetRows).get(record.date);
  if (existing) {
    return itemResult(
      { ...state, targetRows: currentTargetRows },
      itemId,
      existing.duration === record.duration
        ? 'already-correct'
        : 'validation-error',
      existing.duration === record.duration
        ? 'O item já está correto no extrato. Revise e avance.'
        : 'O Channel agora contém duração divergente; nenhum campo foi alterado.',
    );
  }

  const assignment = assignExpertProject(record, state.config);
  const result = await adapters.writeTarget(state, assignment);
  const recognized =
    result.status === 'filled' || result.status === 'already-correct';
  return {
    ...state,
    items: state.items.map((item) =>
      item.id === itemId ? { ...item, result: result.status } : item,
    ),
    phase: recognized ? 'waiting-review' : 'partial',
    message: recognized
      ? 'Um item foi reconhecido no formulário. Revise e salve manualmente no Channel; depois avance.'
      : 'O item não foi preenchido. A fila está parcial; revise o Channel antes de avançar.',
  };
}

export function advanceQueue(state: OperationData): OperationData {
  if (state.phase !== 'waiting-review' && state.phase !== 'partial') {
    throw new Error('A fila não está aguardando revisão.');
  }
  return { ...state, queueIndex: state.queueIndex + 1 };
}

export function cancelOperation(state: OperationData): OperationData {
  return {
    ...state,
    phase: 'cancelled',
    pendingRole: undefined,
    inFlight: undefined,
    items: state.items.map((item) =>
      item.status === 'missing' && item.result === undefined
        ? { ...item, result: 'skipped' }
        : item,
    ),
    message: 'Operação cancelada. Nenhum novo item será preenchido.',
  };
}

function comparableRows(
  result: Extract<InjectedChannelReadResult, { ok: true }>,
): readonly ComparableWorkRecord[] {
  return result.rows.map((row) => ({
    date: civilDate(row.date),
    duration: row.duration,
    durationMinutes: row.durationMinutes,
  }));
}

function itemResult(
  state: OperationData,
  itemId: string,
  result: NonNullable<PreviewItem['result']>,
  message: string,
): OperationData {
  return {
    ...state,
    items: state.items.map((item) =>
      item.id === itemId ? { ...item, result } : item,
    ),
    phase: result === 'already-correct' ? 'waiting-review' : 'partial',
    message,
  };
}

function requirePhase(
  state: OperationData,
  phase: OperationData['phase'],
): void {
  if (state.phase !== phase) {
    throw new Error(`Ação indisponível no estado ${state.phase}.`);
  }
}
