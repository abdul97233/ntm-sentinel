/**
 * DevTools page: runs once per DevTools window and registers the APIWatch panel.
 * The panel itself (panel.html) does all capture work.
 */
chrome.devtools.panels.create('NTM APIWatch', '/icons/icon-32.png', 'src/devtools/panel.html');
