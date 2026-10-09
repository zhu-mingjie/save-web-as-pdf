# Save Web as PDF 0.5.3 — Test Candidate Verification Record

This file separates prior maintainer verification, automated checks for the current candidate, current manual browser checks, intentionally deferred coverage, and work reserved for the maintainer. Do not treat an item from one category as evidence for another.

## Current 0.5.3 controlled verification — 2026-10-09

- [x] `scripts/check.mjs`: TypeScript; filename, print planning, i18n (11 catalogs/73 keys), popup, and new settings/compatibility tests; production build.
- [x] Mocked Chrome debugger: three adaptive two-page attempts followed by a maximum-height one-page result carries `optimizeSinglePage=true`, with attempt diagnostics. Normal adaptive single-page output remains excluded.
- [x] Local controlled PDF matrix in **actual Chrome 120.0.6099.109** (old headless mode) and **Chrome 154.0.8037.98** on macOS: 11 text/link/image/table/SVG/light/shadow/background/nearly-full/normal-single/fallback-single cases. Text, annotations, earlier page boxes and production post-write render validation pass. The representative two-page remainder is 14,400 → 203.677 pt; fallback one-page input is 14,400 → 8,978.924 pt with final links retained. Safely shortened cases have about 14–15 pt raster-measured bottom space (4 mm plus raster safety).
- [x] All 16 header/footer combinations on both short and multi-page fixtures (32 combinations): metadata appears once per enabled position, header only first and footer only final, with no lost final marker or annotations. Default none/none creates zero metadata nodes.
- [x] Long Chinese/Arabic URL paths use valid canonical encoding, wrap and retain clickable targets without query/fragment. One explicit timestamp is shared by both ends; positive fractional and negative timezone offsets are unit-tested.
- [x] A 19,185 CSS-pixel body plus header/footer is replanned into two safe pages, each ≤200 inches; no overlap or oversized last page is introduced.
- [x] Native popup selects: defaults, actual locale options, persistence across reload, manual Chinese and restore automatic English, failed-write rollback/feedback, invalid old values, Escape/back. Visual screenshot confirms 320 px layout and content-driven three-row height. The supplied gear resource is copied unchanged; runtime icons are local.
- [x] Missing ReadableStream async iterator simulation; actual Chrome 120 initialization and PDF handling. Initial actual Chrome 120 failed with “not async iterable” before the targeted adapter. Legacy's bundled compatibility covers newer Promise APIs in that browser; “legacy” alone is not treated as evidence.
- [x] Deliberately infinite synchronous worker: actual total deadline ends at approximately 20,001–20,006 ms, calls terminate, stops subsequent messages, and cancels without success. Cancellation stops work and a subsequent real optimization succeeds. Missing worker constructor/resource and stale callback simulations preserve isolation/fallback. No nested parser worker survives termination.
- [x] Current Chrome 154 loads the unpacked build using its extension debugging protocol; extension-local storage, local Noto/font/CMap/worker resource URLs and the unmodified production preview run under actual extension CSP. The initial targeted smoke test seeds a locally generated PDF handoff record; the same test then activates the real toolbar action on a local fixture and exercises full-save and edit-save with URL/time metadata, Chinese naming, immediate language updates inside the closed editor shadow root, and removal of temporary metadata/font/editor resources. The background-tab animation-frame cleanup stall found here is fixed with a bounded wait. This automated controlled-flow coverage is distinct from the maintainer's actual file dialog and real-site acceptance.

Commands: `npm run check`, `npm run test:pdf-integration`, `npm run test:extension-runtime` (current Chrome with Extensions debugging API), `npm run package`, `npm run verify:release`. Set `CHROME_PATH` to test another executable; Chrome 120 on this Mac requires `CHROME_HEADLESS_MODE=old`. Chrome 120's newer headless/headed launch crashed on this macOS host; no installed-extension Chrome 120 acceptance is inferred from old-headless controlled tests. `PDF_TEST_OUTPUT_DIRECTORY` optionally saves before/after PDFs and settings screenshots outside the source tree.

The 20-second optimization budget starts before task construction/copy and includes parser startup, decode, render, scan, rewrite and validation. One absolute deadline is passed into the worker, so initialization consumes the same budget. It does not claim a 20-second maximum for the entire webpage-preparation/Chrome-print operation. Timeout keeps the valid original with a visible notice. Cancel hides processing controls and never constructs a success object URL; closing the preview terminates its task and revokes any existing URL.

### Validated test package

- Version: `0.5.3`; `minimum_chrome_version` remains `120`.
- ZIP: 3,106,982 bytes (about 2.96 MiB); 220 runtime files, with `manifest.json` at the root. Build/package and `verify:release` pass. The former 0.5.2 test ZIP was about 728 KiB; growth is local legacy compatibility, parser, CMaps/standard fonts, Noto Sans and license resources.
- SHA-256: `7800ceb6aedf888069c54c9e711d9bfbc335a8c0d40fd1b48febd8bfe6b45f4f`.
- No personal paths, real file URLs, local development server addresses, source maps, TypeScript or dependencies directories in the archive. Binary font/CMap resources are inspected as files rather than decoded as text. The path scanner distinguishes PDF.js's generic diagnostic “file:// URLs” from a real file URL; a targeted test confirms actual path/authority URLs are still rejected. Upstream guarded Node-only branches are not used in browser processing; `process` is compile-defined as undefined and no external Node/native runtime module is loaded.
- Source backup is on `fix/pdf-height-settings`, preserving the preceding unpushed cloud-handoff document commit. No Release/tag/store operation accompanies this ZIP.

### Still awaiting maintainer acceptance

- [ ] Install the 0.5.3 ZIP on the reported Windows machine; exercise short/adaptive and long/final-remainder pages, full-save/edit-save, preview/download, settings persistence and optional metadata.
- [ ] Windows/Linux current candidate installation and platform-specific behavior. Prior maintainer reports below are historical, not this version's acceptance.
- [ ] Ordinary installed Chrome 120 complete workflow and every-site compatibility. Controlled Mac minimum-version and current-extension smoke coverage are narrower evidence.
- [ ] Actual download Save As interaction and manual per-locale/screen-reader acceptance. Existing naming tests and prior installed results below remain valid historical evidence.
- [ ] Before approved publication: update the public website privacy policy and store screenshot/disclosures to reflect persistent settings. No public Release, tag or store action in this task.

Full-save and edit-save converge on the same generator and preview worker in source. No Wikipedia or other maintainer-designated real website was visited for testing, and no full clean-device or 11-language manual matrix was repeated. Unsafe full backgrounds, unsupported filters/page transforms, large inputs and failed verification retain the original complete PDF with an explicit diagnostic reason; a fallback is not counted as repaired height behavior.

## Prior maintainer verification — do not repeat as a release blocker

- **Windows without development tools:** the maintainer reports successful installation and use on a Windows computer without Node.js, npm, TypeScript, esbuild, or project dependencies.
- **macOS:** the maintainer reports successful testing on macOS. No unreported machine or browser details are inferred.
- **Previously designated real websites:** the maintainer reports the designated Zhihu and other real-site cases passed for the version they tested. Future real-site compatibility checks remain with the maintainer unless a new request says otherwise.

These results establish prior platform and compatibility coverage. They do not claim that the maintainer has already accepted the 0.5.2 beta.

## Historical 0.5.2 final-page-height verification

- [x] Pure boundary tests confirm the centralized 4 mm padding, raster safety allowance, minimum-benefit threshold, and invalid-input fallback.
- [x] Real Chrome-generated two-page PDF with a short text remainder keeps two pages and changes only page 2 from 14,400 pt to 203.677 pt high.
- [x] Real Chrome-generated three-page PDF keeps all earlier page boxes unchanged and shortens only page 3.
- [x] Final content ending in an image, table, SVG, external link, shallow-color text, or shadow remains present and passes the post-write text/annotation/render validation.
- [x] A full-page gradient background remains at the original height because its lower boundary is not safe to treat as redundant whitespace.
- [x] A nearly full final page remains unchanged when the safe reduction is below the configured minimum; a single-page PDF remains byte-for-byte unmodified by this feature.
- [x] Page count, earlier page boxes, final-page extracted text, annotations, PDF envelope, and the white-composited rendered top region are checked after rewriting; any failure returns the original valid PDF.
- [x] The representative before/after PDFs were reopened with Poppler. Both have two pages; page 1 remains 720.96 × 14,400 pt, while page 2 changes from 720.96 × 14,400 pt to 720.96 × 203.677 pt. The top content render is visually unchanged.
- [x] Historical resource guards: 64 MiB input, four million render pixels and a 12-second render timeout. The old 20-second loop-boundary deadline was cooperative, not a proven hard total limit; 0.5.3 replaces it with worker termination.

The controlled matrix ran on 2026-10-02 with Headless Chrome 154 on macOS against local fixtures. It does not replace maintainer acceptance of the installed ZIP, the existing clean-device matrix, or the maintainer-owned website list. Full-save and edit-save both converge on the same preview-side optimizer by code path; an installed-extension manual edit-flow regression was not repeated in this automated run.

## Historical 0.5.2 automated verification

Record the actual result when the candidate is built:

- [x] TypeScript typecheck
- [x] Filename regression tests, including Unicode, illegal characters, reserved names, blank input, byte limits, and repeated `.pdf` suffixes
- [x] Export-plan regression tests, including the single-page boundary, maximum-height fallback, long-page planning, page counts, and PDF header/EOF validation
- [x] All 11 locale catalogs have matching keys and valid placeholders
- [x] Popup/source checks
- [x] Production build
- [x] Release-package validation, archive-root manifest, and absence of source/development debris
- [x] Runtime bundles contain no Node-only API or personal/local path leakage

These checks passed on 2026-10-02 using the 0.5.2 beta. The validated 728 KiB archive contained 30 runtime files with `manifest.json` at its root, including the local PDF worker and both third-party license texts.

## Prior 0.5.1 controlled Chrome regression

Use local pages rather than repeating the maintainer's designated real-site list.

- [x] Clearly short page exports as one complete page.
- [x] Near-boundary and rounding cases terminate after bounded attempts.
- [x] A nominal single-page plan that Chrome renders as two pages is remeasured and replanned with the verified 200-inch maximum paper height.
- [x] Pages slightly above the single-page limit, around twice the limit, and substantially longer export as complete multi-page PDFs with a shorter final page where applicable.
- [x] Top, middle, and final markers are present; links and images cross page boundaries without the final content being dropped.
- [x] Preview receives the complete PDF rather than only its first page.
- [x] An automatic Chinese or mixed-language title is used for the actual downloaded filename.
- [x] A manual filename edit made immediately before saving controls the actual downloaded filename.
- [x] Blank input, long/invalid input, repeated saves, one-page output, and multi-page output preserve the shared safe filename rules.
- [x] Canceling the Save As dialog does not report a completed download.

These checks were completed in Chrome on macOS on 2026-10-01 with the installed 0.5.1 package and controlled local pages. The forced-break regression reproduced the historical unexpected two-page outcome from an initial single-page plan; the accepted result was a complete two-page PDF whose first page measured 200 inches high. A 50,000 CSS-pixel fixture produced three 200-inch pages. PDF header/EOF, page count, marker text, link annotation, preview page count, and rendered pages were inspected. A short page also completed through Edit Before Saving and opened a complete one-page preview with the expected title. The Save As cancellation produced no file.

## Prior 0.5.1 auxiliary and interruption checks

- [x] Keyboard focus order and visible focus for popup and preview controls
- [x] Enter/Space activation, Escape dismissal, cancellation, and retry state restoration
- [x] Empty status/error region remains absent; a long error remains scrollable and readable
- [x] Accessibility-tree names and disabled state for buttons, icon links, progress, errors, and the disabled rating entry
- [ ] Actual screen-reader announcement of progress and errors
- [ ] DevTools/debugger conflict reports an error and releases state cleanly
- [ ] Navigation or tab closure during export releases temporary DOM/styles and debugger state

Keyboard order, accessible names/states, cancellation, and successful retry were exercised in the installed extension. Empty-region and maximum-height error behavior are covered by the popup source/layout regression checks; a synthetic long runtime error was not injected into the release build. VoiceOver was not enabled, so an actual screen-reader announcement is not claimed. Docked DevTools did not reproduce a debugger conflict in the tested Chrome build: export still completed and cleanup succeeded. Navigation/tab-close interruption could not be exercised reliably through the attached browser-control session and remains manual follow-up coverage.

Static source or accessibility-tree inspection may support these items but does not count as an actual screen-reader announcement test.

## Deferred by maintainer

- Manual end-to-end testing of every one of the 11 supported locales is postponed pending real-user feedback.
- Continue automated catalog-key, placeholder, fallback, typecheck, build, and package checks.
- The editor's pointer-based element selection remains a known accessibility limitation unless a separate keyboard selection workflow is implemented.

## Chrome Web Store work — maintainer owned

- Enter `https://miengieh.com/save-web-as-pdf/privacy/` in the Developer Dashboard.
- Confirm dashboard disclosures and Limited Use certification match `PRIVACY.md` and `CHROMEWEBSTORE.md`.
- Upload the approved ZIP to the draft store item and perform the final store submission.

The repository work may verify that the public policy URL is reachable and that a real current screenshot exists, but it must not mark the Developer Dashboard or store submission complete without maintainer action.
