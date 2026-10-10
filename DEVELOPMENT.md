# Development Guide

## Requirements and installation

- [Node.js](https://nodejs.org/) 22.13 or newer and npm
- Desktop Google Chrome 120 or later; another compatible Chromium browser may work, but does not replace Chrome acceptance

From the repository root:

```bash
npm ci
npm run check
```

`npm ci` installs the committed dependency lockfile. `npm run check` runs TypeScript validation, filename, export-logic, locale, settings/compatibility and popup tests, then a production build. These checks do not establish installed-browser or cross-platform acceptance.

For a development build:

```bash
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the generated `dist/` folder containing `manifest.json`. Do not load the repository root. Reload the extension after rebuilding. Build removes the previous `dist/`, compiles the browser entry points, and copies the Manifest V3 runtime assets.

## Targeted checks

```bash
npm run typecheck
npm run test:filename
npm run test:export
npm run test:i18n
npm run test:settings
npm run test:popup
npm run test:page-layout
npm run test:pdf-integration
npm run test:extension-runtime
```

The last three commands require a runnable local Chrome executable and local fixture/debugging access. `test:page-layout` exercises production preparation/printing and layout stability; `test:pdf-integration` covers controlled PDF, metadata, settings and worker lifecycle cases; `test:extension-runtime` uses current Chrome's Extensions debugging API for actual extension URLs/CSP and full-save/edit-save on local fixtures. They are separate from the fast checks. Browser selection, output options, historical results and outstanding manual acceptance are recorded in [PRE_RELEASE_TEST_PLAN.md](PRE_RELEASE_TEST_PLAN.md).

## Architecture and contribution constraints

The runtime uses Chrome Extension APIs, `Page.printToPDF` through the Chrome DevTools Protocol, IndexedDB, standard Web APIs, and locally bundled browser builds of PDF.js and pdf-lib. Node.js, npm, TypeScript and esbuild are development tools only. Runtime code must not require OS-specific shell commands, native applications, fixed filesystem paths, Native Messaging, Node-only APIs, or remotely loaded code.

Preserve the free/open-source, local searchable-PDF design, minimal permissions, existing UI, localization parity, and cleanup after success, failure or cancellation. The debugger connection is temporary and released during cleanup. Technical decisions, browser compatibility details and known boundaries are maintained in [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md); privacy and bundled licenses are in [PRIVACY.md](PRIVACY.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Read [AGENTS.md](AGENTS.md) and the complete project context before AI-assisted changes. Inspect existing Git changes and preserve unrelated work. Commit and push meaningful verified work for backup; source backup does not authorize tags, Releases or store submission. Packaging and publication rules are maintained in [RELEASING.md](RELEASING.md).
