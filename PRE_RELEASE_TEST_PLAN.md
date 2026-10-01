# Save Web as PDF 0.5.1 — Pre-release Verification Record

This file separates prior maintainer verification, automated checks for the current candidate, current manual browser checks, intentionally deferred coverage, and work reserved for the maintainer. Do not treat an item from one category as evidence for another.

## Prior maintainer verification — do not repeat as a release blocker

- **Windows without development tools:** the maintainer reports successful installation and use on a Windows computer without Node.js, npm, TypeScript, esbuild, or project dependencies.
- **macOS:** the maintainer reports successful testing on macOS. No unreported machine or browser details are inferred.
- **Previously designated real websites:** the maintainer reports the designated Zhihu and other real-site cases passed for the version they tested. Future real-site compatibility checks remain with the maintainer unless a new request says otherwise.

These results establish prior platform and compatibility coverage. They do not claim that the maintainer already tested the new 0.5.1 pagination and filename changes.

## Current 0.5.1 automated verification

Record the actual result when the candidate is built:

- [x] TypeScript typecheck
- [x] Filename regression tests, including Unicode, illegal characters, reserved names, blank input, byte limits, and repeated `.pdf` suffixes
- [x] Export-plan regression tests, including the single-page boundary, maximum-height fallback, long-page planning, page counts, and PDF header/EOF validation
- [x] All 11 locale catalogs have matching keys and valid placeholders
- [x] Popup/source checks
- [x] Production build
- [x] Release-package validation, archive-root manifest, and absence of source/development debris
- [x] Runtime bundles contain no Node-only API or personal/local path leakage

These checks passed on 2026-10-01 using the 0.5.1 candidate. The validated archive contained 27 runtime files with `manifest.json` at its root.

## Current 0.5.1 controlled Chrome regression

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

## Current 0.5.1 auxiliary and interruption checks

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
