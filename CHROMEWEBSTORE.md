# Chrome Web Store Listing — Save Web as PDF

> Last Updated: 2026-09-06

## Store Listing

**Extension Name**

Save Web as PDF

**Short Description**

Save the current webpage as one continuous, searchable PDF page, with an optional cleanup step before export.

**Detailed Description**

Save the current webpage as one continuous PDF page while preserving searchable and selectable text wherever Chrome supports it.

FEATURES
• Save a complete webpage as one continuous PDF page
• Preserve visible layout, images, colors, tables, links, and searchable text where supported
• Remove unwanted page elements before saving
• Undo, redo, or restore edits before export
• Preview the generated PDF before downloading
• Keep page processing and temporary PDF data on your device

HOW TO USE
1. Open the webpage you want to save.
2. Open Save Web as PDF from the Chrome toolbar.
3. Choose Save Full Page, or choose Edit Before Saving to remove unwanted elements.
4. Review the PDF preview and download the file.

PRIVACY
The selected webpage and generated PDF are processed locally in Chrome and are not uploaded to the developer or any third party. Temporary preview data is removed after the preview reads it. The extension has no analytics, advertising, accounts, or backend service.

PERMISSIONS
The extension accesses only the active page after you open it and choose an action. It temporarily uses Chrome's page-rendering capability to create the PDF and releases that access during cleanup.

Version 0.3.1 — Updated the extension and store artwork with the new Save Web as PDF icon.

**Category**

Productivity

**Language**

English

## Single Purpose

Save a webpage selected by the user as one continuous, searchable PDF page, optionally after removing unwanted elements.

## Permissions Justification

| Permission | Justification |
|---|---|
| `activeTab` | Gives temporary access only to the active webpage after the user opens the extension, so the extension can prepare that page for the requested export. |
| `scripting` | Injects the locally bundled page-preparation and optional editing controls into the active webpage after the user requests them. |
| `debugger` | Temporarily connects to the selected tab so Chrome can render that webpage as a searchable PDF. It is attached only during generation and detached during cleanup or cancellation. |
| `downloads` | Opens Chrome's Save As flow when the user clicks Download PDF in the preview. |
| `storage` | Stores only ephemeral per-tab export coordination state in browser session storage so duplicate exports can be prevented across service-worker restarts. The state clears at the end of the export or browser session. |

No host permissions are requested. The extension does not request the `tabs` permission; `activeTab` provides the narrower, user-initiated access needed for the current page.

## Privacy & Data Use

**Data handled locally**

- Website content and layout selected for PDF export
- Page title
- Source URL with query parameters and fragments removed
- Generated PDF
- Ephemeral tab-specific export state without page content

**Transmission and sharing**

No data is transmitted to the developer or third parties. There is no analytics, advertising, tracking, account system, remote API, or backend service.

**Retention**

The temporary PDF database record is deleted when the preview reads it. Interrupted records are eligible for cleanup after 24 hours. Export coordination state is removed after completion or cancellation and otherwise expires with the browser session.

**Limited Use certification**

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

**Privacy Policy URL**

[REQUIRED BEFORE SUBMISSION] Publish `PRIVACY.md` at a stable public URL, add a monitored privacy contact, paste that URL here, and verify it without signing in.

## Graphic Assets

- Extension icons: `icons/icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png`
- Store icon: `icons/icon-128.png`
- Small promotional image: `store-assets/small-promo-440x280.png`
- Popup screenshot: `store-assets/screenshot-popup-640x400.png`
- Recommended additional screenshot: capture the completed PDF preview during the final Chrome acceptance test.
- Marquee promotional image: optional, not prepared

## Publishing Readiness

- [x] Manifest V3
- [x] Narrow single purpose
- [x] Permission justifications prepared
- [x] No remote code or network data transmission
- [x] Privacy policy text prepared
- [x] 128×128 store icon prepared and included in the extension package
- [x] 440×280 small promotional image prepared
- [x] Current 640×400 popup screenshot prepared
- [x] Chrome Web Store ZIP places `manifest.json` at the archive root
- [ ] Add privacy contact and host the privacy policy at a public URL
- [ ] Add the final privacy policy URL above and in the Developer Dashboard
- [ ] Complete the Developer Dashboard privacy disclosures and Limited Use certification
- [ ] Optionally capture a second screenshot showing the completed PDF preview
- [ ] Complete the Windows and macOS acceptance tests in `PRE_RELEASE_TEST_PLAN.md`
- [x] MIT License added for the source code and original project assets

## Version History

### 0.3.1 — 2026-09-06

- Replaced the extension icon at every required Chrome size
- Updated the Chrome Web Store promotional image to use the new icon
- Rebuilt and verified the cross-platform release package

### 0.3.0 — 2026-09-05

- Corrected Chrome Web Store ZIP structure
- Added export cancellation and service-worker-safe session coordination
- Reduced temporary data retention and sanitized stored source URLs
- Rejected PDF output whose single-page result cannot be verified
- Added accessible status messaging, native instructions dialog, focus styling, and extension icons
- Added privacy, store listing, and release-testing documentation

### 0.2.0

- Added cross-platform packaging and filename handling
- Added local preview and download workflow

## Review Notes

The `debugger` permission is used only because Chrome's native PDF rendering command is exposed through the tab debugging interface. It is never used to inspect unrelated tabs, monitor browsing, execute remote code, or transmit data. The extension connects only after the user requests an export and disconnects in cleanup, including errors and cancellation.

Known platform limitations are listed in `README.md`. Store copy must not claim perfect fidelity for canvas, WebGL, video, protected pages, or extremely large webpages.
