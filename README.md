# Save Web as PDF

A free, open-source Chrome extension that saves web pages as searchable PDFs, preserving their layout, images, and links where supported.

[Download](https://github.com/zhu-mingjie/save-web-as-pdf/releases/latest) · [Report an issue](https://github.com/zhu-mingjie/save-web-as-pdf/issues) · [Privacy policy](https://miengieh.com/save-web-as-pdf/privacy/)

## Features

- **Searchable text** — Select, copy, and search webpage text in the PDF.
- **Long-page PDFs** — Keep shorter webpages on one continuous page, split longer ones automatically, and reduce trailing blank space when possible.
- **Edit before saving** — Remove unwanted sections, with Undo, Redo, and Restore.
- **Preview and rename** — Review the PDF before downloading, with an editable filename based on the page title.
- **Optional source details** — Add the source URL, save time, or both at the beginning and/or end of the PDF.
- **Multilingual interface** — Choose from 11 locales or follow your browser's language.

## Install

Requires **desktop Google Chrome 120 or later**. The same extension package is used on Windows, macOS, and Linux.

1. Open the [latest release](https://github.com/zhu-mingjie/save-web-as-pdf/releases/latest). Under **Assets**, download the extension ZIP whose name starts with `save-web-as-pdf-v`, rather than the **Source code** archive.
2. Extract the ZIP into an empty folder.
3. Open `chrome://extensions` and enable **Developer mode**.
4. Click **Load unpacked** and select the extracted folder containing `manifest.json`.

No build tools are needed. The extension is not yet available in the Chrome Web Store.

## Use

1. Open the webpage you want to save and let its content load.
2. Click the extension icon, then choose **Save Full Page** or **Edit Before Saving**.
3. Review the generated PDF, adjust its filename if needed, and click **Download PDF**.

Use the gear icon to change the interface language or add a first-page header and last-page footer. Source details are off by default; each position can show the source URL, save time, or both, once per document.

## Privacy and permissions

PDF generation and temporary storage happen locally in Chrome. The extension does not upload your webpages or PDFs and has no accounts, analytics, or backend service. See the [privacy policy](https://miengieh.com/save-web-as-pdf/privacy/) for details.

The `debugger` permission is used to ask Chrome to generate the PDF. It is used only during an export, and the debugger connection is released afterward.

## Limitations

- Chrome internal pages, the Chrome Web Store, and other protected pages cannot be saved.
- Dynamic pages, infinite scrolling, and embedded media may cause missing content, layout differences, or export failures. Not every website can be saved completely.
- Close DevTools on the source tab before exporting to avoid a debugger conflict.

## Feedback and contributions

[Open an issue](https://github.com/zhu-mingjie/save-web-as-pdf/issues) or email [support@miengieh.com](mailto:support@miengieh.com). Not every website can currently be saved completely. Page structure, dynamic loading, and other compatibility differences may cause missing content, layout problems, or export failure. If you encounter a reproducible problem, email support@miengieh.com with a publicly shareable page URL, your Chrome and extension versions, and the error message. Do not send passwords, cookies, or other sensitive credentials. Compatibility issues that can be addressed safely may receive targeted fixes, but support for every website cannot be guaranteed.

Thanks to [@xuanzhaogao](https://github.com/xuanzhaogao) for suggesting the source URL and save-time footer in [PR #1](https://github.com/zhu-mingjie/save-web-as-pdf/pull/1).

## License

Source code and original project assets are licensed under [MIT](LICENSE). Bundled third-party components retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Development

See the [development guide](DEVELOPMENT.md), [test plan and verification records](PRE_RELEASE_TEST_PLAN.md), [release process](RELEASING.md), and [technical context](PROJECT_CONTEXT.md).
