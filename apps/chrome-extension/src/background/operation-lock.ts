import type { OperationData } from '../application/types';

export interface OperationStateStore {
  load(): Promise<OperationData | undefined>;
  save(state: OperationData): Promise<void>;
}

export class OperationBusyError extends Error {}
export class OperationDisplayError extends Error {}

export class OperationEffectLock {
  private readonly active = new Set<string>();

  async run(
    state: OperationData,
    kind: NonNullable<OperationData['inFlight']>,
    store: OperationStateStore,
    effect: (locked: OperationData) => Promise<OperationData>,
  ): Promise<OperationData> {
    if (state.inFlight !== undefined || this.active.has(state.operationId)) {
      throw new OperationBusyError('Já existe uma ação em andamento.');
    }
    this.active.add(state.operationId);
    let locked: OperationData;
    try {
      const latest = await store.load();
      if (
        latest?.operationId !== state.operationId ||
        latest.revision !== state.revision ||
        latest.inFlight !== undefined
      ) {
        throw new OperationBusyError(
          'A operação mudou antes de iniciar a ação.',
        );
      }
      locked = {
        ...state,
        inFlight: kind,
        revision: state.revision + 1,
      };
      await store.save(locked);
    } catch (error) {
      this.active.delete(state.operationId);
      throw error;
    }
    try {
      const result = await effect(locked);
      const current = await store.load();
      if (current?.operationId !== state.operationId) {
        throw new OperationBusyError('A operação foi substituída.');
      }
      if (current.phase === 'cancelled') return current;
      if (current.revision !== locked.revision || current.inFlight !== kind) {
        throw new OperationBusyError(
          'A operação mudou durante a ação; o resultado antigo foi descartado.',
        );
      }
      const committed: OperationData = {
        ...result,
        inFlight: undefined,
        revision: locked.revision + 1,
      };
      await store.save(committed);
      return committed;
    } catch (error) {
      const current = await store.load();
      if (
        current?.operationId === state.operationId &&
        current.revision === locked.revision &&
        current.inFlight === kind
      ) {
        await store.save({
          ...current,
          phase: 'failed',
          inFlight: undefined,
          revision: current.revision + 1,
          message:
            error instanceof OperationDisplayError
              ? error.message
              : 'A ação falhou sem iniciar outra escrita.',
        });
      }
      throw error;
    } finally {
      this.active.delete(state.operationId);
    }
  }
}
