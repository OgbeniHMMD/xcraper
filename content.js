let isScraping = false // The global flag

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "start_scraping") {
    if (!isScraping) {
      isScraping = true
      startPersistentCollection()
    }
    sendResponse({ status: "Started" })
  }

  if (request.action === "stop_scraping") {
    isScraping = false // This will break the while loop
    console.log("%c Scraping Paused by User.", "color: red; font-weight: bold;")
    sendResponse({ status: "Paused" })
  }
})

async function startPersistentCollection() {
  console.log("%c Auto-Collector Started...", "color: #1DA1F2; font-weight: bold;")

  let lastHeight = 0
  let stopCount = 0

  const grabAndSave = async () => {
    const { collectedTweets = {} } = await chrome.storage.local.get("collectedTweets")
    const tweetMap = new Map(Object.entries(collectedTweets))
    const initialCount = tweetMap.size

    // X often uses 'article' but sometimes video containers are outside it
    const articles = document.querySelectorAll("article[data-testid='tweet']")

    articles.forEach((article) => {
      // Look for video or the play overlay
      const videoContainer = article.querySelector(
        'div[data-testid="videoPlayer"], video, [aria-label="Embedded video"]',
      )

      if (videoContainer) {
        const timeEl = article.querySelector("time")
        if (!timeEl) return

        const link = timeEl.closest("a").href.split("?")[0]

        if (!tweetMap.has(link)) {
          const textEl = article.querySelector('div[data-testid="tweetText"]')

          // We look for an image that is part of the video container specifically
          const thumbEl = videoContainer.querySelector('img[src*="video_thumb"], img[src*="tweet_video_thumb"]')
          const thumbnail = thumbEl ? thumbEl.src : null

          // Robust check for 'Retweeted' or 'Attributed' videos
          const socialContext = article.querySelector('div[data-testid="socialContext"]')

          tweetMap.set(link, {
            link,
            thumbnail,
            text: textEl ? textEl.innerText.trim() : "[No Text]",
            time: timeEl.getAttribute("datetime"),
            isRetweet: !!socialContext,
            collectedAt: new Date().toISOString(),
          })
        }
      }
    })

    if (tweetMap.size > initialCount) {
      await chrome.storage.local.set({ collectedTweets: Object.fromEntries(tweetMap) })

      // Notify background script to update icon badge
      chrome.runtime.sendMessage({
        action: "update_badge",
        count: tweetMap.size,
      })

      console.log(`%c Database Updated: ${tweetMap.size} total items.`, "color: #17bf63; font-weight: bold;")
    }
  }

  while (isScraping && stopCount < 5) {
    await grabAndSave()
    window.scrollBy(0, window.innerHeight)
    await new Promise((r) => setTimeout(r, 2500))
    let newHeight = document.body.scrollHeight
    if (newHeight === lastHeight) stopCount++
    else {
      lastHeight = newHeight
      stopCount = 0
    }
  }

  isScraping = false // Reset when finished naturally
  console.log("%c Collection Finished.", "color: orange;")
}
