# Report — Signal an in-progress review with a platform label

Spec: [221-review-in-progress-label](../specs/221-review-in-progress-label.md) —
Plan: [221-review-in-progress-label.plan](../plans/221-review-in-progress-label.plan.md)

## Status: implemented

`yarn verify` green: typecheck clean, lint free of new warnings, format clean, 4315 tests / 513 files
passing.

## What was built

A server-side label channel that marks a merge request while its initial review runs. The label is
applied before Claude is invoked and removed on every terminal state.

The pre-existing `ADD_LABEL` review action was deliberately left untouched: actions authored by
Claude land in the review-context file and only execute after the run completes
(`executeReview.usecase.ts` → `executePostReviewActions`), so that channel structurally cannot carry
an "in progress" signal.

## Files

### Entity — `platform-integration`

- `src/modules/platform-integration/entities/reviewLabel/reviewLabel.ts` —
  `REVIEW_IN_PROGRESS_LABEL = 'review-in-progress'` constant.
- `src/modules/platform-integration/entities/reviewLabel/reviewLabel.gateway.ts` —
  `ReviewLabelGateway` with `ensureLabelExists` / `addLabel` / `removeLabel`, plus the
  `EnsureReviewLabelInput` / `ReviewLabelInput` shapes.

No schema, guard, factory or value object: nothing external crosses a boundary inward here, so those
would have been pure boilerplate. The label name is a gateway *parameter*, not hard-coded in the
gateway, which keeps the CLI implementations testable without the domain constant.

### Use cases

- `src/modules/platform-integration/usecases/markReviewInProgress.usecase.ts` — ensure then add.
- `src/modules/platform-integration/usecases/clearReviewInProgress.usecase.ts` — remove.

Both `execute` methods are contractually non-throwing: they own the `try/catch` + `logger.warn`.
This is what keeps `executeReview` free of label error handling and what guarantees the removal still
runs after a failed application.

### Gateway implementations

- `src/modules/platform-integration/interface-adapters/gateways/cli/reviewLabel.github.cli.gateway.ts`
- `src/modules/platform-integration/interface-adapters/gateways/cli/reviewLabel.gitlab.cli.gateway.ts`

Both follow the `noteCommentPost.*.cli.gateway.ts` precedent: injected `CommandExecutor`, local
`shellQuote` helper.

### Modified

- `src/modules/review-execution/usecases/executeReview.usecase.ts` — the existing 85-line body was
  renamed verbatim to a private `runReviewPipeline` (zero edits inside it); a new ~14-line exported
  `executeReview` wraps it.
- `src/main/executeReviewWiring.ts` — `reviewLabelGateway` added to
  `ExecuteReviewWiringDependencies`, the two use cases constructed and injected into
  `ExecuteReviewDependencies`.
- `src/main/routes.ts` — one gateway instance per platform (lines ~400), injected at both
  `buildExecuteReview` call sites.

### Tests

- `src/tests/units/modules/platform-integration/interface-adapters/gateways/cli/reviewLabel.cli.test.ts`
  — exact command-string assertions for both platforms.
- `src/tests/units/modules/platform-integration/usecases/markReviewInProgress.usecase.test.ts`
- `src/tests/units/modules/platform-integration/usecases/clearReviewInProgress.usecase.test.ts`
- `src/tests/stubs/reviewLabel.stub.ts`
- `src/tests/acceptance/221-review-in-progress-label.acceptance.test.ts` — GREEN, one test per spec
  scenario.
- Extended: `src/tests/units/modules/review-execution/usecases/executeReview.usecase.test.ts` and
  `src/tests/acceptance/73-execute-review-usecase.acceptance.test.ts` (stub deps gained the two new
  fields).

## CLI commands

| Op | GitHub | GitLab |
|----|--------|--------|
| ensure | `gh label create <label> --force -R <projectPath>` | `glab api --method POST projects/<encoded>/labels --field name=<label> --field color=#1f77b4` |
| add | `gh api --method POST repos/<projectPath>/issues/<n>/labels --field labels[]=<label>` | `glab api --method PUT projects/<encoded>/merge_requests/<n> --field add_labels=<label>` |
| remove | `gh api --method DELETE repos/<projectPath>/issues/<n>/labels/<label>` | `glab api --method PUT projects/<encoded>/merge_requests/<n> --field remove_labels=<label>` |

`gh label create --force` was verified against the locally installed `gh` — `--force` updates an
existing label instead of failing, which makes the GitHub ensure genuinely idempotent. `glab` is not
installed on the machine where this was implemented: the two GitLab forms rest on the documented
REST parameters (`add_labels` / `remove_labels` are the symmetric MR-update fields) and on the
`add_labels` form already in production in `reviewAction.gitlab.cli.gateway.ts:63`. **They have not
been exercised against a live GitLab instance.**

## Decisions

- **`executeReview` wrapper rather than four edit sites.** A `try/finally` around the renamed
  pipeline covers all four terminal returns (`cancelled`, `failed` on invoke, `failed` on unreadable
  context, `completed`) *and* an unexpected throw, writes the `isFollowup` gate once, and adds no
  oxlint size warning. The pipeline body is byte-identical to before.
- **`ensureLabelExists` swallows inside the gateway, not the use case.** Neither CLI offers a
  guaranteed-idempotent create, and telling "already exists" apart from "no permission" would mean
  parsing stderr. Swallowing in the use case instead would skip `addLabel` and violate the spec rule
  "label already exists → label applied, no error surfaced". Consequence: a genuine
  missing-permission failure surfaces one call later, as an *add* warning rather than an *ensure*
  warning.
- **Whole-token shell quoting.** These gateways concatenate a single string handed to `/bin/sh`,
  unlike `reviewAction.*.cli.gateway.ts` which passes an args array. `labels[]=<label>` is therefore
  quoted as one token — bare `[]` is a glob character class in sh. Every interpolated value is
  quoted, including the label in the DELETE path segment.
- **No egress-scan wrapper.** The label is a code-side constant, never model-authored text, so it
  carries nothing for `EgressScannedNoteCommentPostGateway` to scan.
- **Label colour `#1f77b4` hard-coded** for the GitLab create (GitLab requires a colour; GitHub picks
  one). Not exposed as configuration — out of scope.

## Known limitations

- The GitLab command forms are unverified against a live instance (see above). Best-effort semantics
  contain the blast radius: a wrong form logs a warning and leaves the review outcome intact.
- A label left over from a daemon crash mid-review is not reconciled (spec out of scope) — it is
  cleared by the next review of that merge request.
- `removeLabel` on GitHub returns 404 when the label is absent, which logs a spurious warning after
  a run whose apply had already failed. Harmless, and the alternative (`gh pr edit --remove-label`)
  would break the `gh api` consistency of the gateway.
