// Shared CSV export helpers for the Xscrapper popup and dashboard.
// Loaded as a plain (non-module) script and exposed on `window.XcrapperCSV`.
(() => {
  // Column order for the exported dataset. Kept in one place so the popup and
  // the dashboard always produce identically-shaped files.
  const HEADERS = ["Link", "Text", "Time", "Is Retweet", "Collected At", "Thumbnail", "Done", "Flagged"];

  const rowFor = (t) => [
    t.link,
    t.text,
    t.time,
    t.isRetweet ? "Yes" : "No",
    t.collectedAt,
    t.thumbnail,
    t.isDone ? "Yes" : "No",
    t.isFlagged ? "Yes" : "No",
  ];

  // Escape a single value for CSV: force it to a string, neutralize spreadsheet
  // formula injection, flatten newlines, then quote and double inner quotes.
  const csvCell = (value) => {
    let str = value === null || value === undefined ? "" : String(value);
    // A leading =, +, -, @, tab, or CR is treated as a formula by Excel/Sheets.
    if (/^[=+\-@\t\r]/.test(str)) str = "'" + str;
    str = str.replace(/\r?\n/g, " ");
    return `"${str.replace(/"/g, '""')}"`;
  };

  // Serialize an array of tweet records into a UTF-8 CSV string. The leading
  // BOM lets Excel decode emoji/non-Latin text correctly.
  const tweetsToCsv = (tweets) =>
    "\uFEFF" +
    [HEADERS.map(csvCell).join(","), ...tweets.map((t) => rowFor(t).map(csvCell).join(","))].join("\r\n");

  const timestampedFilename = () => `xscrapper_${new Date().toISOString().split("T")[0]}.csv`;

  // Build the CSV blob and trigger a browser download. Returns false if there
  // is nothing to export.
  const downloadTweetsCsv = (tweets, filename = timestampedFilename()) => {
    if (!tweets || tweets.length === 0) return false;

    const blob = new Blob([tweetsToCsv(tweets)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return true;
  };

  window.XcrapperCSV = { HEADERS, csvCell, tweetsToCsv, downloadTweetsCsv, timestampedFilename };
})();
