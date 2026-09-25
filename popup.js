document.addEventListener("DOMContentLoaded", async () => {
  const startBtn = document.getElementById("startBtn");
  const stopAllBtn = document.getElementById("stopAllBtn");
  const exportBtn = document.getElementById("exportBtn");
  const viewGalleryBtn = document.getElementById("viewGalleryBtn");
  const countEl = document.getElementById("count");
  const deletedCountEl = document.getElementById("deletedCount");
  const deletedContainer = document.getElementById("deletedContainer");

  let activeTabId = null;

  const getActiveTab = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  };

  const isXTab = (tab) => !!tab && !!tab.url && (tab.url.includes("x.com") || tab.url.includes("twitter.com"));

  // 1. Initial UI Update: Load current count from storage
  const updateUI = async () => {
    const data = await chrome.storage.local.get(["collectedTweets", "deletedTweets"]);
    const tweets = data.collectedTweets || {};
    const deleted = data.deletedTweets || {};
    countEl.innerText = Object.keys(tweets).length;

    const deletedLen = Object.keys(deleted).length;
    if (deletedLen > 0) {
      deletedContainer.style.display = "block";
      deletedCountEl.innerText = deletedLen;
    } else {
      deletedContainer.style.display = "none";
    }
  };

  // Reflect the scraping state of the active tab onto the start/stop button
  const setScrapeButtonState = (isScraping) => {
    startBtn.dataset.scraping = isScraping ? "true" : "false";
    startBtn.innerText = isScraping ? "Stop Scraping" : "Start Scraping";
    startBtn.style.background = isScraping ? "#e0245e" : "#1da1f2";
  };

  const refreshScrapeButton = async () => {
    const tab = await getActiveTab();
    if (!tab) return;
    activeTabId = tab.id;

    if (!isXTab(tab)) {
      startBtn.disabled = true;
      setScrapeButtonState(false);
      startBtn.innerText = "Open X.com to scrape";
      return;
    }

    startBtn.disabled = false;
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { action: "get_status" });
      setScrapeButtonState(!!(res && res.isScraping));
    } catch (err) {
      // No content script yet => not scraping on this tab
      setScrapeButtonState(false);
    }
  };

  await updateUI();
  await refreshScrapeButton();

  // 2. Start / stop scraping for the current tab
  startBtn.addEventListener("click", async () => {
    const tab = await getActiveTab();

    // Basic check for X/Twitter
    if (!isXTab(tab)) {
      alert("Please open this on X.com");
      return;
    }

    const isScraping = startBtn.dataset.scraping === "true";

    if (isScraping) {
      try {
        await chrome.tabs.sendMessage(tab.id, { action: "stop_scraping" });
      } catch (err) {
        console.log("Could not stop scraping on this tab:", err);
      }
      setScrapeButtonState(false);
      return;
    }

    try {
      // Try sending the message to an already-injected content script
      await chrome.tabs.sendMessage(tab.id, { action: "start_scraping" });
    } catch (err) {
      // The "receiving end does not exist" - so we inject it!
      console.log("Content script not found. Injecting now...");
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
      await chrome.tabs.sendMessage(tab.id, { action: "start_scraping" });
    }

    setScrapeButtonState(true);
  });

  // 3. Stop every ongoing scrape across all tabs
  stopAllBtn.addEventListener("click", async () => {
    try {
      const res = await chrome.runtime.sendMessage({ action: "stop_all" });
      console.log(`Stopped scraping on ${res ? res.stopped : 0} tab(s).`);
    } catch (err) {
      console.log("Stop all failed:", err);
    }
    await refreshScrapeButton();
  });

  // 4. Download CSV
  exportBtn.addEventListener("click", async () => {
    const data = await chrome.storage.local.get(["collectedTweets"]);
    const tweets = Object.values(data.collectedTweets || {});

    if (tweets.length === 0) {
      alert("No data to export!");
      return;
    }

    // Create CSV Header and Rows
    const headers = ["Link", "Text", "Time", "Original Source", "Original Link"];
    const csvContent = [
      headers.join(","),
      ...tweets.map((t) =>
        [
          `"${t.link}"`,
          `"${t.text.replace(/"/g, '""')}"`, // Escape quotes for CSV
          `"${t.time}"`,
          `"${t.originalSource || "N/A"}"`,
          `"${t.originalLink || "N/A"}"`,
        ].join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `X_Video_Data_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  });

  // 5. View Gallery (Opens your dashboard/index.html)
  viewGalleryBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/index.html") });
  });

  // Listen for updates from content scripts to refresh the count / button state
  chrome.runtime.onMessage.addListener((request, sender) => {
    const fromActiveTab = sender.tab && sender.tab.id === activeTabId;

    if (request.action === "update_badge") {
      if (typeof request.count === "number") countEl.innerText = request.count;
      else updateUI();
      if (fromActiveTab) setScrapeButtonState(true);
    }

    if (request.action === "scraping_started" && fromActiveTab) {
      setScrapeButtonState(true);
    }

    if (request.action === "scraping_stopped" && fromActiveTab) {
      setScrapeButtonState(false);
    }
  });
});
