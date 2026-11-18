import type { TrackerSignatureBundle } from '@ntm/shared';

/**
 * Bundled tracker classification list (domain -> known service).
 * Matching is by hostname suffix. Inclusion means "a known third-party service in
 * this category", not proof of any specific data collection.
 */
export const trackerSignatures: TrackerSignatureBundle = {
  schemaVersion: 1,
  version: '2026.11.18',
  trackers: [
    // ---- Analytics ----
    { id: 'google-analytics', name: 'Google Analytics', company: 'Google', category: 'analytics', domains: ['google-analytics.com', 'analytics.google.com'] },
    { id: 'adobe-analytics', name: 'Adobe Analytics', company: 'Adobe', category: 'analytics', domains: ['omtrdc.net', '2o7.net', 'demdex.net'] },
    { id: 'mixpanel', name: 'Mixpanel', company: 'Mixpanel', category: 'analytics', domains: ['mixpanel.com', 'mxpnl.com'] },
    { id: 'amplitude', name: 'Amplitude', company: 'Amplitude', category: 'analytics', domains: ['amplitude.com'] },
    { id: 'segment', name: 'Segment', company: 'Twilio', category: 'analytics', domains: ['segment.com', 'segment.io'] },
    { id: 'heap', name: 'Heap', company: 'Contentsquare', category: 'analytics', domains: ['heapanalytics.com', 'heap-api.com'] },
    { id: 'plausible', name: 'Plausible', company: 'Plausible Insights', category: 'analytics', domains: ['plausible.io'] },
    { id: 'matomo-cloud', name: 'Matomo Cloud', company: 'InnoCraft', category: 'analytics', domains: ['matomo.cloud'] },
    { id: 'fathom', name: 'Fathom', company: 'Conva Ventures', category: 'analytics', domains: ['usefathom.com'] },
    { id: 'posthog', name: 'PostHog', company: 'PostHog', category: 'analytics', domains: ['posthog.com'] },
    { id: 'cloudflare-insights', name: 'Cloudflare Web Analytics', company: 'Cloudflare', category: 'analytics', domains: ['cloudflareinsights.com'] },
    { id: 'chartbeat', name: 'Chartbeat', company: 'Chartbeat', category: 'analytics', domains: ['chartbeat.com', 'chartbeat.net'] },
    { id: 'comscore', name: 'Comscore', company: 'Comscore', category: 'analytics', domains: ['scorecardresearch.com', 'comscore.com'] },
    { id: 'quantcast', name: 'Quantcast', company: 'Quantcast', category: 'advertising', domains: ['quantserve.com', 'quantcount.com', 'quantcast.com'] },
    { id: 'newrelic', name: 'New Relic Browser', company: 'New Relic', category: 'analytics', domains: ['nr-data.net', 'newrelic.com'] },
    { id: 'datadog-rum', name: 'Datadog RUM', company: 'Datadog', category: 'analytics', domains: ['browser-intake-datadoghq.com', 'browser-intake-datadoghq.eu'] },
    { id: 'sentry', name: 'Sentry', company: 'Functional Software', category: 'other', domains: ['sentry.io', 'sentry-cdn.com'] },
    { id: 'yandex-metrica', name: 'Yandex Metrica', company: 'Yandex', category: 'analytics', domains: ['mc.yandex.ru', 'mc.yandex.com'] },
    { id: 'baidu-tongji', name: 'Baidu Analytics', company: 'Baidu', category: 'analytics', domains: ['hm.baidu.com'] },
    { id: 'kissmetrics', name: 'Kissmetrics', company: 'Kissmetrics', category: 'analytics', domains: ['kissmetrics.io', 'kissmetrics.com'] },
    { id: 'parsely', name: 'Parse.ly', company: 'Automattic', category: 'analytics', domains: ['parsely.com', 'parse.ly'] },
    { id: 'wp-stats', name: 'WordPress.com Stats', company: 'Automattic', category: 'analytics', domains: ['stats.wp.com', 'pixel.wp.com'] },
    { id: 'statcounter', name: 'StatCounter', company: 'StatCounter', category: 'analytics', domains: ['statcounter.com'] },
    { id: 'clicky', name: 'Clicky', company: 'Roxr', category: 'analytics', domains: ['getclicky.com'] },
    { id: 'pendo', name: 'Pendo', company: 'Pendo', category: 'analytics', domains: ['pendo.io'] },

    // ---- Tag managers ----
    { id: 'google-tag-manager', name: 'Google Tag Manager', company: 'Google', category: 'tag-manager', domains: ['googletagmanager.com'] },
    { id: 'tealium', name: 'Tealium', company: 'Tealium', category: 'tag-manager', domains: ['tiqcdn.com', 'tealiumiq.com'] },
    { id: 'adobe-launch', name: 'Adobe Experience Platform Tags', company: 'Adobe', category: 'tag-manager', domains: ['adobedtm.com'] },
    { id: 'ensighten', name: 'Ensighten', company: 'Ensighten', category: 'tag-manager', domains: ['ensighten.com'] },

    // ---- Session replay ----
    { id: 'hotjar', name: 'Hotjar', company: 'Contentsquare', category: 'session-replay', domains: ['hotjar.com', 'hotjar.io'] },
    { id: 'fullstory', name: 'FullStory', company: 'FullStory', category: 'session-replay', domains: ['fullstory.com'] },
    { id: 'clarity', name: 'Microsoft Clarity', company: 'Microsoft', category: 'session-replay', domains: ['clarity.ms'] },
    { id: 'mouseflow', name: 'Mouseflow', company: 'Mouseflow', category: 'session-replay', domains: ['mouseflow.com'] },
    { id: 'logrocket', name: 'LogRocket', company: 'LogRocket', category: 'session-replay', domains: ['logrocket.com', 'lr-ingest.io', 'lr-in.com'] },
    { id: 'smartlook', name: 'Smartlook', company: 'Cisco', category: 'session-replay', domains: ['smartlook.com', 'smartlook.cloud'] },
    { id: 'contentsquare', name: 'Contentsquare', company: 'Contentsquare', category: 'session-replay', domains: ['contentsquare.net'] },
    { id: 'crazyegg', name: 'Crazy Egg', company: 'Crazy Egg', category: 'session-replay', domains: ['crazyegg.com'] },

    // ---- Advertising ----
    { id: 'google-ads', name: 'Google Ads / DoubleClick', company: 'Google', category: 'advertising', domains: ['doubleclick.net', 'googleadservices.com', 'googlesyndication.com', 'adservice.google.com', 'pagead2.googlesyndication.com'] },
    { id: 'google-ad-traffic', name: 'Google Ad Traffic Quality', company: 'Google', category: 'advertising', domains: ['adtrafficquality.google'] },
    { id: 'meta-pixel', name: 'Meta Pixel', company: 'Meta', category: 'advertising', domains: ['connect.facebook.net', 'facebook.com', 'facebook.net'] },
    { id: 'amazon-ads', name: 'Amazon Advertising', company: 'Amazon', category: 'advertising', domains: ['amazon-adsystem.com', 'assoc-amazon.com'] },
    { id: 'microsoft-ads', name: 'Microsoft Advertising', company: 'Microsoft', category: 'advertising', domains: ['bat.bing.com', 'ads.microsoft.com'] },
    { id: 'criteo', name: 'Criteo', company: 'Criteo', category: 'advertising', domains: ['criteo.com', 'criteo.net'] },
    { id: 'taboola', name: 'Taboola', company: 'Taboola', category: 'advertising', domains: ['taboola.com'] },
    { id: 'outbrain', name: 'Outbrain', company: 'Outbrain', category: 'advertising', domains: ['outbrain.com', 'outbrainimg.com'] },
    { id: 'tiktok-pixel', name: 'TikTok Pixel', company: 'ByteDance', category: 'advertising', domains: ['analytics.tiktok.com', 'ads.tiktok.com'] },
    { id: 'linkedin-insight', name: 'LinkedIn Insight Tag', company: 'Microsoft', category: 'advertising', domains: ['ads.linkedin.com', 'snap.licdn.com', 'px.ads.linkedin.com'] },
    { id: 'x-ads', name: 'X (Twitter) Ads', company: 'X Corp', category: 'advertising', domains: ['ads-twitter.com', 'static.ads-twitter.com', 'analytics.twitter.com'] },
    { id: 'pinterest-tag', name: 'Pinterest Tag', company: 'Pinterest', category: 'advertising', domains: ['ct.pinterest.com'] },
    { id: 'snap-pixel', name: 'Snap Pixel', company: 'Snap', category: 'advertising', domains: ['sc-static.net', 'tr.snapchat.com'] },
    { id: 'reddit-pixel', name: 'Reddit Pixel', company: 'Reddit', category: 'advertising', domains: ['redditstatic.com', 'alb.reddit.com'] },
    { id: 'adnxs', name: 'Xandr (AppNexus)', company: 'Microsoft', category: 'advertising', domains: ['adnxs.com'] },
    { id: 'pubmatic', name: 'PubMatic', company: 'PubMatic', category: 'advertising', domains: ['pubmatic.com'] },
    { id: 'rubicon', name: 'Magnite (Rubicon)', company: 'Magnite', category: 'advertising', domains: ['rubiconproject.com'] },
    { id: 'openx', name: 'OpenX', company: 'OpenX', category: 'advertising', domains: ['openx.net'] },
    { id: 'thetradedesk', name: 'The Trade Desk', company: 'The Trade Desk', category: 'advertising', domains: ['adsrvr.org'] },
    { id: 'index-exchange', name: 'Index Exchange', company: 'Index Exchange', category: 'advertising', domains: ['casalemedia.com', 'indexww.com'] },
    { id: 'medianet', name: 'Media.net', company: 'Media.net', category: 'advertising', domains: ['media.net'] },
    { id: 'adroll', name: 'AdRoll', company: 'NextRoll', category: 'advertising', domains: ['adroll.com'] },
    { id: 'liveramp', name: 'LiveRamp', company: 'LiveRamp', category: 'advertising', domains: ['rlcdn.com', 'liveramp.com'] },
    { id: 'lotame', name: 'Lotame', company: 'Lotame', category: 'advertising', domains: ['crwdcntrl.net'] },
    { id: 'bluekai', name: 'Oracle BlueKai', company: 'Oracle', category: 'advertising', domains: ['bluekai.com', 'bkrtx.com'] },
    { id: 'id5', name: 'ID5', company: 'ID5', category: 'advertising', domains: ['id5-sync.com'] },
    { id: 'smartadserver', name: 'Equativ (Smart AdServer)', company: 'Equativ', category: 'advertising', domains: ['smartadserver.com'] },
    { id: 'yahoo-ads', name: 'Yahoo Advertising', company: 'Yahoo', category: 'advertising', domains: ['ads.yahoo.com', 'analytics.yahoo.com', 'yimg.com'] },

    // ---- Social widgets ----
    { id: 'x-widgets', name: 'X (Twitter) Widgets', company: 'X Corp', category: 'social', domains: ['platform.twitter.com', 'syndication.twitter.com'] },
    { id: 'linkedin-widgets', name: 'LinkedIn Widgets', company: 'Microsoft', category: 'social', domains: ['platform.linkedin.com'] },
    { id: 'addthis', name: 'AddThis', company: 'Oracle', category: 'social', domains: ['addthis.com', 'addthisedge.com'] },
    { id: 'sharethis', name: 'ShareThis', company: 'ShareThis', category: 'social', domains: ['sharethis.com'] },
    { id: 'disqus', name: 'Disqus', company: 'Disqus', category: 'social', domains: ['disqus.com', 'disquscdn.com'] },

    // ---- Customer engagement ----
    { id: 'intercom', name: 'Intercom', company: 'Intercom', category: 'customer-engagement', domains: ['intercom.io', 'intercomcdn.com'] },
    { id: 'hubspot', name: 'HubSpot', company: 'HubSpot', category: 'customer-engagement', domains: ['hs-scripts.com', 'hs-analytics.net', 'hubspot.com', 'hsforms.net', 'hs-banner.com', 'hscollectedforms.net'] },
    { id: 'drift', name: 'Drift', company: 'Salesloft', category: 'customer-engagement', domains: ['drift.com', 'driftt.com'] },
    { id: 'zendesk', name: 'Zendesk Widget', company: 'Zendesk', category: 'customer-engagement', domains: ['zdassets.com', 'zopim.com'] },
    { id: 'marketo', name: 'Marketo', company: 'Adobe', category: 'customer-engagement', domains: ['marketo.net', 'mktoresp.com'] },
    { id: 'klaviyo', name: 'Klaviyo', company: 'Klaviyo', category: 'customer-engagement', domains: ['klaviyo.com'] },
    { id: 'onesignal', name: 'OneSignal', company: 'OneSignal', category: 'customer-engagement', domains: ['onesignal.com'] },
    { id: 'optimizely', name: 'Optimizely', company: 'Optimizely', category: 'analytics', domains: ['optimizely.com'] },
    { id: 'braze', name: 'Braze', company: 'Braze', category: 'customer-engagement', domains: ['braze.com', 'appboycdn.com'] },

    // ---- Consent management ----
    { id: 'onetrust', name: 'OneTrust', company: 'OneTrust', category: 'consent', domains: ['onetrust.com', 'cookielaw.org'] },
    { id: 'cookiebot', name: 'Cookiebot', company: 'Usercentrics', category: 'consent', domains: ['cookiebot.com'] },
    { id: 'usercentrics', name: 'Usercentrics', company: 'Usercentrics', category: 'consent', domains: ['usercentrics.eu'] },
    { id: 'trustarc', name: 'TrustArc', company: 'TrustArc', category: 'consent', domains: ['trustarc.com', 'truste.com'] },
    { id: 'quantcast-choice', name: 'Quantcast Choice', company: 'Quantcast', category: 'consent', domains: ['quantcast.mgr.consensu.org'] },

    // ---- Fingerprinting / device intelligence ----
    { id: 'fingerprintjs', name: 'Fingerprint (FingerprintJS Pro)', company: 'Fingerprint', category: 'fingerprinting', domains: ['fpjs.io', 'fptls.com', 'fpcdn.io', 'api.fpjs.io'] },
    { id: 'threatmetrix', name: 'ThreatMetrix', company: 'LexisNexis', category: 'fingerprinting', domains: ['online-metrix.net'] },
    { id: 'iovation', name: 'iovation', company: 'TransUnion', category: 'fingerprinting', domains: ['iesnare.com', 'iovation.com'] },
  ],
};
