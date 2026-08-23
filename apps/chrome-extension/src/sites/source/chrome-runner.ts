import type {
  AhgoraProbeDto,
  FrameExecution,
  InjectedMonthCaptureDto,
  MonthCaptureInput,
  SourceScriptRunner,
} from './contracts';
import { captureAhgoraMonthInDocument, probeAhgoraDocument } from './injected';

const AHGORA_MIRROR_ORIGIN = 'https://mirror.app.ahgora.com.br/*';

export class ChromeSourceScriptRunner implements SourceScriptRunner {
  async probe(
    tabId: number,
  ): Promise<readonly FrameExecution<AhgoraProbeDto>[]> {
    const mirrorAllowed = await chrome.permissions.contains({
      origins: [AHGORA_MIRROR_ORIGIN],
    });
    if (!mirrorAllowed) {
      console.warn('[AhgoraChannel][AhgoraProbe]', {
        status: 'failed',
        code: 'MIRROR_HOST_PERMISSION_REQUIRED',
        tabId,
        mirrorAllowed,
      });
      throw new Error('MIRROR_HOST_PERMISSION_REQUIRED');
    }
    const executions = await chrome.scripting.executeScript<[], AhgoraProbeDto>(
      {
        target: { tabId, allFrames: true },
        func: probeAhgoraDocument,
      },
    );
    console.info('[AhgoraChannel][AhgoraProbe]', {
      status: 'ok',
      tabId,
      mirrorAllowed,
      frameCount: executions.length,
      frames: executions.map(({ frameId, result }) => ({
        frameId,
        hasResult: result !== undefined,
        titleMatches: result?.titleMatches ?? false,
        loginForm: result?.loginForm ?? 'unknown',
        mirrorElement: result?.mirrorElement ?? false,
        monthlySummary: result?.monthlySummary ?? false,
      })),
    });
    return executions;
  }

  async captureMonth(
    tabId: number,
    frameId: number,
    input: MonthCaptureInput,
  ): Promise<FrameExecution<InjectedMonthCaptureDto>> {
    const results = await chrome.scripting.executeScript<
      [MonthCaptureInput],
      Promise<InjectedMonthCaptureDto>
    >({
      target: { tabId, frameIds: [frameId] },
      func: captureAhgoraMonthInDocument,
      args: [input],
    });
    const execution: FrameExecution<InjectedMonthCaptureDto> = results[0] ?? {
      frameId,
    };
    console.info('[AhgoraChannel][AhgoraMonth]', {
      status: execution.result?.ok === true ? 'ok' : 'failed',
      tabId,
      frameId,
      hasResult: execution.result !== undefined,
      selection:
        execution.result?.ok === true ? execution.result.selection : undefined,
      code: execution.result?.ok === false ? execution.result.code : undefined,
    });
    return execution;
  }
}
