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
