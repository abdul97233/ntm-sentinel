import { useEffect, useState } from 'react';
import { Crosshair, FileCode2, Image as ImageIcon, MonitorSmartphone, Palette, Type } from 'lucide-react';
import type { AssetItem, ColorSwatch, TypographyReport, ViewportInfo } from '@ntm/shared';
import { StateBlock, Tabs } from '../../components/common';
import { send } from '../../core/messaging/client';
import { useDevLensQuery } from './useDevLensQuery';
import { InspectPanel } from './panels/InspectPanel';
import { ColorsPanel } from './panels/ColorsPanel';
import { TypographyPanel } from './panels/TypographyPanel';
import { AssetsPanel } from './panels/AssetsPanel';
import { ResponsivePanel } from './panels/ResponsivePanel';
import { ExportPanel } from './panels/ExportPanel';
import './devlens.scss';

type SubTab = 'inspect' | 'colors' | 'typography' | 'assets' | 'responsive' | 'export';

const TABS: { id: SubTab; label: string; icon: typeof Crosshair }[] = [
  { id: 'inspect', label: 'Inspect', icon: Crosshair },
  { id: 'colors', label: 'Colors', icon: Palette },
  { id: 'typography', label: 'Type', icon: Type },
  { id: 'assets', label: 'Assets', icon: ImageIcon },
  { id: 'responsive', label: 'Responsive', icon: MonitorSmartphone },
  { id: 'export', label: 'Export', icon: FileCode2 },
];

export interface InspectorPageProps {
  tabId: number | null;
  canAccess: boolean;
  onRequestAccess: () => void;
}

export function InspectorPage({ tabId, canAccess, onRequestAccess }: InspectorPageProps) {
  const [tab, setTab] = useState<SubTab>('inspect');
  const [sourceUrl, setSourceUrl] = useState('');

  const colors = useDevLensQuery<ColorSwatch[]>(() => send('devlens/colors', { tabId: tabId! }), [tabId]);
  const typography = useDevLensQuery<TypographyReport>(() => send('devlens/typography', { tabId: tabId! }), [tabId]);
  const assets = useDevLensQuery<AssetItem[]>(() => send('devlens/assets', { tabId: tabId! }), [tabId]);
  const viewport = useDevLensQuery<ViewportInfo>(() => send('devlens/viewport', { tabId: tabId! }), [tabId]);

  useEffect(() => {
    if (tabId === null) return;
    let alive = true;
    chrome.tabs
      .get(tabId)
      .then((t) => alive && setSourceUrl(t.url ?? ''))
      .catch(() => alive && setSourceUrl(''));
    return () => {
      alive = false;
    };
  }, [tabId]);

  if (tabId === null) {
    return <StateBlock kind="unsupported" title="No active tab" body="Open a web page to use DevLens." />;
  }
  if (!canAccess) {
    return (
      <StateBlock
        kind="permission"
        title="Site access required"
        body="DevLens needs permission to read this page's DOM and styles. Nothing leaves your device."
        action={
          <button type="button" className="btn btn--primary" onClick={onRequestAccess}>
            Grant access to this site
          </button>
        }
      />
    );
  }

  return (
    <div className="stack devlens">
      <Tabs ariaLabel="DevLens tools" value={tab} onChange={setTab} items={TABS} />
      {tab === 'inspect' && <InspectPanel tabId={tabId} />}
      {tab === 'colors' && <ColorsPanel query={colors} onRun={colors.run} />}
      {tab === 'typography' && <TypographyPanel query={typography} onRun={typography.run} />}
      {tab === 'assets' && <AssetsPanel query={assets} onRun={assets.run} />}
      {tab === 'responsive' && <ResponsivePanel tabId={tabId} viewport={viewport} onRefresh={viewport.run} />}
      {tab === 'export' && (
        <ExportPanel
          colors={colors}
          typography={typography}
          sourceUrl={sourceUrl || 'unknown'}
          onCollect={() => {
            void colors.run();
            void typography.run();
          }}
        />
      )}
    </div>
  );
}
