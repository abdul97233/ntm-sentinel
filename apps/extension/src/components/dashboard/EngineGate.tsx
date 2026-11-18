import type { ReactNode } from 'react';
import { ScanSearch } from 'lucide-react';
import type { EngineState } from '@ntm/shared';
import type { TabContext } from '../../hooks/useTabContext';
import { StateBlock } from '../common';

/**
 * Renders the correct status block (no page / unsupported / permission / not-scanned /
 * scanning / failed) for an engine, or the children when data is available.
 */
export function EngineGate<T>(props: {
  ctx: TabContext;
  state: EngineState<T> | undefined;
  engineName: string;
  enabled: boolean;
  children: (data: T) => ReactNode;
}) {
  const { ctx, state, engineName } = props;
  if (!props.enabled) {
    return <StateBlock title={`${engineName} is disabled`} body="Enable it in Settings → Modules." />;
  }
  if (ctx.loading) return <StateBlock kind="loading" title="Loading…" />;
  if (ctx.tabId === null) return <StateBlock title="No active tab" body="Open a website to analyse it." />;
  if (ctx.access && !ctx.access.supported) {
    return <StateBlock kind="unsupported" title="Unsupported page" body={ctx.access.unsupportedReason} />;
  }
  if (state?.status === 'scanning') return <StateBlock kind="loading" title={`${engineName} is scanning…`} />;
  if (state?.status === 'completed' && state.data) return <>{props.children(state.data)}</>;
  if (ctx.access && !ctx.access.canAccess) {
    return (
      <StateBlock
        kind="permission"
        title="Permission required"
        body="NTM Sentinel only reads a page after you allow it. Click the toolbar icon while on this page, or grant persistent access for this site."
        action={
          <button type="button" className="btn btn--primary" onClick={() => void ctx.requestSiteAccess()}>
            Grant access to this site
          </button>
        }
      />
    );
  }
  if (state?.status === 'failed') {
    return (
      <StateBlock
        kind="error"
        title="Scan failed"
        body={state.error}
        action={<button type="button" className="btn" onClick={() => void ctx.runScan()}>Retry</button>}
      />
    );
  }
  if (state?.status === 'permission-required') {
    return (
      <StateBlock
        kind="permission"
        title="Permission required"
        body={state.error}
        action={<button type="button" className="btn btn--primary" onClick={() => void ctx.requestSiteAccess()}>Grant access to this site</button>}
      />
    );
  }
  if (state?.status === 'unsupported') return <StateBlock kind="unsupported" title="Unsupported page" body={state.error} />;
  return (
    <StateBlock
      icon={ScanSearch}
      title="Not scanned yet"
      body="Scans run locally in your browser and only when you ask."
      action={<button type="button" className="btn btn--primary" onClick={() => void ctx.runScan()}>Scan this page</button>}
    />
  );
}
