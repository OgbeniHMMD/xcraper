// Listen for messages from the content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "update_badge") {
    const countText = message.count.toString()

    // Set the text on the badge
    chrome.action.setBadgeText({ text: countText })

    // Optional: Change the badge color to X/Twitter Blue
    chrome.action.setBadgeBackgroundColor({ color: "#1DA1F2" })
  }
})

// Clear badge when database is cleared (optional but recommended)
chrome.storage.onChanged.addListener((changes) => {
  if (changes.collectedTweets && !changes.collectedTweets.newValue) {
    chrome.action.setBadgeText({ text: "" })
  }
})
