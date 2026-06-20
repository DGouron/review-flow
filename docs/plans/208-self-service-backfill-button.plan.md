# Plan — SPEC-208 Self-service backfill button

> Spec: `docs/specs/208-self-service-backfill-button.md`
> Architecture: modular monolith (`src/modules/<context>/...`), inside-out TDD (Detroit).
> Goal: make the dashboard "Recalculate" button actually backfill change-size data by (1) resolving each project's platform + project identifier from its git remote, (2) feeding the identifier to the platform gateway instead of the local path, (3) recomputing `diffStatsReviewCount`, (4) rejecting unresolvable projects.

```
PLAN:
  scope: self-service backfill button
  is_new_module: false
```

## ANTI-OVERENGINEERING CHALLENGE

The temptation is a new "ProjectIdentifierResolver" gateway/service hierarchy. Rejected.

- The git side (run `git remote get-url`, sniff platform) **already exists** in `GitRemoteCliGateway` (setup-wizard). Reuse it, do not duplicate.
- The only genuinely new logic is a **pure string parse**: git remote URL -> `group/proj`. That is one stateless function with branchy edge cases (SSH vs HTTPS, `.git` suffix, nested groups). It earns an entity file with a pure function + Zod-validated branded type at most — no class, no gateway, no use case wrapper.
- No new platform abstraction: the existing `Platform` union (`'github' | 'gitlab' | 'unknown'`) is sufficient.
- The resolver runs **once, in the route** (composition edge), producing `{ platform, projectIdentifier }` that flows inward as plain data. The inner use cases stay infrastructure-agnostic.

Net new files: 1 entity (+test) + 1 cross-module reuse of an existing gateway. Everything else is modify-in-place. Within the <10-file budget.

## ENTITIES

- **ProjectIdentifier resolver (NEW)** — pure function, no class
  - file: `src/modules/statistics-insights/entities/projectIdentifier/projectIdentifier.ts`
  - export: `resolveProjectIdentifier(remoteUrl: string): string | null`
  - returns `group/proj` (GitLab, may be nested e.g. `group/sub/proj`) or `owner/repo` (GitHub), or `null` if the URL cannot be parsed into an identifier
  - test: `src/tests/units/modules/statistics-insights/entities/projectIdentifier/projectIdentifier.test.ts`
  - NO schema/guard/gateway-contract files — the input is already a `string`, output is `string | null`; a Zod schema here would be boilerplate over a regex. (If branding `ProjectIdentifier` proves useful later, add it then — YAGNI now.)

- **ReviewStats.diffStatsReviewCount** — field already exists optional in `entities/stats/projectStats.ts:41`. No entity change.

## RESOLVER DESIGN

**Where it lives**: pure function in `statistics-insights` entities (domain layer). It takes a remote URL string and returns the identifier. It does NOT touch the filesystem or run git — that is the gateway's job.

**How the two halves compose (in the route, the dirty edge)**:

```
repository.localPath                      (from config)
   │
   ├─ gitRemoteGateway.getOriginRemote(localPath) ── string | null   (existing, setup-wizard)
   │        │
   │        ├─ null ──────────────────────────────► reject RULE 3
   │        ▼
   ├─ gitRemoteGateway.detectPlatform(remote) ──── 'github'|'gitlab'|'unknown'   (existing)
   │        │
   │        └─ 'unknown' ──────────────────────────► reject RULE 3
   │
   └─ resolveProjectIdentifier(remote) ──────────── string | null   (NEW pure fn)
            │
            └─ null ────────────────────────────────► reject RULE 3
                                                        "Plateforme du projet introuvable"
   ▼
{ platform, projectIdentifier }  ──► recalculateWithBackfill (plain data, flows inward)
```

**Parsing rules** (drive the unit-test table):
| input remote | output identifier |
|---|---|
| `git@gitlab.com:group/proj.git` | `group/proj` |
| `https://gitlab.com/group/proj.git` | `group/proj` |
| `git@gitlab.com:group/sub/proj.git` | `group/sub/proj` (nested groups preserved) |
| `git@github.com:owner/repo.git` | `owner/repo` |
| `https://github.com/owner/repo` | `owner/repo` |
| `git@gitlab.example.com:org/proj.git` | `org/proj` (self-hosted host stripped) |
| `not-a-url` / `""` | `null` |

Strategy: strip protocol/host prefix (`scheme://host/` or `git@host:`), strip trailing `.git`, require at least `seg/seg`; otherwise `null`. Implementation detail left to the implementer; the table is the contract.

## USECASES (all MODIFY — no new use case)

- **`backfillDiffStats.usecase.ts`** (MODIFY)
  - file: `src/modules/statistics-insights/usecases/stats/backfillDiffStats.usecase.ts`
  - test: `src/tests/units/usecases/stats/backfillDiffStats.usecase.test.ts`
  - **DEFECT 2 fix**: add `projectIdentifier: string` to `BackfillDiffStatsInput`. Keep `projectPath` for `statsGateway.loadProjectStats/saveProjectStats` (filesystem key). Change line 52 from `fetchDiffStats(projectPath, review.mrNumber)` to `fetchDiffStats(projectIdentifier, review.mrNumber)`.
  - The gateway signature `fetchDiffStats(string, number)` is UNCHANGED — the first arg's *meaning* shifts from "local path" to "platform identifier". The `StubDiffStatsFetchGateway` already ignores arg 1 (`_projectPath`), so stub stays valid; add one assertion that the identifier (not the path) is forwarded.

- **`recalculateWithBackfill.usecase.ts`** (MODIFY)
  - file: `src/modules/statistics-insights/usecases/stats/recalculateWithBackfill.usecase.ts`
  - test: `src/tests/units/usecases/stats/recalculateWithBackfill.usecase.test.ts`
  - **DEFECT 1 + 3 fix**: add `projectIdentifier: string | null` to `RecalculateWithBackfillInput`. Guard becomes `shouldBackfill && diffStatsFetchGateways && platform && projectIdentifier`. Pass `projectIdentifier` through to `backfillDiffStats`. (Rejection itself — RULE 3 — is done upstream in the route so the user gets a 4xx + message; this use case stays fire-and-forget. If identifier is null here it simply skips, but the route should have rejected before calling.)

- **`recalculateProjectStats.usecase.ts`** (MODIFY)
  - file: `src/modules/statistics-insights/usecases/stats/recalculateProjectStats.usecase.ts`
  - test: `src/tests/units/usecases/stats/recalculateProjectStats.usecase.test.ts`
  - **DEFECT 4 fix (RULE 4)**: set `stats.diffStatsReviewCount = reviewsWithDiffStats.length` alongside the totals/averages block (currently computed at lines 49-69 but never stored). Set it in BOTH branches (the `> 0` branch and the `else` -> `0`). Also set it in the no-stats empty-stats object (`= 0`) for consistency.

## GATEWAYS

- **`DiffStatsFetchGateway`** contract — UNCHANGED.
  - `src/modules/shared-kernel/entities/diffStats/diffStatsFetch.gateway.ts` keeps `fetchDiffStats(projectPath: string, mergeRequestNumber: number)`. Rename the param to `projectIdentifier` for clarity (optional, cosmetic; no behavior change). The GitLab/GitHub impls already interpolate arg 1 into `project(fullPath:"...")` / `repos/.../pulls` — they were always *expecting* the identifier; the bug was purely the caller passing the wrong value.
  - GitLab impl: `diffStatsFetch.gitlab.gateway.ts` — UNCHANGED.
  - GitHub impl: `diffStatsFetch.github.gateway.ts` — UNCHANGED.
  - `StubDiffStatsFetchGateway` (`src/tests/stubs/diffStatsFetch.stub.ts`) — optionally record the received identifier to assert forwarding; otherwise UNCHANGED.

- **`GitRemoteGateway`** (REUSE, cross-module) — `src/modules/setup-wizard/entities/gitRemote/gitRemote.gateway.ts` + impl `gitRemote.cli.gateway.ts`. Already exposes `getOriginRemote(path)` + `detectPlatform(url)`. Imported by the route. No change. (statistics-insights -> setup-wizard is an interface-adapter-to-interface-adapter dependency at the composition edge; the route imports the concrete gateway, the inner use cases stay clean.)

## CONTROLLERS / ROUTES

- **`stats.routes.ts`** (MODIFY) — `POST /api/stats/recalculate`
  - file: `src/modules/statistics-insights/interface-adapters/controllers/http/stats.routes.ts`
  - test: `src/tests/units/interface-adapters/controllers/http/statsRecalculate.routes.test.ts`
  - Add `gitRemoteGateway: GitRemoteGateway` to `StatsRoutesOptions` (injected, so tests stub it).
  - In the handler, AFTER the 404 repo check and BEFORE calling `recalculateWithBackfill`, resolve when `shouldBackfill` is true:
    1. `remote = gitRemoteGateway.getOriginRemote(repository.localPath)`
    2. `platform = remote ? gitRemoteGateway.detectPlatform(remote) : null`
    3. `projectIdentifier = remote ? resolveProjectIdentifier(remote) : null`
    4. If `shouldBackfill` AND (`remote === null` OR `platform === 'unknown'` OR `projectIdentifier === null`) -> `reply.status(422).send({ error: 'Plateforme du projet introuvable' })` and return. **(RULE 3)**
  - Drop the stale `repository.platform ?? null` (DEFECT 1 source, line 106) in favour of the resolved `platform`. Pass `platform` and `projectIdentifier` into `recalculateWithBackfill`.
  - When `shouldBackfill === false`: skip resolution entirely (recompute-only path stays working for projects without a remote).
  - Status code for rejection: `422 Unprocessable Entity` (project exists in config but cannot be backfilled). Confirm with implementer if `400` is preferred; spec only mandates the message, not the code.

## WIRING

- file: `src/main/routes.ts` (MODIFY, the only composition-root change)
  - Import `GitRemoteCliGateway` from `@/modules/setup-wizard/interface-adapters/gateways/gitRemote.cli.gateway.js`.
  - In the existing `app.register(statsRoutes, { ... })` block (lines 193-202), add `gitRemoteGateway: new GitRemoteCliGateway()`.
  - No new gateway instances for diff-stats (gitlab/github already wired lines 196-199). No route additions; `/api/stats/recalculate` already exists.

## SPEC-RULE -> SCENARIO -> TEST MAPPING

| Spec Rule | Scenario | Test (file :: case) |
|---|---|---|
| Resolve platform without manual config (RULE 1) | gitlab project / github project | `projectIdentifier.test.ts` (parse table) + `statsRecalculate.routes.test.ts` :: "resolves platform from git remote, not config" |
| Fetch using platform identifier, not local path (RULE 2) | gitlab `group/proj`, github `owner/repo` | `backfillDiffStats.usecase.test.ts` :: "forwards projectIdentifier to gateway, not projectPath" + `projectIdentifier.test.ts` |
| Reject unresolvable platform/identifier (RULE 3) | unresolvable platform: remote none -> reject | `statsRecalculate.routes.test.ts` :: "rejects with 'Plateforme du projet introuvable' when remote is missing / unknown / unparseable" |
| Recompute diffStatsReviewCount with totals/averages (RULE 4) | count maintained: 40 reviews -> count 40 | `recalculateProjectStats.usecase.test.ts` :: "sets diffStatsReviewCount to the number of reviews with diffStats" |
| Button populates reviews -> non-zero totals (RULE 5) | gitlab/github populated; nothing-missing unchanged | acceptance test (below) — full vertical slice |

### Existing tests that MUST change
- `statsRecalculate.routes.test.ts` — `createTestOptions` must add a stubbed `gitRemoteGateway` (e.g. `getOriginRemote -> 'git@gitlab.com:group/proj.git'`, `detectPlatform -> 'gitlab'`). Without it the backfill branch can't resolve. Add the rejection-path cases.
- `recalculateWithBackfill.usecase.test.ts` — every `recalculateWithBackfill({ ... })` call gains `projectIdentifier`. The "github gateway" and "run backfill" cases assert the identifier is forwarded. The "skip when platform null" case keeps working (now also covered by null identifier).
- `backfillDiffStats.usecase.test.ts` — every `backfillDiffStats({ projectPath, ... })` call gains `projectIdentifier`. Add the forwarding assertion.
- `recalculateProjectStats.usecase.test.ts` — add the `diffStatsReviewCount` assertion; the empty-reviews case asserts `0`.

## IMPLEMENTATION_ORDER

1. `entities/projectIdentifier/projectIdentifier.ts` (+ test) — pure domain core, the only genuinely new logic; testable in isolation, no I/O. **Walking-skeleton seed.**
2. `usecases/stats/recalculateProjectStats.usecase.ts` — RULE 4 one-liner (`diffStatsReviewCount`); smallest independent fix, unblocks the count scenario.
3. `usecases/stats/backfillDiffStats.usecase.ts` — add `projectIdentifier` input, forward to gateway (RULE 2).
4. `usecases/stats/recalculateWithBackfill.usecase.ts` — thread `projectIdentifier` through, tighten the guard (RULE 1 enablement).
5. `interface-adapters/controllers/http/stats.routes.ts` — resolve via `gitRemoteGateway` + `resolveProjectIdentifier`, reject unresolvable (RULE 3), pass resolved data inward.
6. `main/routes.ts` — wire `new GitRemoteCliGateway()` into `statsRoutes` (composition root, LAST).
7. acceptance test green.

## ACCEPTANCE_TEST

```
ACCEPTANCE_TEST:
  file: src/tests/acceptance/208-self-service-backfill-button.acceptance.test.ts
  note: "SDD outer loop — written first by implementer, RED during impl, GREEN at the end.
         Drives stats.routes via fastify.inject POST /api/stats/recalculate with backfill:true,
         a stubbed gitRemoteGateway (gitlab remote) and a StubDiffStatsFetchGateway returning
         non-zero diffStats. Asserts: reviews populated, totals/averages non-zero,
         diffStatsReviewCount == fetched count, and that the identifier (group/proj) — not the
         local path — reached the gateway. Second case: remote=none -> 422 +
         'Plateforme du projet introuvable'. Third: nothing-missing -> no fetch, totals unchanged."
```

## REFERENCE_FILES

- `src/modules/setup-wizard/interface-adapters/gateways/gitRemote.cli.gateway.ts` — REUSE `getOriginRemote` + `detectPlatform`; the resolver is the missing third piece.
- `src/modules/setup-wizard/entities/gitRemote/gitRemote.gateway.ts` — contract to inject into the route.
- `src/modules/setup-wizard/entities/projectContext/projectContext.schema.ts` — the `Platform` union (`'github'|'gitlab'|'unknown'`) reused for rejection logic.
- `src/modules/statistics-insights/usecases/stats/backfillDiffStats.usecase.ts:52` — DEFECT 2 (path passed where identifier expected).
- `src/modules/statistics-insights/usecases/stats/recalculateWithBackfill.usecase.ts:31` — DEFECT 1 (skips when platform null).
- `src/modules/statistics-insights/usecases/stats/recalculateProjectStats.usecase.ts:49-69` — DEFECT 4 (count never stored).
- `src/modules/statistics-insights/interface-adapters/controllers/http/stats.routes.ts:106` — DEFECT 1 source (`repository.platform ?? null`).
- `src/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.ts:48` — confirms arg 1 must be `group/proj` (interpolated into `project(fullPath:)`).
- `src/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.github.gateway.ts:18` — confirms arg 1 must be `owner/repo` (`repos/.../pulls`).
- `src/modules/cli-configuration/usecases/cli/discoverRepositories.usecase.ts:43` — prior-art `detectPlatform`; do NOT reuse its loose `includes('gitlab')` for identifier parsing.
- `src/main/routes.ts:193-202` — the `statsRoutes` registration to extend.
- `src/tests/stubs/diffStatsFetch.stub.ts` — stub already ignores arg 1; add identifier capture if asserting forwarding.
