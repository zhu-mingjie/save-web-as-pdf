# Repository AI Instructions

`PROJECT_CONTEXT.md` is this repository's primary source of project context across AI tools and development sessions. Read it before planning or changing the project, and update it when architecture, workflow, decisions, status, risks, or next steps materially change.

- Inspect the real working tree, current branch, remotes, uncommitted changes, and unpushed commits before editing or performing Git operations.
- Preserve user work and stay within scope. Do not modify unrelated business code or combine unrelated changes.
- Follow Manifest V3 constraints, keep permissions minimal, store service-worker state outside globals, preserve cleanup paths, keep all locale catalogs aligned, and keep runtime bundles browser-only.
- Never commit secrets, credentials, private keys, personal local paths, dependencies, or unnecessary generated artifacts.
- Run checks proportional to the change and report only validation actually performed.
- For meaningful completed and verified work, normally create a scoped commit and push the current branch for backup. Do not create a tag, GitHub Release, store submission, or other release without explicit user approval.
- Do not rewrite history, force-push, delete refs/releases, or use destructive Git commands without explicit authorization.
- In a ChatGPT project mirror, files under `sources/` are read-only synchronized reference material and may be replaced later.

If repository evidence conflicts with this file, do not guess: record the conflict in `PROJECT_CONTEXT.md` and ask when the choice would materially affect the result.
