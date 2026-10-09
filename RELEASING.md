# Release Process

Commit and push each reasonably complete development or test version so the source history is backed up and can be rolled back. “Not ready for a Release” does not mean source commits or pushes should stop.

Create a Git tag, GitHub Release, and public release package only after the maintainer explicitly confirms that testing passed and requests publication. Until then, keep the version as source-only beta work on the project's normal development branch.

1. Bump the same version in `manifest.json`, `package.json`, and `package-lock.json`.
2. Update the version history and store-facing assets in `CHROMEWEBSTORE.md` when applicable.
3. Run `npm run check`, then commit and push the verified source changes to the normal development branch.
4. After explicit release approval, run `npm run package`.
5. Confirm the ZIP contains `manifest.json` at its root and only browser runtime files.
6. Confirm the generated JavaScript does not depend on Node.js-only APIs such as `fs`, `path`, `child_process`, `process`, or `Buffer`.
7. Create a Git tag and GitHub Release tagged `vX.X.X` for the approved commit.
8. Attach `release/save-web-as-pdf-vX.X.X.zip` and add a concise, user-facing summary of the changes.

The attached ZIP is the same cross-platform package for Windows, macOS, and Linux. End users do not need Node.js, npm, TypeScript, esbuild, or any other development tool: they extract the ZIP and load the folder containing `manifest.json` from Chrome's Extensions page.

## Release descriptions and maintainer publication

Write GitHub Release descriptions in English. For any release that includes bug fixes, end the entire description with this exact sentence:

> Fixed various issues and improved the user experience.

When the maintainer reserves the final Publish release button, create or update a draft Release, fill in the title/tag/target/notes, upload the verified ZIP, and leave it as a draft. Do not publish it or manually create a public tag on the maintainer's behalf. Preparing that draft and updating the repository homepage are authorized by the request; Chrome Web Store submission remains separate.

Credit @xuanzhaogao for suggesting the optional source URL and save-time PDF footer, linking to [PR #1](https://github.com/zhu-mingjie/save-web-as-pdf/pull/1). This credit acknowledges the suggestion/discussion; it does not imply that PR #1 was merged.
