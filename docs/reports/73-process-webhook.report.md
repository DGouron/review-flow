# Report — SPEC-073 Stage 3: ProcessWebhook orchestrator + WebhookEvent union

Plan: `docs/plans/73-process-webhook.plan.md` (DECISION LOCK enforced) · Spec: `docs/specs/73-extract-webhook-processing-usecase.md`

## Status: OK Clean — `yarn verify` green (473 files / 3921 tests), acceptance GREEN

## What shipped (Stage 3 only)

A platform-neutral `WebhookEvent` discriminated union (entity layer) plus a function-based
`processWebhook(event, deps)` orchestrator that routes the **synchronous** webhook outcomes
(`close`, `merge`, `followup-push` eligibility, `ignored`). Both webhook controllers now map their
already-parsed close/merge/followup events into `WebhookEvent`, call `deps.processWebhook`, and map
the `ProcessWebhookResult` back to their **exact** existing HTTP replies (status code + body keys
byte-for-byte, incl. GitLab `mrNumber` vs GitHub `prNumber`). Wired in the composition root.

Per the DECISION LOCK, the `approve` and `review-requested` paths stay 100% controller-side
(folded into Stage 4): the union carries both variants for completeness, but the orchestrator does
not route them — they return `{ type: 'ignored', reason: '<variant>-handled-by-controller' }` to
keep the switch total without a `never` throw. Budget gate, processor closure capturing
`executeReview`, `gateClaudeInvocation`, actor-trust, and `enqueueReview` all remain controller-side.

## Files created

- `src/modules/platform-integration/entities/webhookEvent/webhookEvent.ts` — `WebhookEvent`
  discriminated union (6 variants), pure type module (no Zod guard; data already validated upstream).
- `src/modules/platform-integration/usecases/processWebhook.usecase.ts` — `processWebhook(event, deps)`,
  `ProcessWebhookResult`, `ProcessWebhookDependencies`, `ProcessWebhook` function type. Imports only
  `entities/` + sibling `usecases/` (Dependency Rule respected; no `interface-adapters/`, no
  `frameworks/`, no platform-specific event type).
- `src/tests/units/modules/platform-integration/usecases/processWebhook.usecase.test.ts` — 13 unit
  tests (one describe per routed variant, state-based on fn stubs).
- `src/tests/acceptance/73-process-webhook.acceptance.test.ts` — 8 acceptance tests (SDD outer loop),
  drives `processWebhook` directly, imports NO `GitLab*`/`GitHub*` type (platform-neutrality proof).

## Files modified

- `gitlab.controller.ts` — close/merge/followup mapped → `WebhookEvent` → `deps.processWebhook`;
  reply shapes preserved exactly. `processWebhook` added to `GitLabWebhookDependencies`. Approve and
  review-request paths untouched (`deps.transitionState` re-qualified in approve branch since
  `transitionState`/`recordPush`/`checkFollowupNeeded` were dropped from the handler destructuring).
- `github.controller.ts` — close/followup mapped the same way (GitHub has no merge branch — a merged
  PR arrives as close). `processWebhook` added to `GitHubWebhookDependencies`.
- `src/main/routes.ts` — `processWebhook` composed per-platform from existing usecases (shares the
  per-platform `handleClose` closure, now extracted into `gitLabHandleClose`/`gitHubHandleClose`),
  injected into both controller dep objects.
- 5 controller/acceptance test files updated to provide `processWebhook` composed from the same
  stub/mock sub-deps: `gitlab.controller.test.ts`, `github.controller.test.ts`,
  `gitlabIdempotency.controller.test.ts`, `200-webhook-event-idempotency.acceptance.test.ts`,
  `197-trusted-actor-provenance-gate.acceptance.test.ts`, `46-github-followup-review-on-push.acceptance.test.ts`.

## Test counts

| Suite | Tests |
|---|---|
| `processWebhook.usecase.test.ts` (unit) | 13 |
| `73-process-webhook.acceptance.test.ts` | 8 |
| `gitlab.controller.test.ts` + `github.controller.test.ts` | 91 (preserved, reply shapes intact) |
| Full `yarn test:ci` | 3921 pass / 473 files |

`yarn verify` (typecheck + lint + format:check + test:ci): **exit 0**.

## Spec coverage (Stage 3 scope per DECISION LOCK)

- OK `close` → `{ type:'closed', mergeRequestNumber, jobCancelled, trackingArchived }`; controller maps
  to existing `200 { status:'cleaned', mrNumber/prNumber, ... }` — covered by acceptance + both controller tests.
- OK `merge` → `transitionState(targetState:'merged')` + best-effort `removeWorktree`; `{ type:'merged' }`
  → `200 { status:'merged', mrNumber }` — covered (GitLab only; GitHub has no merge branch).
- OK `followup-push` eligible → `{ type:'followup-eligible' }`; controller proceeds to its unchanged
  budget/gate/enqueue tail — covered by spec-46 + spec-197 acceptance.
- OK `followup-push` skipped (not tracked / no followup needed / auto-followup off) →
  `{ type:'followup-skipped', reason }`; controller maps `'Auto-followup disabled'` →
  `200 { status:'ignored', reason:'Auto-followup disabled' }`, others fall through to
  `200 { status:'ignored', reason: filterResult.reason }` — covered.
- OK `ignored` → reason passthrough — covered.
- OK Platform-neutrality: orchestrator + acceptance import no `GitLab*`/`GitHub*` type — asserted.
- KO (out of scope, Stage 4) `approve`, `review-requested` async tail, HTTP reply-shape unification,
  `_trackingGateway` param removal — explicitly deferred per DECISION LOCK.

## Self-review

- Naming: full words (`mergeRequestNumber`, `decideFollowupSkipReason`), camelCase files, domain suffixes. OK
- Imports: `@/` alias + `.js` everywhere (source AND tests), no relative, no barrel. OK
- TypeScript: zero `any`/`as Type`/`!` in production files. OK
- Dependency Rule: usecase imports only entities + sibling usecases. OK
- `null` (not `undefined`) in the domain union (`description`, `language`, `displayName`). OK
- Anti-overengineering: no Zod guard for a type that never crosses an untrusted boundary; orchestrator
  routes only the synchronous subset (transitional bridge to Stage 4, flagged in the plan). OK

## Remaining issues

None. Stage 4 (full controller thinning + HTTP reply-shape unification + approve/review-request
inward move + `_trackingGateway` removal) remains as planned future work — out of scope here.
