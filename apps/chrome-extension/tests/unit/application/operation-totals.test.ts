import { describe, expect, it } from 'vitest';

import {
  emptyOperation,
  operationTotals,
  type OperationData,
} from '../../../src/application/types';
import { civilDate } from '../../../src/domain';

describe('totais numéricos da operação', () => {
  it('separa capturado, novos para revisar e selecionados sem parsear duração textual', () => {
    const state = previewState();

    expect(operationTotals(state)).toEqual({
      capturedMinutes: 990,
      capturedCount: 3,
      reviewMinutes: 930,
      reviewCount: 2,
      selectedMinutes: 480,
      selectedCount: 1,
    });

    const refused: OperationData = {
      ...state,
      items: state.items.map((item) =>
        item.id === '2026-07-26' ? { ...item, decision: 'refused' } : item,
      ),
    };
    expect(operationTotals(refused)).toMatchObject({
      reviewMinutes: 930,
      reviewCount: 2,
      selectedMinutes: 0,
      selectedCount: 0,
    });
  });
});

function previewState(): OperationData {
  return {
    ...emptyOperation('totals-test'),
    phase: 'preview',
    sourceRows: [
      {
        date: civilDate('2026-07-26'),
        duration: 'texto deliberadamente não numérico',
        durationMinutes: 480,
      },
      {
        date: civilDate('2026-07-27'),
        duration: 'ignorado no cálculo',
        durationMinutes: 450,
      },
      {
        date: civilDate('2026-07-28'),
        duration: 'também ignorado',
        durationMinutes: 60,
      },
    ],
    items: [
      {
        id: '2026-07-26',
        date: civilDate('2026-07-26'),
        ahgoraDuration: 'qualquer texto',
        status: 'missing',
        decision: 'selected',
      },
      {
        id: '2026-07-27',
        date: civilDate('2026-07-27'),
        ahgoraDuration: 'qualquer texto',
        status: 'missing',
        decision: 'pending',
      },
      {
        id: '2026-07-28',
        date: civilDate('2026-07-28'),
        ahgoraDuration: 'qualquer texto',
        status: 'divergent',
        decision: 'pending',
      },
    ],
  };
}
