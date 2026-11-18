import { Code2, EyeOff, Gauge, Layers, Network, Settings, ShieldCheck, type LucideIcon } from 'lucide-react';

export type RouteId = 'overview' | 'security' | 'privacy' | 'technologies' | 'inspector' | 'api' | 'settings';

export const ROUTES: { id: RouteId; label: string; icon: LucideIcon; engine?: string }[] = [
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'security', label: 'Security', icon: ShieldCheck, engine: 'ScamLens' },
  { id: 'privacy', label: 'Privacy', icon: EyeOff, engine: 'PrivacyGuard' },
  { id: 'technologies', label: 'Technologies', icon: Layers, engine: 'StackPeek' },
  { id: 'inspector', label: 'Inspector', icon: Code2, engine: 'DevLens' },
  { id: 'api', label: 'API Monitor', icon: Network, engine: 'APIWatch' },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function isRouteId(v: string | null | undefined): v is RouteId {
  return !!v && ROUTES.some((r) => r.id === v);
}
