async function loadGallery() {
  const data = await chrome.storage.local.get(["collectedTweets"]);
  let tweets = Object.values(data.collectedTweets || {});

  let activeStatusFilter = "all";
  let selectedItems = new Set();

  const grid = document.getElementById("grid");
  const search = document.getElementById("search");
  const sortFilter = document.getElementById("sort-filter");
  const markAllBtn = document.getElementById("mark-all-btn");
  const markAllText = document.getElementById("mark-all-text");

  // Helper to extract username safely
  const getUsername = (link) => {
    try {
      const pathParts = new URL(link).pathname.split("/");
      return pathParts[1] ? `@${pathParts[1]}` : "@unknown";
    } catch {
      return "@unknown";
    }
  };

  // Compact relative time, e.g. "3h ago"; falls back to a date for old items.
  const timeAgo = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return "just now";
    for (const [suffix, secs] of [
      ["y", 31536000],
      ["mo", 2592000],
      ["d", 86400],
      ["h", 3600],
      ["m", 60],
    ]) {
      const count = Math.floor(seconds / secs);
      if (count >= 1) return `${count}${suffix} ago`;
    }
    return date.toLocaleDateString();
  };

  // Broken-thumbnail detection. `alt` is static, so it can't tell us if an
  // image actually loaded. We rely on the image `error` event / naturalWidth
  // and record the results here.
  const brokenLinks = new Set();
  const checkedLinks = new Set();

  const markThumbBroken = (link) => {
    brokenLinks.add(link);
    checkedLinks.add(link);
  };

  // An empty thumbnail counts as broken too.
  const isThumbBroken = (t) => !t.thumbnail || brokenLinks.has(t.link);

  // Broken items that still need attention (not already done/flagged).
  const isBrokenPending = (t) => isThumbBroken(t) && !t.isDone && !t.isFlagged;

  // Probe a single thumbnail without rendering it (covers lazy/unrendered cards).
  const verifyThumbnail = (t) =>
    new Promise((resolve) => {
      if (checkedLinks.has(t.link)) return resolve();
      if (!t.thumbnail) {
        markThumbBroken(t.link);
        return resolve();
      }
      const img = new Image();
      img.onload = () => {
        checkedLinks.add(t.link);
        resolve();
      };
      img.onerror = () => {
        markThumbBroken(t.link);
        resolve();
      };
      img.src = t.thumbnail;
    });

  // Run probes with bounded concurrency so a large collection doesn't fire
  // thousands of requests at once.
  const scanThumbnails = async (items = tweets, concurrency = 8) => {
    const queue = items.filter((t) => !checkedLinks.has(t.link));
    let i = 0;
    const worker = async () => {
      while (i < queue.length) await verifyThumbnail(queue[i++]);
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  };

  const render = (items) => {
    if (items.length === 0) {
      grid.innerHTML = `<div class="col-span-full text-center text-slate-400 py-10 font-medium text-sm">No videos found.</div>`;
      return;
    }

    grid.innerHTML = items
      .map((t) => {
        const username = getUsername(t.link);
        const cardClasses = `group relative item-card flex flex-col overflow-hidden rounded-xl bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
          t.isFlagged ? "border border-red-300 ring-1 ring-red-500/60" : t.isDone ? "border border-emerald-300 ring-1 ring-emerald-500/60" : "border border-slate-200 hover:border-slate-300"
        }`;

        const statusBadge = t.isFlagged
          ? `<span class="absolute top-2 right-2 z-20 inline-flex items-center gap-1 rounded-full bg-red-600/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm">⚑ Flagged</span>`
          : t.isDone
            ? `<span class="absolute top-2 right-2 z-20 inline-flex items-center gap-1 rounded-full bg-emerald-600/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm">✓ Done</span>`
            : "";

        return `
          <div class="${cardClasses}">
            <label class="block cursor-pointer">
              <input type="checkbox" data-link="${t.link}" ${selectedItems.has(t.link) ? "checked" : ""} class="select-checkbox card-checkbox peer">
              <div class="relative aspect-3/4 w-full overflow-hidden bg-slate-900 peer-checked:ring-2 peer-checked:ring-inset peer-checked:ring-blue-500">
                <div class="pointer-events-none absolute inset-x-0 top-0 z-10 h-14 bg-linear-to-b from-black/60 to-transparent"></div>
                ${statusBadge}
                <img src="${t.thumbnail || ""}" data-link="${t.link}" loading="lazy" alt="No Preview" class="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]">
              </div>
            </label>
            <div class="flex grow flex-col gap-1 p-2.5">
              <div class="flex items-center justify-between gap-2">
                <span class="truncate text-[11px] font-semibold text-slate-700">${username}</span>
                <span class="shrink-0 text-[10px] font-medium tabular-nums text-slate-400" title="${t.time ? new Date(t.time).toLocaleString() : "Unknown post time"}">${t.time ? timeAgo(t.time) : "N/A"}</span>
              </div>
              <p class="line-clamp-2 text-[11px] leading-snug text-slate-600">${t.text || "[No Text]"}</p>
              <div class="mt-auto pt-0.5 text-[10px] text-slate-400" title="${t.collectedAt ? new Date(t.collectedAt).toLocaleString() : ""}">Saved ${timeAgo(t.collectedAt) || "unknown"}</div>
            </div>
          </div>
        `;
      })
      .join("");

    // Record images that fail to load as the user browses.
    grid.querySelectorAll("img[data-link]").forEach((img) => {
      img.addEventListener("error", () => markThumbBroken(img.getAttribute("data-link")));
    });
  };

  const getProcessedTweets = () => {
    let result = tweets;
    if (activeStatusFilter === "pending") {
      result = result.filter((t) => !t.isDone && !t.isFlagged);
    } else if (activeStatusFilter === "done") {
      result = result.filter((t) => t.isDone);
    } else if (activeStatusFilter === "today") {
      const todayStr = new Date().toDateString();
      result = result.filter((t) => t.collectedAt && new Date(t.collectedAt).toDateString() === todayStr);
    } else if (activeStatusFilter === "flagged") {
      result = result.filter((t) => t.isFlagged);
    } else if (activeStatusFilter === "broken") {
      result = result.filter(isBrokenPending);
    }

    const query = search.value.toLowerCase().trim();
    if (query) {
      result = result.filter((t) => {
        const matchText = t.text && t.text.toLowerCase().includes(query);
        const username = getUsername(t.link).toLowerCase();
        const matchUser = username.includes(query.replace("@", ""));
        return matchText || matchUser;
      });
    }

    const sortBy = sortFilter.value;
    result.sort((a, b) => {
      if (sortBy === "collected-newest") return new Date(b.collectedAt || 0) - new Date(a.collectedAt || 0);
      if (sortBy === "collected-oldest") return new Date(a.collectedAt || 0) - new Date(b.collectedAt || 0);
      if (sortBy === "posted-newest") return (b.time ? new Date(b.time) : 0) - (a.time ? new Date(a.time) : 0);
      if (sortBy === "posted-oldest") return (a.time ? new Date(a.time) : 0) - (b.time ? new Date(b.time) : 0);
      return 0;
    });

    return result;
  };

  const updateStats = () => {
    document.getElementById("stat-total").innerText = tweets.length;
    document.getElementById("stat-pending").innerText = tweets.filter((t) => !t.isDone && !t.isFlagged).length;
    document.getElementById("stat-done").innerText = tweets.filter((t) => t.isDone).length;
    const todayStr = new Date().toDateString();
    document.getElementById("stat-today").innerText = tweets.filter((t) => t.collectedAt && new Date(t.collectedAt).toDateString() === todayStr).length;
    document.getElementById("stat-flagged").innerText = tweets.filter((t) => t.isFlagged).length;
    document.getElementById("stat-broken").innerText = tweets.filter(isBrokenPending).length;
  };

  const updateMarkAllButtonState = () => {
    const visibleTweets = getProcessedTweets();
    const totalMarked = selectedItems.size;
    const allVisibleSelected = visibleTweets.length > 0 && visibleTweets.every((t) => selectedItems.has(t.link));

    if (allVisibleSelected) {
      markAllText.innerText = `Unmark All (${totalMarked})`;
    } else {
      markAllText.innerText = `Mark All (${totalMarked})`;
    }
  };

  // Event Listeners
  search.addEventListener("input", () => {
    render(getProcessedTweets());
    updateMarkAllButtonState();
  });

  sortFilter.addEventListener("change", () => {
    render(getProcessedTweets());
    updateMarkAllButtonState();
  });

  document.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", async () => {
      document.querySelectorAll(".filter-chip").forEach((c) => {
        c.classList.remove("active");
        c.setAttribute("aria-pressed", "false");
      });
      chip.classList.add("active");
      chip.setAttribute("aria-pressed", "true");

      activeStatusFilter = chip.getAttribute("data-filter");
      search.value = "";
      selectedItems.clear();

      if (activeStatusFilter === "broken") {
        grid.innerHTML = `<div class="col-span-full text-center text-slate-400 py-10 font-medium text-sm">Scanning thumbnails…</div>`;
        await scanThumbnails();
        updateStats();
      }

      render(getProcessedTweets());
      updateMarkAllButtonState();
    });
  });

  // Context Menu Setup
  const contextMenu = document.createElement("div");
  contextMenu.id = "custom-context-menu";
  contextMenu.className = "hidden fixed bg-white shadow-lg border border-slate-200 rounded-lg z-[100] text-sm";
  document.body.appendChild(contextMenu);

  document.addEventListener("contextmenu", (e) => {
    const card = e.target.closest(".item-card");
    if (!card) {
      contextMenu.classList.add("hidden");
      return;
    }

    e.preventDefault();
    const link = card.querySelector(".select-checkbox").getAttribute("data-link");
    const unmarkAllDisplay =
      selectedItems.size > 0
        ? `<button class="block w-full text-left px-4 py-2 hover:bg-slate-100 rounded context-action text-blue-600 font-medium" data-action="unmark-all">Clear Selection (${selectedItems.size})</button>`
        : "";

    contextMenu.innerHTML = `
      <div class="p-1 text-xs">
          <button class="block w-full text-left px-4 py-2 hover:bg-slate-100 rounded context-action" data-action="open-x">Open in X</button>
          <button class="block w-full text-left px-4 py-2 hover:bg-slate-100 rounded context-action" data-action="open-tweeload">Open in Tweeload</button>
          <hr class="my-1 border-slate-200">
          <button class="block w-full text-left px-4 py-2 hover:bg-slate-100 rounded context-action" data-action="copy-link">Copy Link</button>
          <button class="block w-full text-left px-4 py-2 hover:bg-slate-100 rounded context-action" data-action="copy-fixup">Copy FixupX Link</button>
          <button class="block w-full text-left px-4 py-2 hover:bg-slate-100 rounded context-action" data-action="copy-tweeload">Copy Tweeload Link</button>
          <hr class="my-1 border-slate-200">
          <button class="block w-full text-left px-4 py-2 hover:bg-slate-100 rounded context-action" data-action="toggle-done">Toggle Done</button>
          <button class="block w-full text-left px-4 py-2 hover:bg-slate-100 rounded context-action" data-action="toggle-flag">Toggle Flag</button>
          ${activeStatusFilter === "flagged" ? `<button class="block w-full text-left px-4 py-2 hover:bg-slate-100 rounded text-red-600 context-action" data-action="delete">Delete</button>` : ""}
          ${unmarkAllDisplay ? `<hr class="my-1 border-slate-200">${unmarkAllDisplay}` : ""}
      </div>
    `;

    contextMenu.classList.remove("hidden");
    const menuWidth = contextMenu.offsetWidth;
    const menuHeight = contextMenu.offsetHeight;
    let x = Math.min(e.clientX, window.innerWidth - menuWidth);
    let y = Math.min(e.clientY, window.innerHeight - menuHeight);

    contextMenu.style.top = `${y}px`;
    contextMenu.style.left = `${x}px`;
    contextMenu.dataset.link = link;
  });

  document.addEventListener("click", async (e) => {
    const contextMenuEl = e.target.closest("#custom-context-menu");
    if (contextMenuEl) {
      const action = e.target.getAttribute("data-action");
      const targetLink = contextMenu.dataset.link;
      const linksToActOn = selectedItems.has(targetLink) ? Array.from(selectedItems) : [targetLink];

      if (!action) return;

      if (action === "open-x") {
        linksToActOn.forEach((link) => window.open(link, "_blank"));
      } else if (action === "copy-link") {
        navigator.clipboard.writeText(linksToActOn.join("\n"));
      } else if (action === "copy-fixup") {
        navigator.clipboard.writeText(linksToActOn.map((l) => l.replace(/x\.com|twitter\.com/g, "fixupx.com")).join("\n"));
      } else if (action === "copy-tweeload") {
        navigator.clipboard.writeText(linksToActOn.map((l) => l.replace(/x\.com|twitter\.com/g, "tweeload.com")).join("\n"));
      } else if (action === "open-tweeload") {
        linksToActOn.forEach((link) => window.open(link.replace(/x\.com|twitter\.com/g, "tweeload.com"), "_blank"));
      } else if (action === "unmark-all") {
        selectedItems.clear();
        render(getProcessedTweets());
        updateMarkAllButtonState();
      } else if (action === "toggle-done" || action === "toggle-flag" || action === "delete") {
        if (action === "delete" && !confirm(`Are you sure you want to delete ${linksToActOn.length} item(s)?`)) {
          contextMenu.classList.add("hidden");
          return;
        }

        const localData = await chrome.storage.local.get(["collectedTweets"]);
        let modified = false;

        linksToActOn.forEach((link) => {
          if (localData.collectedTweets?.[link]) {
            if (action === "toggle-done") {
              localData.collectedTweets[link].isDone = !localData.collectedTweets[link].isDone;
              modified = true;
            } else if (action === "toggle-flag") {
              localData.collectedTweets[link].isFlagged = !localData.collectedTweets[link].isFlagged;
              modified = true;
            } else if (action === "delete") {
              delete localData.collectedTweets[link];
              modified = true;
            }
          }
        });

        if (action === "toggle-flag" || action === "toggle-done" || action === "delete") {
          selectedItems.clear();
        }

        if (modified) {
          await chrome.storage.local.set({ collectedTweets: localData.collectedTweets });
          tweets = Object.values(localData.collectedTweets);
          render(getProcessedTweets());
          updateStats();
          updateMarkAllButtonState();
        }
      }
      contextMenu.classList.add("hidden");
      return;
    }
    contextMenu.classList.add("hidden");
  });

  grid.addEventListener("click", (e) => {
    if (e.target.classList.contains("select-checkbox")) {
      const link = e.target.getAttribute("data-link");
      if (e.target.checked) selectedItems.add(link);
      else selectedItems.delete(link);
      updateMarkAllButtonState();
    }
  });

  markAllBtn.addEventListener("click", () => {
    const visibleTweets = getProcessedTweets();
    if (visibleTweets.length === 0) return;

    const allVisibleSelected = visibleTweets.every((t) => selectedItems.has(t.link));
    if (allVisibleSelected) {
      visibleTweets.forEach((t) => selectedItems.delete(t.link));
    } else {
      visibleTweets.forEach((t) => selectedItems.add(t.link));
    }

    updateMarkAllButtonState();
    render(visibleTweets);
  });

  // Auto-scroll logic
  const autoScrollBtn = document.getElementById("auto-scroll");
  const scrollIcon = document.getElementById("scroll-icon");
  const scrollText = document.getElementById("scroll-text");
  const jumpToTopBtn = document.getElementById("jump-to-top");
  const jumpToBottomBtn = document.getElementById("jump-to-bottom");
  let isScrolling = false;
  let scrollInterval;

  const scrollContainer = document.getElementById("scroll-container") || window;

  if (jumpToTopBtn) {
    jumpToTopBtn.addEventListener("click", () => {
      if (scrollContainer === window) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  if (jumpToBottomBtn) {
    jumpToBottomBtn.addEventListener("click", () => {
      if (scrollContainer === window) {
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      } else {
        scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: "smooth" });
      }
    });
  }

  if (autoScrollBtn) {
    autoScrollBtn.addEventListener("click", () => {
      isScrolling = !isScrolling;

      if (isScrolling) {
        if (scrollIcon) scrollIcon.innerText = "⏹";
        if (scrollText) scrollText.innerText = "Stop Scroll";
        autoScrollBtn.classList.add("bg-red-50", "border-red-200");

        scrollInterval = setInterval(() => {
          if (scrollContainer === window) {
            window.scrollBy(0, 10);
            if (window.innerHeight + window.scrollY >= document.body.offsetHeight) {
              stopScrolling();
            }
          } else {
            scrollContainer.scrollBy(0, 10);
            if (scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight) {
              stopScrolling();
            }
          }
        }, 20);
      } else {
        stopScrolling();
      }
    });
  }

  function stopScrolling() {
    isScrolling = false;
    clearInterval(scrollInterval);
    if (scrollIcon) scrollIcon.innerText = "▶";
    if (scrollText) scrollText.innerText = "Auto Scroll";
    if (autoScrollBtn) autoScrollBtn.classList.remove("bg-red-50", "border-red-200");
  }

  // Initial load
  render(getProcessedTweets());
  updateStats();
  updateMarkAllButtonState();
}

loadGallery();
