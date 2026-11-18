/** Side panel page for APIWatch: the real tool lives in DevTools; this explains and summarises. */
import { Activity, Keyboard, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Card, Callout } from '../../components/common';

export function ApiMonitorPage(props: { tabId: number | null; requestCount?: number }) {
  const hasCount = typeof props.requestCount === 'number';
  return (
    <div className="stack">
      <Card
        title="APIWatch"
        icon={Activity}
        subtitle="API inspection and network debugging in a dedicated DevTools panel"
      >
        <div className="stack">
          <div className="row row--between">
            <span className="muted">Requests observed on this tab</span>
            <strong data-testid="apiwatch-count">{hasCount ? props.requestCount : '—'}</strong>
          </div>
          {!hasCount && (
            <div className="subtle">
              No data yet. The counter updates while the APIWatch DevTools panel is open for this tab.
            </div>
          )}
        </div>
      </Card>

      <Card title="How to open" icon={Keyboard}>
        <ol className="aw-steps">
          <li>
            Press <kbd>F12</kbd> (or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>I</kbd> / <kbd>⌘</kbd>+<kbd>⌥</kbd>+<kbd>I</kbd>) on
            the page you want to inspect.
          </li>
          <li>
            Select the <strong>NTM APIWatch</strong> tab (it may be under the » overflow menu).
          </li>
          <li>Reload the page to capture its complete network activity, including response bodies.</li>
        </ol>
      </Card>

      <Card title="Coverage and limitations" icon={TriangleAlert}>
        <ul className="aw-list">
          <li>Only requests made by the inspected tab while DevTools is open are captured.</li>
          <li>
            Response bodies are read on demand through the DevTools <code>getContent()</code> API; requests that finished
            before the panel opened have metadata only.
          </li>
          <li>Service worker, extension and other-tab traffic is not visible. WebSocket frames are not inspected.</li>
          <li>Some request payloads (multipart, binary uploads) are not exposed by DevTools.</li>
        </ul>
      </Card>

      <Card title="Privacy" icon={ShieldCheck}>
        <Callout>
          APIWatch is entirely local. Captured requests stay in the DevTools panel's memory, are cleared when DevTools
          closes, and are never uploaded. Authorization headers, cookies and common token formats are redacted by
          default in the view and in every export, and exporting always asks for confirmation first.
        </Callout>
      </Card>
    </div>
  );
}
