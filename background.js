// Listen for messages from the content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "update_badge") {
    // Scraping is ongoing: show a solid green indicator instead of the count
    chrome.action.setBadgeText({ text: " " });
    chrome.action.setBadgeBackgroundColor({ color: "#17BF63" });
  }

  if (message.action === "scraping_stopped") {
    // Scraping finished or paused: clear the indicator
    chrome.action.setBadgeText({ text: "" });
  }
});

// Clear badge when database is cleared (optional but recommended)
chrome.storage.onChanged.addListener((changes) => {
  if (changes.collectedTweets && !changes.collectedTweets.newValue) {
    chrome.action.setBadgeText({ text: "" });
  }
});
