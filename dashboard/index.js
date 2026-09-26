async function loadGallery() {
  const data = await chrome.storage.local.get(["collectedTweets"]);
  let tweets = Object.values(data.collectedTweets || {});

  let activeStatusFilter = "all";
  let selectedItems = new Set();

  // Bumped whenever the underlying data or derived sets change, so that cached
  // filtered/sorted views are invalidated.
  let dataVersion = 0;

  // Cards are added to the DOM in chunks and more are appended as the user
  // scrolls. Building one giant string for a 10k+ collection melts the layout.
  const RENDER_CHUNK = 150;
  let currentView = [];
  let renderedCount = 0;

  const grid = document.getElementById("grid");
  const search = document.getElementById("search");
  const sortFilter = document.getElementById("sort-filter");
  const markAllBtn = document.getElementById("mark-all-btn");
  const markAllText = document.getElementById("mark-all-text");
  const scrollContainer = document.getElementById("scroll-container") || window;
  const sentinel = document.getElementById("grid-sentinel");

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

  // Parsing dates on every comparison/sort is a major cost at scale, so parse
  // each value once and cache it on the tweet object via a WeakMap.
  const tsCache = new WeakMap();
  const toTs = (t, field) => {
    let value = tsCache.get(t);
    if (!value) {
      value = {};
      tsCache.set(t, value);
    }
    if (!(field in value)) {
      const raw = t[field];
      const ms = raw ? new Date(raw).getTime() : 0;
      value[field] = Number.isNaN(ms) ? 0 : ms;
    }
    return value[field];
  };

  const dayKeyCache = new WeakMap();
  const getDayKey = (t) => {
    let key = dayKeyCache.get(t);
    if (key === undefined) {
      key = t.collectedAt ? new Date(t.collectedAt).toDateString() : "";
      dayKeyCache.set(t, key);
    }
    return key;
  };

  // Broken-thumbnail detection. `alt` is static, so it can't tell us if an
  // image actually loaded. We rely on the image `error` event / naturalWidth
  // and record the results here.
  const brokenLinks = new Set();
  const checkedLinks = new Set();

  const markThumbBroken = (link) => {
    if (!brokenLinks.has(link)) dataVersion++;
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

  const buildCard = (t) => {
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
  };

  // Append the next slice of the current view. Called on render and whenever the
  // sentinel below the grid scrolls into view.
  const appendNextChunk = () => {
    if (renderedCount >= currentView.length) return;
    const slice = currentView.slice(renderedCount, renderedCount + RENDER_CHUNK);
    renderedCount += slice.length;
    grid.insertAdjacentHTML("beforeend", slice.map(buildCard).join(""));
    if (sentinel) sentinel.hidden = renderedCount >= currentView.length;
  };

  // Rebuild the grid from the given processed view, starting with the first
  // chunk. Off-screen chunks are appended lazily via the sentinel observer.
  const render = (items) => {
    currentView = items;
    renderedCount = 0;

    if (items.length === 0) {
      grid.innerHTML = `<div class="col-span-full text-center text-slate-400 py-10 font-medium text-sm">No videos found.</div>`;
      if (sentinel) sentinel.hidden = true;
      return;
    }

    grid.innerHTML = "";
    appendNextChunk();
  };

  // Cached filtered/sorted view. The key covers every input that can change the
  // result, so repeated calls (mark-all state, export menu, render) are free.
  let viewCacheKey = null;
  let viewCache = [];

  const getProcessedTweets = () => {
    const query = search.value.toLowerCase().trim();
    const sortBy = sortFilter.value;
    const cacheKey = `${activeStatusFilter}\u0000${query}\u0000${sortBy}\u0000${dataVersion}`;
    if (cacheKey === viewCacheKey) return viewCache;

    let result = tweets;
    if (activeStatusFilter === "pending") {
      result = result.filter((t) => !t.isDone && !t.isFlagged);
    } else if (activeStatusFilter === "done") {
      result = result.filter((t) => t.isDone);
    } else if (activeStatusFilter === "today") {
      const todayStr = new Date().toDateString();
      result = result.filter((t) => getDayKey(t) === todayStr);
    } else if (activeStatusFilter === "flagged") {
      result = result.filter((t) => t.isFlagged);
    } else if (activeStatusFilter === "broken") {
      result = result.filter(isBrokenPending);
    }

    if (query) {
      const userQuery = query.replace("@", "");
      const userCache = new Map();
      result = result.filter((t) => {
        const matchText = t.text && t.text.toLowerCase().includes(query);
        let username = userCache.get(t.link);
        if (username === undefined) {
          username = getUsername(t.link).toLowerCase();
          userCache.set(t.link, username);
        }
        return matchText || username.includes(userQuery);
      });
    }

    // Decorate-sort-undecorate: timestamps are parsed once instead of on every
    // comparison, which matters a lot for 10k+ items.
    const field = sortBy.startsWith("collected") ? "collectedAt" : sortBy.startsWith("posted") ? "time" : null;
    if (field) {
      const dir = sortBy.endsWith("newest") ? -1 : 1;
      result = result
        .map((t, i) => [t, toTs(t, field), i])
        .sort((a, b) => (a[1] - b[1]) * dir || a[2] - b[2])
        .map((entry) => entry[0]);
    } else {
      result = result.slice();
    }

    viewCacheKey = cacheKey;
    viewCache = result;
    return result;
  };

  const updateStats = () => {
    const todayStr = new Date().toDateString();
    let pending = 0;
    let done = 0;
    let today = 0;
    let flagged = 0;
    let broken = 0;

    for (const t of tweets) {
      const isDone = !!t.isDone;
      const isFlagged = !!t.isFlagged;
      if (isDone) done++;
      if (isFlagged) flagged++;
      if (!isDone && !isFlagged) {
        pending++;
        if (isThumbBroken(t)) broken++;
      }
      if (getDayKey(t) === todayStr) today++;
    }

    document.getElementById("stat-total").innerText = tweets.length;
    document.getElementById("stat-pending").innerText = pending;
    document.getElementById("stat-done").innerText = done;
    document.getElementById("stat-today").innerText = today;
    document.getElementById("stat-flagged").innerText = flagged;
    document.getElementById("stat-broken").innerText = broken;
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
  // Debounce typing so a large collection isn't re-filtered on every keystroke.
  let searchDebounce;
  search.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      render(getProcessedTweets());
      updateMarkAllButtonState();
    }, 150);
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
        currentView = [];
        renderedCount = 0;
        if (sentinel) sentinel.hidden = true;
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
          dataVersion++;
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

  // Record images that fail to load as the user browses. `error` doesn't bubble,
  // so listen in the capture phase; this covers lazily appended chunks too.
  grid.addEventListener(
    "error",
    (e) => {
      const img = e.target;
      if (img && img.tagName === "IMG" && img.dataset.link) markThumbBroken(img.dataset.link);
    },
    true,
  );

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

  // CSV export: all items, the current filtered/sorted view, or the selection.
  const exportWrap = document.getElementById("export-wrap");
  const exportBtn = document.getElementById("export-btn");
  const exportMenu = document.getElementById("export-menu");

  const getSelectedTweets = () => tweets.filter((t) => selectedItems.has(t.link));

  const closeExportMenu = () => {
    exportMenu.classList.add("hidden");
    exportBtn.setAttribute("aria-expanded", "false");
  };

  const openExportMenu = () => {
    const viewCount = getProcessedTweets().length;
    const selectedCount = selectedItems.size;
    exportMenu.innerHTML = `
      <button class="export-action" role="menuitem" data-scope="all">Export all (${tweets.length})</button>
      <button class="export-action" role="menuitem" data-scope="view">Export current view (${viewCount})</button>
      <button class="export-action" role="menuitem" data-scope="selected" ${selectedCount ? "" : "disabled"}>Export selected (${selectedCount})</button>
    `;
    exportMenu.classList.remove("hidden");
    exportBtn.setAttribute("aria-expanded", "true");
  };

  const runExport = (scope) => {
    const items = scope === "selected" ? getSelectedTweets() : scope === "view" ? getProcessedTweets() : tweets;
    window.XcrapperCSV.downloadTweetsCsv(items);
  };

  if (exportBtn && exportMenu) {
    exportBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (exportMenu.classList.contains("hidden")) openExportMenu();
      else closeExportMenu();
    });

    exportMenu.addEventListener("click", (e) => {
      const action = e.target.closest(".export-action");
      if (!action || action.disabled) return;
      runExport(action.dataset.scope);
      closeExportMenu();
    });

    // Close when clicking outside the dropdown.
    document.addEventListener("click", (e) => {
      if (!exportWrap.contains(e.target)) closeExportMenu();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeExportMenu();
    });
  }

  // Auto-scroll logic
  const autoScrollBtn = document.getElementById("auto-scroll");
  const scrollIcon = document.getElementById("scroll-icon");
  const scrollText = document.getElementById("scroll-text");
  const jumpToTopBtn = document.getElementById("jump-to-top");
  const jumpToBottomBtn = document.getElementById("jump-to-bottom");
  let isScrolling = false;
  let scrollInterval;

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

  // Lazily append more cards as the sentinel below the grid scrolls into view.
  // A generous rootMargin pre-loads the next chunk so scrolling stays smooth.
  if (sentinel) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) appendNextChunk();
      },
      { root: scrollContainer === window ? null : scrollContainer, rootMargin: "800px 0px" },
    );
    observer.observe(sentinel);
  }

  // Initial load
  render(getProcessedTweets());
  updateStats();
  updateMarkAllButtonState();
}

loadGallery();
