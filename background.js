const SCRAPING_TABS_KEY = "scrapingTabs";

// Tabs currently scraping are tracked in session storage so the state survives
// service-worker restarts (but is cleared when the browser session ends).
async function getScrapingTabs() {
  const stored = await chrome.storage.session.get(SCRAPING_TABS_KEY);
  return stored[SCRAPING_TABS_KEY] || {};
}

async function setTabScraping(tabId, isScraping) {
  const tabs = await getScrapingTabs();

  if (isScraping) {
    tabs[tabId] = true;
    chrome.action.setBadgeText({ tabId, text: " " });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#17BF63" });
  } else {
    delete tabs[tabId];
    chrome.action.setBadgeText({ tabId, text: "" });
  }

  await chrome.storage.session.set({ [SCRAPING_TABS_KEY]: tabs });
}

async function stopAllScraping() {
  const tabs = await getScrapingTabs();
  const tabIds = Object.keys(tabs).map(Number);
  let stopped = 0;

  await Promise.all(
    tabIds.map(async (tabId) => {
      try {
        await chrome.tabs.sendMessage(tabId, { action: "stop_scraping" });
        stopped++;
      } catch (err) {
        // Tab closed or content script no longer available; nothing to stop.
      }
      chrome.action.setBadgeText({ tabId, text: "" });
    }),
  );

  await chrome.storage.session.set({ [SCRAPING_TABS_KEY]: {} });
  return stopped;
}

// Listen for messages from the content script and the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // --- From content scripts (sender.tab is set) ---
  if (sender.tab) {
    if (message.action === "scraping_started") {
      setTabScraping(sender.tab.id, true);
      return;
    }

    if (message.action === "scraping_stopped") {
      setTabScraping(sender.tab.id, false);
      return;
    }

    if (message.action === "update_badge") {
      // Scraping is ongoing: show a solid green indicator instead of the count
      chrome.action.setBadgeText({ tabId: sender.tab.id, text: " " });
      chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: "#17BF63" });
      return;
    }
  }

  // --- From the popup (no sender.tab) ---
  if (message.action === "get_scraping_tabs") {
    getScrapingTabs().then((tabs) => sendResponse({ tabs: Object.keys(tabs).map(Number) }));
    return true; // keep the message channel open for the async response
  }

  if (message.action === "stop_all") {
    stopAllScraping().then((stopped) => sendResponse({ stopped }));
    return true;
  }
});

// Clean up tracking when a tab is closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const tabs = await getScrapingTabs();
  if (tabs[tabId]) {
    delete tabs[tabId];
    await chrome.storage.session.set({ [SCRAPING_TABS_KEY]: tabs });
  }
});

// Clear badges when the collected database is cleared
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === "local" && changes.collectedTweets && !changes.collectedTweets.newValue) {
    const tabs = await getScrapingTabs();
    Object.keys(tabs).forEach((tabId) => chrome.action.setBadgeText({ tabId: Number(tabId), text: "" }));
    await chrome.storage.session.set({ [SCRAPING_TABS_KEY]: {} });
  }
});
