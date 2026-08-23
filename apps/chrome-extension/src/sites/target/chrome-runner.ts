import type {
  InjectedChannelFillInput,
  InjectedChannelFillResult,
  InjectedChannelReadInput,
  InjectedChannelReadResult,
} from './injected';
import {
  runInjectedChannelApiRead,
  runInjectedChannelApiWrite,
} from './api-injected';

export async function executeChannelRead(
  tabId: number,
  input: InjectedChannelReadInput,
): Promise<InjectedChannelReadResult> {
  const [execution] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: runInjectedChannelApiRead,
    args: [{ ...input, timeoutMs: input.timeoutMs ?? 30_000 }],
  });
  const result = execution?.result ?? {
    ok: false as const,
    code: 'missing-execution-result',
  };
  console.info('[AhgoraChannel][ChannelApiReadRunner]', {
    status: result.ok ? 'ok' : 'failed',
    tabId,
    hasExecution: execution !== undefined,
    code: result.ok ? undefined : result.code,
    rowCount: result.ok ? result.rows.length : undefined,
    invalidRowCount: result.ok ? result.errors.length : undefined,
  });
  return result;
}

export async function executeChannelFill(
  tabId: number,
  input: InjectedChannelFillInput,
): Promise<InjectedChannelFillResult> {
  const [execution] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: runInjectedChannelApiWrite,
    args: [{ ...input, timeoutMs: input.timeoutMs ?? 30_000, commit: true }],
  });
  const result = execution?.result ?? {
    date: input.date,
    requestedMinutes: input.durationMinutes,
    status: 'failed',
    code: 'missing-execution-result',
  };
  console.info('[AhgoraChannel][ChannelApiWriteRunner]', {
    status: result.status,
    code: result.code,
    tabId,
    hasExecution: execution !== undefined,
  });
  return result;
}
