import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppBindings } from '../types/env';

export type ErrorCode =
  | 'bad_request'
  | 'validation_failed'
  | 'invalid_json'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'origin_not_allowed'
  | 'rate_limited'
  | 'internal_error'
  | 'service_unavailable';

export class ApiError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function errorResponse(
  c: Context<AppBindings>,
  status: ContentfulStatusCode,
  code: ErrorCode,
  message: string,
) {
  return c.json({ error: { code, message, requestId: c.get('requestId') } }, status);
}
