# Third-Party Notices

Save Web as PDF is distributed under the repository's MIT License. The built extension also contains the following separately licensed components. Their licenses remain in effect for those components and are copied into `dist/licenses/` and the release ZIP by the build.

## PDF.js (`pdfjs-dist` 6.3.289)

- Project: https://mozilla.github.io/pdf.js/
- Source: https://github.com/mozilla/pdf.js
- License: Apache License 2.0
- Use: locally bundled PDF parsing, rendering, text/annotation inspection, and the local PDF worker used to verify safe final-page bounds
- Distribution notice: the complete Apache License 2.0 text is included as `licenses/pdfjs-apache-2.0.txt`

## pdf-lib 1.17.1

- Project and source: https://github.com/Hopding/pdf-lib
- License: MIT License
- Use: locally bundled update of the final page's PDF page boxes after a safe content boundary is detected
- Copyright: Copyright (c) 2019 Andrew Dillon
- Distribution notice: the complete MIT license text is included as `licenses/pdf-lib-mit.txt`

Neither component is loaded from a network location at runtime. Node.js-only optional packages declared by upstream packages are not included in the Chrome runtime bundle or release ZIP.

## Legacy compatibility and bundled PDF resources

PDF.js's legacy builds include core-js 3.50.0 compatibility code (MIT); its license ships as `licenses/core-js-mit.txt`. Both parser and display code remain inside the local, terminable optimization worker. A separate locally bundled legacy parser is also retained for browser verification. CMaps ship with their upstream license (`licenses/cmaps.txt`); PDF.js standard fonts ship with PDFium/Foxit BSD-style and Liberation SIL OFL notices (`licenses/foxit.txt`, `licenses/liberation.txt`). WebAssembly/image-decoder paths are disabled; no external decoder is requested.

## Noto Sans Regular

- Source: https://github.com/notofonts/noto-fonts/blob/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf
- Copyright: 2018 The Noto Project Authors
- License: SIL Open Font License 1.1, included unmodified as `fonts/OFL.txt`
- Use: locally loaded, embedded-by-Chromium font for canonical ASCII URLs and ISO-style export timestamps. Unicode source URLs retain valid percent-encoded/punycode characters. Source-page Unicode text is still handled by Chrome's normal print pipeline.
- Resource size: about 556 KiB uncompressed. No font installer is required.

The dependency versions remain PDF.js 6.3.289 and pdf-lib 1.17.1. The increased test package size comes from legacy compatibility, bundled CMaps/standard fonts and Noto Sans, not a runtime service or native dependency. Upstream PDF.js's advertised legacy support baseline is newer than Chrome 120; the narrower Chrome 120 support claim relies on this project's capability adapter and controlled real-browser tests, and must continue to be checked when PDF.js changes.
