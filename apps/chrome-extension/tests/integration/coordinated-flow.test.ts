import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  advanceQueue,
  cancelOperation,
  captureAndCompareOperation,
  decideItem,
  fillCurrentQueueItem,
  prepareSelectedQueue,
  selectRemainingItems,
  type CoordinatorAdapters,
} from '../../src/background/coordinator';
import {
  emptyOperation,
  publicState,
  type OperationData,
} from '../../src/application/types';
import {
  civilDate,
  monthPeriod,
  type ProjectAssignment,
} from '../../src/domain';
import {
  captureAhgora,
  captureAhgoraMonthInDocument,
  probeAhgoraDocument,
  type AhgoraProbeDto,
  type FrameExecution,
  type InjectedMonthCaptureDto,
  type MonthCaptureInput,
  type SourceScriptRunner,
} from '../../src/sites/source';
import {
  runInjectedChannelFill,
  runInjectedChannelRead,
} from '../../src/sites/target';
import { makeMirrorCalendarText } from '../fixtures/source/mirror-calendar';

const projectRoot = resolve(import.meta.dirname, '../..');

describe('coordenador real sobre DOM sintético', () => {
  it('executa captura → leitura → comparação → seleção → fila de um item sem submit', async () => {
    const sourceRunner = new SyntheticSourceRunner(
      makeMirrorCalendarText('2026-08', {
        '2026-07-26': ['08:00', '12:00', '13:00', '17:00'],
        '2026-07-27': ['08:00', '12:00', '13:00', '17:00'],
      }),
    );
    const extract = makeExtractDocument('27/07/2026 08:00');
    const form = await fixtureDocument('form');
    let submitCount = 0;
    form.querySelector('form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      submitCount++;
    });
    let fillCalls = 0;
    const adapters = adaptersFor(sourceRunner, extract, form, () => {
      fillCalls++;
    });

    const preview = await captureAndCompareOperation(
      configuredState('coordinated-flow'),
      adapters,
    );
    expect(preview.phase).toBe('preview');
    expect(preview.items).toMatchObject([
      { id: '2026-07-26', status: 'missing', decision: 'pending' },
      { id: '2026-07-27', status: 'equal', decision: 'pending' },
    ]);
    expect(publicState(preview)).toMatchObject({
      capturedMinutes: 960,
      capturedCount: 2,
      reviewMinutes: 480,
      reviewCount: 1,
      selectedMinutes: 0,
      selectedCount: 0,
    });

    const selected = decideItem(preview, '2026-07-26', 'selected');
    expect(publicState(selected)).toMatchObject({
      selectedMinutes: 480,
      selectedCount: 1,
    });
    expect(
      publicState(decideItem(selected, '2026-07-26', 'refused')),
    ).toMatchObject({ selectedMinutes: 0, selectedCount: 0 });
    const queued = prepareSelectedQueue(selected);
    const waitingReview = await fillCurrentQueueItem(queued, adapters);
    expect(waitingReview).toMatchObject({
      phase: 'waiting-review',
      queue: ['2026-07-26'],
      queueIndex: 0,
    });
    expect(waitingReview.items[0]?.result).toBe('filled');
    expect(fillCalls).toBe(1);
    expect(submitCount).toBe(0);
    expect(form.querySelector<HTMLInputElement>('#data')?.value).toBe(
      '26/07/2026',
    );

    const completed = await fillCurrentQueueItem(
      advanceQueue(waitingReview),
      adapters,
    );
    expect(completed.phase).toBe('completed');
    expect(fillCalls).toBe(1);
    expect(submitCount).toBe(0);
  });

  it('cancela durante a fila antes da barreira de escrita e não chama o adapter de fill', async () => {
    const sourceRunner = new SyntheticSourceRunner(
      makeMirrorCalendarText('2026-08', {
        '2026-07-26': ['08:00', '12:00'],
      }),
    );
    const form = await fixtureDocument('form');
    let cancelled = false;
    let fillCalls = 0;
    const baseAdapters = adaptersFor(
      sourceRunner,
      makeExtractDocument(''),
      form,
      () => fillCalls++,
    );
    const adapters: CoordinatorAdapters = {
      ...baseAdapters,
      writeTarget: () => {
        cancelled = true;
        return Promise.reject(new Error('cancelled-before-write'));
      },
    };
    const preview = await captureAndCompareOperation(
      configuredState('cancelled-flow'),
      adapters,
    );
    const queued = prepareSelectedQueue(
      decideItem(preview, '2026-07-26', 'selected'),
    );

    await expect(fillCurrentQueueItem(queued, adapters)).rejects.toThrow(
      'cancelled-before-write',
    );
    expect(cancelled).toBe(true);
    expect(fillCalls).toBe(0);
    const stopped = cancelOperation(queued);
    expect(stopped.phase).toBe('cancelled');
    expect(() => advanceQueue(stopped)).toThrow(/não está aguardando revisão/);
  });

  it('orienta fechar o formulário Channel antes de ler o Extrato', async () => {
    const sourceRunner = new SyntheticSourceRunner(
      makeMirrorCalendarText('2026-08', {
        '2026-07-26': ['08:00', '12:00'],
      }),
    );
    const adapters = adaptersFor(
      sourceRunner,
      makeExtractDocument(''),
      await fixtureDocument('form'),
      () => undefined,
    );

    await expect(
      captureAndCompareOperation(configuredState('entry-form-open'), {
        ...adapters,
        readTarget: () =>
          Promise.resolve({ ok: false, code: 'entry-form-open' }),
      }),
    ).rejects.toThrow(/Feche ou cancele o formulário, abra o Extrato/);
  });

  it('não inicia o próximo item depois de cancelar uma fila parcial', async () => {
    const sourceRunner = new SyntheticSourceRunner(
      makeMirrorCalendarText('2026-08', {
        '2026-07-26': ['08:00', '12:00'],
        '2026-07-28': ['08:00', '12:00'],
      }),
    );
    const form = await fixtureDocument('form');
    let fillCalls = 0;
    const adapters = adaptersFor(
      sourceRunner,
      makeExtractDocument(''),
      form,
      () => fillCalls++,
    );
    const preview = await captureAndCompareOperation(
      configuredState('cancel-after-first'),
      adapters,
    );
    const queued = prepareSelectedQueue(selectRemainingItems(preview));
    const afterFirst = await fillCurrentQueueItem(queued, adapters);
    expect(afterFirst.phase).toBe('waiting-review');
    expect(fillCalls).toBe(1);

    const stopped = cancelOperation(afterFirst);
    expect(stopped.phase).toBe('cancelled');
    expect(() => advanceQueue(stopped)).toThrow(/não está aguardando revisão/);
    expect(fillCalls).toBe(1);
  });
});

function configuredState(operationId: string): OperationData {
  return {
    ...emptyOperation(operationId),
    sourceTab: { id: 10, origin: 'https://source.synthetic' },
    targetTab: { id: 20, origin: 'https://target.synthetic' },
    config: {
      project: 'PROJETO_SINTETICO',
      activity: 'ATIVIDADE_SINTETICA',
      activityType: 'Nenhum',
      task: 'Nenhum',
      period: monthPeriod('2026-08'),
      overrides: [],
    },
  };
}

function adaptersFor(
  sourceRunner: SourceScriptRunner,
  extract: Document,
  form: Document,
  onFill: () => void,
): CoordinatorAdapters {
  return {
    today: civilDate('2026-08-22'),
    captureSource: (tabId, period) =>
      captureAhgora(sourceRunner, {
        tabId,
        today: civilDate('2026-08-22'),
        period,
      }),
    readTarget: (_tabId, input) => runInjectedChannelRead(input, extract),
    writeTarget: (_state, assignment: ProjectAssignment) => {
      onFill();
      return runInjectedChannelFill(assignment, form);
    },
  };
}

function makeExtractDocument(resultText: string): Document {
  const document = new DOMParser().parseFromString(
    `<!doctype html><html><body><main id="conteudo"><select id="totalItensPagina"><option>10</option><option>Não paginar</option></select><input name="dataInicial"><input name="dataFinal"><button value="Filtrar">Filtrar</button><table><tbody id="tblListagem">carregando</tbody></table></main></body></html>`,
    'text/html',
  );
  document
    .querySelector('[value*="Filtrar"]')
    ?.addEventListener('click', () => {
      const replacement = document.createElement('tbody');
      replacement.id = 'tblListagem';
      replacement.textContent = resultText;
      document.querySelector('#tblListagem')?.replaceWith(replacement);
    });
  return document;
}

async function fixtureDocument(name: string): Promise<Document> {
  const html = await readFile(
    resolve(projectRoot, `tests/fixtures/target/${name}.html`),
    'utf8',
  );
  return new DOMParser().parseFromString(html, 'text/html');
}

class SyntheticSourceRunner implements SourceScriptRunner {
  private readonly topDocument: Document;
  private readonly mirrorDocument: Document;

  constructor(calendar: string) {
    this.topDocument = new DOMParser().parseFromString(
      '<!doctype html><html><head><title>Portal Ahgora</title></head><body><iframe id="mirror"></iframe></body></html>',
      'text/html',
    );
    this.mirrorDocument = new DOMParser().parseFromString(
      `<!doctype html><html><body>
        <button>AUGUST/2026</button>
        <button>MONTHLY SUMMARY</button>
        <pre>${calendar}\nHoras Trabalhadas</pre>
      </body></html>`,
      'text/html',
    );
  }

  probe(): Promise<readonly FrameExecution<AhgoraProbeDto>[]> {
    return Promise.resolve([
      {
        frameId: 0,
        result: runWithDocument(this.topDocument, probeAhgoraDocument),
      },
      {
        frameId: 7,
        result: runWithDocument(this.mirrorDocument, probeAhgoraDocument),
      },
    ]);
  }

  captureMonth(
    _tabId: number,
    frameId: number,
    input: MonthCaptureInput,
  ): Promise<FrameExecution<InjectedMonthCaptureDto>> {
    return runWithDocument(this.mirrorDocument, async () => ({
      frameId,
      result: await captureAhgoraMonthInDocument(input),
    }));
  }
}

function runWithDocument<TResult>(
  selectedDocument: Document,
  action: () => TResult,
): TResult;
function runWithDocument<TResult>(
  selectedDocument: Document,
  action: () => Promise<TResult>,
): Promise<TResult>;
function runWithDocument<TResult>(
  selectedDocument: Document,
  action: () => TResult | Promise<TResult>,
): TResult | Promise<TResult> {
  const previous = globalThis.document;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: selectedDocument,
  });
  try {
    const result = action();
    if (result instanceof Promise) {
      return result.finally(() => restoreDocument(previous));
    }
    restoreDocument(previous);
    return result;
  } catch (error) {
    restoreDocument(previous);
    throw error;
  }
}

function restoreDocument(previous: Document): void {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: previous,
  });
}
