# Save Web as PDF

Save a complete webpage as a searchable PDF while preserving the page's visual layout. Pages that fit within Chrome's safe single-page limit stay continuous; longer webpages are split into the fewest practical pages.

## Features

- Save shorter webpages as one continuous PDF page
- Split longer webpages into pages up to Chrome's safe maximum height, keeping the page count as low as practical
- Shorten the final page of a multi-page PDF, or an oversized single page produced by maximum-height fallback, when its content boundary can be verified safely
- Keep text selectable, copyable, and searchable
- Preserve the webpage's screen layout, images, colors, tables, and links where Chromium supports them
- Stabilize viewport-height sections and spacing before Chrome lays out an extra-long PDF page
- Save the complete question section and requested answer from supported Zhihu answer URLs without unrelated answers, recommendations, sidebars, or floating controls
- Remove unwanted elements before saving, with Undo, Redo, and Restore
- Preview the generated PDF before downloading
- Process and store PDF data locally in the browser
- Use the same Chrome extension package on Windows, macOS, and Linux
- Use the interface in 11 supported locales: English, Simplified Chinese, Traditional Chinese, German, Italian, Spanish, Brazilian Portuguese, European Portuguese, French, Japanese, and Korean

The interface defaults to Chrome's display language, including when Chrome follows the operating system language. The gear at the right of the popup brand bar opens three locally saved settings: language, first-page header, and last-page footer. Language can be automatic or any supported locale. Header/footer independently offer none (default), source URL, time, or both. Changes save immediately. Regional variants use Chrome's native locale matching, and unsupported languages fall back to English. No webpage-language detection, location lookup, or network translation service is used.

Save Web as PDF uses the Chrome DevTools Protocol (`Page.printToPDF`) rather than a screenshot pipeline. After the page is prepared, content that fits within the verified safe capacity is exported as one continuous page. Longer content is automatically exported across maximum-height pages. When the last page's rendered content, image, and annotation bounds can be verified safely, only the final page's PDF boxes are shortened (also for a one-page maximum-height fallback) with about 4 mm of bottom padding. The original searchable PDF content and links remain intact; ambiguous backgrounds, unsupported page boxes, resource limits, and validation failures keep the original page unchanged. This shared rule applies to every accessible, processable capture mode; it is not limited to a website list.

## Install the 0.5.3 test package

Extract the provided ZIP into an empty folder. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the folder containing `manifest.json`. No developer tools, Node.js, Python, or additional fonts are needed by users. This candidate has not been published as a GitHub Release or submitted to the store.

## PDF metadata and compatibility

Headers are printed once before the body and footers once after its actual prepared bottom. They participate in the same height measurement and pagination as the body, including when their extra space exceeds the 200-inch capacity. No space is reserved when both are disabled. A single export-start timestamp uses local date/time and explicit UTC offset; both positions share it. URLs retain the real host/path but omit query and fragment. Unicode URL characters use standard percent encoding/punycode, so the bundled Noto Sans font can display every URL and timestamp character reliably; the webpage's own Unicode text remains Chromium's searchable output. Long URLs wrap, and their link annotations remain clickable.

The minimum remains Chrome 120. PDF.js 6.3.289 now uses its locally bundled legacy build plus a feature-detected ReadableStream async-iterator adapter in the actual optimization worker. This choice was tested rather than inferred from the word “legacy”: upstream's general legacy baseline is newer than 120. PDF parsing, rendering, scanning, rewriting and validation run in one terminable worker. One 20-second total budget starts before worker construction; timeout terminates the worker and keeps the complete original PDF. Cancel rejects the operation and cannot create a PDF preview/download URL. This budget applies to optional optimization, not the entire webpage preparation/Chrome print pipeline. Resource/setup failures and unsafe bounds produce a visible original-PDF notice and console diagnostics.

Controlled macOS tests with real Chrome 120.0.6099.109 (old headless mode) and Chrome 154 cover the PDF matrix. Settings, metadata and worker lifecycle are also automated; current Chrome 154 additionally runs the actual unpacked extension with its CSP, full-save/edit-save and cleanup. see [the verification record](PRE_RELEASE_TEST_PLAN.md). This is not Windows/Linux installation acceptance or a guarantee for every site. Real-site testing remains with the maintainer.

## Development installation

1. Install [Node.js](https://nodejs.org/) 22.13 or newer and npm.
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

- Node.js 22.13 or newer
- npm
- Chrome or another compatible Chromium-based desktop browser

Commands:

```bash
npm ci
npm run check
npm run build
```

`npm run test:pdf-integration` runs the controlled PDF/settings/lifecycle matrix. `npm run test:extension-runtime` uses current Chrome's extension debugging protocol to check real extension URLs/CSP and full-save/edit-save on a local fixture. These browser tests are separate from the fast checks.

`npm run check` runs TypeScript validation, filename, export-logic, locale, popup, settings/compatibility tests, and a production build. `npm run build` removes the previous `dist` directory, compiles the TypeScript entry points, and copies only the Manifest V3 runtime files required by Chrome.

The runtime uses Chrome Extension APIs, the Chrome DevTools Protocol, IndexedDB, standard Web APIs, and locally bundled browser builds of PDF.js and pdf-lib. It does not use operating-system-specific shell commands, native applications, fixed filesystem paths, Native Messaging, or remotely loaded code.

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

Commit and push each reasonably complete development or test version so the source history remains backed up and reversible. A decision to delay a public release does not delay normal source commits or pushes. Create a Git tag, GitHub Release, and public release package only after the version has been tested and the maintainer explicitly approves publication. Follow [RELEASING.md](RELEASING.md) for the required checks and publishing steps.

## Privacy

PDF generation and temporary storage happen locally in Chrome. The extension does not upload page content, HTML, screenshots, or generated PDFs, and it has no account, analytics, subscription, or backend service. The temporary IndexedDB record is deleted as soon as the preview reads it; records left by an interrupted operation are removed opportunistically after 24 hours. Query parameters and fragments are removed before a source URL is stored. The three preferences are retained in extension-local storage until changed or the extension is removed.

Read the [public privacy policy](https://miengieh.com/save-web-as-pdf/privacy/) or its repository source in [PRIVACY.md](PRIVACY.md).

## License

The source code, original extension icon, and repository-owned promotional assets are available under the [MIT License](LICENSE). Bundled third-party components retain their Apache-2.0 or MIT terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Known limitations

- Chrome blocks extension access to internal pages, the Chrome Web Store, and some other protected pages.
- DevTools or another debugger cannot own the source tab while an export is running.
- Pages that fit within Chromium's safe single-page height are exported as one continuous page. Longer webpages are automatically paginated with each page using the maximum safe height, except for the final remainder. Extremely wide pages can still exceed Chromium or PDF viewer limits even at the minimum supported print scale.
- Final-page shortening is conservative. A full-page background, unsupported PDF transfer filters, unusual page boxes or rotation, a large/slow PDF, or any mismatch in page count, earlier page sizes, final-page text, annotations, dimensions, or rendered content leaves the original valid PDF unchanged.
- Infinite-scroll and slow-loading pages are bounded by time, iteration, and height guards so an export cannot run forever.
- Zhihu feeds use a snapshot of the content already loaded when export starts. Supported direct answer URLs preserve the main question section and the requested answer; if either cannot be identified safely, the extension stops instead of exporting different content.
- Viewport-dependent layout can be stabilized only when the responsible page styles are inspectable. Cross-origin or script-generated styles can still cause layout differences, missing content, or export failure.
- Canvas, WebGL, video, cross-origin frames, and site-specific CSS may not be preserved as selectable or vector PDF content.

Not every website can currently be saved completely. Page structure, dynamic loading, and other compatibility differences may cause missing content, layout problems, or export failure. If you encounter a reproducible problem, email [support@miengieh.com](mailto:support@miengieh.com) with a publicly shareable page URL, your Chrome and extension versions, and the error message. Do not send passwords, cookies, or other sensitive credentials. Compatibility issues that can be addressed safely may receive targeted fixes, but support for every website cannot be guaranteed.
