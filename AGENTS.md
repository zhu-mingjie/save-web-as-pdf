# Repository AI Instructions

`PROJECT_CONTEXT.md` is this repository's primary source of project context across AI tools and development sessions. Read it before planning or changing the project, and update it when architecture, workflow, decisions, status, risks, or next steps materially change.

- Inspect the real working tree, current branch, remotes, uncommitted changes, and unpushed commits before editing or performing Git operations.
- Preserve user work and stay within scope. Do not modify unrelated business code or combine unrelated changes.
- Follow Manifest V3 constraints, keep permissions minimal, store service-worker state outside globals, preserve cleanup paths, keep all locale catalogs aligned, and keep runtime bundles browser-only.
- Never commit secrets, credentials, private keys, personal local paths, dependencies, or unnecessary generated artifacts.
- Run checks proportional to the change and report only validation actually performed.
- For meaningful completed and verified work, normally create a scoped commit and push the current branch for backup. Do not create a tag, GitHub Release, store submission, or other release without explicit user approval.
- Do not delete tags or Releases without explicit authorization; other destructive Git/GitHub operations are covered in the safety section below.
- In a ChatGPT project mirror, files under `sources/` are read-only synchronized reference material and may be replaced later.

If repository evidence conflicts with this file, do not guess: record the conflict in `PROJECT_CONTEXT.md` and ask when the choice would materially affect the result.

## GitHub 操作与安全规范

本项目使用 GitHub 进行代码托管和版本管理。在执行开发任务时，请遵守以下原则：

1. **正常开发不受限制**

   - 可以正常进行代码编辑、测试、Git 状态检查、差异比较，以及任务所需的 Commit、Push、Pull Request 等操作。
   - 不需要为了减少 GitHub API 调用而牺牲正常开发效率。

2. **避免不必要的 GitHub API 请求**

   - 优先使用本地 Git 信息完成能够在本地完成的任务。
   - 不要反复轮询 GitHub API 获取相同信息。
   - 避免不必要的并发请求、重复查询和批量操作。
   - 如果需要执行大量 GitHub API 修改请求，应采用串行方式，并在连续修改请求之间至少间隔 1 秒。

3. **遵守 GitHub 官方限制**

   - 遵守 GitHub API Rate Limits、Acceptable Use Policies 及相关使用规范。
   - 如果遇到 API 限流（例如 403、429，且确认与 Rate Limit 有关），应遵循 GitHub 返回的 Retry-After 或重置时间，避免连续重试。
   - 不得通过切换账号、Token 或其他方式绕过 GitHub 的速率限制。
   - 不得执行与当前开发任务无关的大规模自动化 GitHub 操作。

4. **保护仓库安全**

   - 未经我明确授权，不得删除仓库、删除远程分支、强制推送、重写远程提交历史或修改仓库权限及安全设置。
   - 避免执行可能破坏现有代码或版本历史的 Git 操作。
   - 如果操作具有明显的破坏性或不可逆性，应先征得我的同意。

5. **以完成开发任务为优先目标**

   - 这些规则旨在防止异常自动化行为，而不是妨碍正常的软件开发。
   - 对日常开发中合理、低频的 Git 和 GitHub 操作，无需增加不必要的审批或等待。

以上规则适用于本项目的所有开发任务。

这些规范与上文及 `PROJECT_CONTEXT.md`、`RELEASING.md` 的既有规则共同适用：正常开发所需的 Commit、Push、Pull Request 无需额外审批；Tag、Release 和商店提交仍须遵守既有的明确授权要求。大量 GitHub API 修改请求之间的间隔不适用于日常本地编辑、测试或普通 Git 命令。
