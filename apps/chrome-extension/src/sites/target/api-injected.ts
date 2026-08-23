import type {
  InjectedChannelFillInput,
  InjectedChannelFillResult,
  InjectedChannelReadInput,
  InjectedChannelReadResult,
} from './injected';

interface DwrApi {
  readonly [method: string]: (...args: unknown[]) => unknown;
}

type ChannelRuntime = typeof globalThis & {
  readonly ApontamentoAjax?: DwrApi;
  readonly ProjetoAjax?: DwrApi;
  readonly ID_EMPRESA?: string | number;
};

interface ChannelApiRow {
  readonly dataFormatada?: unknown;
  readonly totalDuracao?: unknown;
}

interface ChannelApiResult {
  readonly lista?: unknown;
}

/** Chama o cliente DWR já autenticado sem navegar, preencher ou clicar no DOM. */
export async function runInjectedChannelApiRead(
  input: InjectedChannelReadInput,
): Promise<InjectedChannelReadResult> {
  const runtime = globalThis as ChannelRuntime;
  const api = runtime.ApontamentoAjax;
  const timeoutMs = input.timeoutMs ?? 30_000;
  const call = (
    owner: DwrApi,
    method: string,
    args: readonly unknown[],
  ): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const action = owner[method];
      if (!action) {
        reject(new Error(`${method}-not-found`));
        return;
      }
      const timer = globalThis.setTimeout(
        () => reject(new Error(`${method}-timeout`)),
        timeoutMs,
      );
      action(...args, (value: unknown) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      });
    });
  const toIso = (value: string): string | undefined => {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    if (!match) return undefined;
    const [, day, month, year] = match;
    return day && month && year ? `${year}-${month}-${day}` : undefined;
  };
  const toDuration = (minutes: number): string => {
    const sign = minutes < 0 ? '-' : '';
    const absolute = Math.abs(minutes);
    return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
  };
  const failed = (code: string): InjectedChannelReadResult => {
    console.warn('[AhgoraChannel][ChannelApiRead]', {
      status: 'failed',
      code,
      origin: location.origin,
      dwrAvailable: api?.listarApontamentoPorData !== undefined,
    });
    return { ok: false, code };
  };
  if (!api?.listarApontamentoPorData) return failed('channel-api-unavailable');
  let participant =
    document.querySelector<HTMLInputElement>('#participanteSelecionado')
      ?.value ?? '';
  const noPagination = [
    ...document.querySelectorAll<HTMLOptionElement>('#totalItensPagina option'),
  ].find((option) => option.text.trim() === 'Não paginar');
  let company = String(runtime.ID_EMPRESA ?? '');
  const participantFromPage = Boolean(participant);
  const companyFromPage = Boolean(company);

  try {
    if (!participant || !company) {
      const contextResponse = await fetch(
        '/channel/apontamento.do?action=listarDatas&retorno=painel',
        { credentials: 'include', headers: { Accept: 'text/html' } },
      );
      const contextHtml = await contextResponse.text();
      const contextDocument = new DOMParser().parseFromString(
        contextHtml,
        'text/html',
      );
      if (contextDocument.querySelector('#loginForm'))
        return failed('login-required');
      if (!contextResponse.ok)
        return failed(`channel-context-http-${String(contextResponse.status)}`);
      participant ||=
        contextDocument.querySelector<HTMLInputElement>(
          '#participanteSelecionado',
        )?.value ?? '';
      const scripts = [...contextDocument.scripts]
        .map((script) => script.textContent)
        .join('\n');
      company ||=
        /(?:var\s+)?ID_EMPRESA\s*=\s*["']?([A-Za-z0-9_-]+)/.exec(
          scripts,
        )?.[1] ?? '';
    }
    console.info('[AhgoraChannel][ChannelContext]', {
      status: participant && company ? 'ok' : 'failed',
      participantSource: participantFromPage
        ? 'page'
        : participant
          ? 'extract-fetch'
          : 'missing',
      companySource: companyFromPage
        ? 'page'
        : company
          ? 'extract-fetch'
          : 'missing',
    });
    if (!participant) return failed('channel-participant-unavailable');
    if (!company) return failed('channel-company-unavailable');
    const raw = (await call(api, 'listarApontamentoPorData', [
      {
        start: 0,
        limit: noPagination?.value || '999999',
        dataInicial: input.startDate,
        dataFinal: input.endDate,
        usuario: participant,
        checkBoxApontamento: '',
        empresa: company,
        filtroStatusApontamento: '',
      },
    ])) as ChannelApiResult;
    if (!Array.isArray(raw.lista))
      return failed('channel-api-contract-invalid');
    const rows = raw.lista.flatMap((candidate, rowIndex) => {
      const row = candidate as ChannelApiRow;
      if (
        typeof row.dataFormatada !== 'string' ||
        typeof row.totalDuracao !== 'number'
      )
        return [];
      const date = toIso(row.dataFormatada);
      if (!date) return [];
      const durationMinutes = Math.round(row.totalDuracao * 60);
      return [
        {
          rowIndex,
          date,
          duration: toDuration(durationMinutes),
          durationMinutes,
        },
      ];
    });
    const invalidRowCount = raw.lista.length - rows.length;
    console.info('[AhgoraChannel][ChannelApiRead]', {
      status: 'ok',
      origin: location.origin,
      rowCount: rows.length,
      invalidRowCount,
    });
    return {
      ok: true,
      rows,
      errors: Array.from({ length: invalidRowCount }, (_, rowIndex) => ({
        rowIndex,
        code: 'invalid-row' as const,
      })),
    };
  } catch (error: unknown) {
    return failed(error instanceof Error ? error.message : 'api-read-failed');
  }
}

export async function runInjectedChannelApiWrite(
  input: InjectedChannelFillInput & { readonly commit?: boolean },
): Promise<InjectedChannelFillResult> {
  const runtime = globalThis as ChannelRuntime;
  const apontamento = runtime.ApontamentoAjax;
  const projetos = runtime.ProjetoAjax;
  const timeoutMs = input.timeoutMs ?? 30_000;
  const call = (
    owner: DwrApi,
    method: string,
    args: readonly unknown[],
  ): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const action = owner[method];
      if (!action) {
        reject(new Error(`${method}-not-found`));
        return;
      }
      const timer = globalThis.setTimeout(
        () => reject(new Error(`${method}-timeout`)),
        timeoutMs,
      );
      action(...args, (value: unknown) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      });
    });
  const find = (
    items: unknown,
    prefix: string,
  ): Record<string, unknown> | undefined => {
    if (!Array.isArray(items)) return undefined;
    return items.find((item): item is Record<string, unknown> => {
      if (typeof item !== 'object' || item === null) return false;
      const record = item as Record<string, unknown>;
      const values = Object.values(record).filter(
        (value): value is string => typeof value === 'string',
      );
      const code =
        typeof record.codigo === 'string' || typeof record.codigo === 'number'
          ? String(record.codigo)
          : '';
      const name = typeof record.nome === 'string' ? record.nome : '';
      const combined = `${code} ${name}`.trim();
      return (
        values.some((value) => value.trim().startsWith(prefix)) ||
        combined.startsWith(prefix)
      );
    });
  };
  const idOf = (item: Record<string, unknown>): string => {
    if (typeof item.id !== 'number' && typeof item.id !== 'string')
      throw new Error('option-id-not-found');
    return String(item.id);
  };
  const selectValue = (
    form: HTMLFormElement,
    selector: string,
    prefix: string,
  ): string | undefined => {
    const select = form.querySelector<HTMLSelectElement>(selector);
    return [...(select?.options ?? [])].find((option) =>
      option.text.trim().startsWith(prefix),
    )?.value;
  };
  const brazilianDate = (value: string): string => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) throw new Error('invalid-date');
    const [, year, month, day] = match;
    if (!year || !month || !day) throw new Error('invalid-date');
    return `${day}/${month}/${year}`;
  };
  const base = { date: input.date, requestedMinutes: input.durationMinutes };
  const failure = (
    status: InjectedChannelFillResult['status'],
    code: string,
  ): InjectedChannelFillResult => {
    console.warn('[AhgoraChannel][ChannelApiWrite]', {
      status,
      code,
      origin: location.origin,
    });
    return { ...base, status, code };
  };
  if (!apontamento || !projetos)
    return failure('failed', 'channel-api-unavailable');

  try {
    const response = await fetch('/channel/apontamento.do?action=novo', {
      credentials: 'include',
      headers: { Accept: 'text/html' },
    });
    const html = await response.text();
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    if (parsed.querySelector('#loginForm'))
      return failure('failed', 'login-required');
    const form = parsed.querySelector<HTMLFormElement>(
      'form[name="apontamentoForm"]',
    );
    if (!response.ok || !form)
      return failure('failed', 'entry-request-contract-invalid');
    let participant =
      form.querySelector<HTMLInputElement>('[name="participanteSelecionado"]')
        ?.value ||
      document.querySelector<HTMLInputElement>('#participanteSelecionado')
        ?.value ||
      '';
    let company = String(runtime.ID_EMPRESA ?? '');
    if (!participant || !company) {
      const contextResponse = await fetch(
        '/channel/apontamento.do?action=listarDatas&retorno=painel',
        { credentials: 'include', headers: { Accept: 'text/html' } },
      );
      const contextHtml = await contextResponse.text();
      const contextDocument = new DOMParser().parseFromString(
        contextHtml,
        'text/html',
      );
      if (contextDocument.querySelector('#loginForm'))
        return failure('failed', 'login-required');
      if (!contextResponse.ok)
        return failure(
          'failed',
          `channel-context-http-${String(contextResponse.status)}`,
        );
      participant ||=
        contextDocument.querySelector<HTMLInputElement>(
          '#participanteSelecionado',
        )?.value ?? '';
      const scripts = [...contextDocument.scripts]
        .map((script) => script.textContent)
        .join('\n');
      company ||=
        /(?:var\s+)?ID_EMPRESA\s*=\s*["']?([A-Za-z0-9_-]+)/.exec(
          scripts,
        )?.[1] ?? '';
    }
    if (!participant)
      return failure('failed', 'channel-participant-unavailable');
    if (!company) return failure('failed', 'channel-company-unavailable');
    const readExistingMinutes = async (): Promise<number | undefined> => {
      if (!apontamento.listarApontamentoPorData) return undefined;
      const requestedDate = brazilianDate(input.date);
      const result = (await call(apontamento, 'listarApontamentoPorData', [
        {
          start: 0,
          limit: '999999',
          dataInicial: requestedDate,
          dataFinal: requestedDate,
          usuario: participant,
          checkBoxApontamento: '',
          empresa: company,
          filtroStatusApontamento: '',
        },
      ])) as ChannelApiResult;
      if (!Array.isArray(result.lista)) return undefined;
      const row = result.lista.find(
        (candidate) =>
          (candidate as ChannelApiRow).dataFormatada === requestedDate,
      ) as ChannelApiRow | undefined;
      return typeof row?.totalDuracao === 'number'
        ? Math.round(row.totalDuracao * 60)
        : undefined;
    };
    const existingMinutes = await readExistingMinutes();
    if (existingMinutes !== undefined) {
      return existingMinutes === input.durationMinutes
        ? {
            ...base,
            status: 'already-correct',
            resultingMinutes: existingMinutes,
          }
        : failure('validation-error', 'existing-duration-divergent');
    }
    const isStaff = Boolean(await call(apontamento, 'isStaff', [participant]));
    const projectItems = (await call(
      projetos,
      isStaff
        ? 'listarPorUsuarioObjetoFalso'
        : 'listarPorUsuarioAreaApontamento',
      isStaff ? [participant] : [-1, true, false],
    )) as unknown[];
    const project = find(projectItems, input.project);
    if (!project) return failure('not-found', 'project-prefix-not-found');
    const projectId = idOf(project);
    const activities = (await call(apontamento, 'getAtividadesByProjeto', [
      projectId,
      participant,
      null,
    ])) as unknown[];
    const activity = find(activities, input.activity);
    if (!activity) return failure('not-found', 'activity-prefix-not-found');
    const activityId = idOf(activity);
    const tasks = (await call(apontamento, 'getTarefasByAtividade', [
      activityId,
    ])) as unknown[];
    const task = find(tasks, input.task);
    const activityType = selectValue(
      form,
      '[id="apontamento.idTipoAtividadeProjeto"]',
      input.activityType,
    );
    const taskId = task
      ? idOf(task)
      : selectValue(form, '[id="apontamento.idTarefa"]', input.task);
    if (activityType === undefined)
      return failure('not-found', 'activity-type-prefix-not-found');
    if (taskId === undefined)
      return failure('not-found', 'task-prefix-not-found');

    const body = new URLSearchParams();
    for (const [name, value] of new FormData(form))
      if (typeof value === 'string') body.append(name, value);
    const projectType =
      form.querySelector<HTMLInputElement>('#tpApontamentoProjeto')?.value ??
      '0';
    body.set('tipoApontamento', projectType);
    body.set('apontamento.projetosSelecionado', projectId);
    body.set('apontamento.idTipoAtividadeProjeto', activityType);
    body.set('apontamento.notificacaoSelecionada', activityId);
    body.set('apontamento.idTarefa', taskId);
    body.set('data', brazilianDate(input.date));
    body.set('apontamento.duracao', input.duration);
    body.set('apontamento.horaInicio', '');
    body.set('apontamento.horaFim', '');
    body.set('action', 'salvar');
    body.set('key', '-1');
    body.set('historyBackUrl', '');
    if (input.commit === false) {
      console.info('[AhgoraChannel][ChannelApiWrite]', {
        status: 'prepared',
        origin: location.origin,
        fieldCount: [...body.keys()].length,
      });
      return { ...base, status: 'filled', resultingMinutes: 0 };
    }
    const saved = await fetch(form.getAttribute('action') ?? form.action, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'text/html',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body,
    });
    if (!saved.ok)
      return failure('failed', `write-http-${String(saved.status)}`);
    let confirmedMinutes: number | undefined;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline && confirmedMinutes === undefined) {
      confirmedMinutes = await readExistingMinutes();
      if (confirmedMinutes === undefined)
        await new Promise((resolve) => globalThis.setTimeout(resolve, 250));
    }
    if (confirmedMinutes !== input.durationMinutes)
      return failure(
        confirmedMinutes === undefined ? 'failed' : 'validation-error',
        confirmedMinutes === undefined
          ? 'write-not-confirmed'
          : 'written-duration-divergent',
      );
    console.info('[AhgoraChannel][ChannelApiWrite]', {
      status: 'submitted',
      origin: location.origin,
      responseStatus: saved.status,
    });
    return {
      ...base,
      status: 'filled',
      resultingMinutes: confirmedMinutes,
    };
  } catch (error: unknown) {
    return failure(
      error instanceof Error && /not-found$/.test(error.message)
        ? 'not-found'
        : 'failed',
      error instanceof Error ? error.message : 'api-write-failed',
    );
  }
}
