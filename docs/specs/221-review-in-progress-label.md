# Signal an in-progress review with a platform label

## Status: implemented

## Context

While a review runs there is no signal on the merge request itself. The dashboard knows a job is
running, but anyone looking at the MR/PR on GitLab or GitHub sees nothing — so a reviewer can start
reading, or the author can push, without knowing an automated review is already in flight.

ReviewFlow already has a `ADD_LABEL` review action wired for both platforms
(`reviewAction.github.cli.gateway.ts`, `reviewAction.gitlab.cli.gateway.ts`), but review actions
written by Claude land in the review-context file and are only executed **after** the run completes
(`executeReview.usecase.ts` → `executePostReviewActions`). That channel therefore cannot signal
"in progress" — the label would appear at the very moment the review ends.

This feature adds a dedicated server-side label channel, applied by `executeReview` before Claude is
invoked and cleared when the run reaches any terminal state. It is fully deterministic: no prompt
instruction, no subagent, no token cost, and it cannot be skipped by an agent ignoring its
instructions.

Scope is limited to the **initial review** (`isFollowup === false`). Follow-up runs are untouched.

## Rules

- the label name is the domain constant `review-in-progress` — not configurable in this iteration
- when an initial review starts, before Claude is invoked, ReviewFlow ensures the label exists on the
  project and then applies it to the merge request
- ensuring the label exists is idempotent: if the label already exists on the project, the run
  proceeds without error and without altering the existing label
- the label is removed from the merge request when the review reaches any terminal state —
  `completed`, `cancelled`, or `failed` (both the Claude-invocation failure and the
  unreadable-context failure)
- label operations are best-effort: any failure (missing scope, network, CLI error) is logged as a
  warning and **never** changes the review outcome — a review that succeeds still reports
  `completed` even if its label could not be applied or removed
- if applying the label failed, the removal attempt still runs (it is a no-op on the platform side)
  and its own failure is likewise swallowed
- follow-up reviews (`isFollowup === true`) neither apply nor remove the label
- both platforms are supported through one gateway contract with a GitLab CLI implementation
  (`glab`) and a GitHub CLI implementation (`gh`)

## Scenarios

- initial review starts: {initial review job, GitHub} → label `review-in-progress` ensured on the
  repository then applied to the PR, before `claudeInvoker.invoke` is called
- initial review starts: {initial review job, GitLab} → same, via `glab`
- label already exists: {initial review, label `review-in-progress` already present on the project}
  → ensure step is a no-op, label applied, no error surfaced
- review completes: {initial review, Claude returns success, actions executed} → label removed,
  result `completed` with unchanged stats
- review cancelled: {initial review, run aborted} → label removed, result `cancelled`
- review fails on invocation: {initial review, Claude exits non-zero} → label removed, result
  `failed` with the same reason as today
- review fails on unreadable context: {initial review, context file unreadable after the run} →
  label removed, result `failed` with `CONTEXT_UNREADABLE_REASON`
- apply fails: {initial review, ensure or add throws} → warning logged, Claude still invoked, review
  outcome identical to a run without the feature
- remove fails: {initial review completes, remove throws} → warning logged, result still `completed`
- follow-up review: {follow-up job} → no label applied, no label removed, behavior identical to
  before this feature

## Out of Scope

- Making the label name configurable per project (`.reviewflow.json`)
- Label colour / description management beyond what is needed to create a missing label
- A distinct label per outcome (`review-passed`, `review-blocked`) — only the in-progress signal
- Applying the label on follow-up reviews
- Exposing the label state on the dashboard
- Reconciling labels left over from a daemon crash mid-review (no startup sweep)
- Replacing or removing the existing Claude-driven `ADD_LABEL` review action

## Glossary

| Term | Definition |
|------|------------|
| in-progress label | The `review-in-progress` platform label marking a merge request currently under automated review |
| ensure | Create the label on the project if it does not exist yet; no-op otherwise |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | New gateway + 2 use cases + wiring; no existing behavior changed |
| Negotiable | OK | Label colour and exact CLI invocation left to implementation |
| Valuable | OK | Makes an in-flight review visible to humans on the platform itself |
| Estimable | OK | 1 gateway contract, 2 CLI implementations, 2 use cases, 1 constant, wiring in executeReview |
| Small | OK | ~10 files including tests |
| Testable | OK | Each rule maps to a scenario; gateways are CLI-command assertions |

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md`.

## Implementation

### Artefacts

- **Entity (new)**: `src/modules/platform-integration/entities/reviewLabel/reviewLabel.ts`
  (`REVIEW_IN_PROGRESS_LABEL` constant) + `.../reviewLabel.gateway.ts` (`ReviewLabelGateway` with
  `ensureLabelExists` / `addLabel` / `removeLabel`). No schema/guard/factory — nothing external
  crosses a boundary inward here.
- **Use cases (new)**: `MarkReviewInProgressUseCase` (ensure + add) and
  `ClearReviewInProgressUseCase` (remove), both in
  `src/modules/platform-integration/usecases/`. Their `execute` is contractually non-throwing: they
  own the `try/catch` + `logger.warn`.
- **Gateways (new)**: `reviewLabel.github.cli.gateway.ts` (`gh`) and
  `reviewLabel.gitlab.cli.gateway.ts` (`glab`) under
  `src/modules/platform-integration/interface-adapters/gateways/cli/`, following the
  `noteCommentPost.*.cli.gateway.ts` precedent (injected `CommandExecutor`, local `shellQuote`).
- **Use case (modified)**: `executeReview.usecase.ts` — the existing body renamed verbatim to a
  private `runReviewPipeline`; the new exported `executeReview` early-returns for follow-ups, marks,
  then wraps the pipeline in `try/finally` to clear.
- **Wiring**: `executeReviewWiring.ts` gained `reviewLabelGateway` and constructs both use cases;
  `routes.ts` builds one gateway per platform and injects it at both `buildExecuteReview` call sites.

### Decisions

- The `try/finally` wrapper covers all four terminal returns plus an unexpected throw, writes the
  `isFollowup` gate once, and leaves the pipeline body byte-identical.
- `ensureLabelExists` swallows its error **inside the gateway**: neither CLI guarantees an idempotent
  create, and swallowing in the use case instead would skip `addLabel` and break the
  "label already exists → label applied" rule. A genuine permission failure therefore surfaces one
  call later as an *add* warning.
- `labels[]=<label>` is shell-quoted as a whole token — these gateways build one `/bin/sh` string
  (unlike `reviewAction.*.cli.gateway.ts`, which passes an args array) and bare `[]` is a glob class.
- No egress-scan wrapper: the label is a code-side constant, never model-authored text.
- GitLab create hard-codes colour `#1f77b4` (GitLab requires one; GitHub picks its own).
- The GitLab command forms rest on the documented REST parameters and the `add_labels` form already
  in production; they were **not** exercised against a live GitLab instance.

Full report: [docs/reports/221-review-in-progress-label.report.md](../reports/221-review-in-progress-label.report.md).
