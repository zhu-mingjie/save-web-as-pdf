# Privacy Policy for Save Web as PDF

Last updated: September 12, 2026

Save Web as PDF converts a webpage selected by the user into a PDF. The extension is designed to perform this work locally in Chrome and does not operate a developer-controlled server.

## Data the extension handles

When the user explicitly starts an export, the extension handles:

- the visible content and layout of the active webpage, including content that Chrome renders into the PDF;
- the webpage title and a source URL with query parameters and fragments removed;
- the generated PDF file; and
- an ephemeral export status associated with the active browser tab.

The generated PDF may contain personal or sensitive information if that information is visible on the webpage selected by the user. The extension does not intentionally inspect passwords, authentication cookies, browser history, or webpages that the user has not selected for export.

## How data is used

The data is used only to prepare the selected webpage, generate one PDF, show its preview, allow the user to download it, and safely coordinate or cancel that export.

## Storage and retention

All processing and temporary storage occur locally in the user's Chrome profile.

- The generated PDF and its sanitized source metadata are placed temporarily in the extension's local IndexedDB database. The record is deleted as soon as the preview reads it.
- If Chrome closes or an operation is interrupted before the preview opens, abandoned PDF records are eligible for deletion after 24 hours and are removed during a later cleanup opportunity.
- Export coordination state is kept in Chrome session storage and is cleared when the browser session ends. It does not contain webpage content or the generated PDF.
- Downloaded PDF files remain wherever the user chooses to save them and are controlled by the user.

Removing the extension deletes its extension-owned browser storage. Users can also remove locally downloaded PDFs through their operating system.

## Network transmission and third parties

The extension does not upload or transmit webpage content, URLs, generated PDFs, or export status to the developer or to third parties. It does not use analytics, advertising, tracking, accounts, subscriptions, remote APIs, or remotely hosted executable code.

No user data is sold or shared. The extension's use of information is limited to its disclosed, user-facing purpose and complies with the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Security

The extension activates only after a user opens it and chooses an export action. It requests only permissions needed to prepare the active webpage, ask Chrome to create the PDF, manage temporary export state, and save the completed file. Powerful browser access is used only during an active export and is released during cleanup.

## Changes to this policy

If the extension's data practices change, this policy and the Chrome Web Store disclosures will be updated before the changed version is published.

## Contact

For privacy questions or support, contact [support@miengieh.com](mailto:support@miengieh.com). Sending an email is a separate action initiated by the user; the extension does not automatically send support messages or their contents.
