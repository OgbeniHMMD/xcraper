async function loadGallery() {
  const data = await chrome.storage.local.get(["collectedTweets"]);
  let tweets = Object.values(data.collectedTweets || {}); // Keep raw data array

  let activeStatusFilter = "all";

  const grid = document.getElementById("grid");
  const search = document.getElementById("search");
  const sortFilter = document.getElementById("sort-filter");

  const render = (items) => {
    if (items.length === 0) {
      grid.innerHTML = `<div class="col-span-full text-center text-slate-400 py-10 font-medium text-sm">No videos found.</div>`;
      return;
    }

    grid.innerHTML = items
      .map((t) => {
        // EXTRACT USERNAME ON THE FLY
        let username = "@unknown";
        try {
          const pathParts = new URL(t.link).pathname.split("/");
          if (pathParts[1]) {
            username = `@${pathParts[1]}`;
          }
        } catch (e) {
          console.error("Could not parse link dynamic username:", e);
        }

        // Conditional styling and properties depending on completion status
        const cardClasses = `bg-white overflow-hidden flex flex-col border hover:border-slate-900 ${
          t.isDeleted ? "border-red-500 bg-red-50/20" : t.isDone ? "border-dashed border-emerald-500" : "border-slate-200"
        }`;

        const btnClasses = "text-lg text-slate-800 p-0.5 px-1.5 bg-slate-100 rounded flex items-center justify-center cursor-pointer";

        return `
            <div class="${cardClasses}">
                <div class="w-full aspect-[3/4] bg-black overflow-hidden relative">
                    ${
                      t.isDeleted
                        ? `<div class="absolute inset-0 bg-red-950/75 flex flex-col items-center justify-center text-white text-[10px] font-bold p-2 text-center"><span>⚠️</span><span class="mt-1">Deleted / Suspended</span></div>`
                        : t.thumbnail
                          ? `<img src="${t.thumbnail}" loading="lazy" class="w-full h-full object-contain">`
                          : `<div class="h-full flex items-center justify-center text-slate-400 text-xs">No Preview</div>`
                    }
                </div>

                <div class="p-2 flex flex-col grow">
                  <div class="text-[8px] font-medium text-slate-400"><strong>${username}</strong> - ${t.time ? new Date(t.time).toLocaleDateString() : "N/A"}</div>

                  <div class="text-[10px] leading-relaxed text-slate-800 py-0.5 line-clamp-2 min-h-[36px] font-normal">${t.text || "[No Text]"}</div>

                  <div class="text-[8px] font-medium text-slate-400 mb-3">${new Date(t.collectedAt).toLocaleString()}</div>

                  <div class="flex justify-between items-center gap-0.5">
                    <button data-link="${t.link}" class="${btnClasses} done-btn" title="${t.isDone ? "Mark Pending" : "Mark Done"}">
                        <span class="inline-block align-middle">${t.isDone ? "✅" : "☑️"}</span>
                    </button>

                    <a href="${t.link}" target="_blank" class="${btnClasses}" title="View on X">
                        <span class="inline-block align-middle">🎥 </span>
                    </a>
                    <a href="${t.link.replace("x.com", "tweeload.com").replace("twitter.com", "tweeload.com")}" target="_blank" class="${btnClasses}" title="Download Video">
                        <span class="inline-block align-middle">💾</span>
                    </a>
                    <button data-link="${t.link}" class="${btnClasses} copyFx-btn" title="Copy FixupX Link">
                        <span class="inline-block align-middle">📋</span>
                    </button>
                    <button data-link="${t.link}" class="${btnClasses} delete-btn" title="Delete">
                        <span class="inline-block align-middle">❌</span>
                    </button>
                  </div>
                </div>
            </div>
          `;
      })
      .join("");
  };

  // Combined function handling Sorting AND Live Searching together
  const getProcessedTweets = () => {
    // 1. Filter by status filter
    let result = tweets;
    if (activeStatusFilter === "pending") {
      result = result.filter((t) => !t.isDone);
    } else if (activeStatusFilter === "done") {
      result = result.filter((t) => t.isDone);
    } else if (activeStatusFilter === "today") {
      const todayStr = new Date().toDateString();
      result = result.filter((t) => new Date(t.collectedAt).toDateString() === todayStr);
    }

    // 2. Filter by search query (Checking both text AND username)
    const query = search.value.toLowerCase();

    result = result.filter((t) => {
      // 2a. Check text content
      const matchText = t.text && t.text.toLowerCase().includes(query);

      // 2b. Derive username from URL exactly how we do it in the renderer
      let username = "";
      try {
        const pathParts = new URL(t.link).pathname.split("/");
        if (pathParts[1]) username = pathParts[1].toLowerCase();
      } catch (e) {}

      const matchUser = username.includes(query.replace("@", "")); // Strips '@' if user typed it in search

      return matchText || matchUser;
    });

    // 2. Sort depending on dropdown selection
    const sortBy = sortFilter.value;
    result.sort((a, b) => {
      if (sortBy === "collected-newest") {
        return new Date(b.collectedAt) - new Date(a.collectedAt);
      }
      if (sortBy === "collected-oldest") {
        return new Date(a.collectedAt) - new Date(b.collectedAt);
      }
      if (sortBy === "posted-newest") {
        const timeA = a.time ? new Date(a.time) : 0;
        const timeB = b.time ? new Date(b.time) : 0;
        return timeB - timeA;
      }
      if (sortBy === "posted-oldest") {
        const timeA = a.time ? new Date(a.time) : 0;
        const timeB = b.time ? new Date(b.time) : 0;
        return timeA - timeB;
      }
      return 0;
    });

    return result;
  };

  const updateStats = () => {
    const totalCount = tweets.length;
    const doneCount = tweets.filter((t) => t.isDone).length;
    const pendingCount = totalCount - doneCount;

    // Calculate items collected within the current calendar day
    const todayStr = new Date().toDateString();
    const todayCount = tweets.filter((t) => new Date(t.collectedAt).toDateString() === todayStr).length;

    document.getElementById("stat-total").innerText = totalCount;
    document.getElementById("stat-pending").innerText = pendingCount;
    document.getElementById("stat-done").innerText = doneCount;
    document.getElementById("stat-today").innerText = todayCount;
  };

  render(getProcessedTweets());
  updateStats();

  search.addEventListener("input", () => render(getProcessedTweets()));
  sortFilter.addEventListener("change", () => render(getProcessedTweets()));

  // Undone All logic
  const undoneAllBtn = document.getElementById("undone-all");
  undoneAllBtn.addEventListener("click", async () => {
    if (tweets.length === 0) return;
    if (confirm("Are you sure you want to mark all items as undone / pending?")) {
      const localData = await chrome.storage.local.get(["collectedTweets"]);
      if (localData.collectedTweets) {
        Object.keys(localData.collectedTweets).forEach((link) => {
          localData.collectedTweets[link].isDone = false;
        });
        await chrome.storage.local.set({ collectedTweets: localData.collectedTweets });
        tweets = Object.values(localData.collectedTweets);
        render(getProcessedTweets());
        updateStats();
      }
    }
  });

  // Auto-scroll logic
  const autoScrollBtn = document.getElementById("auto-scroll");
  const scrollIcon = document.getElementById("scroll-icon");
  const scrollText = document.getElementById("scroll-text");
  let isScrolling = false;
  let scrollInterval;

  autoScrollBtn.addEventListener("click", () => {
    isScrolling = !isScrolling;

    if (isScrolling) {
      scrollIcon.innerText = "🛑";
      scrollText.innerText = "Stop Scroll";
      autoScrollBtn.classList.add("bg-red-50", "border-red-200");

      scrollInterval = setInterval(() => {
        window.scrollBy(0, 10);
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight) {
          stopScrolling();
        }
      }, 20);
    } else {
      stopScrolling();
    }
  });

  function stopScrolling() {
    isScrolling = false;
    clearInterval(scrollInterval);
    scrollIcon.innerText = "⏬";
    scrollText.innerText = "Auto Scroll";
    autoScrollBtn.classList.remove("bg-red-50", "border-red-200");
  }

  // Set up status filtering click handlers on stats cards
  document.querySelectorAll(".stat-card").forEach((card) => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".stat-card").forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      activeStatusFilter = card.getAttribute("data-filter");
      render(getProcessedTweets());
    });
  });

  // Check Deletions / Thumbnail Health Check logic
  const checkHealthBtn = document.getElementById("check-health");
  const healthText = document.getElementById("health-text");

  checkHealthBtn.addEventListener("click", async () => {
    if (tweets.length === 0) {
      alert("No saved videos to check!");
      return;
    }

    healthText.innerText = "Checking...";
    checkHealthBtn.classList.add("bg-blue-50", "border-blue-300");

    const localData = await chrome.storage.local.get(["collectedTweets"]);
    let tweetsObj = localData.collectedTweets || {};
    let updated = false;

    for (const [link, tweet] of Object.entries(tweetsObj)) {
      if (!tweet.thumbnail) continue;

      // Test loading thumbnail image via Image probe
      const isActive = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = tweet.thumbnail;
        setTimeout(() => resolve(false), 6000); // 6s timeout
      });

      const isCurrentlyDeleted = !isActive;
      if (tweet.isDeleted !== isCurrentlyDeleted) {
        tweetsObj[link].isDeleted = isCurrentlyDeleted;
        updated = true;
      }
    }

    if (updated) {
      await chrome.storage.local.set({ collectedTweets: tweetsObj });
      tweets = Object.values(tweetsObj);
      render(getProcessedTweets());
      updateStats();
    }

    healthText.innerText = "Check Deletions";
    checkHealthBtn.classList.remove("bg-blue-50", "border-blue-300");
    alert("Thumbnail and deletion check complete!");
  });

  grid.addEventListener("click", async (e) => {
    const doneBtn = e.target.closest(".done-btn");
    const deleteBtn = e.target.closest(".delete-btn");
    const copyFxBtn = e.target.closest(".copyFx-btn");

    // Handle Toggle Mark Done Click
    if (doneBtn) {
      const targetLink = doneBtn.getAttribute("data-link");
      const localData = await chrome.storage.local.get(["collectedTweets"]);

      if (localData.collectedTweets && localData.collectedTweets[targetLink]) {
        // Toggle state or set to true if it didn't exist yet
        localData.collectedTweets[targetLink].isDone = !localData.collectedTweets[targetLink].isDone;
        await chrome.storage.local.set({ collectedTweets: localData.collectedTweets });

        // Synchronize state and trigger processing UI refresh pipeline
        tweets = Object.values(localData.collectedTweets);
        render(getProcessedTweets());
        updateStats();
      }
    }

    if (deleteBtn) {
      const targetLink = deleteBtn.getAttribute("data-link");
      const localData = await chrome.storage.local.get(["collectedTweets"]);

      if (localData.collectedTweets && localData.collectedTweets[targetLink]) {
        delete localData.collectedTweets[targetLink];
        await chrome.storage.local.set({ collectedTweets: localData.collectedTweets });

        tweets = Object.values(localData.collectedTweets);
        render(getProcessedTweets());
        updateStats();
      }
    }

    if (copyFxBtn) {
      const targetLink = copyFxBtn.getAttribute("data-link");
      const fxLink = targetLink.replace("x.com", "fixupx.com").replace("twitter.com", "fixupx.com");

      navigator.clipboard
        .writeText(fxLink)
        .then(() => {
          copyFxBtn.classList.remove("text-slate-800", "border-slate-200");
          copyFxBtn.classList.add("text-emerald-600", "border-emerald-500", "bg-emerald-50");
          setTimeout(() => {
            copyFxBtn.classList.add("text-slate-800", "border-slate-200");
            copyFxBtn.classList.remove("text-emerald-600", "border-emerald-500", "bg-emerald-50");
          }, 1000);
        })
        .catch((err) => {
          copyFxBtn.classList.remove("text-slate-800", "border-slate-200");
          copyFxBtn.classList.add("text-red-600", "border-red-500", "bg-red-50");
          setTimeout(() => {
            copyFxBtn.classList.add("text-slate-800", "border-slate-200");
            copyFxBtn.classList.remove("text-red-600", "border-red-500", "bg-red-50");
          }, 1000);
          console.error("Clipboard copy failed: ", err);
        });
    }
  });
}

loadGallery();
