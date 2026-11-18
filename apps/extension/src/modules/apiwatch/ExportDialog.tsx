import { useState } from 'react';
import { Callout, Modal, downloadFile } from '../../components/common';
import { toJsonExport, toPostmanCollection, type ExportOptions } from './export';
import { decodeContent } from './capture';
import type { ApiRequest } from './types';

const MAX_BODY_FETCH = 200;

export function ExportDialog(props: {
  open: boolean;
  onClose: () => void;
  selected: ApiRequest[];
  filtered: ApiRequest[];
  redactByDefault: boolean;
  captureBodies: boolean;
  cachedBodies: ReadonlyMap<string, string>;
}) {
  const [scope, setScope] = useState<'selected' | 'filtered'>('selected');
  const [format, setFormat] = useState<'json' | 'postman'>('json');
  const [redact, setRedact] = useState(true);
  const [includeBodies, setIncludeBodies] = useState(false);
  const [busy, setBusy] = useState(false);
  const effectiveScope = props.selected.length ? scope : 'filtered';
  const items = effectiveScope === 'selected' ? props.selected : props.filtered;

  const run = async () => {
    setBusy(true);
    try {
      const opts: ExportOptions = { redact, includeBodies };
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      if (format === 'postman') {
        downloadFile(`apiwatch-collection-${stamp}.postman_collection.json`, toPostmanCollection(items, opts));
      } else {
        const bodies = new Map(props.cachedBodies);
        if (includeBodies && props.captureBodies) {
          for (const r of items.slice(0, MAX_BODY_FETCH)) {
            if (bodies.has(r.id) || !r.loadBody) continue;
            const { content, encoding } = await r.loadBody();
            const text = decodeContent(content, encoding, r.mimeType);
            if (text !== null) bodies.set(r.id, text);
          }
        }
        downloadFile(`apiwatch-export-${stamp}.json`, toJsonExport(items, opts, bodies));
      }
      props.onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={props.open}
      title="Export requests"
      onClose={props.onClose}
      actions={
        <>
          <button type="button" className="btn" onClick={props.onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" disabled={!items.length || busy} onClick={run}>
            {busy ? 'Exporting…' : `Export ${items.length} request${items.length === 1 ? '' : 's'}`}
          </button>
        </>
      }
    >
      <Callout tone="warning">
        Exports may contain sensitive data such as API keys, session tokens, personal data and internal URLs. The file
        is saved locally only — NTM Sentinel never uploads it. Review it before sharing.
      </Callout>
      <fieldset className="aw-fieldset">
        <legend>Scope</legend>
        <label className="row">
          <input
            type="radio"
            name="scope"
            checked={effectiveScope === 'selected'}
            disabled={!props.selected.length}
            onChange={() => setScope('selected')}
          />
          Selected ({props.selected.length})
        </label>
        <label className="row">
          <input type="radio" name="scope" checked={effectiveScope === 'filtered'} onChange={() => setScope('filtered')} />
          All visible after filters ({props.filtered.length})
        </label>
      </fieldset>
      <fieldset className="aw-fieldset">
        <legend>Format</legend>
        <label className="row">
          <input type="radio" name="format" checked={format === 'json'} onChange={() => setFormat('json')} />
          JSON (metadata, headers{includeBodies ? ', bodies' : ''})
        </label>
        <label className="row">
          <input type="radio" name="format" checked={format === 'postman'} onChange={() => setFormat('postman')} />
          Postman Collection v2.1 (API collection)
        </label>
      </fieldset>
      <fieldset className="aw-fieldset">
        <legend>Content</legend>
        <label className="row">
          <input type="checkbox" checked={redact} onChange={(e) => setRedact(e.target.checked)} />
          Redact Authorization, cookies and token-like values (recommended)
        </label>
        <label className="row">
          <input type="checkbox" checked={includeBodies} onChange={(e) => setIncludeBodies(e.target.checked)} />
          Include request{format === 'json' ? ' and response' : ''} bodies
        </label>
        {includeBodies && format === 'json' && !props.captureBodies && (
          <div className="subtle">Response body capture is disabled in Settings; only request bodies will be included.</div>
        )}
        {includeBodies && format === 'json' && props.captureBodies && items.length > MAX_BODY_FETCH && (
          <div className="subtle">Response bodies are read for the first {MAX_BODY_FETCH} requests only.</div>
        )}
      </fieldset>
      {!redact && (
        <Callout tone="danger">Redaction is off: credentials in headers, URLs and bodies will be written to the file as-is.</Callout>
      )}
      {props.redactByDefault === false && redact && (
        <div className="subtle">Your settings show unredacted values in the panel, but exports are still redacted unless you untick the box.</div>
      )}
    </Modal>
  );
}
