document.addEventListener("DOMContentLoaded", async () => {
  const startBtn = document.getElementById("startBtn");
  const exportBtn = document.getElementById("exportBtn");
  const clearBtn = document.getElementById("clearBtn");
  const viewGalleryBtn = document.getElementById("viewGalleryBtn");
  const countEl = document.getElementById("count");
  const deletedCountEl = document.getElementById("deletedCount");
  const deletedContainer = document.getElementById("deletedContainer");

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
  updateUI();

  // 1. Scraping Handler (Logic combined into one)
  startBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // 1. Basic check for X/Twitter
    if (!tab.url.includes("x.com") && !tab.url.includes("twitter.com")) {
      alert("Please open this on X.com");
      return;
    }

    // Toggle scraping state
    // Note: We need a way to know if we are currently scraping without relying on innerText
    // But for now, let's just attempt to trigger it

    try {
      // Try sending the message
      await chrome.tabs.sendMessage(tab.id, { action: "start_scraping" });
      startBtn.innerText = "Scraping...";
      startBtn.style.opacity = "0.7";
    } catch (err) {
      // 3. If it fails, the "receiving end does not exist" - so we inject it!
      console.log("Content script not found. Injecting now...");

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });

      // 4. Try sending the message again after a tiny delay
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, { action: "start_scraping" });
        startBtn.innerText = "Scraping...";
        startBtn.style.opacity = "0.7";
      }, 500);
    }
  });

  // 3. Download CSV
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

  // 4. View Gallery (Opens your dashboard/index.html)
  viewGalleryBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/index.html") });
  });

  // 5. Clear Data
  clearBtn.addEventListener("click", async () => {
    if (confirm("Are you sure you want to delete all saved video links?")) {
      await chrome.storage.local.remove("collectedTweets");
      chrome.action.setBadgeText({ text: "" }); // Clear the badge too
      updateUI();
    }
  });

  // Listen for updates from content script to refresh the count in real-time
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "update_badge") {
      countEl.innerText = request.count;
    }
    if (request.action === "scraping_stopped") {
      startBtn.innerText = "Start Scraping";
      startBtn.style.opacity = "1";
    }
  });
});
