import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Terminal, X } from 'lucide-react';
import { redactBody, redactHeaders, redactUrl, isSensitiveHeader, isSensitiveParam, REDACTED } from '@ntm/shared';
import { Callout, StateBlock, Tabs, copyText, formatBytes } from '../../components/common';
import { BodyViewer } from './JsonViewer';
import { decodeContent } from './capture';
import { toCurl } from './export';
import type { ApiRequest, BodyState, NameValue } from './types';

type DetailTab = 'headers' | 'query' | 'payload' | 'response' | 'timing';

function HeaderTable({ items, redact }: { items: NameValue[]; redact: boolean }) {
  const shown = redact ? redactHeaders(items) : items;
  if (!items.length) return <div className="subtle">None</div>;
  return (
    <table className="table aw-kv-table">
      <tbody>
        {shown.map((h, i) => (
          <tr key={`${h.name}-${i}`}>
            <td className="aw-kv-name mono">
              {h.name}
              {isSensitiveHeader(h.name) && <span className="aw-sensitive" title="Sensitive header">●</span>}
            </td>
            <td className="mono break">{h.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function statusTone(status: number): string {
  if (status === 0) return 'aw-status--error';
  if (status >= 500) return 'aw-status--5xx';
  if (status >= 400) return 'aw-status--4xx';
  if (status >= 300) return 'aw-status--3xx';
  return 'aw-status--2xx';
}

export function RequestDetails(props: {
  req: ApiRequest;
  captureBodies: boolean;
  redactByDefault: boolean;
  body: BodyState;
  onLoadBody: () => void;
  onClose: () => void;
}) {
  const { req } = props;
  const [tab, setTab] = useState<DetailTab>('headers');
  const [reveal, setReveal] = useState(!props.redactByDefault);
  const redact = !reveal;
  const [curlNote, setCurlNote] = useState<string | null>(null);

  useEffect(() => {
    setCurlNote(null);
  }, [req.id]);

  useEffect(() => {
    if (tab === 'response' && props.body.state === 'idle' && props.captureBodies && req.loadBody) props.onLoadBody();
  }, [tab, props.body.state, props.captureBodies, req.loadBody, props.onLoadBody]);

  const query = useMemo(
    () => (redact ? req.query.map((q) => (isSensitiveParam(q.name) ? { ...q, value: REDACTED } : q)) : req.query),
    [req.query, redact],
  );

  const payload = req.postData;
  const payloadText =
    payload?.text !== undefined ? (redact ? redactBody(payload.text, payload.mimeType) : payload.text) : undefined;

  return (
    <div className="aw-details">
      <div className="aw-details__head">
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <div className="row" style={{ minWidth: 0 }}>
            <span className="badge badge--accent">{req.method}</span>
            <span className={`aw-status ${statusTone(req.status)}`}>{req.status || 'ERR'}</span>
            <span className="mono truncate" title={redact ? redactUrl(req.url) : req.url}>
              {redact ? redactUrl(req.url) : req.url}
            </span>
          </div>
        </div>
        <div className="row">
          <button
            type="button"
            className={`btn btn--sm ${reveal ? 'btn--danger' : ''}`}
            onClick={() => setReveal((v) => !v)}
            title="Toggle redaction of sensitive values in this view (local only)"
          >
            {reveal ? <EyeOff size={12} /> : <Eye size={12} />}
            {reveal ? 'Hide sensitive values' : 'Reveal sensitive values'}
          </button>
          <button
            type="button"
            className="btn btn--sm"
            onClick={async () => {
              const c = toCurl(req, { redact });
              await copyText(c.command);
              setCurlNote(
                (redact ? 'cURL copied with sensitive values redacted.' : 'cURL copied WITH sensitive values.') +
                  (c.bodyUnavailable ? ' Request body was not available to DevTools and is omitted.' : ''),
              );
            }}
          >
            <Terminal size={12} /> Copy as cURL
          </button>
          <button type="button" className="btn btn--sm btn--ghost btn--icon" aria-label="Close details" onClick={props.onClose}>
            <X size={13} />
          </button>
        </div>
      </div>
      {reveal && (
        <Callout tone="warning">
          Sensitive values (Authorization, cookies, tokens) are visible. They stay in this DevTools panel and are never
          uploaded, but take care when screen sharing or copying.
        </Callout>
      )}
      {curlNote && <div className="subtle">{curlNote}</div>}
      <Tabs<DetailTab>
        ariaLabel="Request details"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'headers', label: 'Headers' },
          { id: 'query', label: 'Query', count: req.query.length },
          { id: 'payload', label: 'Payload' },
          { id: 'response', label: 'Response' },
          { id: 'timing', label: 'Timing' },
        ]}
      />
      <div className="aw-details__body">
        {tab === 'headers' && (
          <div className="stack">
            <dl className="kv">
              <dt>Request URL</dt>
              <dd className="mono break">{redact ? redactUrl(req.url) : req.url}</dd>
              <dt>Method</dt>
              <dd>{req.method}</dd>
              <dt>Status</dt>
              <dd>
                {req.status || '(failed)'} {req.statusText}
              </dd>
              <dt>Type</dt>
              <dd>
                {req.resourceType || req.kind} · {req.mimeType || 'unknown'}
              </dd>
              {req.httpVersion && (
                <>
                  <dt>Protocol</dt>
                  <dd>{req.httpVersion}</dd>
                </>
              )}
              {req.serverIp && (
                <>
                  <dt>Remote address</dt>
                  <dd className="mono">{req.serverIp}</dd>
                </>
              )}
            </dl>
            <h4 className="aw-h">Response headers ({req.responseHeaders.length})</h4>
            <HeaderTable items={req.responseHeaders} redact={redact} />
            <h4 className="aw-h">Request headers ({req.requestHeaders.length})</h4>
            <HeaderTable items={req.requestHeaders} redact={redact} />
          </div>
        )}
        {tab === 'query' &&
          (query.length ? (
            <table className="table aw-kv-table">
              <tbody>
                {query.map((q, i) => (
                  <tr key={`${q.name}-${i}`}>
                    <td className="aw-kv-name mono">{q.name}</td>
                    <td className="mono break">{q.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <StateBlock title="No query parameters" />
          ))}
        {tab === 'payload' &&
          (!payload ? (
            <StateBlock title="No request payload" body="This request did not send a body." />
          ) : payloadText !== undefined ? (
            <BodyViewer text={payloadText} mimeType={payload.mimeType} />
          ) : payload.params?.length ? (
            <HeaderTable items={payload.params} redact={redact} />
          ) : (
            <StateBlock
              title="Payload not available"
              body={`DevTools did not expose the body for this ${payload.mimeType || 'request'} (common for multipart and binary uploads).`}
            />
          ))}
        {tab === 'response' && (
          <ResponsePane
            req={req}
            captureBodies={props.captureBodies}
            body={props.body}
            redact={redact}
            onRetry={props.onLoadBody}
          />
        )}
        {tab === 'timing' && (
          <dl className="kv">
            <dt>Started</dt>
            <dd>{new Date(req.startedAt).toLocaleTimeString()}</dd>
            <dt>Total</dt>
            <dd>{req.duration.toFixed(1)} ms</dd>
            <dt>Size</dt>
            <dd>{req.size >= 0 ? formatBytes(req.size) : 'unknown'}</dd>
            {Object.entries(req.timings ?? {}).map(([k, v]) => (
              <FragmentKV key={k} k={k} v={`${v.toFixed(1)} ms`} />
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

function FragmentKV({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </>
  );
}

function ResponsePane(props: {
  req: ApiRequest;
  captureBodies: boolean;
  body: BodyState;
  redact: boolean;
  onRetry: () => void;
}) {
  const { req, body } = props;
  if (!props.captureBodies)
    return (
      <StateBlock
        title="Response body capture is off"
        body="Enable “Capture response bodies” in NTM Sentinel Settings → APIWatch. Bodies are read locally via the DevTools API only when you open this tab."
      />
    );
  if (!req.loadBody)
    return (
      <StateBlock
        title="Body not available"
        body="This request finished before the APIWatch panel was opened. DevTools only exposes bodies for requests observed live — reload the page with this panel open."
      />
    );
  if (body.state === 'idle' || body.state === 'loading') return <StateBlock kind="loading" title="Loading body…" />;
  if (body.state === 'unavailable')
    return (
      <StateBlock
        kind="error"
        title="Body not available"
        body={body.reason}
        action={
          <button type="button" className="btn btn--sm" onClick={props.onRetry}>
            Retry
          </button>
        }
      />
    );
  if (body.encoding === 'base64' && req.mimeType.startsWith('image/') && !req.mimeType.includes('svg')) {
    return (
      <div className="stack">
        <div className="subtle">Binary image ({req.mimeType})</div>
        <img className="aw-img" alt="Response preview" src={`data:${req.mimeType};base64,${body.text}`} />
      </div>
    );
  }
  const text = body.encoding === 'base64' ? decodeContent(body.text, 'base64', req.mimeType) : body.text;
  if (text === null) return <StateBlock title="Binary content" body={`${req.mimeType || 'Unknown type'} — not displayed.`} />;
  if (!text.length) return <StateBlock title="Empty response body" />;
  const shown = props.redact ? redactBody(text, req.mimeType) : text;
  return (
    <div className="stack">
      {props.redact && shown !== text && (
        <div className="subtle">Token-like values in this body are redacted. Use “Reveal sensitive values” to see the original.</div>
      )}
      <BodyViewer text={shown} mimeType={req.mimeType} />
    </div>
  );
}
