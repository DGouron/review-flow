# Implementation Report — SPEC-209 Guard oversized merge requests

> Spec: `docs/specs/209-mr-size-guard.md` · Plan: `docs/plans/209-mr-size-guard.plan.md`
> Status: implemented · Date: 2026-06-22

## Status: Complete

## Files created

| File | Description |
|------|-------------|
| `src/modules/shared-kernel/entities/diffSizeGate/diffSizeGate.ts` | Pure `evaluateDiffSizeGate` + `ChangedFile` type + excluded-basename set |
| `src/modules/shared-kernel/entities/diffSizeGate/changedFilesFetch.gateway.ts` | Per-file changed-files port (`ChangedFile[] | null`) |
| `src/modules/platform-integration/interface-adapters/gateways/changedFilesFetch.gitlab.gateway.ts` | GitLab GraphQL `diffStats` impl |
| `src/modules/platform-integration/interface-adapters/gateways/changedFilesFetch.github.gateway.ts` | GitHub `pulls/{n}/files --paginate` impl |
| `src/modules/platform-integration/usecases/guardDiffSize.usecase.ts` | Fetch → gate → verdict + FR `buildSplitMessage` |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/diffSizeGuard.helper.ts` | `applyDiffSizeGuard` — per-mode revoke/comment/anti-spam |
| `src/tests/factories/changedFiles.factory.ts` | `ChangedFile` test factory |
| `src/tests/stubs/changedFilesFetch.stub.ts` | Stub gateway (`setResponse`/`setFailure`) |
| `src/tests/units/.../diffSizeGate.test.ts` | Gate unit tests |
| `src/tests/units/.../guardDiffSize.usecase.test.ts` | Use case unit tests |
| `src/tests/units/.../changedFilesFetch.gitlab.gateway.test.ts` | GitLab gateway tests |
| `src/tests/units/.../changedFilesFetch.github.gateway.test.ts` | GitHub gateway tests |
| `src/tests/units/.../diffSizeGuard.helper.test.ts` | Helper tests (3 modes + best-effort failures) |
| `src/tests/acceptance/209-mr-size-guard.acceptance.test.ts` | Outer-loop acceptance test |

## Files modified

- `src/config/projectConfig.ts` — `maxDiffLines?` per-repo + `parseMaxDiffLines`
- `src/frameworks/config/configLoader.ts` — global `maxDiffLines?`
- `src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts` — deps + 3 gated sites
- `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts` — deps + 3 gated sites
- `src/main/routes.ts` — DI wiring + `getMaxDiffLines` resolver (both webhooks)
- Test-wiring (new required deps added to deps builders): `46`, `180`, `197` acceptance tests; `github.controller.test.ts`, `gitlab.controller.test.ts`, `gitlabIdempotency.controller.test.ts`, config tests

## Tests

- `yarn verify` GREEN: typecheck + lint + format + **3988 tests passed** (481 files), 0 failures.
- Lint: only pre-existing size/depth warnings (tracked debt); no errors.

## Spec coverage

| Rule / scenario | Covered by |
|---|---|
| counted size excludes package.json + lockfiles | `diffSizeGate.test.ts`, acceptance "lockfiles/package.json excluded" |
| oversized = counted strictly > budget | `diffSizeGate.test.ts` |
| budget per-repo → global → 2000 | `projectConfig.test.ts`, `configLoader.test.ts`, `routes` resolver |
| oversized review → no enqueue + FR comment | `guardDiffSize.usecase.test.ts`, `diffSizeGuard.helper.test.ts`, acceptance, controller tests |
| oversized followup → no enqueue, silent | `diffSizeGuard.helper.test.ts`, acceptance |
| oversized approve → approval revoked + comment | `diffSizeGuard.helper.test.ts`, acceptance |
| fail-open on fetch failure | `guardDiffSize.usecase.test.ts`, acceptance |
| both GitLab and GitHub | controller tests + gateway tests both platforms |

## Notes / follow-ups

- The controller blocked-branch (`if (blocked) { reply rejected; return }`) is a trivial reply+return; the decision logic it guards is fully tested at the helper seam.
- GitHub `/files` pagination handled via `--paginate`.
- Dashboard surfacing of the blocked-for-size state remains out of scope (potential follow-up).
