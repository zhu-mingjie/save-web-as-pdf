# Save Web as PDF

A local-first Chrome Manifest V3 extension that saves the current webpage as one continuous PDF page while preserving real, selectable and searchable text. It uses Chrome DevTools Protocol (`Page.printToPDF`) rather than screenshots.

## Features

- **Save Full Page** pre-scrolls the page to trigger lazy content, waits for fonts and images, emulates screen media, and prints one continuous PDF page.
- **Edit Before Saving** provides a red hover overlay, click-to-hide reflow, Undo, Redo, Restore, Save PDF, and Exit.
- The generated PDF is held locally in IndexedDB and opened in an extension preview before download.
- No page content, HTML, screenshot, or PDF is uploaded anywhere.
- The debugger is attached only around layout measurement and PDF generation and is detached in a `finally` block.

## Install dependencies and build

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run check
```

The unpacked extension is generated in `dist/`.

## Load unpacked

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project's `dist` directory.
5. Pin **Save Web as PDF** to the toolbar.

The warning that the extension can access the debugger appears because searchable, vector-preserving PDF output requires `chrome.debugger` and CDP `Page.printToPDF`. The extension attaches only during export.

## Wikipedia acceptance test

Use a long article with an infobox, multiple images and captions, tables, code or formulas, and references—for example the English Wikipedia article **Apollo 11**.

1. Scroll to a mid-page position, choose **Save Full Page**, and confirm the original scroll position is restored.
2. In preview, verify that the PDF has one page; search for a phrase with Ctrl/Cmd+F and copy text.
3. Check the infobox, captions, tables, colors, spacing, and links.
4. Reload the article, choose **Edit Before Saving**, remove the infobox or another block, then test Undo, Redo, and Restore.
5. Remove an unwanted block again, choose **Save PDF**, and verify the block is absent, nearby content reflows, and no red overlay or toolbar appears in the PDF.
6. Choose **Exit** in a separate edit session and verify every hidden element is restored.

## Architecture

- `src/background/`: export orchestration, short-lived debugger session, CDP stream reading.
- `src/page/`: lazy-load pre-scroll, resource waits, temporary export styles, state cleanup.
- `src/editor/`: Shadow DOM toolbar, independent selection overlay, removal history.
- `src/preview/`: IndexedDB-backed PDF preview and download.
- `src/shared/`: messages, constants, filenames, and local PDF storage.

## Known limits

- Chrome blocks extension injection on `chrome://` pages, the Chrome Web Store, and certain other protected pages.
- Chrome cannot attach this extension's debugger while DevTools or another debugger owns the tab.
- The extension rejects content larger than the conservative Chromium single-paper limit of 200 inches in either dimension. It does not silently paginate or fall back to a screenshot.
- Infinite-scroll pages are bounded by iteration, height-growth, and maximum-height guards, so content that appears only after those guards may not be included.
- Lazy resources that do not finish within the resource timeout are skipped so export cannot hang forever.
- Some websites use canvas, WebGL, video, cross-origin frames, or print-hostile CSS that Chromium cannot preserve as selectable/vector PDF content.
- The built-in Chrome PDF viewer may be slow or decline to render extremely tall pages even when Chrome generated them successfully.
- The page-count check reads Chrome's PDF page dictionaries. If a future Chrome version encodes them in an unrecognizable way, the code accepts the generated file rather than inventing a screenshot fallback.

## Privacy

All processing and storage are local to Chrome. Generated preview records expire and are deleted opportunistically after 24 hours.
