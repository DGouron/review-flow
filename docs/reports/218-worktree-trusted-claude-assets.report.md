# Report — SPEC-218: Sync trusted Claude assets into the review worktree

## Trigger

PR practivizio-app#1281: the review session failed with `Unknown command: /review-code` because the MR branch predated the commit that added the review skill to the repository. Root cause generalizes into a security hole: the review session loads `.claude/` assets from the branch under review, so a branch author can delete or weaken the review skill, agents, or commands — or commit a `.claude/settings.json` registering arbitrary hooks — to make their PR pass.

## Change

After every worktree checkout or reset onto the MR branch, `ensureWorktree` now replaces the worktree's `.claude/skills`, `.claude/agents`, and `.claude/commands` with copies from the source checkout (`sourceCheckoutPath`), and (re)writes `.claude/settings.json`. Both run on `created` **and** `reused` paths — previously settings were only written on creation, so a `reset --hard` on reuse restored whatever settings the branch committed.

- Sync failure fails the ensure with reason `claude-assets-sync-failed` (the review must never run on unverified branch-controlled assets).
- Settings write failure stays a non-blocking warning, now surfaced on `reused` too (`settingsWarning` added to the `reused` variant of `EnsureResult`).

## Artefacts

- Service (new): `src/modules/worktree-management/services/trustedClaudeAssetsSync.ts` — delete-then-copy of the three asset directories; absent source directory means deletion only (a branch cannot inject assets).
- Use case (modified): `src/modules/worktree-management/usecases/ensureWorktree.usecase.ts` — new `syncTrustedClaudeAssets` dependency, called on both branches; settings rewrite added to the reuse branch.
- Schema (modified): `src/modules/worktree-management/entities/worktree/worktree.schema.ts` — `settingsWarning` on the `reused` variant.
- Gateway (modified): `src/modules/worktree-management/interface-adapters/gateways/worktree.fileSystem.gateway.ts` — wires the real service.
- Invoker (modified): `src/frameworks/claude/claudeInvoker.ts` — settings warning logged for any non-failed ensure, not only `created`.

## Tests

- Acceptance (new): `src/tests/acceptance/218-worktree-trusted-claude-assets.acceptance.test.ts` — real FS services through `ensureWorktree` (missing skill restored, tampered assets replaced, injected skill removed, malicious settings overwritten).
- Unit (new): `src/tests/units/modules/worktree-management/services/trustedClaudeAssetsSync.test.ts` — 7 cases including no-source-`.claude`, reviews-data exclusion, copy failure.
- Unit (updated): `ensureWorktree.usecase.test.ts` — sync called on create and reuse, hard failure on sync error, settings warning surfaced on reuse.
- Acceptance (updated): `170-prebuilt-worktree-lifecycle.acceptance.test.ts` — scenario 2 now expects the settings rewrite on reuse.

## Deliberate exclusions

- Whole-`.claude` sync (would drag reviews tracking data, logs, nested worktrees into the review worktree).
- Branch-side CLAUDE.md / rule files — prompt context, not executable surface; separate spec if needed.
