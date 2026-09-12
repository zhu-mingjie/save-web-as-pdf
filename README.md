# Save Web as PDF

Save a complete webpage as one continuous, searchable PDF page while preserving the page's visual layout.

## Features

- Save a complete webpage as one continuous PDF page
- Keep text selectable, copyable, and searchable
- Preserve the webpage's screen layout, images, colors, tables, and links where Chromium supports them
- Stabilize viewport-height sections and spacing before Chrome lays out an extra-long PDF page
- Save the complete question section and requested answer from supported Zhihu answer URLs without unrelated answers, recommendations, sidebars, or floating controls
- Remove unwanted elements before saving, with Undo, Redo, and Restore
- Preview the generated PDF before downloading
- Process and store PDF data locally in the browser
- Use the same Chrome extension package on Windows, macOS, and Linux
- Use the interface in English, Simplified Chinese, Traditional Chinese, German, Italian, Spanish, Brazilian or European Portuguese, French, Japanese, or Korean

The interface automatically follows Chrome's display language, including when Chrome follows the operating system language. Regional variants use Chrome's native locale matching, and unsupported languages fall back to English. No webpage-language detection, location lookup, or network translation service is used.

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

`npm run check` runs TypeScript validation, filename and export-logic tests, and a production build. `npm run build` removes the previous `dist` directory, compiles the TypeScript entry points, and copies only the Manifest V3 runtime files required by Chrome.

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
5. Create an empty folder and extract the ZIP into it.
6. Select **Load unpacked**, then select that extracted folder—the folder directly contains `manifest.json`.

The ZIP is also ready for direct upload to the Chrome Web Store because `manifest.json` is at the archive root.

The same release package is used across supported desktop Chrome platforms; there are no separate macOS, Windows, or Linux builds.

## Release policy

Every version update must be published as a GitHub Release tagged `vX.X.X`. Attach the matching `release/save-web-as-pdf-vX.X.X.zip` package and include a short, user-facing summary of what changed. Follow [RELEASING.md](RELEASING.md) for the required checks and publishing steps.

## Privacy

PDF generation and temporary storage happen locally in Chrome. The extension does not upload page content, HTML, screenshots, or generated PDFs, and it has no account, analytics, subscription, or backend service. The temporary IndexedDB record is deleted as soon as the preview reads it; records left by an interrupted operation are removed opportunistically after 24 hours. Query parameters and fragments are removed before a source URL is stored.

See [PRIVACY.md](PRIVACY.md) for the complete privacy policy.

## License

The source code, original extension icon, and repository-owned promotional assets are available under the [MIT License](LICENSE).

## Known limitations

- Chrome blocks extension access to internal pages, the Chrome Web Store, and some other protected pages.
- DevTools or another debugger cannot own the source tab while an export is running.
- Very long or wide pages can exceed Chromium or PDF viewer single-page limits. The extension reports an error instead of silently paginating or creating a screenshot.
- Infinite-scroll and slow-loading pages are bounded by time, iteration, and height guards so an export cannot run forever.
- Zhihu feeds use a snapshot of the content already loaded when export starts. Supported direct answer URLs preserve the main question section and the requested answer; if either cannot be identified safely, the extension stops instead of exporting different content.
- Viewport-dependent layout can be stabilized only when the responsible page styles are inspectable. Cross-origin or script-generated styles may still prevent a one-page result, in which case the extension reports the limitation without saving an incomplete PDF.
- Canvas, WebGL, video, cross-origin frames, and site-specific CSS may not be preserved as selectable or vector PDF content.

Not every website can currently be saved completely. Page structure, dynamic loading, and other compatibility differences may cause missing content, layout problems, or export failure. If you encounter a reproducible problem, email [support@miengieh.com](mailto:support@miengieh.com) with a publicly shareable page URL, your Chrome and extension versions, and the error message. Do not send passwords, cookies, or other sensitive credentials. Compatibility issues that can be addressed safely may receive targeted fixes, but support for every website cannot be guaranteed.
