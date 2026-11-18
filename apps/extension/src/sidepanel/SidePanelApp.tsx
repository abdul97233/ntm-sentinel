import { useEffect, useState } from 'react';
import { RefreshCw, ShieldHalf } from 'lucide-react';
import { ROUTES, isRouteId, type RouteId } from '../app/routes';
import { useTheme } from '../app/useTheme';
import { useTabContext } from '../hooks/useTabContext';
import { Callout } from '../components/common';
import { OverviewPage } from '../modules/overview/OverviewPage';
import { SecurityPage } from '../modules/scamlens/SecurityPage';
import { PrivacyPage } from '../modules/privacyguard/PrivacyPage';
import { TechnologiesPage } from '../modules/stackpeek/TechnologiesPage';
import { SettingsPage } from '../modules/settings/SettingsPage';
import { InspectorPage } from '../modules/devlens';
import { ApiMonitorPage } from '../modules/apiwatch';

const ROUTE_KEY = 'ntm:lastRoute';

function initialRoute(): RouteId {
  const fromHash = location.hash.replace('#', '');
  if (isRouteId(fromHash)) return fromHash;
  try {
    const saved = localStorage.getItem(ROUTE_KEY);
    if (isRouteId(saved)) return saved;
  } catch {
    /* ignore */
  }
  return 'overview';
}

export function SidePanelApp() {
  const [route, setRoute] = useState<RouteId>(initialRoute);
  const ctx = useTabContext({ follow: true });
  useTheme(ctx.settings.theme);

  useEffect(() => {
    try {
      localStorage.setItem(ROUTE_KEY, route);
    } catch {
      /* ignore */
    }
  }, [route]);

  useEffect(() => {
    const onHash = () => {
      const h = location.hash.replace('#', '');
      if (isRouteId(h)) setRoute(h);
    };
    // Popup writes the requested route to localStorage before opening/focusing the panel.
    const onStorage = (e: StorageEvent) => {
      if (e.key === ROUTE_KEY && isRouteId(e.newValue)) setRoute(e.newValue);
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const current = ROUTES.find((r) => r.id === route)!;

  return (
    <div className="shell">
      <nav className="shell__nav" aria-label="Main">
        <div className="shell__logo" title="NTM Sentinel">
          <ShieldHalf size={20} />
        </div>
        {ROUTES.map((r) => {
          const Icon = r.icon;
          return (
            <button
              key={r.id}
              type="button"
              className={`nav-item ${route === r.id ? 'nav-item--active' : ''}`}
              onClick={() => setRoute(r.id)}
              title={r.engine ? `${r.label} · ${r.engine}` : r.label}
              aria-label={r.label}
              aria-current={route === r.id ? 'page' : undefined}
            >
              <Icon size={18} />
              <span className="nav-item__label">{r.label.split(' ')[0]}</span>
            </button>
          );
        })}
      </nav>
      <main className="shell__main">
        <header className="shell__header">
          <div>
            <h1>{current.label}</h1>
            {current.engine && <span className="subtle">{current.engine}</span>}
          </div>
          <button type="button" className="btn btn--ghost btn--icon" title="Refresh tab status" aria-label="Refresh" onClick={() => void ctx.refresh()}>
            <RefreshCw size={14} />
          </button>
        </header>
        {ctx.error && <Callout tone="danger">{ctx.error}</Callout>}
        <div className="shell__content">
          {route === 'overview' && <OverviewPage ctx={ctx} navigate={setRoute} />}
          {route === 'security' && <SecurityPage ctx={ctx} />}
          {route === 'privacy' && <PrivacyPage ctx={ctx} />}
          {route === 'technologies' && <TechnologiesPage ctx={ctx} />}
          {route === 'inspector' &&
            (ctx.settings.modules.devlens ? (
              <InspectorPage tabId={ctx.tabId} canAccess={!!ctx.access?.canAccess} onRequestAccess={() => void ctx.requestSiteAccess()} />
            ) : (
              <Callout>DevLens is disabled. Enable it in Settings → Modules.</Callout>
            ))}
          {route === 'api' && <ApiMonitorPage tabId={ctx.tabId} requestCount={ctx.scan?.apiRequestCount} />}
          {route === 'settings' && <SettingsPage ctx={ctx} />}
        </div>
      </main>
    </div>
  );
}
