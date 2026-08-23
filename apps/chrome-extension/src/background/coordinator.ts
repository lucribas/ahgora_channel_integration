import type {
  CaptureProgress,
  OperationData,
  PreviewItem,
  WriteProgress,
} from '../application/types';
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
  reportCaptureProgress?(progress: CaptureProgress): Promise<void>;
  reportWriteProgress?(
    state: OperationData,
    progress: WriteProgress,
  ): Promise<void>;
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
  let progress: CaptureProgress = {
    ahgora: {
      status: 'running',
      detail: `Consultando ${String(period.mirrorMonths.length)} mês(es) do espelho…`,
    },
    channel: {
      status: 'waiting',
      detail: 'Aguardando a captura do Ahgora.',
    },
  };
  await adapters.reportCaptureProgress?.(progress);
  const source = await adapters.captureSource(state.sourceTab.id, period);
  if (!source.ok) {
    progress = {
      ...progress,
      ahgora: { status: 'failed', detail: source.error.message },
    };
    await adapters.reportCaptureProgress?.(progress);
    throw new Error(source.error.message);
  }
  const calculation = calculatePunchDays(source.days, state.config.overrides);
  const sourceRows: readonly ComparableWorkRecord[] = calculation.records.map(
    ({ date, duration, durationMinutes }) => ({
      date,
      duration,
      durationMinutes,
    }),
  );
  progress = {
    ahgora: {
      status: 'done',
      detail: `${String(source.days.length)} dia(s) recebido(s); ${String(calculation.records.length)} com duração calculada.`,
    },
    channel: {
      status: 'running',
      detail: 'Resolvendo sessão e consultando o Extrato via DWR…',
    },
  };
  await adapters.reportCaptureProgress?.(progress);
  const targetResult = await adapters.readTarget(state.targetTab.id, {
    startDate: formatBrazilianDate(period.start),
    endDate: formatBrazilianDate(period.end),
  });
  if (!targetResult.ok) {
    progress = {
      ...progress,
      channel: {
        status: 'failed',
        detail: channelReadFailureMessage(targetResult.code),
      },
    };
    await adapters.reportCaptureProgress?.(progress);
    throw new Error(channelReadFailureMessage(targetResult.code));
  }
  const targetRows = comparableRows(targetResult);
  progress = {
    ...progress,
    channel: {
      status: 'done',
      detail: `${String(targetRows.length)} linha(s) recebida(s) do Extrato.`,
    },
  };
  await adapters.reportCaptureProgress?.(progress);
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
    captureProgress: progress,
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
        'channel-api-unavailable':
          'A aba Channel não carregou o cliente DWR do Extrato. Abra o Extrato nessa aba e registre-a novamente.',
        'channel-participant-unavailable':
          'O Channel não informou o participante nem na página atual nem no Extrato autenticado. Reabra o Extrato e refaça o login.',
        'channel-company-unavailable':
          'O Channel não informou a empresa nem na página atual nem no Extrato autenticado. Reabra o Extrato e registre a aba novamente.',
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
    writeProgress: {
      status: 'running',
      completedItems: 0,
      totalItems: queue.length,
      detail: `Preparando ${String(queue.length)} apontamento(s) para envio ao Channel.`,
    },
    message: `Preparando ${String(queue.length)} apontamento(s) para envio ao Channel.`,
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
      message: 'Todos os apontamentos selecionados foram processados.',
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
      existing.duration,
    );
  }

  const assignment = assignExpertProject(record, state.config);
  const result = await adapters.writeTarget(state, assignment);
  const recognized =
    result.status === 'filled' || result.status === 'already-correct';
  return {
    ...state,
    items: state.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            result: result.status,
            ...(recognized
              ? {
                  status: 'equal' as const,
                  channelDuration: assignment.duration,
                }
              : {}),
          }
        : item,
    ),
    phase: recognized ? 'waiting-review' : 'partial',
    message: recognized
      ? 'Apontamento confirmado pelo Channel.'
      : 'O apontamento não foi confirmado. A fila foi interrompida para evitar duplicidade.',
  };
}

export async function fillSelectedQueue(
  initial: OperationData,
  adapters: CoordinatorAdapters,
): Promise<OperationData> {
  let current = initial;
  while (current.queueIndex < current.queue.length) {
    const itemId = current.queue[current.queueIndex];
    if (itemId === undefined) throw new Error('Posição inválida na fila.');
    const position = current.queueIndex + 1;
    let progress: WriteProgress = {
      status: 'running',
      completedItems: current.queueIndex,
      totalItems: current.queue.length,
      currentDate: civilDate(itemId),
      detail: `Revalidando ${formatBrazilianDate(civilDate(itemId))} no Channel (${String(position)} de ${String(current.queue.length)})…`,
    };
    current = { ...current, writeProgress: progress, message: progress.detail };
    await adapters.reportWriteProgress?.(current, progress);
    const written = await fillCurrentQueueItem(current, adapters);
    if (written.phase === 'partial') {
      progress = {
        ...progress,
        status: 'failed',
        detail: `Envio interrompido em ${formatBrazilianDate(civilDate(itemId))}: ${written.message ?? 'o Channel não confirmou o apontamento.'}`,
      };
      const failed = { ...written, writeProgress: progress };
      await adapters.reportWriteProgress?.(failed, progress);
      return failed;
    }
    progress = {
      status: 'running',
      completedItems: position,
      totalItems: current.queue.length,
      currentDate: civilDate(itemId),
      detail: `${formatBrazilianDate(civilDate(itemId))} enviado e confirmado (${String(position)} de ${String(current.queue.length)}).`,
    };
    const confirmed = {
      ...written,
      writeProgress: progress,
      message: progress.detail,
    };
    await adapters.reportWriteProgress?.(confirmed, progress);
    current = advanceQueue(confirmed);
  }
  const completed = await fillCurrentQueueItem(current, adapters);
  const progress: WriteProgress = {
    status: 'done',
    completedItems: current.queue.length,
    totalItems: current.queue.length,
    detail: `${String(current.queue.length)} de ${String(current.queue.length)} apontamento(s) enviado(s) e confirmado(s) pelo Channel.`,
  };
  const result = {
    ...completed,
    writeProgress: progress,
    message: progress.detail,
  };
  await adapters.reportWriteProgress?.(result, progress);
  return result;
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
  channelDuration?: string,
): OperationData {
  return {
    ...state,
    items: state.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            result,
            ...(result === 'already-correct'
              ? {
                  status: 'equal' as const,
                  ...(channelDuration === undefined ? {} : { channelDuration }),
                }
              : result === 'validation-error'
                ? {
                    status: 'divergent' as const,
                    ...(channelDuration === undefined
                      ? {}
                      : { channelDuration }),
                  }
                : {}),
          }
        : item,
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
