# Sync trusted Claude assets into the review worktree

## Status: implemented

See [report](../reports/218-worktree-trusted-claude-assets.report.md).

## Context

Reviews run inside a git worktree checked out on the **MR/PR branch**. The Claude session is spawned with the worktree as cwd, so every `.claude/` asset it loads (skills, agents, commands) comes from the branch under review — an untrusted input. Two failure modes observed in production:

- **Availability**: a branch created before the review skill was committed to the default branch has no `.claude/skills/review-code/`, so the session fails with `Unknown command: /review-code` (PR practivizio-app#1281).
- **Security**: a branch author can deliberately delete or weaken the review skill, agents, or commands (e.g. strip the security audit block) to make their PR pass review. Since the review runs with the branch's own `.claude/` content, the review pipeline is self-attested by the code it is supposed to judge.

The trusted source of these assets is the operator's source checkout (`job.localPath`, the clone reviewflow already reads `.claude/reviews/config.json` from) — never the branch under review.

## Rules

- After the worktree is checked out or reset onto the MR branch, its `.claude/skills`, `.claude/agents`, and `.claude/commands` directories are replaced by copies of the same directories from the source checkout.
- Replacement is total: an asset directory present on the MR branch but absent from the source checkout is deleted from the worktree (a branch cannot inject a skill, agent, or command).
- The sync runs on every ensure — both when the worktree is freshly created and when an existing worktree is reused — because a reuse resets the worktree onto the latest branch head, restoring whatever the branch committed.
- A sync failure fails the ensure (reason `claude-assets-sync-failed`): the review must never run with unverified branch-controlled assets.
- `.claude/settings.json` is (re)written by reviewflow on every ensure — including reuse — so a settings file committed on the MR branch (which could register arbitrary hooks) never survives into the session.
- A settings write failure remains a non-blocking warning, now surfaced on reuse as well as on creation.

## Scenarios

- branch predates the skill: {worktree: no .claude/skills, source: .claude/skills/review-code} → worktree has .claude/skills/review-code after ensure
- branch tampered with the skill: {worktree: .claude/skills/review-code (weakened), source: .claude/skills/review-code (trusted)} → worktree skill content equals source content
- branch injects a skill: {worktree: .claude/skills/backdoor, source: no backdoor} → backdoor absent from worktree after ensure
- branch commits settings.json: {worktree reused, branch committed .claude/settings.json with hooks} → worktree settings.json is reviewflow's own content
- source has no .claude directory: {source: no .claude} → worktree .claude/skills, agents, commands removed; ensure succeeds
- sync fails: {copy raises EACCES} → ensure returns {status: "failed", reason: "claude-assets-sync-failed"}
- agents and commands follow the same rule as skills

## Out of Scope

- Syncing the whole `.claude/` directory (reviews tracking data, logs, and nested worktrees must not be copied).
- Verifying or sandboxing hooks declared in the source checkout's own settings (the source checkout is trusted by definition).
- Protecting against a malicious source checkout — it is operator-controlled.
- CLAUDE.md / rule files on the branch (contextual prompt content, not executable commands; separate spec if needed).

## Glossary

| Term | Definition |
|------|------------|
| Source checkout | The operator's local clone of the repository (`job.localPath`), trusted; where `.claude/reviews/config.json` already lives. |
| Review worktree | The git worktree under `~/.reviewflow/worktrees/` checked out on the MR branch, where the Claude review session runs. |
| Trusted Claude assets | `.claude/skills`, `.claude/agents`, `.claude/commands` as they exist in the source checkout. |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Confined to worktree-management + one log condition in claudeInvoker. |
| Negotiable | OK | Directory list is the negotiable surface; replace-all semantics are not. |
| Valuable | OK | Fixes a live review-blocking bug and closes a review-bypass vector. |
| Estimable | OK | One new service, one usecase edit, wiring. |
| Small | OK | ~6 files. |
| Testable | OK | Scenarios map to FS-level assertions. |

Verdict: **READY**

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md` for the full checklist.
