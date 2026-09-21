# Project Context — Save Web as PDF

> Primary source of truth for project context across AI tools and development sessions.
>
> Last reviewed: 2026-09-21. Evidence was taken from the reviewed 0.4.5 beta snapshot and the authoritative Git checkout of GitHub `main`. The last remote commit before this beta sync was `7700017c1ecac67d11c0841e0acdb5aa16532162`; see sections 12–14 for current status and Git rules.

## 1. Project Overview

Save Web as PDF is a local-first Chrome extension for saving the current webpage as a searchable, selectable-text PDF. It prepares dynamic pages for printing, supports optional element removal before export, and opens the generated document in an extension preview before download.

- Primary users: desktop Google Chrome users who want a clean archival PDF of a webpage.
- Product goals: preserve readable page content, avoid screenshot-only output, require no backend or account, and work without Node.js or build tools on the end user's computer.
- Current maturity: pre-release/beta. GitHub's latest published release is `v0.4.2`; source version `0.4.5` is the current beta and is not an approved public release.
- Repository: `https://github.com/zhu-mingjie/save-web-as-pdf`
- Default branch: `main`

## 2. Tech Stack

| Area | Technology |
| --- | --- |
| Extension platform | Chrome Extension Manifest V3, minimum Chrome 120 |
| Runtime language | TypeScript compiled to browser-native ES modules (ES2022) |
| Browser APIs | Chrome extensions APIs, Chrome DevTools Protocol, DOM/Web APIs, IndexedDB |
| UI | Plain HTML and CSS; no UI framework |
| Build tooling | Node.js 20+, npm, TypeScript, esbuild |
| Tests/checks | TypeScript typecheck plus Node-based filename, export, localization, build, and release-package checks |
| Backend/database/auth | None. PDF data is temporarily stored in local IndexedDB; operation state uses `chrome.storage.session` |
| Runtime third-party dependencies | None identified; development dependencies are `@types/chrome`, `esbuild`, and `typescript` |

Node.js, npm, TypeScript, and esbuild are development/build tools only. A built `dist/` directory or release ZIP must install and run directly in Chrome on a clean Windows or macOS computer without those tools.

## 3. Repository Structure

```text
.
├── manifest.json                 # MV3 manifest and permission declarations
├── src/
│   ├── background/               # Service worker, debugger session, PDF generation
│   ├── page/                     # Page preparation, capture rules, state restoration
│   ├── editor/                   # Interactive element-removal mode and history
│   ├── popup/                    # Toolbar popup UI and operation controls
│   ├── preview/                  # Local PDF preview and final download
│   └── shared/                   # Messages, types, filename/i18n/storage helpers
├── _locales/                     # Chrome i18n catalogs for 11 locales
├── icons/                        # Extension icon sizes referenced by the manifest
├── scripts/                      # Build, test, package, and release verification scripts
├── assets/ and store-assets/     # Project and Chrome Web Store assets
├── README.md                     # User/developer overview
├── CHROMEWEBSTORE.md             # Store listing, permissions, privacy, and readiness notes
├── PRE_RELEASE_TEST_PLAN.md      # Manual cross-platform and website acceptance plan
├── RELEASING.md                  # Existing release procedure; see known policy conflict below
├── LICENSE                       # MIT license
├── PROJECT_CONTEXT.md            # Primary cross-AI project context
├── AGENTS.md                     # Repository-wide agent instructions
└── CLAUDE.md                     # Claude-specific entry point
```

Generated or local-only directories include `node_modules/`, `dist/`, `release/`, `.pnpm-store/`, and `.agents/`. They are not source of truth and should not be committed.

## 4. Architecture

### Save flow

1. The popup sends a typed runtime message for the active-tab operation.
2. The MV3 service worker validates the sender, maintains per-tab operation state in `chrome.storage.session`, and injects the required page code.
3. The page agent/preparer loads lazy content, waits for page stability, applies capture-specific rules, freezes unstable viewport-height behavior, and returns measured content dimensions.
4. The background debugger session attaches through the Chrome DevTools Protocol and calls `Page.printToPDF`, receiving the PDF through a protocol stream.
5. The PDF generator validates the resulting page count and restores page state and the debugger connection even on failure or cancellation.
6. The completed PDF and safe filename are written to IndexedDB, and an extension preview tab is opened.
7. The preview consumes the one-time local record, embeds the PDF, and downloads it through `chrome.downloads` when requested.

### Editing flow

The popup can enter an injected editor mode. The user selects page elements to remove and can undo, redo, restore, cancel, or continue to save. Page mutations are tracked so cleanup can restore the original page.

### Capture modes

- `full-page`: general webpage preparation and export.
- `zhihu-answer`: keeps the full question-header context and the target answer while suppressing unrelated page branches and fixed UI.
- `loaded-snapshot`: preserves content already loaded in feed/infinite-scroll pages instead of forcing unbounded scrolling.

### Data and trust boundaries

- There is no application server, account system, analytics endpoint, advertising SDK, or remote database.
- Operation status is session-scoped in `chrome.storage.session` so it survives service-worker suspension but clears with the browser session.
- Generated PDFs are temporary IndexedDB records in database `save-web-as-pdf`, store `pdfs`, with a 24-hour cleanup horizon. `takePdf` removes a record when the preview consumes it.
- Page URLs are sanitized before use; query strings and fragments are not retained as document metadata.
- Runtime messages and tab identities are validated at extension boundaries.

## 5. Key Technical Decisions

- **Searchable print output, not screenshots.** Chrome's print pipeline preserves text selection, searchability, links, and vector content. No screenshot fallback is used.
- **Adaptive page strategy.** Pages within Chrome's practical single-page limit are exported as one continuous page with rounding retries. Longer pages are exported as multiple pages using the largest practical page height so each page holds as much content as possible. This behavior exists in the local snapshot and still requires release-level browser testing.
- **Narrow permissions.** The manifest declares `activeTab`, `scripting`, `debugger`, `downloads`, and `storage`, with no host permissions and no `tabs` permission. Do not broaden permissions without a concrete requirement and updated store justification.
- **Explicit page preparation and restoration.** Dynamic/lazy content is prepared before printing, but all temporary styles and mutations must be recoverable after success, cancellation, or error.
- **Site-specific handling only where justified.** Zhihu answer and feed behavior use targeted capture rules; general logic remains site-independent.
- **Ephemeral service worker.** Durable operation state belongs in Chrome storage rather than service-worker globals.
- **One-time local PDF handoff.** IndexedDB bridges background generation and preview without network transfer or long-lived file retention.
- **Unicode-safe filenames.** Titles are decoded, common mojibake is repaired, normalized to NFC, stripped of Windows-forbidden characters/reserved names, and capped at 180 UTF-8 bytes.
- **No runtime framework or dependency bundle.** Plain DOM/CSS and bundled TypeScript keep the runtime small. The historical rationale for selecting esbuild over alternatives is not documented and should not be invented.

## 6. Coding Conventions

- Use strict TypeScript and browser-compatible ES modules.
- Prefer `async`/`await` and explicit cleanup through `try`/`finally` for debugger, page-state, and temporary-style lifecycles.
- Keep runtime message contracts and shared data shapes in `src/shared/`; narrow untrusted payloads before use.
- Keep pure rules, such as filename sanitization and print planning, separable and testable.
- Use Chrome i18n message keys for user-facing text and keep all 11 locale catalogs structurally consistent.
- Keep extension HTML free of inline scripts and event handlers; bind behavior from bundled modules.
- Preserve the existing compact visual language. Avoid unrelated UI or architecture refactors in targeted fixes.
- Use two-space indentation and semicolons, matching the current TypeScript and JavaScript style.
- Comment non-obvious browser constraints and cleanup invariants, not self-evident syntax.
- Never introduce Node-only runtime APIs or imports such as `fs`, `path`, `child_process`, or reliance on global `process` into browser bundles.

## 7. High-Risk Areas

- **`manifest.json` and permissions:** changes affect user trust, Chrome Web Store review, and what tab data is accessible. Reconcile every change with `CHROMEWEBSTORE.md`.
- **Debugger/PDF generation:** `src/background/debugger-session.ts` and `pdf-generator.ts` manage an exclusive browser resource, hard Chrome dimension limits, rounding behavior, streams, cancellation, and page-count validation. Always detach and restore state.
- **Page preparation and cleanup:** mutations run inside arbitrary third-party pages. Fixed/sticky elements, lazy loading, CSS transforms, cross-origin stylesheets, infinite feeds, and site updates can break measurement or restoration.
- **Special-site capture rules:** selector changes can silently omit the intended question/answer or include unrelated content. Verify against live representative URLs.
- **Temporary PDF storage:** object/data lifetime, size, one-time consumption, and stale-record cleanup affect privacy and memory use.
- **Filename handling:** regressions can produce mojibake, invalid Windows filenames, truncation bugs, or unexpected paths.
- **Localization:** one missing or malformed key can break the popup or Chrome manifest text in a locale. Run the catalog checks after changing user-facing copy.
- **Build/package scripts:** the release ZIP must contain only browser runtime files, with `manifest.json` at its root and no source maps, TypeScript, local paths, credentials, or development tools.

## 8. Environment Variables and External Services

- No required environment variables were found.
- No `.env` files, credentials, API keys, OAuth configuration, analytics services, backend services, or external database connections were identified.
- Chrome permissions are declared in `manifest.json`; Chrome debugger access is visible to the user while active.
- The extension is expected to operate locally. Introducing any data transmission is a privacy-significant architectural change requiring explicit approval, code review, disclosure updates, and tests.
- A heuristic scan of the current snapshot and available Git history found no credential/private-key patterns as of 2026-09-21. This is not a substitute for a dedicated secret scanner before making the repository public.

## 9. Local Development

Prerequisites: Node.js 20+, npm, and Chrome 120+.

```bash
npm ci
npm run check
```

For manual testing:

1. Run `npm run build`.
2. Open `chrome://extensions` in Chrome.
3. Enable Developer mode.
4. Choose **Load unpacked** and select the generated `dist/` directory.
5. Test normal save, edit-then-save, cancellation, restricted pages, long pages, localized UI, filename behavior, and preview/download behavior.

Do not load the repository root as the extension. `dist/` is the installable development artifact.

## 10. Build and Packaging

```bash
npm run typecheck       # TypeScript only
npm run test:filename   # Filename encoding and cross-platform safety
npm run test:export     # Print planning and export behavior
npm run test:i18n       # Catalog shape, fallback, and localization integrity
npm run build           # Bundle five browser entry points and copy runtime assets
npm run check           # Typecheck + focused tests + build validation
npm run package         # Clean, test, build, validate, and create the release ZIP
npm run verify:release  # Validate an existing release artifact
```

- `dist/` is the unpacked Chrome extension and has `manifest.json` at its root.
- The release artifact is `release/save-web-as-pdf-vX.X.X.zip`.
- The package validator rejects common repository/development debris, including `.git`, `node_modules`, source TypeScript/maps, macOS/Windows metadata, and local-path or localhost leakage.
- Run `npm run check` before `npm run package`; packaging includes focused tests but is not a replacement for an explicit typecheck unless the script is updated.
- A release candidate is not complete until the ZIP is installed and exercised on clean Windows and macOS systems without Node.js or other development tools.

## 11. Deployment and Distribution

- There is no backend or website deployment pipeline in this repository.
- Development builds are loaded unpacked from `dist/`.
- Public distribution is intended through the Chrome Web Store and GitHub Releases.
- `CHROMEWEBSTORE.md` is the store-submission source for listing copy, permission justifications, privacy disclosures, assets, and readiness checks.
- The privacy-policy URL is still marked as required before submission; it must be hosted and matched to the Chrome Web Store data-use declarations.
- No automated CI/CD or store-publishing workflow was found. Exact production signing/upload steps remain manual unless a future reviewed workflow is added.
- GitHub tags and Releases are release events, not routine backup steps. Create them only after the user explicitly approves that version for release.

## 12. Current Development Status

### Confirmed on GitHub

- GitHub `main` currently ends at `7700017c1ecac67d11c0841e0acdb5aa16532162` (`fix: restore readable webpage-title filenames`, 2026-09-18).
- A fresh read-only clone was aligned with `origin/main`, so there were no unpushed commits in that clone.
- Published tags/releases found: `v0.3.1`, `v0.4.1`, and `v0.4.2`; `v0.4.2` is the latest published release.

### Current local snapshot

- The local version is `0.4.5`.
- The authoritative checkout uses `main` and tracks `origin/main` at `https://github.com/zhu-mingjie/save-web-as-pdf.git`.
- The reviewed beta contained 23 tracked-file changes relative to the previous GitHub `main` (170 insertions, 64 deletions before workflow-document updates).
- Those changes were confirmed as cohesive 0.4.5 beta work: adaptive long-page pagination and tests, compact popup status/error layout, synchronized localization/store/test documentation, and version/build metadata after `v0.4.2`.
- The approved AI handoff files and minimal secret/local-file ignore patterns are included with this beta source sync.
- Local prompt and analysis Markdown files were intentionally excluded from the public repository.

### Next recommended steps

1. Continue manual beta testing from the built `dist/`, especially Wikipedia long pages, Zhihu answer pages, popup error expansion, localized filenames, and clean-device installs.
2. Record reproducible compatibility issues without broadening permissions or changing capture semantics silently.
3. Create a tag, public package, or GitHub Release only after the user explicitly confirms testing passed and requests publication.

## 13. Known Issues and Technical Debt

- There is no automated real-Chrome end-to-end suite; critical behavior still depends on manual website and clean-device testing.
- There is no CI workflow enforcing typecheck, focused tests, packaging validation, or secret scanning on pushes.
- The Chrome Web Store privacy-policy URL is unresolved, and store screenshots may need refresh after UI changes.
- `README.md` still describes no automatic pagination, but the local PDF logic now intentionally paginates pages that exceed the practical single-page limit.
- `README.md` and `RELEASING.md` now distinguish routine beta source commits/pushes from explicitly approved public tags and Releases.
- Chrome printing remains sensitive to cross-origin stylesheet access, canvas/media content, virtualized lists, viewport-dependent layouts, lazy resources, and site DOM changes.
- The editor's pointer-driven selection needs continued keyboard/accessibility review.
- The local mirror is not a Git checkout. Treat content comparisons as an audit aid, not a substitute for `git status` in the actual working clone.
- Local-only prompt/analysis Markdown files must be reviewed intentionally before any future commit; do not assume they belong in the public repository.
- The local version (`0.4.5`) is ahead of the latest published tag (`v0.4.2`), so version history and release notes must be reconciled before the next approved release.

## 14. Git Workflow

This section is the default authorization model for future AI-assisted work in this repository.

1. Before editing, read this file, inspect the actual working tree, identify the active branch and remote, and review uncommitted and unpushed work.
2. Preserve user changes. Do not discard, overwrite, stage, or include unrelated changes.
3. Make the smallest coherent change that satisfies the task; avoid unrelated refactors.
4. Run checks proportional to risk. For meaningful extension changes, prefer `npm run check` plus targeted manual tests; package/release verification is required for release candidates.
5. Update this document when architecture, workflow, status, important decisions, risks, or next steps materially change.
6. After a meaningful task or test version is complete and verified, create a clear, scoped commit and push the current branch to GitHub so the work is backed up and reversible.
7. If multiple unrelated changes exist, split them into separate commits or ask before combining them.
8. Never commit secrets, credentials, private keys, personal local paths, generated dependencies, or unnecessary build artifacts.
9. Do not rewrite public history, force-push, delete branches/tags/releases, or run destructive Git commands without explicit user authorization.
10. A normal commit/push is not a release. Do not create or publish a Git tag, GitHub Release, Chrome Web Store submission, or other release artifact unless the user explicitly approves that release.
11. Before any approved release, synchronize versions, run the full test/package checklist, prepare concise user-facing release notes, and let the user perform any explicitly reserved final publish action.
12. Task-specific user instructions override this default. For the 2026-09-21 handoff task, the user explicitly requested review before any commit or push.

## 15. AI Agent Working Rules

- Treat this file as the primary cross-session context. Read it before planning substantive work.
- Verify statements against repository files and current Git state. Label unknowns; never invent infrastructure, commands, credentials, or historical rationale.
- Follow `AGENTS.md`; Claude-based tools must also read `CLAUDE.md`.
- In a ChatGPT project mirror, treat `sources/` as read-only synchronized reference material.
- Stay within requested scope. Do not modify business logic during audits, documentation-only tasks, or diagnosis-only tasks.
- For Chrome extension changes, protect MV3 compatibility, declared-permission minimality, service-worker ephemerality, CSP constraints, cleanup invariants, localization parity, and browser-only runtime compatibility.
- Never add remote code execution, runtime-loaded scripts, telemetry, data transmission, or broader permissions without explicit approval and corresponding privacy/store documentation.
- Inspect generated bundles for Node-only runtime dependencies and local-path leakage before release.
- Report tests actually run and their results; do not claim manual browser or cross-platform coverage that was not performed.
- At handoff, summarize changed files, validation, Git status, remaining risks, and the safest next action. Update the handoff log below when the information will help the next session.

## 16. Handoff Log

### 2026-09-21 — Codex

- **Worked on:** initialized durable project context and cross-AI operating instructions; audited repository structure, architecture, build/release workflow, current GitHub state, local-vs-remote differences, and secret/local-path risk.
- **Changed:** `PROJECT_CONTEXT.md`, `AGENTS.md`, `CLAUDE.md`, and minimal `.gitignore` safety patterns only.
- **Important decisions:** `PROJECT_CONTEXT.md` is the primary context source; meaningful verified work normally gets committed and pushed for backup, while tags and GitHub Releases require explicit user approval; this task itself must remain uncommitted/unpushed pending review.
- **Current state:** local snapshot `0.4.5`; GitHub `main` at `7700017`; latest published release `v0.4.2`; current mirror has no `.git` directory and includes substantial source/doc changes beyond GitHub `main`.
- **Validation:** heuristic current-tree and available-history scans found no credential/private-key/local-path indicators. Documentation consistency and ignore behavior were checked. The full existing check script passed (TypeScript, filename, export logic, all 11 locale catalogs, and build); no business source was edited.
- **Remaining work:** complete manual browser and clean-device acceptance testing before any approved public release.
- **Recommended next step:** continue testing the source-only 0.4.5 beta; fix any reproducible regression in a scoped commit, and wait for explicit release approval before tagging or publishing.

### 2026-09-21 — Codex (0.4.5 beta source sync)

- **Worked on:** moved from the ChatGPT project mirror to an authoritative Git checkout, verified `origin/main`, audited all 23 pre-existing beta differences, and unified the Git/Release workflow documentation.
- **Confirmed beta scope:** maximum-height pagination for overlong pages, focused export regression coverage, compact popup status/error behavior, matching localization and product documentation, and synchronized `0.4.5` version metadata.
- **Excluded:** local prompt/analysis files, generated build output, dependencies, credentials, tags, GitHub Releases, and public release packages.
- **Validation:** the existing typecheck, filename tests, export-logic tests, localization tests (11 catalogs, 58 messages), and production build passed before this source sync. The built bundles contained no detected Node-only runtime or personal local-path markers.
- **Release state:** source-only beta; no tag or public release is authorized by this handoff.
