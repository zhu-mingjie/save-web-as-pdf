# Project Context — Save Web as PDF

> Primary source of truth for project context across AI tools and development sessions.
>
> Last reviewed: 2026-10-10. Current 0.5.5 layout/metadata fix builds on the 0.5.4 UI and 0.5.3 implementation; controlled verification supersedes the 0.5.2 compatibility/deadline findings below. Previous review: 2026-10-08. Evidence was taken from a fresh development clone of GitHub `main` at `0072dc8`, the surviving project mirror/test ZIP, and accessible prior chat records; see sections 12–14 and the newest handoff entry. Historical browser tests remain explicitly historical.

## 1. Project Overview

Save Web as PDF is a local-first Chrome extension for saving the current webpage as a searchable, selectable-text PDF. It prepares dynamic pages for printing, supports optional element removal before export, and opens the generated document in an extension preview before download.

- Primary users: desktop Google Chrome users who want a clean archival PDF of a webpage.
- Product goals: remain free and open source under MIT, preserve readable page content, avoid screenshot-only output, require no backend or account, and work without Node.js or build tools on the end user's computer.
- Current maturity: released beta. GitHub Release `v0.5.5` is published with the current metadata/settings and PDF fixes; Chrome Web Store submission remains maintainer-owned.
- Repository: `https://github.com/zhu-mingjie/save-web-as-pdf`
- Default branch: `main`

## 2. Tech Stack

| Area | Technology |
| --- | --- |
| Extension platform | Chrome Extension Manifest V3, minimum Chrome 120; 0.5.3 legacy/API adapter tested in actual Chrome 120 on macOS |
| Runtime language | TypeScript compiled to browser-native ES modules (ES2022) |
| Browser APIs | Chrome extensions APIs, Chrome DevTools Protocol, DOM/Web APIs, IndexedDB |
| UI | Plain HTML and CSS; no UI framework |
| Build tooling | Node.js 22.13+, npm, TypeScript, esbuild |
| Tests/checks | TypeScript typecheck plus Node-based filename, export, localization, popup UI/link, build, and release-package checks |
| Backend/database/auth | None. PDF data is temporarily stored in local IndexedDB; operation state uses `chrome.storage.session`; language/header/footer preferences use `chrome.storage.local` |
| Runtime third-party dependencies | Locally bundled `pdfjs-dist` 6.3.289 (Apache-2.0) and `pdf-lib` 1.17.1 (MIT); development dependencies are `@types/chrome`, `esbuild`, and `typescript` |

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
├── README.md                     # Concise user overview
├── DEVELOPMENT.md                # Development installation, build and targeted checks
├── CHROMEWEBSTORE.md             # Store listing, permissions, privacy, and readiness notes
├── PRE_RELEASE_TEST_PLAN.md      # Manual cross-platform and website acceptance plan
├── RELEASING.md                  # Packaging, source backup and publication rules
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
5. The PDF generator rechecks prepared/current dimensions using the identical injected DOM helper (CDP content dimensions separately size the paper), validates the resulting page count and restores page state and the debugger connection even on failure or cancellation.
6. The completed PDF and safe filename are written to IndexedDB, and an extension preview tab is opened.
7. The preview consumes the one-time local record. For multi-page PDFs within the resource budget, local PDF.js rendering finds the last page's painted, image, and annotation boundary. If the boundary and page boxes are safe, pdf-lib raises only the last page's lower page-box edge, retaining about 4 mm bottom padding.
8. The rewritten PDF must preserve page count, every earlier page box, final-page text and annotations, expected dimensions, the PDF envelope, and the white-composited rendered top region. Any ambiguity, timeout, limit, parse/write error, or validation mismatch keeps the original valid PDF.
9. The preview embeds the selected original or verified optimized PDF and uses that same object URL for the requested `chrome.downloads` save.

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
- **Adaptive page strategy.** Pages within Chrome's practical single-page limit are first exported as one continuous page with bounded rounding retries. If Chrome still returns multiple pages, the shared generator remeasures the stabilized layout and replans at the verified 200-inch maximum height; a complete valid multi-page result is accepted. This rule is shared by full-page, edited-page, focused-site, and snapshot capture modes.
- **Narrow permissions.** The manifest declares `activeTab`, `scripting`, `debugger`, `downloads`, and `storage`, with no host permissions and no `tabs` permission. Do not broaden permissions without a concrete requirement and updated store justification.
- **Explicit page preparation and restoration.** Dynamic/lazy content is prepared before printing, but all temporary styles and mutations must be recoverable after success, cancellation, or error.
- **Site-specific handling only where justified.** Zhihu answer and feed behavior use targeted capture rules; general logic remains site-independent.
- **Ephemeral service worker.** Durable operation state belongs in Chrome storage rather than service-worker globals.
- **One-time local PDF handoff.** IndexedDB bridges background generation and preview without network transfer or long-lived file retention.
- **Unicode-safe filenames.** Titles and the current preview input are decoded, common mojibake is repaired, normalized to NFC, stripped of Windows-forbidden characters/reserved names, capped at 180 UTF-8 bytes, and given exactly one `.pdf` suffix before the download request.
- **No runtime UI framework; two scoped PDF dependencies.** Plain DOM/CSS and bundled TypeScript remain in use. PDF.js is bundled only for local PDF parsing/rendering and pdf-lib only for last-page box updates. Their license texts ship in `dist/licenses/`; no remote code, Node runtime, optional native canvas package, or additional Chrome permission is included.
- **Conservative final-page shortening.** Normal adaptive single-page PDFs are unchanged; oversized single pages produced by maximum-height fallback now opt in. All eligible inputs are limited to 64 MiB, four million render pixels, a 12-second render timeout within one hard 20-second total budget. The outer worker is terminated on every result/error/timeout/cancel, including synchronous parsing/rewrite work. Full-page non-white/gradient backgrounds, rotations, nonmatching MediaBox/CropBox values, small savings, and all failed validations preserve the original page.
- **Persistent settings and document metadata.** The supplied gear opens a three-row native-select view, with automatic/manual language and independently optional header/footer. Both default to none. Storage change events update runtime popup/editor/preview localization; native manifest localization still follows Chrome. Export snapshots choices and one local timestamp with UTC offset. Isolated metadata hosts occupy normal document flow before/after the prepared body and enter the common measurement/pagination and final-boundary pipeline. Canonical URL encoding preserves Unicode paths without requiring metadata CJK fonts, strips only query/fragment, and remains clickable. Noto Sans and PDF resources are local and licensed.
- **Popup resource links are explicit and local-first.** Website, support, and GitHub destinations are configured in `src/popup/links.ts` and open only after a user click. `CHROME_WEB_STORE_REVIEW_URL` is intentionally empty until a stable store review URL exists; the visible rating entry remains disabled without navigation or export side effects.

### Compatibility and settings reference retained from the former README

Automatic language follows Chrome's display language (including the OS language when Chrome follows it), with Chrome's regional matching and English fallback. There is no webpage-language detection, location lookup or network translation. All 11 locale catalogs remain available: English, Simplified/Traditional Chinese, German, Italian, Spanish, Brazilian/European Portuguese, French, Japanese and Korean. Preferences save immediately; the settings view may widen for long labels/options and returning home restores the compact 320 px view.

Disabled header/footer reserve no document space; long canonical URLs wrap. The detailed metadata/worker decisions above and dated [verification records](PRE_RELEASE_TEST_PLAN.md) retain the former README's technical claims and their evidence boundaries.

Chrome internal/store/protected pages cannot be accessed. Another debugger or DevTools owning the source tab may conflict with export. Extremely wide pages can exceed Chrome/PDF-viewer limits even at the minimum print scale. Infinite-scroll preparation is bounded by time, iterations and height. Viewport stabilization depends on inspectable styles; cross-origin or script-generated styles can cause differences, missing content or failure. Canvas, WebGL, video, cross-origin frames and site-specific CSS are not guaranteed selectable/vector output. Zhihu feeds capture already-loaded content; supported direct answers retain the main question and target answer, and unsafe identification stops instead of selecting different content. These limits do not imply universal website support.

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

Prerequisites: Node.js 22.13+, npm, and Chrome 120+.

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


### Reusable cloud setup (pending execution)

The 2026-10-08 cloud-handoff request was received in a restricted macOS host, not a Codex cloud checkout. Do not treat its local check results as cloud readiness. Select this GitHub repository in an actual cloud task and re-inspect the checkout before continuing.

- Configure Node.js >=22.13.0 with npm available on PATH; use a supported version satisfying the committed package requirements. No dependency or lockfile migration is needed.
- In the cloud environment setup, run `node --version`, `npm --version`, and `npm ci` from the actual Git repository root. Re-run `npm ci` when the lockfile changes or the dependency cache is absent.
- Setup must be able to reach GitHub for source and the package registry referenced by `package-lock.json` (currently `registry.npmjs.org`). Check DNS, HTTPS and repository authorization rather than changing dependencies when access fails. Never put credentials in the repository.
- Run `npm run check` in that environment and confirm `package.json` and `package-lock.json` remain unchanged. The check script performs typecheck, filename/export/i18n/popup checks, and the browser production build; it does not perform installed-extension acceptance.
- PDF integration additionally requires a Chrome/Chromium executable, a writable temporary profile, permission to listen on loopback, and access to Chrome's local debugging port. Set `CHROME_PATH` to the installed executable when needed, then run `npm run test:pdf-integration`. The existing Linux default is `google-chrome`; root containers or restricted sandboxes may not support the existing Chrome launch. Record unsupported conditions instead of weakening the sandbox or modifying product code.
- Before switching machines, commit/push meaningful verified work using the established branch/PR workflow. A remote backup does not update another local checkout automatically. If work exists only on a different Mac checkout, supply its committed branch or patch plus untracked source files; this session cannot certify those unseen changes.
- For future requested acceptance, provide a version/commit-identified downloadable test ZIP (not a public Release), installation steps, and a brief full-save/edit-save, searchable-text, filename, preview/download and long-page checklist. Preserve the release-approval policy.

## 10. Build and Packaging

```bash
npm run typecheck       # TypeScript only
npm run test:filename   # Filename encoding and cross-platform safety
npm run test:export     # Print planning and export behavior
npm run test:i18n       # Catalog shape, fallback, and localization integrity
npm run test:popup      # Popup resources, links, review configuration, and layout contracts
npm run build           # Bundle browser entry points and copy runtime assets
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
- The selected public privacy-policy URL is `https://miengieh.com/save-web-as-pdf/privacy/`. It returned HTTP 200 without sign-in on 2026-10-01 and its content matched the current local processing, permissions, retention, external-link, and support-email behavior. Developer Dashboard entry is tracked separately and remains with the maintainer.
- No automated CI/CD or store-publishing workflow was found. Exact production signing/upload steps remain manual unless a future reviewed workflow is added.
- GitHub tags and Releases are release events, not routine backup steps. Create them only after the user explicitly approves that version for release.

## 12. Current Development Status

### Confirmed on GitHub

- Before the 0.4.6 popup work, the authoritative checkout and `origin/main` were aligned at `f98fa0667ad776b4604969d02eecb8bd801f2aee` (`feat: sync 0.4.5 beta source and AI handoff docs`).
- Published tags/releases include `v0.3.1`, `v0.4.1`, `v0.4.2`, `v0.5.1`, and `v0.5.5`; `v0.5.5` is the latest published release.
- Release `v0.5.1` was created from source commit `5d7b98bae2a9bc21c4f89704b56721994bb0b650` with the verified `save-web-as-pdf-v0.5.1.zip` asset. Its local release artifact SHA-256 was `09730c1b499c2558b2e0f41ceaf60ceac7a2be081b047ed518618d259f786e26`.

### Current local snapshot

- The candidate version is `0.5.5` (layout/metadata test fix following the 0.5.4 UI revision). On 2026-10-09, GitHub `main` was fetched/confirmed at `a249118`; the actual local checkout had clean branch `docs/cloud-handoff-2026-10-08` at `7c2467c`, containing one unpushed documentation commit. That work was preserved by starting `fix/pdf-height-settings` from it. No reset/pull or overwrite was performed.
- The ChatGPT project root is a non-Git mirror still containing 0.5.0 source/context plus later delivery artifacts. Do not use its source or build output as the current development baseline. The development clone is now `repositories/save-web-as-pdf/` relative to that mirror. Work inside the clone and read its `AGENTS.md` and this file. Preserve synchronized mirror files.
- Both earlier temporary development directories were found with incomplete `.git` remnants and no surviving source files. Their current uncommitted/unpushed state cannot be reconstructed or certified clean. The new clone started clean and aligned with `origin/main`; it does not prove that all historical local work was pushed. Surviving mirror source/script/locale differences match sampled historical commits; its globe SVG differs only in surrounding whitespace. No unique unbacked source change was found in that comparison.
- The authoritative checkout now uses development branch `fix/pdf-height-settings`; remote remains `https://github.com/zhu-mingjie/save-web-as-pdf.git`.
- The 0.5.3 candidate fixes fallback-single-page eligibility and minimum-browser initialization, moves optional PDF processing into one terminable worker, and adds the requested local language/header/footer settings while retaining the common capture, filename, preview/download and editor pipeline. Earlier 0.5.2 behavior and historical tests follow for provenance.
- Controlled real-PDF tests on 2026-10-02 covered two and three pages; text, image, table, SVG, link, shallow-color, and shadow endings; full-page gradient fallback; a nearly full last page; and a single-page no-op. The representative last page changed from 14,400 pt to 203.677 pt with about 15 pt measured bottom whitespace, while page count, page 1, extracted text, annotations, and visual top content remained unchanged.
- `pdfjs-dist` 6.3.289 and `pdf-lib` 1.17.1 are exact runtime dependencies. The former 0.5.2 `dist/` was approximately 2.2 MiB. The 0.5.3 build includes legacy parser/display code, local CMaps/standard fonts, Noto Sans, and their license texts, and contains no detected Node-only runtime imports or calls.
- The popup website, support, and GitHub destinations are active. The rating text is present but intentionally disabled because `CHROME_WEB_STORE_REVIEW_URL` remains empty.
- The approved AI handoff files and minimal secret/local-file ignore patterns are included with this beta source sync.
- Local prompt and analysis Markdown files were intentionally excluded from the public repository.

### Next recommended steps

1. Have the maintainer install the 0.5.5 test ZIP and retest the reported failing Wikipedia pages with their original header/footer choices. The new bug report authorizes targeted Wikipedia diagnosis; it does not require repeating the broader maintainer-owned site list or the Windows acceptance matrix. Exact failing URLs/settings and browser build remain unconfirmed. Preserve the pending Windows full-save/edit-save, preview/download and height acceptance from 0.5.3.
2. Keep the prior 0.5.1/0.5.2 evidence and the new controlled Mac/Chrome 120/current matrix distinct from Windows/Linux installed acceptance. Recheck actual minimum-browser behavior whenever the PDF dependency changes; upstream's general legacy baseline remains newer than Chrome 120.
3. Before a separately approved Chrome Web Store submission, synchronize the website privacy policy and refresh the store screenshot/settings disclosures. GitHub v0.5.5 was explicitly authorized and published on 2026-10-10; store submission remains unauthorized.

## 13. Known Issues and Technical Debt

- **0.5.2 compatibility/deadline findings resolved in the 0.5.3 candidate:** the prior modern PDF.js build failed a missing-`Promise.withResolvers` probe and initialized outside the fallback `try`. Legacy initializes bundled core-js before PDF API use; actual Chrome 120 additionally reproduced `TypeError: ... is not async iterable`, resolved by a local feature-detected ReadableStream iterator in the optimization context. Actual Chrome 120 controlled PDF tests establish a narrower project baseline than upstream's advertised Chrome 125+ legacy support; they do not establish every site or OS. Dependency versions and manifest minimum are unchanged.
- **Height regression evidence:** old preview logic unconditionally skipped single-page PDFs, including a maximum-height fallback whose final page count became one. The new print result explicitly carries fallback eligibility. A mock debugger reproduces three rejected adaptive two-page attempts followed by a valid maximum-height one-page result, and actual browser PDFs verify it shortens without losing text/links. This does not prove it is the sole cause on the user's Windows machine.
- **Deadline scope:** the prior 20-second loop-boundary budget was cooperative only. The new client deadline starts before worker construction and terminates its complete parser/render/scan/rewrite/validation context; no nested parsing worker is created. Timeout keeps the original PDF with a visible notice; user cancellation creates no object URL. The budget is for optional optimization, not Chrome printing or webpage preparation.
- **Conservative limitations:** gradients/full-page backgrounds, unusual boxes/rotation, unsupported nonidentity transfer filters, resource limits and failed validation keep the complete original with diagnostics. Worker raster detection does not rewrite body text/images. Full image extents and annotations are included even for soft masks.
- There is now a controlled real-Chrome PDF/settings/lifecycle suite, but it does not replace installed full-flow, manual website and OS acceptance.
- There is no CI workflow enforcing typecheck, focused tests, packaging validation, or secret scanning on pushes.
- The public privacy-policy URL is selected and verified; Developer Dashboard entry remains maintainer-owned.
- The 640×400 store screenshot is a real capture from the installed 0.5.1 build. Future UI changes must refresh it before store submission.
- Actual VoiceOver announcement and a reliable navigation/tab-close interruption test were not completed in the current automation environment. Docked DevTools did not reproduce a debugger conflict because the tested Chrome build allowed the export to complete.
- `README.md` and `RELEASING.md` now distinguish routine beta source commits/pushes from explicitly approved public tags and Releases.
- Chrome printing remains sensitive to cross-origin stylesheet access, canvas/media content, virtualized lists, viewport-dependent layouts, lazy resources, and site DOM changes.
- The editor's pointer-driven selection needs continued keyboard/accessibility review.
- The local mirror is not a Git checkout. Treat content comparisons as an audit aid, not a substitute for `git status` in the actual working clone.
- Local-only prompt/analysis Markdown files must be reviewed intentionally before any future commit; do not assume they belong in the public repository.
- The source beta version and latest published GitHub tag are `0.5.5`. Chrome Web Store publication has not been performed by the agent.

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
13. Keep semantic-version components to a single digit for this project; after a patch reaches `.9`, advance the minor version instead of using a two-digit patch component (for example, advance `0.4.9` to `0.5.0`).

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

### 2026-10-10 — Codex (GitHub automation and safety rules)

- Added the maintainer-supplied GitHub operation/safety section to repository-root `AGENTS.md`, preserving existing instructions and consolidating the overlapping destructive-operation rule. Prefer local Git evidence; avoid redundant polling and unrelated bulk operations; serialize large API mutation batches with at least one second between consecutive requests, honor confirmed rate-limit responses, and never evade limits. Repository deletion, remote branch deletion, force push/history rewriting and permissions/security changes require explicit authorization.
- Normal editing, tests, task-related commits/pushes/PRs remain available without additional approval or artificial waits. Existing tag/Release/store authorization rules remain in force. Documentation-only change; formatting, supplied-section completeness and scope checked, with no runtime tests required. The synchronized project mirror and references are untouched.

### 2026-10-10 — Codex (concise README and development-document migration)

- **Scope/baseline:** documentation only, based on the maintainer's supplied English draft; no runtime, dependency, version, tag, Release or store change. Actual clone `repositories/save-web-as-pdf/` was clean on `fix/pdf-height-settings` at `a30151a`; after fetch, HEAD, origin/main and the remote development branch matched. The synchronized project mirror remains untouched.
- **Fact check:** manifest/package are 0.5.5, minimum Chrome 120; English control labels and 11 catalogs match the draft. Live GitHub latest-release API confirms public v0.5.5 and its packaged ZIP/checksum. Store records still report no submission and the rating URL remains empty; no authenticated Developer Dashboard evidence is available. The public privacy URL returns HTTP 200; its previously recorded persistent-preferences update remains pending. No new store acceptance is claimed. Contributor wording credits the PR #1 suggestion, not a merge.
- **Migration:** README follows the supplied structure and uses `releases/latest` with explicit packaged-ZIP installation. `DEVELOPMENT.md` contains development setup/build/checks and runtime constraints; this context retains technical/settings/compatibility details; `PRE_RELEASE_TEST_PLAN.md` retains historical evidence and gains the package acceptance procedure; `RELEASING.md` gains exact packaging commands and artifact requirements while preserving approval, source-backup and English release-note rules. No duplicate uploaded draft or collapsed long development section is added to the homepage.
- **Validation:** documentation structure, relative links, external destinations, code/manifest/script consistency and documentation-only diff are checked for this task. No build, PDF, installed-browser or OS matrix is rerun; pending manual acceptance remains unchanged. Commit/push these scoped documents to the development branch and main by normal fast-forward to update the GitHub homepage, with no force push.

### 2026-10-10 — Codex (0.5.5 published with explicit authorization)

- **Authorization change:** after being unable to open the draft link, the maintainer explicitly requested direct publication. This supersedes the earlier reserved-button restriction for this Release only; future publications still require their own explicit authorization.
- **Result:** published existing Release id `408097678` as [v0.5.5](https://github.com/zhu-mingjie/save-web-as-pdf/releases/tag/v0.5.5) on 2026-10-10 at 00:23:31 Asia/Singapore. API confirms `draft=false`, latest release is v0.5.5, and the single ZIP retains SHA-256 `04a3bc4235bda48252a184c7d4a3e16527e6a3ca9d6ef5cdab1f969827cfd7e1`, size 3,108,175 bytes. No rebuild/runtime change or new acceptance result.
- **Notes:** contributor credit, PR #1 discussion link and the exact English bug-fix closing sentence are preserved. README now links to the public Release rather than describing it as an unpublished candidate. Store status remains separate.
- **Branch protection question:** explained GitHub's unprotected-main advisory and optional Dismiss action. No branch protection, permissions or repository rules were changed; the request was explanatory.

### 2026-10-10 — Codex (0.5.5 GitHub draft and homepage preparation)

- **Authorization:** the maintainer requests a 0.5.5 GitHub Release draft with installation ZIP and English description, reserves the final Publish release button, and authorizes updating the GitHub homepage feature list. This supersedes the previous test-ZIP-only limit for draft preparation, not public publication or store submission.
- **Content:** homepage and Release acknowledge the optional webpage source URL/save-time footer and thank @xuanzhaogao, linking to PR #1. The PR was inspected and is open; no merge of its separate implementation is requested or performed. Release notes also cover settings and final-page height improvements since v0.5.1.
- **Persistent writing rule:** for future Releases that include bug fixes, end the entire English Release description with exactly: `Fixed various issues and improved the user experience.` Recorded in `RELEASING.md`; do not append installation, checksums or other sections afterward.
- **Source/artifact:** draft targets the actual verified code commit `f363fbc73bab87a348fbac248fc6826fb7acfdb3`; upload the existing `save-web-as-pdf-v0.5.5.zip` without rebuilding. SHA-256 is `04a3bc4235bda48252a184c7d4a3e16527e6a3ca9d6ef5cdab1f969827cfd7e1`, 3,108,175 bytes. Documentation-only edits do not change the delivered runtime. Synchronize the already verified development history plus these docs to main by a normal fast-forward push; no force push/reset or unrelated PR merge.
- **Verified draft:** GitHub Release id `408097678`, [draft page](https://github.com/zhu-mingjie/save-web-as-pdf/releases/tag/untagged-56824f6965d191a72665); API confirms `draft=true`, full target SHA, exact English final sentence and ZIP filename/size/SHA-256. No public tag was manually created. Homepage wording and workflow documents were checked; prior runtime tests were not repeated for documentation-only work.
- **Publication boundaries:** latest public Release remains v0.5.1 until the maintainer publishes the draft. Exact live-Wikipedia/Windows acceptance limitations from the previous handoff remain recorded; no new browser or cross-platform result is inferred from Release preparation. Chrome Web Store and website privacy/screenshot work are not part of this request.

### 2026-10-10 — Codex (0.5.5 Wikipedia-reported layout/metadata fix)

- **Report and limits:** the maintainer reports that most sites export metadata normally, but several Wikipedia pages reject with `errorLayoutChanged`. Exact URLs, selected metadata combination and browser build were requested but have not yet been supplied. Direct access to a representative Wikipedia page timed out in this environment; the resulting Chrome error page is not a Wikipedia test. No live-site pass or Windows pass is claimed.
- **Confirmed defects:** preparation measured maxima of DOM scroll/offset boxes but generation compared them against CDP's content size. These are not interchangeable for CSS scaling/clipped bodies. The previous source at `15a75a2` reproduces the same false error on a stable scaled-root fixture. Wikimedia's official Vector and legacy `normalize.less` also declare `html, body { height: 100%; }` (see [official source](https://github.com/wikimedia/mediawiki-skins-Vector/blob/master/resources/skins.vector.styles/normalize.less)). With metadata siblings, Chrome resolves this percentage height against PDF sheets, adding unnecessary pages. The previous source reproduces this independently; it is not asserted to fully explain every reported live-page failure.
- **Fix:** extracted the existing self-contained DOM measurement into `src/shared/page-metrics.ts`; the generator injects this same function before initial printing and maximum-height fallback. The existing tolerances remain unchanged, true dimension changes are still rejected, and native CDP content dimensions still determine the PDF paper. Mismatches log only dimensions. When metadata is enabled, the existing reversible viewport-style preparation also freezes html/body percentage height declarations at their current resolved pixel height. No per-domain bypass, UI/permission/dependency change or screenshot conversion.
- **Actual validation (2026-10-09–10):** check script passes. New `test:page-layout` runs production preparation/generation with actual Chrome protocol transport: 8 cases on Chrome 154.0.8037.98 and Chrome 120.0.6099.109 (old headless), covering first/last/both/no metadata, short/long percentage-height pages, a scaled root, constrained body, and a genuine post-preparation change. Short cases now print once as one page; long case prints once as two pages. Body text/end link and metadata text/links remain searchable/clickable; header/footer positions, temporary style/node/font cleanup and rejection of genuine changes pass. The previous-source run proves both regressions rather than assuming them.
- **Installed controlled flow:** actual unpacked 0.5.5 on Chrome 154 passes full-save, edit-save, real extension CSP/local resources/storage/preview worker, immediate editor language update and active-export cancel/no-new-preview on a local percentage-height fixture. Root/body height overrides, metadata fonts and editor resources are restored. This is separate from actual user file-dialog/Windows acceptance; the prior PDF raster/last-page matrix is historical and was not needlessly rerun for this change.
- **Delivery:** verified 0.5.5 test ZIP: 3,108,175 bytes, 222 files, SHA-256 `04a3bc4235bda48252a184c7d4a3e16527e6a3ca9d6ef5cdab1f969827cfd7e1`; package/build/verify-release pass and package details are recorded in `PRE_RELEASE_TEST_PLAN.md`. Scoped commit/push backup on `fix/pdf-height-settings`; no tag, GitHub Release or store submission. Retest the original Wikipedia URLs before calling the reported real-site problem accepted.

### 2026-10-09 — Codex (0.5.4 settings UI refinement)

- **Scope:** user-requested UI only. Kept all popup TypeScript, settings persistence, capture/edit/preview/download, PDF processing, permissions and dependency versions unchanged. Bumped package/manifest metadata to 0.5.4 to distinguish the test ZIP.
- **Icons and labels:** copied the supplied return and caret SVGs unchanged. Return uses the same 18×18 image and button position as the gear. Three native selects retain labels and keyboard behavior; decorative 14×14 carets ignore pointer events, sit 10 px inside the right edge, and invert with the existing dark theme. Added localized colons to header/footer across all 11 catalogs, consistent with each locale's language label.
- **Layout decision:** this request explicitly supersedes the earlier requirement that settings remain the same width as home. The home stays 320 px. Settings use shared intrinsic label/option columns, a 12 px gap, and content-driven width/height with single-line labels; long labels/options expand settings rather than forcing a wrap. Returning to home or pressing Escape restores 320 px. No JS sizing or replacement picker is introduced; CSS `:has` is supported in the declared Chrome 120 baseline.
- **Actual verification:** existing check script passes. Controlled local popup checks on current Chrome 154 and actual Chrome 120 verify all 11 locales, Chinese colons/aligned 237 px controls in a 320×199 settings view, 12 px label gap, 10 px caret inset, matching return/gear dimensions, dark icons, and home/Escape width restoration. Existing translations currently fit 320 px; synthetic longer label/option probes expand to approximately 436/475 px without overflow or wrapping. This is UI evidence, not a rerun of PDF or platform acceptance.
- **Package:** 0.5.4 ZIP: 3,107,877 bytes, 222 runtime files, SHA-256 `7b36499a58003910830369b74a0ecbe0684282e9dcba0e21a4fe66023730b412`; archive-root manifest and both new SVGs verified.
- **Delivery:** 0.5.4 test ZIP only; scoped commit/push backup under the established workflow. No tag, GitHub Release or store operation. Preserve prior 0.5.3 validation and Windows/Linux acceptance limitations below.

### 2026-10-09 — Codex (0.5.3 height/compatibility/settings test candidate)

- **Authorization and baseline:** the user requested implementation of height regression, Chrome 120/deadline handling, and settings/header/footer, followed by a test ZIP only. Repository workflow authorizes scoped source commit/push backup; public tags, Release and store operations remain excluded. Preserved `7c2467c` (previous cloud-handoff documentation) and based `fix/pdf-height-settings` on it rather than discarding the local commit.
- **Changes:** preserved normal adaptive single pages; passed explicit optimization eligibility for maximum-height fallback, including one page. PDF parsing/rendering/scanning/rewriting/validation now share one dedicated terminable worker; legacy core-js and a feature-detected stream iterator initialize in the actual dependency context. Bundled CMaps, standard fonts and licenses; no native tools, remotely loaded code, extra permission, WASM or OS-name gating. Setup errors select a visible original-PDF fallback.
- **Settings/metadata:** copied the supplied `gear.svg` unchanged to the top-right brand bar. Popup stays 320 px; three native-select rows have content-driven height, immediate local persistence, safe defaults/invalid fallback and failed-write feedback. Eleven actual catalogs support auto/manual language through a common runtime reader and storage events (closed editor shadow root reference retained). Default metadata creates no nodes/space. Header/footer are isolated normal-flow content only at the document start/end, with wrapped sanitized real source URLs, canonical Unicode encoding, bundled Noto Sans, and one export-start timestamp/UTC offset. Added dimensions are measured before common pagination, including near-capacity repagination; final footer/link bounds participate in trim validation.
- **Evidence:** `scripts/check.mjs` passes typecheck, filename/export/catalog/popup and new settings/compatibility checks (including stale read protection, missing stream API, maximum-height single-page branch, and late-worker isolation). `scripts/test-last-page-integration.mjs` exercises actual Chrome PDF output, all 16 metadata combinations on short/long fixtures, long Unicode URLs, capacity boundary, popup storage/auto/manual/error/back behavior, and a deliberately infinite worker. The actual 20-second termination and cancel/recovery experiment tests computation stopping, not merely a resolved timeout promise. Current Chrome 154 additionally loads the unpacked extension under its actual CSP and exercises full-save/edit-save, Chinese naming, closed-shadow editor language updates and resource cleanup. That test exposed a background-tab animation-frame wait; cleanup now cancels a deferred frame after a bounded timer so editor/session cleanup cannot stall when preview becomes active. Full matrices and package details are in `PRE_RELEASE_TEST_PLAN.md`.
- **Validation boundary:** no requested real website was retested. Prior 0.5.1 installed full-save/edit-save/file-dialog results remain historical. Windows regression acceptance and Linux installation remain untested in this session; no complete clean-device matrix or manual 11-language acceptance is claimed. The repository privacy/store drafts include preferences, but no public website policy or store assets were published.
- **Final checks/source:** implementation commit `92987ce`; final actual Chrome 120 matrix also includes a three-page metadata/no-middle-repeat case and a 20,011 ms busy-worker deadline. Current Chrome 154 actual extension flow confirms active cancellation opens no new preview and restores controls. Full-save/edit-save cleanup and closed-shadow language updates pass.
- **Package:** validated 0.5.3 archive: 220 runtime files, 3,106,982 bytes; SHA-256 `7800ceb6aedf888069c54c9e711d9bfbc335a8c0d40fd1b48febd8bfe6b45f4f`. Minimum Chrome remains 120. Package growth and third-party licenses are recorded in the verification record/notices. Package scanning continues to reject real local/file URLs; its generic protocol-diagnostic and binary-resource handling is now tested.
- **Next:** deliver the 0.5.3 test ZIP and wait for maintainer feedback from the reported Windows environment. Keep conservative original-PDF behavior for genuinely unsafe boundaries, and preserve diagnostic browser/dependency versions rather than attributing failures to an OS without evidence.

### 2026-10-08 — Codex (cloud readiness preflight; cloud execution blocked)

- **Scope and evidence:** read the complete current context, applicable agent rules, README, package/manifest, test and release documents, recent Git history and relevant source. Only this context document is changed. Existing accessible project summaries and repository history are partial evidence; full old-conversation inheritance is not claimed.
- **Actual host:** Darwin 24.6.0 arm64. The project root is a non-Git synchronized mirror; the independent development clone remains `repositories/save-web-as-pdf/`. No cloud executor or cloud environment configuration capability was available in this task.
- **Git baseline:** local `main`, cached `origin/main` and GitHub's live `main` endpoint all matched `a24911893ecff6dc04649a281e12d316b8d3272d`; the checkout initially had no uncommitted changes or ahead/behind commits. HTTPS origin is the existing repository. Direct `git fetch origin` failed with DNS resolution failure, so live remote alignment was checked through the GitHub connector instead.
- **Environment:** Node/npm were absent from terminal PATH. An existing bundled Node 24.21.0 was usable without installing or altering the project. npm was unavailable; `npm ci` and `npm run check` both failed to start with `command not found: npm`. Registry HTTPS probing also failed to resolve `registry.npmjs.org`. Existing dependencies enabled the checks below, but a fresh locked npm installation was not completed or certified. Package and lock files remain unchanged.
- **Actual automated result:** direct Node execution of the exact `scripts/check.mjs` configured by `npm run check` exited 0: TypeScript, filename, export logic, 11-locale/60-message i18n, popup UI/link tests, and production build passed. This validates the existing local dependency installation, not a fresh npm/cloud setup.
- **PDF integration:** Chrome 154.0.8037.98 is installed. Direct Node execution of `scripts/test-last-page-integration.mjs` failed at its fixture server with `listen EPERM: operation not permitted 127.0.0.1`, before Chrome launch and before any PDF case ran. No PDF integration case passed in this session.
- **Not performed:** actual cloud setup, fresh `npm ci`, installed-extension manual acceptance, Windows/macOS/Linux cross-platform acceptance, live-site acceptance, minimum-Chrome tests, package/ZIP validation or public release. Historical results above remain historical.
- **Delivery limitation:** GitHub connector branch creation was rejected with `MCP tool call requires approval, but approval policy is never`; no remote branch, commit or PR was created by that attempt. Shell Git network access is also blocked by DNS resolution. Preserve the documentation on local branch `docs/cloud-handoff-2026-10-08`, commit if the environment permits, and push when authorized network/tool access is available. Report the resulting local commit separately; do not claim a remote backup or main/Mac synchronization.
- **Next step:** launch a task in the actual cloud environment on the delivery branch (or updated main after merge), execute the setup/check recipe in section 9, and report new results. Continue the free/open-source, local searchable-PDF design, current UI/permissions/privacy and cross-platform goals. Minimum-Chrome compatibility and installed 0.5.2 acceptance remain future scoped work. No new feature, server, tag, GitHub Release or store submission is authorized by this handoff.

### 2026-10-08 — Codex (development handoff and baseline)

- **Scope:** context recovery, code/document review, proportional checks, and this context update only. No product/UI/permission/dependency/version change and no release operation.
- **Repository recovery:** verified GitHub main at `0072dc8` using the GitHub connector, then cloned into `repositories/save-web-as-pdf/` under the project mirror. The new clone uses `main`, the existing HTTPS origin, and initially had no uncommitted changes or ahead/behind commits. Old temporary clones had lost their Git metadata and source files; no reset, pull, overwrite, or cleanup of them or the synchronized mirror was performed.
- **Accessible history:** read the relevant earlier development chat’s 0.5.1/0.5.2 results and the prompt-generation chat. The latter’s statement that last-page shortening was absent predates implementation and is superseded by `0072dc8`. No separate local memory directory was available; this audit does not claim exhaustive access to every old conversation or erased local edit.
- **Confirmed current behavior:** shared Chrome print generation, bounded single-page retries and maximum-height pagination, reversible editor/page mutations, Unicode filename rules based on the current download input, one-time local IndexedDB handoff, and preview-side final-page optimization with original-PDF fallback for handled errors. All capture modes converge on the same preview. No new architecture is inferred from the model switch.
- **Historical evidence only:** 0.5.1 installed Chrome checks and maintainer-reported Windows/macOS coverage; 0.5.2 controlled Headless Chrome 154 PDF matrix and visual checks from 2026-10-02. No newer installed-0.5.2 acceptance evidence was found. Latest public GitHub Release remains `v0.5.1`; there is no `v0.5.2` tag/Release.
- **This session’s checks:** used bundled Node 24.19.0 and dependencies matching every version in the committed package-lock (temporary package-manager import file removed; committed lock unchanged). Executed `scripts/check.mjs`: typecheck, filename, export/boundary, 11-locale/60-message, popup tests, and production build all passed. Executed `validateDist` and existing test-ZIP structural validation: 30 files. Every rebuilt runtime file matched the existing 0.5.2 test ZIP byte-for-byte. Focused heuristic Node-runtime import/process scanning found no matches (not a full security audit). ZIP SHA-256 still equals `5de8027a86bcd0459269a9e0ae2302d9e8e9c246ca5bcbb2c484f4f3f10e9b50`.
- **New findings:** recorded the minimum-Chrome/missing-Promise-API failure and the cooperative rather than hard total deadline in section 13. These were not fixed because this turn is limited to handoff.
- **Not rerun:** the full real-PDF integration matrix, installed-extension browser flows, clean-device or cross-platform acceptance, screen-reader checks, and store dashboard work. A successful build and archive match do not establish these results.
- **Remaining:** ordinary-Chrome installed 0.5.2 full-save/edit-save preview and download acceptance; minimum-browser compatibility resolution; previously documented interruption/accessibility follow-up. Publication still requires explicit approval. Follow the existing scoped commit/push backup rules for this documentation update.

### 2026-10-02 — Codex (0.5.2 last-page auto height)

- **Worked on:** added conservative last-page height optimization for multi-page PDFs without changing capture, print planning, page breaks, filenames, popup UI, or permissions.
- **Implementation:** the preview locally renders only the last page within fixed resource budgets, treats verified white paper background as blank, includes recorded image and annotation bounds, retains 4 mm plus raster safety padding, and updates matching final-page PDF boxes without translating content. A second parse/render validation gates use of the rewritten PDF; all failures retain the original.
- **Dependencies:** exact `pdfjs-dist` 6.3.289 (Apache-2.0) and `pdf-lib` 1.17.1 (MIT), both bundled locally with license texts. Browser builds remove Node-only branches and no network-loaded code or new permission is used.
- **Validation:** typecheck, focused rules, real Chrome-generated PDF integration matrix, Poppler page-box/render review, localization, popup, filename, build, package validation, Node-API/local-path scan, and npm audit were completed for the beta candidate. See `PRE_RELEASE_TEST_PLAN.md` for the exact matrix and remaining installed-ZIP acceptance step.
- **Release state:** source-only 0.5.2 beta. No tag, GitHub Release, Chrome Web Store action, or public release is authorized by this handoff.

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

### 2026-09-27 — Codex (0.4.6 popup UI)

- **Worked on:** rebuilt the popup presentation around the supplied reference layout while preserving export, editing, cancellation, status, and error flows.
- **Changed:** added the supplied popup brand and globe SVGs; added localized prompt/footer copy; centralized external destinations and the empty review URL in `src/popup/links.ts`; changed extension-owned primary accents from blue to black; and added popup UI/link tests.
- **Important decision:** `CHROME_WEB_STORE_REVIEW_URL` stays empty until the real listing review URL exists. The rating entry remains visible with disabled semantics and no navigation.
- **Release state:** source-only beta; no tag, GitHub Release, store submission, or public package is authorized by this handoff.

### 2026-09-27 — Codex (0.4.7 popup spacing)

- **Worked on:** tightened the popup's natural content height and resized the footer navigation to match the main action width more closely.
- **Changed:** removed bottom padding from the main content, gave the footer equal block padding, increased footer text to 12px and interactive targets to at least 24px, and added layout regression assertions.
- **Status behavior:** the status/error element remains `display: none` while empty and adds only its actual content height when shown, with a 120px scroll limit for long messages.
- **Release state:** a test ZIP may be produced for user acceptance, but no tag, GitHub Release, or store submission is authorized until the user confirms testing passed.

### 2026-09-27 — Codex (0.4.8 compact footer)

- **Worked on:** changed only the footer distribution requested during beta review.
- **Changed:** retained the existing globe size, 12px link text, 24px interaction targets, and equal 16px block padding while centering the links as a compact group with 6px gaps.
- **Release state:** test ZIP only; no tag, GitHub Release, or store submission is authorized until the user confirms testing passed.

### 2026-09-27 — Codex (0.4.9 refined popup scale)

- **Worked on:** reduced only the popup's visual scale and surrounding whitespace after beta review.
- **Changed:** set the popup to 320px wide; reduced the brand icon/header, content spacing, and action controls; retained readable 14px main/button text; and preserved the footer's 16px globe, 12px labels, and 24px minimum link targets.
- **Localization:** long footer labels may wrap within the narrower popup instead of overflowing; the normal Chinese layout remains compact.
- **Release state:** test ZIP only; no tag, GitHub Release, or store submission is authorized until the user confirms testing passed.

### 2026-09-27 — Codex (0.5.0 lighter popup typography)

- **Worked on:** adjusted only popup typography and icon sizing after beta visual review.
- **Changed:** removed the bold title weight; changed title/body/button/footer/status text to 15/13/13/11/11px; changed the brand/globe icons to 22/14px; and set the light-theme brand-header background to `#f9f9f9`.
- **Unchanged:** popup width, spacing, minimum interaction targets, error behavior, PDF capture, and filename behavior.
- **Release state:** test ZIP only; no tag, GitHub Release, or store submission is authorized until the user confirms testing passed.
