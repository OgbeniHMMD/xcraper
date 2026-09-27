# Xcrapper (X Deep Collector)

**Xcrapper** is a Chrome Extension (Manifest V3) that automatically scrolls, discovers, and collects video tweets — with their metadata — from X (formerly Twitter). It ships with a modern, Tailwind-powered dashboard gallery for reviewing, searching, triaging, and exporting your collected library.

---

## Features

### Collecting

- **Automated scrolling & scraping**: Scrolls through X feeds and timelines and extracts video tweets without manual intervention. Collection stops on its own after the page stops producing new content.
- **Per-tab control**: Start/stop scraping on the active tab, or stop every running scrape across all tabs at once.
- **Duplicate-safe**: Videos are keyed by their tweet URL, so re-scraping a page never creates duplicates.
- **Live badge indicator**: The toolbar icon shows a green dot on any tab that is actively scraping.
- **Today's count**: The popup shows how many videos were collected today.

### Metadata captured per video

| Field         | Description                                             |
| ------------- | ------------------------------------------------------- |
| `link`        | Direct, query-stripped tweet URL                        |
| `thumbnail`   | Video thumbnail image URL                               |
| `text`        | Tweet text content (`[No Text]` if empty)               |
| `time`        | Original post timestamp (ISO 8601)                      |
| `isRetweet`   | Whether the tweet appeared as a retweet/attributed post |
| `collectedAt` | Local timestamp of when it was scraped                  |

### Dashboard gallery (`dashboard/index.html`)

- **Search** by tweet text or `@username`.
- **Status filters**: All, Pending, Done, Today, Flagged, Broken (broken-thumbnail scan).
- **Sorting**: collected (newest/oldest) or posted (newest/oldest).
- **Bulk selection**: select individual cards or "Mark All" of the current view.
- **Triage**: mark items Done / Flagged, or delete flagged items.
- **Context menu** (right-click a card): open in X, open in Tweeload, copy link, copy FixupX link, copy Tweeload link, toggle Done, toggle Flag, delete, and clear selection.
- **Broken-thumbnail detection**: thumbnails are verified and surfaced under the "Broken" filter.
- **Performance**: lazy card rendering + `content-visibility` keep large libraries smooth; auto-scroll and jump-to-top/bottom helpers are built in.

### Export

- **CSV export** with three scopes: all items, the current filtered/sorted view, or the current selection.
- Exports include `Done` and `Flagged` columns and a UTF-8 BOM so Excel renders emoji/non-Latin text correctly.
- CSV cells are hardened against spreadsheet formula injection.

---

## How it works

1. `content.js` is injected into X/Twitter pages (declaratively via the manifest, and on demand when the popup starts a scrape).
2. It scrolls the page on an interval, finds tweets containing a video player, and reads each one's link, thumbnail, text, timestamp, and retweet context from the DOM.
3. New items are merged into `collectedTweets` in `chrome.storage.local`, keyed by tweet URL.
4. `background.js` (the service worker) tracks which tabs are scraping and manages the toolbar badge.
5. The popup and the dashboard both read from the same `collectedTweets` store, so changes made in the dashboard (Done/Flagged/delete) are immediately reflected everywhere.

---

## Project Structure

```text
Xcrapper/
├── manifest.json         # Chrome Extension Manifest V3 configuration
├── background.js         # Service worker: scraping-tab state & badge management
├── content.js            # Content script: auto-scroll + DOM scraping
├── popup.html            # Extension popup UI
├── popup.js              # Extension popup logic
├── lib/
│   └── csv.js            # Shared CSV export helpers (window.XcrapperCSV)
├── dashboard/
│   ├── index.html        # Web gallery dashboard UI
│   ├── index.js          # Gallery: search, filters, sorting, triage, export
│   ├── input.css         # Tailwind CSS source input
│   └── tailwind.css      # Compiled Tailwind CSS stylesheet
├── package.json          # Node dependencies and scripts
└── yarn.lock             # Dependency lockfile
```

---

## Installation & Setup

### 1. Prerequisites

- **Node.js** (LTS recommended)
- **Yarn** or **npm**
- **Google Chrome** or any Chromium-based browser that supports Manifest V3 extensions
- An **X (Twitter)** account, logged in, to view feeds/timelines

### 2. Install dependencies

```bash
cd Xcrapper
yarn install
# or
npm install
```

### 3. Build Tailwind CSS (only if you change styles)

The compiled `dashboard/tailwind.css` is committed, so this step is only needed when you edit `dashboard/input.css`:

```bash
yarn build:css   # one-off, minified build
yarn watch:css   # watch mode for development
```

### 4. Load the extension in Chrome

1. Open `chrome://extensions/`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** (top-left).
4. Select the `Xcrapper` directory.

---

## Usage

### Collecting videos

1. Open [X (Twitter)](https://x.com) and navigate to a profile, feed, or search results page that contains videos.
2. Click the **Xcrapper** icon in the toolbar.
3. Click the ▶ button to **start scraping** on this tab. The page begins auto-scrolling and collecting.
4. Click ⏹ to **stop** on this tab, or the "stop all" button to halt every tab at once.
5. The popup shows how many videos you've saved today.

### Browsing the dashboard

1. Click **"N Saved Today"** in the popup to open the dashboard gallery.
2. Use the search box, status filters, and sort dropdown to narrow the list.
3. Right-click any card for actions (open, copy links, mark Done/Flag, delete).
4. Use **Mark All** / checkboxes to select items in bulk.

### Exporting

1. In the popup, **Download CSV** exports the entire library (all items, including Done/Flagged).
2. In the dashboard, the **Export** menu lets you export **all**, the **current view**, or the **selected** items.
3. Files are named `xscrapper_YYYY-MM-DD.csv`.

---

## Bulk Downloading

Xcrapper collects _links and metadata_; it does not download the video files themselves. To grab videos in bulk, use the export/links together with a downloader:

- **JDownloader 2** — paste links into the LinkGrabber (or enable clipboard monitoring and use **Copy FixupX Links** from a card's right-click menu) and let it resolve and download the queue. See the note below.
- **yt-dlp** — the most reliable bulk option. Export the CSV, extract the `Link` column, and feed it to `yt-dlp` (for example, `yt-dlp --batch-file links.txt`). It handles X/Twitter's signed/HLS video streams robustly.
- **Tweeload** — use **Copy Tweeload Links** / **Open in Tweeload** from the context menu for one-off downloads.

> X serves videos through signed, expiring HLS streams rather than stable direct `.mp4` URLs. Downloaders generally resolve the tweet URL for you; the `fixupx.com` / `fxtwitter` / `tweeload` variants are convenient resolver aliases for exactly this purpose.

---

## Data & Storage

- Collected data lives in `chrome.storage.local` under the `collectedTweets` key, keyed by tweet URL. The `unlimitedStorage` permission keeps large libraries from hitting quota limits.
- Which tabs are currently scraping is tracked in `chrome.storage.session`, so that state survives service-worker restarts but clears when the browser session ends.
- **Clearing data**: individual items can be deleted from the dashboard (Flagged filter → right-click → Delete). There is currently no one-click "clear all" button; to wipe everything, remove and re-add the extension, or clear its storage from `chrome://extensions/` → Details → Site data / Storage.

---

## Permissions & Privacy

| Permission         | Why it's needed                                |
| ------------------ | ---------------------------------------------- |
| `activeTab`        | Act on the current tab when you start scraping |
| `scripting`        | Inject `content.js` into a tab on demand       |
| `storage`          | Persist collected tweets and session state     |
| `unlimitedStorage` | Allow large local collections                  |

All scraping and storage happen **locally in your browser**. Xcrapper has no backend and sends none of your data anywhere. It only reads pages on `x.com` / `twitter.com`.

---

## Limitations & Notes

- X changes its DOM frequently; if selectors break, collection may silently stop finding videos. Selector logic lives in `content.js`.
- Scraping is throttled (a fixed delay between scroll steps) to stay under rate limits and avoid lookahead detection; very large collections take time.
- The popup's **Download CSV** exports the _entire_ library, while the popup count reflects _today_ only.
- Naming is intentionally/casually inconsistent: the extension is "Xcrapper", the dashboard is "Xscrapper Gallery", and exported files are prefixed `xscrapper_`.

---

## Development

- There is no test suite or build step for the extension itself; edit the source and reload the unpacked extension from `chrome://extensions/`.
- After editing `dashboard/input.css`, run `yarn build:css` (or `yarn watch:css`).
- `lib/csv.js` is a plain (non-module) script shared by both the popup and the dashboard via `window.XcrapperCSV`.

---

## License

No license is specified for this project. Add one before distributing.
