# Xcrapper (X Deep Collector)

**Xcrapper** is a Chrome Extension (Manifest V3) designed to automatically scroll, discover, and collect video tweets along with their metadata (direct links, thumbnails, tweet text, timestamps, retweet status, and collection timestamp) from X (formerly Twitter). It also includes a modern, Tailwind-powered dashboard gallery for viewing, searching, and exporting your collected video library.

---

## Features

- **Automated Scrolling & Scraping**: Seamlessly scrolls through X feeds and timelines to extract video tweets without manual intervention.
- **Rich Metadata Extraction**: Captures:
  - Direct tweet URL
  - Video thumbnail image
  - Tweet text content
  - Publication timestamp
  - Retweet/social context indicator
  - Local collection timestamp
- **Chrome Storage Integration**: Saves collected items persistently using `chrome.storage.local`.
- **Badge Counter**: Automatically updates the extension badge count as new videos are collected.
- **Interactive Popup**: Quick controls to start/pause scraping, check collected count, download CSV, view the saved gallery, or clear storage.
- **Rich Web Dashboard**: A dedicated dashboard gallery (`dashboard/index.html`) featuring search, filters, detailed view, video preview links, and CSV export.

---

## Project Structure

```text
Xcrapper/
├── manifest.json         # Chrome Extension Manifest V3 configuration
├── background.js         # Service worker for state & badge management
├── content.js            # Content script for auto-scrolling and DOM scraping
├── popup.html            # Extension popup UI
├── popup.js              # Extension popup logic
├── dashboard/
│   ├── index.html        # Web gallery dashboard UI
│   ├── index.js          # Gallery management, search, and CSV export logic
│   ├── input.css         # Tailwind CSS source input
│   └── tailwind.css      # Compiled Tailwind CSS stylesheet
├── lib/                  # Utility libraries (if applicable)
├── package.json          # Node dependencies and scripts
└── yarn.lock             # Dependency lockfile
```

---

## Installation & Setup

### 1. Prerequisites
- **Node.js** (LTS recommended)
- **Yarn** or **npm**
- **Google Chrome** (or any Chromium-based browser supporting Manifest V3 extensions)

### 2. Install Dependencies
```bash
cd Xcrapper
yarn install
# or
npm install
```

### 3. Build Tailwind CSS (Optional / Development)
If you modify styles in `dashboard/input.css`, rebuild the compiled CSS:
```bash
yarn build:css
# or for watch mode during development
yarn watch:css
```

### 4. Load the Extension in Chrome
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** using the toggle in the top-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select the `Xcrapper` directory.

---

## Usage

1. Open [X (Twitter)](https://x.com) and navigate to any profile, feed, or search results page containing videos.
2. Click the **Xcrapper** extension icon in your Chrome toolbar.
3. Click **Start Scraping**. The extension will automatically scroll down the page and collect video tweets.
4. Click **View Saved Gallery** or open the dashboard to browse, search, and filter your collected video tweets.
5. Click **Download CSV** to export your collected dataset.
