# Save Web as PDF 0.3.3 — Final Acceptance Test

Use the exact `release/save-web-as-pdf-v0.3.3.zip` artifact. Record the Chrome version, operating system version, result, and any console error for every test.

## Clean-device installation

Run once on a Windows computer and once on a macOS computer that does not have Node.js, npm, TypeScript, esbuild, or project dependencies installed.

1. Confirm the ZIP contains `manifest.json` at its root.
2. Create a new empty folder and extract the ZIP into it.
3. Open `chrome://extensions`, enable Developer mode, and choose Load unpacked.
4. Select the extracted folder.
5. Confirm the extension loads with its charcoal document-and-download icon and reports no manifest or service-worker errors.

## Core export

- Export a short static webpage.
- Export a long article with images, tables, links, and lazy-loaded content.
- Start from the middle of a page and confirm the original scroll position is restored.
- Confirm the preview opens and the PDF contains exactly one page.
- Search and copy text from the PDF.
- Download using a title containing Chinese, Japanese, Korean, emoji, accents, reserved Windows characters, and a very long title.
- Confirm the saved filename is valid and the PDF opens normally.
- Export `https://miengieh.com/` and `https://www.deepseek.com/harness/`; confirm each PDF has one page, preserves its beginning and ending content, and contains selectable text and working links.

## Dynamic pages and Zhihu

- Open a direct Zhihu `/question/.../answer/...` URL and confirm the status says that the question and selected answer are being prepared.
- Confirm the PDF includes the complete top question section (title, description, topics, and visible metadata), correct author, full target answer, images, code blocks, and links.
- Confirm unrelated answers, “更多回答”, recommendations, sidebars, fixed navigation, floating buttons, and answer action bars are excluded.
- Test a direct-answer page whose answer cannot be accessed or matched; confirm no other answer is exported.
- Export the Zhihu home feed and confirm preparation uses a finite snapshot rather than scrolling indefinitely.
- After every success and failure above, confirm hidden page sections, eager-image attributes, viewport sizing, animation state, and the original scroll position are restored.

## Edit mode

- Open Edit Before Saving and dismiss the instruction dialog with its button.
- Repeat and dismiss the instruction dialog with Escape.
- Remove multiple elements and test Undo, Redo, and Restore.
- Export after removing an element and confirm nearby content reflows.
- Confirm the editor toolbar, selection outline, and removed content do not appear in the PDF.
- Choose Exit and confirm all page changes are restored.

## Cancellation and cleanup

- Start a long full-page export and click Cancel Export.
- Confirm the export stops, no preview opens, the original scroll position returns, and the page has no leftover styles.
- In edit mode, start an export and cancel before PDF rendering begins.
- Close the popup during a long export and confirm it is treated as cancellation.
- After cancellation or failure, start another export on the same tab and confirm it is not incorrectly reported as already running.

## Failure handling

- Try a `chrome://` page and the Chrome Web Store; confirm a clear access error.
- Open DevTools on the source tab and confirm debugger conflict is explained.
- Test an extremely long page and confirm the extension reports its size or page-verification error without saving a multi-page file.
- Close or navigate the source tab during export and confirm cleanup completes without a stuck session.

## Accessibility

- Navigate the popup and preview with Tab, Shift+Tab, Enter, Space, and Escape.
- Confirm focus indicators are visible.
- Confirm status and error text is announced by a screen reader.
- Confirm the edit instructions behave as a modal dialog and Escape dismisses it.
- Document the pointer-based element selector as a known limitation if a keyboard-equivalent selection workflow is not added before release.

## Store submission

- Verify the hosted privacy policy loads without sign-in and contains the final contact information.
- Confirm Developer Dashboard disclosures match `PRIVACY.md` and `CHROMEWEBSTORE.md`.
- Capture at least one current 1280×800 or 640×400 screenshot from the tested build.
- Upload the ZIP to a draft Chrome Web Store item and confirm the manifest is accepted before submitting for review.
