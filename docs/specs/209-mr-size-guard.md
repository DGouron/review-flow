# Guard oversized merge requests

## Status: implemented

## Context

A merge request that changes too many lines is hard to review well and risks rubber-stamp
approvals. ReviewFlow should refuse to spend a review (or follow-up) on an MR that exceeds a
configurable line budget, revoke any approval already granted, and tell the author how to
split the work into smaller MRs. Lock files and `package.json` churn must not count toward the
budget — they inflate the size without adding review burden.

## Rules

- the counted size of an MR is `additions + deletions` summed over its changed files, excluding `package.json` and lock files (`yarn.lock`, `package-lock.json`, `pnpm-lock.yaml`)
- an MR is oversized when its counted size is strictly greater than the configured line budget
- the line budget is resolved per project: `.claude/reviews/config.json` `maxDiffLines`, falling back to the global `config.json` `maxDiffLines`, falling back to `2000`
- when an oversized MR requests a review, no review job is enqueued
- when an oversized MR is pushed to (follow-up), no follow-up job is enqueued
- when an oversized MR is approved on the platform, the approval is revoked
- whenever a review or approval is blocked for size, a concise French comment is posted explaining the counted size vs the budget and giving 2-3 actionable tips to split the MR
- a non-oversized MR is processed exactly as before (no comment, no revocation, normal enqueue)
- the guard is fail-open: if the changed-files size cannot be fetched, the MR is processed normally (no false block)
- the guard applies to both GitLab and GitHub

## Scenarios

- under budget gitlab: {files: [{path:"src/a.ts", additions:50, deletions:10}], budget:2000} → not oversized, review enqueued, no comment
- over budget gitlab review: {files totaling 2500 counted lines, budget:2000} → no review enqueued + FR split comment posted
- over budget gitlab approve: {counted 2500, budget:2000, MR approved} → approval revoked + FR split comment posted
- over budget followup: {counted 2500, budget:2000, push event} → no follow-up enqueued
- lockfiles excluded: {files: [{path:"yarn.lock", additions:5000, deletions:0}, {path:"src/a.ts", additions:30, deletions:0}], budget:2000} → counted 30, not oversized
- package.json excluded: {files: [{path:"package.json", additions:3000, deletions:0}, {path:"src/a.ts", additions:10, deletions:0}], budget:2000} → counted 10, not oversized
- per-repo override: {project config maxDiffLines:500, counted 800} → oversized
- global fallback: {no per-repo maxDiffLines, global config maxDiffLines:1000, counted 1200} → oversized
- default budget: {no maxDiffLines anywhere, counted 2100} → oversized (default 2000)
- fetch failure: {changed-files fetch throws, counted unknown} → processed normally (fail-open), no comment

## Out of Scope

- Dashboard surfacing of "blocked for size" state (separate UI follow-up)
- Auto-splitting the MR for the author
- Per-file or per-language budgets (single global counted-line budget only)
- Making the excluded-file list itself configurable (hardcoded list for now)
- Re-posting / deduplicating the comment across repeated follow-up pushes beyond the rules above

## Glossary

| Term | Definition |
|------|------------|
| counted size | `additions + deletions` over changed files excluding `package.json` and lock files |
| line budget | The `maxDiffLines` threshold above which an MR is oversized |
| changed files | The per-file additions/deletions of an MR (GitLab GraphQL `diffStats`, GitHub `pulls/{n}/files`) |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Reuses existing approval-revocation + comment gateways; adds one fetch + one gate |
| Negotiable | OK | Excluded-file set and tips wording left open |
| Valuable | OK | Prevents low-quality reviews of giant MRs, nudges good MR hygiene |
| Estimable | OK | One gateway (2 impls), one pure gate, one use case, controller wiring |
| Small | OK | <16 files |
| Testable | OK | Each rule maps to a scenario |

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md`.

## Implementation

### Artefacts

- **Entity (new)**: `src/modules/shared-kernel/entities/diffSizeGate/diffSizeGate.ts` — pure `evaluateDiffSizeGate({ files, budget })` summing `additions + deletions` over files whose basename is not in `{package.json, yarn.lock, package-lock.json, pnpm-lock.yaml}`; `oversized = countedLines > budget`. Declares the canonical `ChangedFile` type. No class, no Zod (internal typed data).
- **Gateway contract (new)**: `src/modules/shared-kernel/entities/diffSizeGate/changedFilesFetch.gateway.ts` — `fetchChangedFiles(projectIdentifier, mrNumber): ChangedFile[] | null` (`null` = fetch failure → fail-open). The existing `DiffStatsFetchGateway` returns totals only and cannot exclude per file, so a new per-file port was required.
- **Gateway impls (new)**: `changedFilesFetch.gitlab.gateway.ts` (GraphQL `diffStats { path additions deletions }` via `glab api graphql`) and `changedFilesFetch.github.gateway.ts` (`gh api --paginate repos/<owner>/<repo>/pulls/<n>/files`). Both try/catch → `null` on any failure or structural mismatch.
- **Use case (new)**: `src/modules/platform-integration/usecases/guardDiffSize.usecase.ts` — fetch → gate → verdict `{ kind: 'allowed' } | { kind: 'blocked', countedLines, budget, message }`. Fail-open on `null`/throw. FR split comment built by the free `buildSplitMessage()` (mirrors `handlePlatformApproval`'s `buildRevertMessage`).
- **Controller helper (new)**: `src/modules/platform-integration/interface-adapters/controllers/webhook/diffSizeGuard.helper.ts` — `applyDiffSizeGuard({ mode, ... })`. `approve` → revoke then comment (both best-effort); `review` → comment only; `followup` → block silently (anti-spam). Always returns `{ blocked }`.
- **Config (modified)**: `src/config/projectConfig.ts` (`maxDiffLines?` per-repo, `parseMaxDiffLines`) and `src/frameworks/config/configLoader.ts` (global `maxDiffLines?`).
- **Controllers (modified)**: `gitlab.controller.ts` + `github.controller.ts` — `guardDiffSize` + `getMaxDiffLines` added to the deps interfaces; the guard runs at 3 sites each (approve, review-requested enqueue, followup), after the budget check and before enqueue. Blocked → `unapproved`/`rejected` reply with reason `oversized`, no enqueue.
- **Wiring**: `src/main/routes.ts` — both webhook deps wired with the platform `Changed*FilesFetchGateway` and `getMaxDiffLines: (localPath) => loadProjectConfig(localPath)?.maxDiffLines ?? globalConfig.maxDiffLines ?? 2000`.

### Reused (not reinvented)

- `ApprovalRevocationGateway` and `NoteCommentPostGateway` (already injected in both controllers) — no new revoke/comment gateways.
- Verdict + free-function FR message pattern from `handlePlatformApproval.usecase.ts`.
- Per-project resolver closure pattern from `getQualityThreshold` in `routes.ts`.

### Decisions

- Budget resolution: per-repo `.claude/reviews/config.json` → global `config.json` → default `2000`. Lives as a one-line closure in `routes.ts`, not in the config files.
- Excluded-file list is hardcoded (basename match) — making it configurable is out of scope.
- Fail-open everywhere: a fetch failure never blocks an MR (no false positives).
- Anti-spam: the FR comment is posted on review-requested and approve, but follow-up pushes block silently — no new persistent state.
- GitHub `/files` uses `--paginate` to avoid the 30-file/page undercount.
