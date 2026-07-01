async function loadGallery() {
  const data = await chrome.storage.local.get(["collectedTweets"])
  let tweets = Object.values(data.collectedTweets || {}) // Keep raw data array

  let activeStatusFilter = "all"

  const grid = document.getElementById("grid")
  const search = document.getElementById("search")
  const sortFilter = document.getElementById("sort-filter")

  const render = (items) => {
    if (items.length === 0) {
      grid.innerHTML = `<div class="col-span-full text-center text-slate-400 py-10 font-medium text-sm">No videos found.</div>`
      return
    }

    grid.innerHTML = items
      .map((t) => {
        // EXTRACT USERNAME ON THE FLY
        let username = "@unknown"
        try {
          const pathParts = new URL(t.link).pathname.split("/")
          if (pathParts[1]) {
            username = `@${pathParts[1]}`
          }
        } catch (e) {
          console.error("Could not parse link dynamic username:", e)
        }

        // Conditional styling and properties depending on completion status
        const cardClasses = `bg-white overflow-hidden flex flex-col border border-slate-200 hover:border-slate-900 transition-all duration-200 ${
          t.isDone ? "opacity-45 grayscale-[30%]" : ""
        }`

        const doneBtnClasses = `border p-1.5 transition-colors rounded-md flex items-center justify-center done-btn ${
          t.isDone
            ? "bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600"
            : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50"
        }`

        const btnClasses = "border border-slate-200 bg-white text-slate-800 p-1.5 transition-colors rounded-md hover:bg-slate-50 flex items-center justify-center"
        const deleteBtnClasses = "border border-slate-200 bg-white text-slate-800 p-1.5 transition-colors rounded-md hover:bg-red-50 hover:text-red-600 hover:border-red-200 flex items-center justify-center delete-btn"

        return `
            <div class="${cardClasses}">
                <div class="w-full aspect-[3/4] bg-black overflow-hidden relative">
                    ${
                      t.thumbnail
                        ? `<img src="${t.thumbnail}" loading="lazy" class="w-full h-full object-contain">`
                        : `<div class="h-full flex items-center justify-center text-slate-400 text-xs">No Preview</div>`
                    }
                </div>

                <div class="p-3.5 flex flex-col grow">
                  <div class="text-[10px] font-medium text-slate-400 mb-1"><strong>${username}</strong> - ${t.time ? new Date(t.time).toLocaleDateString() : "N/A"}</div>

                  <div class="text-xs leading-relaxed text-slate-800 mb-2 line-clamp-2 min-h-[36px] font-normal">${t.text || "[No Text]"}</div>

                  <div class="text-[10px] font-medium text-slate-400 mb-3">${new Date(t.collectedAt).toLocaleString()}</div>

                  <div class="flex justify-between items-center gap-1">
                    <button data-link="${t.link}" class="${doneBtnClasses}" title="${t.isDone ? "Mark Pending" : "Mark Done"}">
                      <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    </button>

                    <a href="${t.link}" target="_blank" class="${btnClasses}" title="View on X">
                      <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                    </a>
                    <a href="${t.link.replace("x.com", "tweeload.com").replace("twitter.com", "tweeload.com")}" target="_blank" class="${btnClasses}" title="Download Video">
                      <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                     </svg>
                    </a>
                    <button data-link="${t.link}" class="${btnClasses} copyFx-btn" title="Copy FixupX Link">
                      <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                      </svg>
                    </button>
                    <button data-link="${t.link}" class="${deleteBtnClasses}" title="Delete">
                        <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                    </button>
                  </div>
                </div>
            </div>
          `
      })
      .join("")
  }

  // Combined function handling Sorting AND Live Searching together
  const getProcessedTweets = () => {
    // 1. Filter by status filter
    let result = tweets
    if (activeStatusFilter === "pending") {
      result = result.filter((t) => !t.isDone)
    } else if (activeStatusFilter === "done") {
      result = result.filter((t) => t.isDone)
    } else if (activeStatusFilter === "today") {
      const todayStr = new Date().toDateString()
      result = result.filter((t) => new Date(t.collectedAt).toDateString() === todayStr)
    }

    // 2. Filter by search query (Checking both text AND username)
    const query = search.value.toLowerCase()

    result = result.filter((t) => {
      // 2a. Check text content
      const matchText = t.text && t.text.toLowerCase().includes(query)

      // 2b. Derive username from URL exactly how we do it in the renderer
      let username = ""
      try {
        const pathParts = new URL(t.link).pathname.split("/")
        if (pathParts[1]) username = pathParts[1].toLowerCase()
      } catch (e) {}

      const matchUser = username.includes(query.replace("@", "")) // Strips '@' if user typed it in search

      return matchText || matchUser
    })

    // 2. Sort depending on dropdown selection
    const sortBy = sortFilter.value
    result.sort((a, b) => {
      if (sortBy === "collected-newest") {
        return new Date(b.collectedAt) - new Date(a.collectedAt)
      }
      if (sortBy === "collected-oldest") {
        return new Date(a.collectedAt) - new Date(b.collectedAt)
      }
      if (sortBy === "posted-newest") {
        const timeA = a.time ? new Date(a.time) : 0
        const timeB = b.time ? new Date(b.time) : 0
        return timeB - timeA
      }
      if (sortBy === "posted-oldest") {
        const timeA = a.time ? new Date(a.time) : 0
        const timeB = b.time ? new Date(b.time) : 0
        return timeA - timeB
      }
      return 0
    })

    return result
  }

  const updateStats = () => {
    const totalCount = tweets.length
    const doneCount = tweets.filter((t) => t.isDone).length
    const pendingCount = totalCount - doneCount

    // Calculate items collected within the current calendar day
    const todayStr = new Date().toDateString()
    const todayCount = tweets.filter((t) => new Date(t.collectedAt).toDateString() === todayStr).length

    document.getElementById("stat-total").innerText = totalCount
    document.getElementById("stat-pending").innerText = pendingCount
    document.getElementById("stat-done").innerText = doneCount
    document.getElementById("stat-today").innerText = todayCount
  }

  render(getProcessedTweets())
  updateStats()

  search.addEventListener("input", () => render(getProcessedTweets()))
  sortFilter.addEventListener("change", () => render(getProcessedTweets()))

  // Set up status filtering click handlers on stats cards
  document.querySelectorAll(".stat-card").forEach((card) => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".stat-card").forEach((c) => c.classList.remove("active"))
      card.classList.add("active")
      activeStatusFilter = card.getAttribute("data-filter")
      render(getProcessedTweets())
    })
  })

  grid.addEventListener("click", async (e) => {
    const doneBtn = e.target.closest(".done-btn")
    const deleteBtn = e.target.closest(".delete-btn")
    const copyFxBtn = e.target.closest(".copyFx-btn")

    // Handle Toggle Mark Done Click
    if (doneBtn) {
      const targetLink = doneBtn.getAttribute("data-link")
      const localData = await chrome.storage.local.get(["collectedTweets"])

      if (localData.collectedTweets && localData.collectedTweets[targetLink]) {
        // Toggle state or set to true if it didn't exist yet
        localData.collectedTweets[targetLink].isDone = !localData.collectedTweets[targetLink].isDone
        await chrome.storage.local.set({ collectedTweets: localData.collectedTweets })

        // Synchronize state and trigger processing UI refresh pipeline
        tweets = Object.values(localData.collectedTweets)
        render(getProcessedTweets())
        updateStats()
      }
    }

    if (deleteBtn) {
      const targetLink = deleteBtn.getAttribute("data-link")
      const localData = await chrome.storage.local.get(["collectedTweets"])

      if (localData.collectedTweets && localData.collectedTweets[targetLink]) {
        delete localData.collectedTweets[targetLink]
        await chrome.storage.local.set({ collectedTweets: localData.collectedTweets })

        tweets = Object.values(localData.collectedTweets)
        render(getProcessedTweets())
        updateStats()
      }
    }

    if (copyFxBtn) {
      const targetLink = copyFxBtn.getAttribute("data-link")
      const fxLink = targetLink.replace("x.com", "fixupx.com").replace("twitter.com", "fixupx.com")

      navigator.clipboard
        .writeText(fxLink)
        .then(() => {
          copyFxBtn.classList.remove("text-slate-800", "border-slate-200")
          copyFxBtn.classList.add("text-emerald-600", "border-emerald-500", "bg-emerald-50")
          setTimeout(() => {
            copyFxBtn.classList.add("text-slate-800", "border-slate-200")
            copyFxBtn.classList.remove("text-emerald-600", "border-emerald-500", "bg-emerald-50")
          }, 1000)
        })
        .catch((err) => {
          copyFxBtn.classList.remove("text-slate-800", "border-slate-200")
          copyFxBtn.classList.add("text-red-600", "border-red-500", "bg-red-50")
          setTimeout(() => {
            copyFxBtn.classList.add("text-slate-800", "border-slate-200")
            copyFxBtn.classList.remove("text-red-600", "border-red-500", "bg-red-50")
          }, 1000)
          console.error("Clipboard copy failed: ", err)
        })
    }
  })
}

loadGallery()
