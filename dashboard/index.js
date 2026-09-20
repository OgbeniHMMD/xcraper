async function loadGallery() {
  const data = await chrome.storage.local.get(["collectedTweets"]);
  let tweets = Object.values(data.collectedTweets || {}); // Keep raw data array

  let activeStatusFilter = "all";
  let selectedItems = new Set();

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
          t.isFlagged ? "border-red-500 bg-red-50/20" : t.isDone ? "border-dashed border-emerald-500" : "border-slate-200"
        }`;

        const btnClasses = "text-lg text-slate-800 p-0.5 px-1.5 bg-slate-100 rounded flex items-center justify-center cursor-pointer";

        return `
            <div class="${cardClasses} relative item-card">
             <label>
               <input type="checkbox" data-link="${t.link}" ${selectedItems.has(t.link) ? "checked" : ""} class="absolute top-1 left-1 z-50 w-4 h-4 cursor-pointer select-checkbox">
               <div class="w-full aspect-[3/4] bg-black overflow-hidden relative text-white">
                   ${
                     activeStatusFilter == "flagged"
                       ? `<button data-link="${t.link}" class="${btnClasses} delete-btn absolute z-50 right-1 top-1" title="Hard Delete">
                           <span class="inline-block align-middle">❌</span>
                         </button>`
                       : ""
                   }

                   ${
                     t.isFlagged
                       ? `<div class="z-20 absolute inset-0 bg-red-950/60 flex flex-col items-center justify-center text-white text-[10px] font-bold p-2 text-center">
                       <span>⚠️</span><span class="mt-1">Flagged</span>
                       </div>`
                       : ""
                   }

                   <img src="${t.thumbnail}" loading="lazy" alt="No Preview" class="w-full h-full object-contain">
               </div>
             </label>

             <div class="p-2 flex flex-col grow">
               <div class="text-[8px] font-medium text-slate-400"><strong>${username}</strong> - ${t.time ? new Date(t.time).toLocaleDateString() : "N/A"}</div>

               <div class="text-[10px] leading-relaxed text-slate-800 py-0.5 line-clamp-2 min-h-[36px] font-normal">${t.text || "[No Text]"}</div>

               <div class="text-[8px] font-medium text-slate-400 mb-3">${new Date(t.collectedAt).toLocaleString()}</div>
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
    } else if (activeStatusFilter === "flagged") {
      result = result.filter((t) => t.isFlagged);
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
    const flaggedCount = tweets.filter((t) => t.isFlagged).length;
    document.getElementById("stat-total").innerText = totalCount;
    document.getElementById("stat-pending").innerText = pendingCount;
    document.getElementById("stat-done").innerText = doneCount;
    document.getElementById("stat-today").innerText = todayCount;
    document.getElementById("stat-flagged").innerText = flaggedCount;
  };

  render(getProcessedTweets());
  updateStats();

  search.addEventListener("input", () => {
    render(getProcessedTweets());
    updateMarkAllButtonState();
  });
  sortFilter.addEventListener("change", () => {
    render(getProcessedTweets());
    updateMarkAllButtonState();
  });

  // Stat card filters
  document.querySelectorAll(".stat-card").forEach((card) => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".stat-card").forEach((c) => c.classList.remove("active", "border-indigo-500", "ring-2", "ring-indigo-100"));
      card.classList.add("active", "border-indigo-500", "ring-2", "ring-indigo-100");

      activeStatusFilter = card.getAttribute("data-filter");
      render(getProcessedTweets());
      updateMarkAllButtonState();
    });
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

  // Right-click context menu
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
        ? `<button class="block w-full text-left px-4 py-2 hover:bg-slate-100 rounded context-action text-blue-600 font-medium" data-action="unmark-all">Unmark All (${selectedItems.size})</button>`
        : "";

    // Set content first so we can calculate size accurately
    contextMenu.innerHTML = `
        <div class="p-1 text-xs">
            <button class="block w-full text-left px-4 py-2 hover:bg-slate-100 rounded context-action" data-action="open-x">Open in X</button>
            <button class="block w-full text-left px-4 py-2 hover:bg-slate-100 rounded context-action" data-action="copy-link">Copy URL</button>
            <hr class="my-1 border-slate-200">
            <button class="block w-full text-left px-4 py-2 hover:bg-slate-100 rounded context-action" data-action="copy-fixup">Copy FixupX Link</button>
            <button class="block w-full text-left px-4 py-2 hover:bg-slate-100 rounded context-action" data-action="open-tweeload">Open in Tweeload</button>
            <hr class="my-1 border-slate-200">
            <button class="block w-full text-left px-4 py-2 hover:bg-slate-100 rounded context-action" data-action="toggle-done">Toggle Done</button>
            <button class="block w-full text-left px-4 py-2 hover:bg-slate-100 rounded context-action" data-action="toggle-flag">Toggle Flag</button>
            <button class="block w-full text-left px-4 py-2 hover:bg-slate-100 rounded text-red-600 context-action" data-action="delete">Delete</button>
            ${unmarkAllDisplay ? `<hr class="my-1 border-slate-200">${unmarkAllDisplay}` : ""}
        </div>
    `;

    // Make it visible to calculate size
    contextMenu.classList.remove("hidden");

    const menuWidth = contextMenu.offsetWidth;
    const menuHeight = contextMenu.offsetHeight;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Calculate position, staying within window bounds
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > windowWidth) {
      x = windowWidth - menuWidth;
    }
    if (y + menuHeight > windowHeight) {
      y = windowHeight - menuHeight;
    }

    contextMenu.style.top = `${y}px`;
    contextMenu.style.left = `${x}px`;
    contextMenu.dataset.link = link;
  });

  // Setup the context menu actions and event delegation
  // Merged the context menu logic and the bulk action logic into a single document click listener
  // to prevent conflicts and ensure consistent event handling.
  document.addEventListener("click", async (e) => {
    // 1. Context Menu Actions
    const contextMenuEl = e.target.closest("#custom-context-menu");
    if (contextMenuEl) {
      const action = e.target.getAttribute("data-action");
      const targetLink = contextMenu.dataset.link;
      // If the right-clicked item is in the selection, act on all; otherwise, just the right-clicked item.
      const linksToActOn = selectedItems.has(targetLink) ? Array.from(selectedItems) : [targetLink];

      if (!action) return;

      if (action === "open-x") {
        linksToActOn.forEach((link) => window.open(link, "_blank"));
      } else if (action === "copy-link") {
        navigator.clipboard.writeText(linksToActOn.join("\n"));
      } else if (action === "copy-fixup") {
        navigator.clipboard.writeText(linksToActOn.map((link) => link.replace("x.com", "fixupx.com").replace("twitter.com", "fixupx.com")).join("\n"));
      } else if (action === "open-tweeload") {
        linksToActOn.forEach((link) => window.open(link.replace("x.com", "tweeload.com").replace("twitter.com", "tweeload.com"), "_blank"));
      } else if (action === "unmark-all") {
        selectedItems.clear();

        render(getProcessedTweets());
      } else if (action === "toggle-done" || action === "toggle-flag" || action === "delete") {
        const localData = await chrome.storage.local.get(["collectedTweets"]);
        let modified = false;

        linksToActOn.forEach((link) => {
          if (localData.collectedTweets && localData.collectedTweets[link]) {
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

        if (modified) {
          if (action === "delete" && !confirm(`Are you sure you want to delete ${linksToActOn.length} item(s)?`)) {
            contextMenu.classList.add("hidden");
            return;
          }
          await chrome.storage.local.set({ collectedTweets: localData.collectedTweets });
          tweets = Object.values(localData.collectedTweets);
          // Optional: clear selection after bulk operation
          // selectedItems.clear();
          render(getProcessedTweets());
          updateStats();
        }
      }
      contextMenu.classList.add("hidden");
      return;
    }

    // If clicked anywhere else, hide context menu
    contextMenu.classList.add("hidden");
  });

  grid.addEventListener("click", async (e) => {
    if (e.target.classList.contains("select-checkbox")) {
      const link = e.target.getAttribute("data-link");
      if (e.target.checked) selectedItems.add(link);
      else selectedItems.delete(link);

      updateMarkAllButtonState();
      return;
    }
  });

  // Mark/Unmark All button logic
  const markAllBtn = document.getElementById("mark-all-btn");
  const markAllText = document.getElementById("mark-all-text");

  function updateMarkAllButtonState() {
    const visibleTweets = getProcessedTweets();
    const totalMarked = selectedItems.size;
    if (visibleTweets.length === 0) {
      markAllText.innerText = totalMarked > 0 ? `Unmark All (${totalMarked})` : "Mark All (0)";
      return;
    }
    const allVisibleSelected = visibleTweets.every((t) => selectedItems.has(t.link));
    if (allVisibleSelected) {
      markAllText.innerText = `Unmark All (${totalMarked})`;
    } else {
      markAllText.innerText = `Mark All (${totalMarked})`;
    }
  }

  markAllBtn.addEventListener("click", () => {
    const visibleTweets = getProcessedTweets();
    if (visibleTweets.length === 0) return;

    const allVisibleSelected = visibleTweets.every((t) => selectedItems.has(t.link));

    if (allVisibleSelected) {
      // Unmark all visible
      visibleTweets.forEach((t) => selectedItems.delete(t.link));
    } else {
      // Mark all visible
      visibleTweets.forEach((t) => selectedItems.add(t.link));
    }

    updateMarkAllButtonState();
    render(visibleTweets);
  });

  updateMarkAllButtonState();
}

loadGallery();
