import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { civilDate } from '../../src/domain/civil-date';
import type { ProjectAssignment } from '../../src/domain/expert';
import {
  detectChannelPage,
  fillChannelProject,
  parseChannelExtract,
  readChannelExtract,
  runInjectedChannelFill,
  runInjectedChannelRead,
  waitForCondition,
} from '../../src/sites/target';

const projectRoot = resolve(import.meta.dirname, '../..');

async function loadFixture(name: string): Promise<void> {
  const html = await readFile(
    resolve(projectRoot, `tests/fixtures/target/${name}.html`),
    'utf8',
  );
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.documentElement.replaceWith(parsed.documentElement);
}

function assignment(
  overrides: Partial<ProjectAssignment> = {},
): ProjectAssignment {
  return {
    kind: 'PROJETOS',
    project: 'PROJETO_SINTETICO',
    activityType: 'Nenhum',
    activity: 'ATIVIDADE_SINTETICA',
    task: 'Nenhum',
    date: civilDate('2026-08-18'),
    durationMinutes: 450,
    duration: '07:30',
    comments: '',
    ...overrides,
  };
}

beforeEach(() => {
  document.documentElement.innerHTML = '<head></head><body></body>';
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => vi.restoreAllMocks());

describe('adapter Channel de leitura', () => {
  it('detecta login, extrato, formulário e página desconhecida pelos seletores Ruby', async () => {
    await loadFixture('login');
    expect(detectChannelPage(document)).toBe('login');
    await loadFixture('extract');
    expect(detectChannelPage(document)).toBe('extract');
    await loadFixture('form');
    expect(detectChannelPage(document)).toBe('entry-form');
    document.body.replaceChildren();
    expect(detectChannelPage(document)).toBe('unknown');
  });

  it('filtra período, escolhe Não paginar e preserva ordem, duplicatas e duração textual', async () => {
    await loadFixture('extract');
    const filter =
      document.querySelector<HTMLInputElement>('[value*="Filtrar"]');
    filter?.addEventListener('click', () => {
      setTimeout(() => {
        const previous = document.querySelector('#tblListagem');
        const replacement = document.createElement('tbody');
        replacement.id = 'tblListagem';
        replacement.textContent = [
          '18/08/2026 07:00',
          '18/08/2026 7:30',
          '19/08/2026 08:00',
        ].join('\n');
        previous?.replaceWith(replacement);
      }, 5);
    });

    const result = await readChannelExtract(document, {
      startDate: '26/07/2026',
      endDate: '25/08/2026',
      timeoutMs: 200,
      pollIntervalMs: 1,
    });

    expect(
      document.querySelector<HTMLInputElement>('[name="dataInicial"]')?.value,
    ).toBe('26/07/2026');
    expect(
      document.querySelector<HTMLInputElement>('[name="dataFinal"]')?.value,
    ).toBe('25/08/2026');
    expect(
      document.querySelector<HTMLSelectElement>('#totalItensPagina')
        ?.selectedOptions[0]?.text,
    ).toBe('Não paginar');
    expect(result).toEqual({
      rows: [
        {
          rowIndex: 0,
          date: '2026-08-18',
          duration: '07:00',
          durationMinutes: 420,
        },
        {
          rowIndex: 1,
          date: '2026-08-18',
          duration: '7:30',
          durationMinutes: 450,
        },
        {
          rowIndex: 2,
          date: '2026-08-19',
          duration: '08:00',
          durationMinutes: 480,
        },
      ],
      errors: [],
    });
    expect(document.querySelector<HTMLInputElement>('#data')).toBeNull();
  });

  it('mantém erros de linha sanitizados sem perder linhas válidas', () => {
    expect(
      parseChannelExtract('18/08/2026 07:30\nlinha inválida\n19/08/2026 08:00'),
    ).toEqual({
      rows: [
        {
          rowIndex: 0,
          date: '2026-08-18',
          duration: '07:30',
          durationMinutes: 450,
        },
        {
          rowIndex: 2,
          date: '2026-08-19',
          duration: '08:00',
          durationMinutes: 480,
        },
      ],
      errors: [{ rowIndex: 1, code: 'invalid-row' }],
    });
  });

  it('executa a leitura autocontida usada por chrome.scripting sem escrever no formulário', async () => {
    await loadFixture('extract');
    document
      .querySelector('[value*="Filtrar"]')
      ?.addEventListener('click', () => {
        const replacement = document.createElement('tbody');
        replacement.id = 'tblListagem';
        replacement.textContent = '18/08/2026 07:00\n18/08/2026 7:30';
        document.querySelector('#tblListagem')?.replaceWith(replacement);
      });

    const result = await runInjectedChannelRead(
      { startDate: '26/07/2026', endDate: '25/08/2026', timeoutMs: 100 },
      document,
    );

    expect(result).toMatchObject({
      ok: true,
      rows: [
        {
          rowIndex: 0,
          date: '2026-08-18',
          duration: '07:00',
          durationMinutes: 420,
        },
        {
          rowIndex: 1,
          date: '2026-08-18',
          duration: '7:30',
          durationMinutes: 450,
        },
      ],
    });
    expect(document.querySelector<HTMLInputElement>('#data')).toBeNull();
  });

  it('recusa leitura enquanto o formulário de apontamento está aberto', async () => {
    await loadFixture('form');

    await expect(
      runInjectedChannelRead(
        { startDate: '26/07/2026', endDate: '25/08/2026', timeoutMs: 100 },
        document,
      ),
    ).resolves.toEqual({ ok: false, code: 'entry-form-open' });
    await expect(
      readChannelExtract(document, {
        startDate: '26/07/2026',
        endDate: '25/08/2026',
        timeoutMs: 100,
      }),
    ).rejects.toMatchObject({ code: 'entry-form-open' });
    expect(console.warn).toHaveBeenCalledWith(
      '[AhgoraChannel][ChannelRead]',
      expect.objectContaining({
        status: 'failed',
        code: 'entry-form-open',
        entryForm: true,
        extractRows: false,
      }),
    );
    const serializedLogs = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(serializedLogs).not.toContain('PROJETO_SINTETICO');
    expect(serializedLogs).not.toContain('18/08/2026');
  });
});

describe('adapter Channel de preenchimento PROJETOS', () => {
  it('seleciona por prefixo, emite eventos mínimos, confirma valores e nunca submete', async () => {
    await loadFixture('form');
    const form = document.querySelector<HTMLFormElement>('#apontamento_diario');
    const submit = vi.fn((event: SubmitEvent) => event.preventDefault());
    form?.addEventListener('submit', submit);
    const inputEvents = vi.fn();
    document.querySelector('#data')?.addEventListener('input', inputEvents);
    document
      .querySelector('#apontamento\\.duracao')
      ?.addEventListener('change', inputEvents);

    const fill = await fillChannelProject(document, assignment());

    expect(fill).toEqual({
      date: '2026-08-18',
      requestedMinutes: 450,
      resultingMinutes: 450,
      status: 'filled',
    });
    expect(
      document.querySelector<HTMLInputElement>('#tpApontamentoProjeto')
        ?.checked,
    ).toBe(true);
    expect(
      document.querySelector<HTMLSelectElement>(
        '[id="apontamento.projetosSelecionado"]',
      )?.selectedOptions[0]?.text,
    ).toMatch(/^PROJETO_SINTETICO/);
    expect(document.querySelector<HTMLInputElement>('#data')?.value).toBe(
      '18/08/2026',
    );
    expect(
      document.querySelector<HTMLInputElement>('[id="apontamento.duracao"]')
        ?.value,
    ).toBe('07:30');
    expect(inputEvents).toHaveBeenCalledTimes(2);
    expect(submit).not.toHaveBeenCalled();
  });

  it('encontra os controles PROJETOS fora do formulário diário como no DOM autenticado', async () => {
    await loadFixture('form');
    const form = document.querySelector('#apontamento_diario');
    for (const selector of [
      '#tpApontamentoProjeto',
      '[id="apontamento.projetosSelecionado"]',
      '[id="apontamento.idTipoAtividadeProjeto"]',
      '[id="apontamento.notificacaoSelecionada"]',
      '[id="apontamento.idTarefa"]',
    ]) {
      const control = document.querySelector(selector);
      if (control) form?.before(control);
    }

    const fill = await runInjectedChannelFill(
      {
        kind: 'PROJETOS',
        project: 'PROJETO_SINTETICO',
        activityType: 'Nenhum',
        activity: 'ATIVIDADE_SINTETICA',
        task: 'Nenhum',
        date: '2026-08-18',
        duration: '07:30',
        durationMinutes: 450,
      },
      document,
    );

    expect(fill.status).toBe('filled');
    expect(document.querySelector<HTMLInputElement>('#data')?.value).toBe(
      '18/08/2026',
    );
  });

  it('aguarda opções dependentes carregadas após selecionar PROJETOS', async () => {
    await loadFixture('form');
    const projectType = document.querySelector('#tpApontamentoProjeto');
    const project = document.querySelector<HTMLSelectElement>(
      '[id="apontamento.projetosSelecionado"]',
    );
    const activity = document.querySelector<HTMLSelectElement>(
      '[id="apontamento.notificacaoSelecionada"]',
    );
    project?.replaceChildren();
    activity?.replaceChildren();
    projectType?.addEventListener('click', () => {
      setTimeout(() => {
        const option = document.createElement('option');
        option.text = 'PROJETO_SINTETICO — descrição';
        project?.append(option);
      }, 5);
    });
    project?.addEventListener('change', () => {
      setTimeout(() => {
        const option = document.createElement('option');
        option.text = 'ATIVIDADE_SINTETICA — descrição';
        activity?.append(option);
      }, 5);
    });

    const fill = await runInjectedChannelFill(
      {
        kind: 'PROJETOS',
        project: 'PROJETO_SINTETICO',
        activityType: 'Nenhum',
        activity: 'ATIVIDADE_SINTETICA',
        task: 'Nenhum',
        date: '2026-08-18',
        duration: '07:30',
        durationMinutes: 450,
        timeoutMs: 100,
      },
      document,
    );

    expect(fill).toMatchObject({ status: 'filled' });
    expect(project?.selectedOptions[0]?.text).toMatch(/^PROJETO_SINTETICO/);
    expect(activity?.selectedOptions[0]?.text).toMatch(/^ATIVIDADE_SINTETICA/);
  });

  it('reconsulta controles substituídos pelo AJAX do Channel', async () => {
    await loadFixture('form');
    const option = (text: string): HTMLOptionElement => {
      const value = document.createElement('option');
      value.text = text;
      return value;
    };
    document
      .querySelector('#tpApontamentoProjeto')
      ?.addEventListener('click', () => {
        setTimeout(() => {
          const project = document.createElement('select');
          project.id = 'apontamento.projetosSelecionado';
          project.append(option('PROJETO_SINTETICO — descrição'));
          document
            .querySelector('[id="apontamento.projetosSelecionado"]')
            ?.replaceWith(project);
          project.addEventListener('change', () => {
            setTimeout(() => {
              const activityType = document.createElement('select');
              activityType.id = 'apontamento.idTipoAtividadeProjeto';
              activityType.append(option('Nenhum tipo relacionado'));
              document
                .querySelector('[id="apontamento.idTipoAtividadeProjeto"]')
                ?.replaceWith(activityType);
              activityType.addEventListener('change', () => {
                setTimeout(() => {
                  const activity = document.createElement('select');
                  activity.id = 'apontamento.notificacaoSelecionada';
                  activity.append(option('ATIVIDADE_SINTETICA — descrição'));
                  document
                    .querySelector('[id="apontamento.notificacaoSelecionada"]')
                    ?.replaceWith(activity);
                }, 5);
              });
            }, 5);
          });
        }, 5);
      });

    const fill = await runInjectedChannelFill(
      {
        kind: 'PROJETOS',
        project: 'PROJETO_SINTETICO',
        activityType: 'Nenhum',
        activity: 'ATIVIDADE_SINTETICA',
        task: 'Nenhum',
        date: '2026-08-18',
        duration: '07:30',
        durationMinutes: 450,
        timeoutMs: 200,
      },
      document,
    );

    expect(fill).toMatchObject({ status: 'filled' });
    expect(
      document.querySelector<HTMLSelectElement>(
        '[id="apontamento.projetosSelecionado"]',
      )?.selectedOptions[0]?.text,
    ).toMatch(/^PROJETO_SINTETICO/);
  });

  it('aceita a data padrão de um formulário novo quando a duração está vazia', async () => {
    await loadFixture('form');
    const date = document.querySelector<HTMLInputElement>('#data');
    if (date) date.value = '22/08/2026';

    const fill = await runInjectedChannelFill(
      {
        kind: 'PROJETOS',
        project: 'PROJETO_SINTETICO',
        activityType: 'Nenhum',
        activity: 'ATIVIDADE_SINTETICA',
        task: 'Nenhum',
        date: '2026-08-18',
        duration: '07:30',
        durationMinutes: 450,
      },
      document,
    );

    expect(fill).toMatchObject({ status: 'filled' });
    expect(date?.value).toBe('18/08/2026');
  });

  it('não sobrescreve um formulário ocupado e trata repetição idempotente', async () => {
    await loadFixture('form');
    const first = await fillChannelProject(document, assignment());
    const repeated = await fillChannelProject(document, assignment());
    const occupied = await fillChannelProject(
      document,
      assignment({
        date: civilDate('2026-08-19'),
        durationMinutes: 480,
        duration: '08:00',
      }),
    );

    expect(first.status).toBe('filled');
    expect(repeated.status).toBe('already-correct');
    expect(occupied).toMatchObject({
      status: 'failed',
      code: 'entry-form-occupied',
    });
    expect(document.querySelector<HTMLInputElement>('#data')?.value).toBe(
      '18/08/2026',
    );
    expect(
      document.querySelector<HTMLInputElement>('[id="apontamento.duracao"]')
        ?.value,
    ).toBe('07:30');
  });

  it('faz preflight das opções e retorna erro por item sem preenchimento parcial', async () => {
    await loadFixture('form');
    const fill = await fillChannelProject(
      document,
      assignment({ activity: 'ATIVIDADE_INEXISTENTE' }),
    );

    expect(fill).toMatchObject({
      status: 'not-found',
      code: 'option-prefix-not-found',
    });
    expect(document.querySelector<HTMLInputElement>('#data')?.value).toBe('');
    expect(
      document.querySelector<HTMLInputElement>('[id="apontamento.duracao"]')
        ?.value,
    ).toBe('');
    expect(
      document.querySelector<HTMLInputElement>('#tpApontamentoProjeto')
        ?.checked,
    ).toBe(true);
  });

  it('reconhece login e não toca no formulário', async () => {
    await loadFixture('login');
    const fill = await fillChannelProject(document, assignment());
    expect(fill).toMatchObject({ status: 'failed', code: 'login-required' });
    expect(document.querySelector('[name="password"]')).not.toBeNull();
  });

  it('registra diagnóstico estrutural sanitizado quando o preenchimento falha', async () => {
    document.body.replaceChildren();

    const fill = await runInjectedChannelFill(
      {
        kind: 'PROJETOS',
        project: 'PROJETO_SINTETICO',
        activityType: 'Nenhum',
        activity: 'ATIVIDADE_SINTETICA',
        task: 'Nenhum',
        date: '2026-08-18',
        duration: '07:30',
        durationMinutes: 450,
      },
      document,
    );

    expect(fill).toMatchObject({
      status: 'not-found',
      code: 'include-entry-not-found',
    });
    expect(console.warn).toHaveBeenCalledWith(
      '[AhgoraChannel][ChannelFill]',
      expect.objectContaining({
        status: 'not-found',
        code: 'include-entry-not-found',
        includeEntry: false,
        entryForm: false,
      }),
    );
    const serializedLogs = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(serializedLogs).not.toContain('PROJETO_SINTETICO');
    expect(serializedLogs).not.toContain('ATIVIDADE_SINTETICA');
    expect(serializedLogs).not.toContain('2026-08-18');
    expect(serializedLogs).not.toContain('07:30');
  });

  it('abre o formulário assíncrono e a função injetada preenche um único item sem submit', async () => {
    await loadFixture('extract');
    const formHtml = await readFile(
      resolve(projectRoot, 'tests/fixtures/target/form.html'),
      'utf8',
    );
    const parsedForm = new DOMParser().parseFromString(formHtml, 'text/html');
    const form = parsedForm.querySelector<HTMLFormElement>(
      '#apontamento_diario',
    );
    const submit = vi.fn((event: SubmitEvent) => event.preventDefault());
    form?.addEventListener('submit', submit);
    document
      .querySelector('#incluirNovoApontamento')
      ?.addEventListener('click', () => {
        setTimeout(() => {
          if (form) document.body.append(form);
        }, 5);
      });

    const result = await runInjectedChannelFill(
      {
        kind: 'PROJETOS',
        project: 'PROJETO_SINTETICO',
        activityType: 'Nenhum',
        activity: 'ATIVIDADE_SINTETICA',
        task: 'Nenhum',
        date: '2026-08-18',
        duration: '07:30',
        durationMinutes: 450,
        timeoutMs: 100,
      },
      document,
    );

    expect(result).toEqual({
      date: '2026-08-18',
      requestedMinutes: 450,
      resultingMinutes: 450,
      status: 'filled',
    });
    expect(document.querySelector<HTMLInputElement>('#data')?.value).toBe(
      '18/08/2026',
    );
    expect(submit).not.toHaveBeenCalled();
  });

  it('cancela waits pendentes sem mutação adicional', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      waitForCondition(() => undefined, 'condição sintética', {
        signal: controller.signal,
        timeoutMs: 100,
      }),
    ).rejects.toMatchObject({ code: 'cancelled' });
  });
});
