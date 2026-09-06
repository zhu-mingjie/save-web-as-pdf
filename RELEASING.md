# Release Process

Every version update must produce a GitHub Release. Do not leave a version change only on the default branch.

1. Bump the same version in `manifest.json`, `package.json`, and `package-lock.json`.
2. Update the version history and store-facing assets in `CHROMEWEBSTORE.md` when applicable.
3. Run `npm run check` and `npm run package`.
4. Confirm the ZIP contains `manifest.json` at its root and only browser runtime files.
5. Confirm the generated JavaScript does not depend on Node.js-only APIs such as `fs`, `path`, `child_process`, `process`, or `Buffer`.
6. Commit the source changes and create a GitHub Release tagged `vX.X.X` for that commit.
7. Attach `release/save-web-as-pdf-vX.X.X.zip` and add a concise, user-facing summary of the changes.

The attached ZIP is the same cross-platform package for Windows, macOS, and Linux. End users do not need Node.js, npm, TypeScript, esbuild, or any other development tool: they extract the ZIP and load the folder containing `manifest.json` from Chrome's Extensions page.
