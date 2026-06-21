# Report — SPEC-073 Stage 4d: drop unused `_trackingGateway` controller param

> Sub-stage 4d ONLY (smallest, lowest-risk). Governed by plan §5 + §9. Pure mechanical
> refactor — NO behavior change. 4a/4b/4c NOT touched.

## Summary

`handleGitLabWebhook` / `handleGitHubWebhook` took a dead 4th positional param
`_trackingGateway: ReviewRequestTrackingGateway` (already underscore-prefixed = signalled dead).
Dropped from both signatures + both `routes.ts` call sites + every test call site, and removed the
now-orphan `ReviewRequestTrackingGateway` import from both controllers. No production behavior change.

The plan's premise held: the param was genuinely dead. No call site or test depended on its value
being passed (each call passed a variable in that slot, but the controller bodies never read it).

## Files modified

### Production (3)
| File | Change |
|---|---|
| `src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts` | Dropped `_trackingGateway` param (was line 237) + orphan `ReviewRequestTrackingGateway` import (was line 47). |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts` | Dropped `_trackingGateway` param (was line 317) + orphan `ReviewRequestTrackingGateway` import (was line 46). |
| `src/main/routes.ts` | Dropped `trackingGw` positional arg from `handleGitLabWebhook` (578) and `handleGitHubWebhook` (652) call sites. The `trackingGw` variable (line 416) is still used by other DI wiring and was left intact. |

### Tests (9)
| File | Call sites updated |
|---|---|
| `src/tests/units/interface-adapters/controllers/webhook/gitlab.controller.test.ts` | 40 — dropped `mockGateway` positional arg. |
| `src/tests/units/interface-adapters/controllers/webhook/github.controller.test.ts` | 44 — dropped `mockGateway` positional arg; removed now-orphan `mockGateway` var (decl+assign), the now-orphan local `createMockTrackingGateway` helper (existed only to feed the dead param), and the now-orphan `TrackedMr` type import. |
| `src/tests/units/modules/platform-integration/interface-adapters/controllers/webhook/gitlabIdempotency.controller.test.ts` | 5 — dropped `mockGateway` positional arg. |
| `src/tests/acceptance/200-webhook-event-idempotency.acceptance.test.ts` | 8 — dropped `mockGateway` positional arg. |
| `src/tests/acceptance/46-github-followup-review-on-push.acceptance.test.ts` | 6 — dropped `mockGateway` positional arg. |
| `src/tests/acceptance/180-quality-threshold-block-approval-iter-B.acceptance.test.ts` | 3 — dropped `tracking` positional arg. |
| `src/tests/acceptance/180-quality-threshold-block-approval-iter-C.acceptance.test.ts` | 2 — dropped `tracking` positional arg (GitLab + GitHub). |
| `src/tests/acceptance/197-trusted-actor-provenance-gate.acceptance.test.ts` | 12 — dropped the lone per-call `*Tracking` positional arg (multiline calls reflowed by `oxfmt`). |

The task brief named 3 controller test files; the mandated grep ("find them all") surfaced **8**
test files calling these handlers positionally. All 8 were updated.

## `ReviewRequestTrackingGateway` orphan evidence

Grep BEFORE the change (each controller — only 2 occurrences: the import and the dead param):

```
gitlab.controller.ts:
  47:import type { ReviewRequestTrackingGateway } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
  237:  _trackingGateway: ReviewRequestTrackingGateway,
github.controller.ts:
  46:import type { ReviewRequestTrackingGateway } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';
  317:  _trackingGateway: ReviewRequestTrackingGateway,
```

The `GitLabWebhookDependencies` / `GitHubWebhookDependencies` interfaces do NOT reference
`ReviewRequestTrackingGateway` (confirmed). Therefore the import was fully orphaned in both files
once the param was removed → safely deleted. Grep AFTER the change: `NONE` in either controller.

## Verification

`yarn verify` (typecheck + lint + format:check + test:ci):

```
typecheck:    OK
lint:         OK (only pre-existing warnings; zero errors)
format:check: OK (all matched files use the correct format)
test:ci:      475 test files passed (475), 3939 tests passed (3939), 0 failed
exit code:    0
```

Two in-scope follow-on fixes were required to keep `yarn verify` green (both direct consequences
of the 4d deletion, not scope creep):
1. `github.controller.test.ts`: removing the dead 4th arg orphaned its `mockGateway` var → which
   orphaned its local `createMockTrackingGateway` helper → which orphaned its `TrackedMr` import.
   All three removed (TS6133 no-unused enforcement). The other 7 test files keep their
   `mockGateway`/`tracking` vars (still used in deps construction / assertions) — untouched beyond
   the arg drop.
2. `197-...acceptance.test.ts`: multiline calls left a formatting drift after arg removal; `oxfmt`
   reflowed them (byte-for-byte semantic no-op).

## Out-of-scope items SIGNALLED (not fixed, per scope-discipline)

- `github.controller.test.ts:98` (and a few peers) uses a **relative import**
  (`'../../../../factories/trackedMr.factory.js'`) — violates the `@/` alias rule. Pre-existing,
  left untouched.
- `docs/feature-tracker.md` shows as modified and `docs/plans/73-stage4-controller-thinning.plan.md`
  as untracked in the worktree — both are pre-existing state from the planning run (not touched by
  this 4d implementation). Left as-is for the orchestrator.
- Numerous pre-existing lint warnings (max-lines, max-depth, max-params on the controllers, etc.).
  Untouched — these are tracked debt, out of 4d scope.

## Status

Stage 4d COMPLETE. `yarn verify` green (exit 0). NOT committed (orchestrator commits).
