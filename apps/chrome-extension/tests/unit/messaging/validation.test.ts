import { describe, expect, it } from 'vitest';

import {
  assertContentSender,
  assertCurrentOperation,
  assertExtensionSender,
  isIncomingMessage,
} from '../../../src/messaging/validation';

describe('message boundary validation', () => {
  it('accepts each small approved command shape', () => {
    expect(
      isIncomingMessage({ type: 'START_OPERATION', operationId: 'op-1' }),
    ).toBe(true);
    expect(
      isIncomingMessage({
        type: 'REGISTER_ACTIVE_TAB',
        operationId: 'op-1',
        role: 'source',
      }),
    ).toBe(true);
    expect(
      isIncomingMessage({
        type: 'SHOW_PREVIEW',
        operationId: 'op-1',
        dryRun: true,
      }),
    ).toBe(true);
  });

  it('rejects unknown, malformed, or stale messages', () => {
    expect(isIncomingMessage(null)).toBe(false);
    expect(
      isIncomingMessage({ type: 'START_OPERATION', operationId: '' }),
    ).toBe(false);
    expect(
      isIncomingMessage({
        type: 'REGISTER_ACTIVE_TAB',
        operationId: 'op-1',
        role: 'both',
      }),
    ).toBe(false);
    expect(
      isIncomingMessage({
        type: 'SHOW_PREVIEW',
        operationId: 'op-1',
        dryRun: 'yes',
      }),
    ).toBe(false);
    expect(() =>
      assertCurrentOperation(
        { type: 'CAPTURE_SOURCE', operationId: 'old-operation' },
        'current-operation',
      ),
    ).toThrow(/antiga/);
  });

  it('requires the expected tab, frame, and exact origin at content boundaries', () => {
    const expected = {
      tabId: 17,
      frameId: 0,
      origin: 'https://synthetic-source.invalid',
    };
    const validSender: chrome.runtime.MessageSender = {
      frameId: 0,
      tab: { id: 17 } as chrome.tabs.Tab,
      url: 'https://synthetic-source.invalid/mirror',
    };

    expect(() => assertContentSender(validSender, expected)).not.toThrow();
    expect(() =>
      assertContentSender(
        { ...validSender, frameId: 2 },
        { ...expected, frameId: 2 },
      ),
    ).not.toThrow();
    expect(() =>
      assertContentSender({ ...validSender, frameId: 2 }, expected),
    ).toThrow(/Remetente/);
    expect(() =>
      assertContentSender(
        { ...validSender, url: 'https://other.invalid/mirror' },
        expected,
      ),
    ).toThrow(/Origem/);
    expect(() =>
      assertContentSender(
        { ...validSender, tab: { id: 18 } as chrome.tabs.Tab },
        expected,
      ),
    ).toThrow(/Remetente/);
  });

  it('accepts only this extension own pages for UI commands', () => {
    const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
    const sender: chrome.runtime.MessageSender = {
      id: extensionId,
      url: `chrome-extension://${extensionId}/src/ui/side-panel.html`,
    };

    expect(() => assertExtensionSender(sender, extensionId)).not.toThrow();
    expect(() =>
      assertExtensionSender({ id: extensionId }, extensionId),
    ).not.toThrow();
    expect(() =>
      assertExtensionSender(
        { ...sender, id: 'different-extension' },
        extensionId,
      ),
    ).toThrow(/Remetente/);
    expect(() =>
      assertExtensionSender(
        { ...sender, url: 'https://synthetic.invalid/' },
        extensionId,
      ),
    ).toThrow(/Origem/);
    expect(() =>
      assertExtensionSender(
        { ...sender, tab: { id: 1 } as chrome.tabs.Tab },
        extensionId,
      ),
    ).not.toThrow();
  });
});
