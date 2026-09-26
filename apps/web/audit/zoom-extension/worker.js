// Keeps an inspectable service-worker boundary for the local audit runner.
chrome.runtime.onInstalled.addListener(() => {});
// Browser API activity keeps this test-only worker available between matrix cases.
setInterval(() => chrome.runtime.getPlatformInfo(), 20000);
