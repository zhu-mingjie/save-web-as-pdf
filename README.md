# Save Web as PDF

Save a complete webpage as one continuous, searchable PDF page while preserving the page's visual layout.

## Features

- Save a complete webpage as one continuous PDF page
- Keep text selectable, copyable, and searchable
- Preserve the webpage's screen layout, images, colors, tables, and links where Chromium supports them
- Remove unwanted elements before saving, with Undo, Redo, and Restore
- Preview the generated PDF before downloading
- Process and store PDF data locally in the browser
- Use the same Chrome extension package on Windows, macOS, and Linux

Save Web as PDF uses the Chrome DevTools Protocol (`Page.printToPDF`) rather than a screenshot pipeline. It does not silently fall back to screenshots or automatic pagination.

## Development installation

1. Install [Node.js](https://nodejs.org/) 20 or newer and npm.
2. Install dependencies and build the extension:

   ```bash
   npm ci
   npm run build
   ```

3. Open `chrome://extensions` in Chrome.
4. Enable **Developer mode**.
5. Select **Load unpacked**.
6. Select the generated `dist` directory—the directory that directly contains `manifest.json`.

The debugger permission is required for Chromium's PDF-generation protocol. The extension attaches the debugger only while measuring and printing the page, then detaches it during cleanup.

## Development

Requirements:

- Node.js 20 or newer
- npm
- Chrome or another compatible Chromium-based desktop browser

Commands:

```bash
npm ci
npm run check
npm run build
```

`npm run check` runs TypeScript validation, cross-platform filename tests, and a production build. `npm run build` removes the previous `dist` directory, compiles the TypeScript entry points, and copies only the Manifest V3 runtime files required by Chrome.

The runtime uses Chrome Extension APIs, the Chrome DevTools Protocol, IndexedDB, and standard Web APIs. It does not use operating-system-specific shell commands, native applications, fixed filesystem paths, or Native Messaging.

## Create a release package

```bash
npm run package
```

This command cleans old build and release output, runs filename tests, creates a fresh production build, validates `dist`, creates a versioned ZIP, and validates the ZIP contents. The version comes from `manifest.json`.

Output format:

```text
release/save-web-as-pdf-vX.X.X.zip
```

You can validate an existing build and package again with:

```bash
npm run verify:release
```

## Test a release package

1. Run `npm run package`.
2. Copy the single generated ZIP to a Windows, macOS, or Linux computer.
3. Extract the ZIP.
4. Open `chrome://extensions` in Chrome and enable **Developer mode**.
5. Select **Load unpacked**.
6. Select the extracted `save-web-as-pdf-vX.X.X` directory that directly contains `manifest.json`.

The same release package is used across supported desktop Chrome platforms; there are no separate macOS, Windows, or Linux builds.

## Privacy

PDF generation and temporary storage happen locally in Chrome. The extension does not upload page content, HTML, screenshots, or generated PDFs, and it has no account, analytics, subscription, or backend service.

## Known limitations

- Chrome blocks extension access to internal pages, the Chrome Web Store, and some other protected pages.
- DevTools or another debugger cannot own the source tab while an export is running.
- Very long or wide pages can exceed Chromium or PDF viewer single-page limits. The extension reports an error instead of silently paginating or creating a screenshot.
- Infinite-scroll and slow-loading pages are bounded by time, iteration, and height guards so an export cannot run forever.
- Canvas, WebGL, video, cross-origin frames, and site-specific CSS may not be preserved as selectable or vector PDF content.
