import { useMemo } from 'react';
import { Download, FileCode2 } from 'lucide-react';
import type { ColorSwatch, TypographyReport } from '@ntm/shared';
import { Card, CopyButton, StateBlock, downloadFile } from '../../../components/common';
import { buildCssVariables, buildDesignTokens } from '../tokens';
import type { QueryState } from '../useDevLensQuery';

export function ExportPanel(props: {
  colors: QueryState<ColorSwatch[]>;
  typography: QueryState<TypographyReport>;
  sourceUrl: string;
  onCollect: () => void;
}) {
  const ready = props.colors.status === 'ready' && props.typography.status === 'ready';
  const loading = props.colors.status === 'loading' || props.typography.status === 'loading';

  const { json, css } = useMemo(() => {
    if (!ready) return { json: '', css: '' };
    const tokens = buildDesignTokens(
      (props.colors.data ?? []).slice(0, 24),
      (props.typography.data?.styles ?? []).slice(0, 12),
      props.sourceUrl,
    );
    return { json: JSON.stringify(tokens, null, 2), css: buildCssVariables(tokens) };
  }, [ready, props.colors.data, props.typography.data, props.sourceUrl]);

  return (
    <Card
      title="Export design tokens"
      icon={FileCode2}
      subtitle="Builds tokens from the top extracted colors and type styles."
      actions={
        <button type="button" className="btn btn--sm btn--primary" onClick={props.onCollect} disabled={loading}>
          {ready ? 'Re-collect' : 'Collect colors & type'}
        </button>
      }
    >
      {!ready && !loading && (
        <StateBlock title="Nothing collected yet" body="Collect colors and typography from the page to generate tokens." />
      )}
      {loading && <StateBlock kind="loading" title="Collecting…" />}
      {(props.colors.status === 'error' || props.typography.status === 'error') && (
        <StateBlock kind="error" title="Collection failed" body={props.colors.error ?? props.typography.error} />
      )}
      {ready && (
        <div className="stack">
          <div className="row row--between">
            <strong>Design tokens (JSON)</strong>
            <div className="row">
              <CopyButton label="Copy" text={json} />
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => downloadFile('design-tokens.json', json)}>
                <Download size={13} /> Download
              </button>
            </div>
          </div>
          <pre className="dl-code">{json}</pre>
          <div className="row row--between">
            <strong>CSS variables</strong>
            <div className="row">
              <CopyButton label="Copy" text={css} />
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => downloadFile('tokens.css', css, 'text/css')}
              >
                <Download size={13} /> Download
              </button>
            </div>
          </div>
          <pre className="dl-code">{css}</pre>
        </div>
      )}
    </Card>
  );
}
