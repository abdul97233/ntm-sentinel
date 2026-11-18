/**
 * UI-side messaging client. All extension pages call the background through `send()`.
 */
import type { Envelope, EventMessage, MessageType, RequestOf, ResponseMap, Result } from './contract';

export class MessagingError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'MessagingError';
  }
}

export async function send<T extends MessageType>(type: T, payload: RequestOf<T>): Promise<ResponseMap[T]> {
  const envelope: Envelope<T> = { channel: 'ntm', type, payload };
  let res: Result<ResponseMap[T]> | undefined;
  try {
    res = (await chrome.runtime.sendMessage(envelope)) as Result<ResponseMap[T]> | undefined;
  } catch (err) {
    throw new MessagingError(err instanceof Error ? err.message : String(err), 'transport');
  }
  if (!res) throw new MessagingError('No response from background service worker', 'no-response');
  if (!res.ok) throw new MessagingError(res.error, res.code);
  return res.data;
}

/** Subscribe to broadcast events. Returns an unsubscribe function. */
export function onEvent(handler: (event: EventMessage) => void): () => void {
  const listener = (msg: unknown) => {
    if (msg && typeof msg === 'object' && (msg as { channel?: string }).channel === 'ntm-event') {
      handler(msg as EventMessage);
    }
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

export function emit(event: Omit<EventMessage, 'channel'>): void {
  chrome.runtime.sendMessage({ channel: 'ntm-event', ...event }).catch(() => {
    /* no listeners open — expected */
  });
}
