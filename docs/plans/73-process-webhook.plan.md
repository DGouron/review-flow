# Plan — SPEC-073 Stage 3: ProcessWebhook orchestrator + WebhookEvent union

## STAGE 3 DECISION LOCK (user-validated — overrides any approve detail below)

The `approve` path STAYS 100% controller-side in Stage 3 (folded into Stage 4). The orchestrator
routes ONLY: `close`, `merge`, `followup-push` (eligibility), `ignored`. Concretely:

- **`WebhookEvent` union**: defines all 6 variants per spec (`review-requested | followup-push |
  close | merge | approve | ignored`). `review-requested` and `approve` are present for
  completeness/Stage-4 but are NOT routed by the orchestrator — controllers handle them inline,
  unchanged, and simply never pass them to `processWebhook`.
- **`processWebhook` switch** is total: `close`/`merge`/`followup-push`/`ignored` route as below;
  the `review-requested` and `approve` branches return `{ type: 'ignored', reason: '<variant>-handled-by-controller' }`
  (defensive — controllers never send them, but the switch stays exhaustive without a `never` throw).
- **`ProcessWebhookResult`** = `closed | merged | followup-eligible | followup-skipped | ignored`.
  DROP `approved` / `approval-revoked` / `approval-ignored` (§2).
- **`ProcessWebhookDependencies`** = `handleClose`, `transitionState`, `recordPush`,
  `checkFollowupNeeded`, `removeWorktree`, `logger`. DROP `handlePlatformApproval` and
  `getQualityThreshold` (§3) — those were approve-only.
- **Controllers**: approve branch untouched (no mapping to `WebhookEvent`, no `processWebhook` call).
- **Tests**: drop all approve cases from the acceptance + unit plan (§6).

Everything else in the plan stands. Sections below that still mention approve routing are
superseded by this lock.

---

> Scope: Stage 3 ONLY. Stages 1-2 (`executeReview`, `handleClose`) are DONE. Stage 4
> (full controller thinning + HTTP response-shape unification) is OUT OF SCOPE — not planned here.
> The spec (`docs/specs/73-extract-webhook-processing-usecase.md`) is STALE on structure:
> flat `src/usecases/` paths and all line numbers are pre-modular-monolith. All paths below
> are verified against the real `src/modules/<context>/...` tree.

```
PLAN:
  scope: ProcessWebhook orchestrator + platform-neutral WebhookEvent union (synchronous routing only)
  is_new_module: false  (adds a webhook entity folder + one usecase in existing modules)
```

---

## 0. Headline decision (read this first)

**The orchestrator owns ONLY the synchronous, platform-neutral routing: `close`, `merge`,
`approve`, `ignored`, and the followup *eligibility* decision (recordPush + checkFollowupNeeded).
It does NOT own the enqueue closure that captures `executeReview`.** The asynchronous
enqueue path (budget gate → processor closure → `gateClaudeInvocation`/`enqueueReview` →
distinct 202 reply shapes) STAYS controller-side for Stage 3. Rationale in §4.

This makes Stage 3 a small, honest increment: it introduces the platform-neutral seam
(`WebhookEvent` in the entity layer) and lifts the genuinely shared synchronous handlers
(close/merge/approve) behind one orchestrator, without dragging queue/budget/gate
infrastructure inward (which is Stage 4's job).

---

## 1. WebhookEvent union (ENTITY layer)

### Location + Dependency Rule justification

File: `src/modules/platform-integration/entities/webhookEvent/webhookEvent.ts`  (new folder)

Why the entity layer, not interface-adapters: **both** webhook controllers (interface-adapters)
AND `processWebhook.usecase.ts` (application) import this type. Per the Dependency Rule
(`entities ← usecases ← interface-adapters`), a type shared by a usecase and a controller must
live at or below the usecase layer. Placing it in `interface-adapters/` would force the usecase
to import outward — forbidden. The `platform-integration` context owns webhook ingress vocabulary,
so its `entities/` is the correct home (sibling to `gitlab/`, `github/`, `threadFetch/`).

It is a pure type module (a discriminated union of plain data) — no Zod schema/guard needed:
the data is already validated upstream by the platform guards (`gitLabMergeRequestEventGuard`,
`gitHubPullRequestEventGuard`); `WebhookEvent` is an internal mapping target, not a trust
boundary. (Anti-overengineering: no guard for a type that never crosses an untrusted boundary.)

### Definition (verified real field names)

`Platform` = `'gitlab' | 'github'` from
`@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js`.
`Language` = `'en' | 'fr'` from
`@/modules/shared-kernel/entities/language/language.schema.js`.
Controllers already resolve `localPath` (via `findRepositoryByProjectPath` /
`findRepositoryByRemoteUrl`) BEFORE mapping — so every non-ignored variant carries it (spec line 488).

```typescript
import type { Language } from '@/modules/shared-kernel/entities/language/language.schema.js';
import type { Platform } from '@/modules/tracking/entities/tracking/reviewRequestTracking.gateway.js';

export interface WebhookEventBase {
  platform: Platform;
  projectPath: string;
  localPath: string;
  mergeRequestNumber: number;
}

export type WebhookEvent =
  | ({ type: 'review-requested';
      mergeRequestUrl: string;
      sourceBranch: string;
      targetBranch: string;
      title: string;
      description: string | null;
      assignedBy: { username: string; displayName: string | null };
      skill: string;
      language: Language | null } & WebhookEventBase)
  | ({ type: 'followup-push';
      mergeRequestUrl: string;
      sourceBranch: string;
      targetBranch: string } & WebhookEventBase)
  | ({ type: 'close' } & WebhookEventBase)
  | ({ type: 'merge' } & WebhookEventBase)
  | ({ type: 'approve' } & WebhookEventBase)
  | { type: 'ignored'; reason: string };
```

Notes on field choices (verified against controllers):
- `description: string | null` and `language: Language | null` use `null` not `undefined`
  (domain rule). Controllers currently pass `event.object_attributes?.description` /
  `getProjectLanguage(...)` which may be `undefined`; the controller mapper coalesces to `null`.
- `assignedBy.displayName: string | null` — controllers build `displayName` from
  `mrAssignee?.name || event.user?.name` (GitLab) / `prAssignee?.login || event.sender?.login`
  (GitHub); both can be absent → `null`.
- `skill` is per-repo (`repoConfig.skill`) — resolved controller-side, carried in the event.
- The `review-requested` and `followup-push` variants are defined now (the union must be complete
  and they are the controller's mapping target), but in Stage 3 the orchestrator does NOT consume
  their async tail — see §3/§4.

---

## 2. ProcessWebhookResult union (what controllers need to format HTTP)

Returned by `processWebhook`. Each variant carries exactly what the controller needs to reproduce
its EXISTING reply (status code + body). HTTP shapes are unchanged in Stage 3 (Stage 4 unifies them).

```typescript
export type ProcessWebhookResult =
  // close → reproduces the 200 { status:'cleaned', mrNumber/prNumber, jobCancelled, trackingArchived }
  | { type: 'closed'; mergeRequestNumber: number; jobCancelled: boolean; trackingArchived: boolean }
  // merge → 200 { status:'merged', mrNumber/prNumber }
  | { type: 'merged'; mergeRequestNumber: number }
  // approve happy path → 200 { status:'approved', ... }
  | { type: 'approved'; mergeRequestNumber: number }
  // approve quality-gate revoke → 200 { status:'unapproved', ..., reason }
  | { type: 'approval-revoked'; mergeRequestNumber: number; reason: 'below-threshold' | 'blockers-present' }
  // approve ignored (not tracked / verdict not reverted) → 200 { status:'ignored', ..., reason }
  | { type: 'approval-ignored'; mergeRequestNumber: number; reason: string }
  // followup eligible → controller proceeds to enqueue (KEEPS its async path)
  | { type: 'followup-eligible'; mergeRequestNumber: number }
  // followup not eligible (auto-followup disabled, no open threads, not pending-fix, not tracked)
  | { type: 'followup-skipped'; mergeRequestNumber: number; reason: string }
  // anything else → 200 { status:'ignored', reason }
  | { type: 'ignored'; reason: string };
```

**Deliberate non-result: there is NO `review-requested` result variant in Stage 3.** A review
request is not resolved synchronously by the orchestrator (it needs budget + gate + enqueue,
which stay controller-side). The controller maps a parsed review-request event straight into its
existing enqueue path and never calls `processWebhook` for it in Stage 3. The `review-requested`
*event* variant exists in the union for completeness and Stage-4 use; the orchestrator's router
treats it as out-of-its-scope (see §3 routing table).

> Honesty flag: this asymmetry (event union is complete, result union + router only cover the
> synchronous subset) is the price of keeping Stage 3 small. It is explicitly a transitional
> shape; Stage 4 absorbs the async tail. See §8.

---

## 3. Orchestrator routing table (variant → existing usecase call)

`processWebhook(event, deps)` switches on `event.type`:

| `event.type` | Orchestrator action (composes EXISTING code) | Returns |
|---|---|---|
| `close` | `await deps.handleClose({ platform, projectPath, localPath, mergeRequestNumber })` | `{ type:'closed', mergeRequestNumber, jobCancelled, trackingArchived }` |
| `merge` | `deps.transitionState.execute({ projectPath: localPath, mrId, targetState:'merged' })` then `await deps.removeWorktree({...})` best-effort | `{ type:'merged', mergeRequestNumber }` |
| `approve` | `deps.transitionState.execute({ ..., targetState:'approved', qualityCheck })`; on `quality-gate` → `deps.handlePlatformApproval.execute(...)`; map verdict | `approved` \| `approval-revoked` \| `approval-ignored` |
| `followup-push` | `deps.recordPush.execute({...})` then `deps.checkFollowupNeeded.execute({...})` + `autoFollowup` check | `followup-eligible` \| `followup-skipped` |
| `review-requested` | NOT routed by orchestrator in Stage 3 — controller handles inline | (controller never calls processWebhook for it) |
| `ignored` | none | `{ type:'ignored', reason }` |

`mrId` is built inside the orchestrator as `` `${platform}-${projectPath}-${mergeRequestNumber}` ``
(the exact format both controllers use today, e.g. gitlab.controller.ts:322,361).

### `ProcessWebhookDependencies` (verified, function-style — second param)

Mirrors `executeReview`/`handleClose` style: explicit `deps`, all imports inward-only.

```typescript
export interface ProcessWebhookDependencies {
  handleClose: HandleClose;                    // @/modules/review-execution/usecases/handleClose.usecase.js
  transitionState: Pick<TransitionStateUseCase, 'execute'>;       // tracking usecase
  handlePlatformApproval: Pick<HandlePlatformApprovalUseCase, 'execute'>;
  recordPush: Pick<RecordPushUseCase, 'execute'>;
  checkFollowupNeeded: Pick<CheckFollowupNeededUseCase, 'execute'>;
  removeWorktree: RemoveWorktreeAction;        // worktree entity
  getQualityThreshold: (projectPath: string) => number | null;
  logger: Logger;
}
```

Dependency Rule audit — every import is inward-safe:
- `HandleClose`, `RemoveWorktreeAction`, `TransitionStateUseCase`, `HandlePlatformApprovalUseCase`,
  `RecordPushUseCase`, `CheckFollowupNeededUseCase` are usecases/entity types — the orchestrator
  imports only `entities/` + sibling `usecases/`. **No `interface-adapters/`, no `frameworks/`,
  no platform-specific type** (`GitLabMergeRequestEvent` / `GitHubPullRequestEvent` never appear).
- `evaluateQualityGate` (entity, `@/modules/tracking/entities/qualityGate/qualityGate.js`) is used
  to build the `qualityCheck` closure for the approve path — already entity-layer, inward-safe.
- The approve path's *platform side effects* (`approvalRevocationGateway.revoke`,
  `noteCommentPostGateway.postComment`) are platform/HTTP gateways → they STAY in the controller.
  The orchestrator returns `approval-revoked` with the reason; the controller performs the
  platform revoke + FR comment exactly as today. (This keeps the usecase free of platform gateways.)

> Approve nuance: today the revoke+comment happen *inside* the controller's `quality-gate` branch.
> Stage 3 splits it: orchestrator decides the verdict (tracked? gate passed? reverted?), controller
> executes the platform I/O. The orchestrator returning `approval-revoked` is the signal to revoke.
> This is the one place Stage 3 reshapes control flow; it is justified because the *decision* is
> platform-neutral and shared, while the *I/O* is not. If this proves too invasive during TDD,
> fall back to leaving the entire approve branch in the controller (orchestrator handles only
> close/merge/followup-eligibility) — flagged as an acceptable de-scope.

---

## 4. Enqueue-ownership decision — orchestrator vs controller

**Decision: the enqueue closure (which captures `executeReview`) STAYS controller-side in Stage 3.
The orchestrator owns only synchronous routing + followup-eligibility.**

### Why (smallest honest change preserving behavior)

The `review-requested` / `followup-push` async tails in BOTH controllers are a dense knot of
HTTP- and platform-coupled concerns that cannot move inward without Stage-4-scale surgery:

1. **Budget gate** — `deps.enforceBudget.execute({ localPaths: listEnabledLocalPaths(...) })` then,
   on rejection, `deps.broadcastBudgetExceeded({...})` (a WebSocket side-effect) and a
   `200 { status:'rejected', reason:'budget-exceeded' }` reply. (gitlab.controller.ts:695-716,
   github.controller.ts:614-635.)
2. **Processor closure capturing `executeReview`** — built per-platform via
   `buildGitLabReviewProcessor` / `buildGitHubReviewProcessor`, which capture repo config,
   `getProjectAgentsOrFocusDefaults`, `extractBaseUrl(repoConfig.remoteUrl)` (GitLab) vs `null`
   (GitHub), `loadProjectConfig(...).qualityThreshold`. These read `@/config/...` and live
   platform-side. (gitlab.controller.ts:797-816, github.controller.ts:695-710.)
3. **Trigger-actor provenance gate (SPEC-197)** — `resolveActorTrust(...)` + `actorTrusted` is
   GitLab-only and uses `event.user.username`; wired into `gateClaudeInvocation`.
   (gitlab.controller.ts:720-769.)
4. **`gateClaudeInvocation` vs raw `enqueueReview`** — the gate decides park-pending vs enqueue and
   produces THREE distinct 202/200 reply shapes (`pending-confirmation`, `queued`, `deduplicated`).
   (gitlab.controller.ts:727-785, github.controller.ts:639-683.)

Moving any of this into a platform-neutral usecase would force `enforceBudget`,
`broadcastBudgetExceeded`, the processor-builder, `gateClaudeInvocation`, and HTTP reply-shape
decisions across the boundary — i.e. it would BE Stage 4 (controller thinning + HTTP unification),
which is explicitly out of scope. Doing it now would also be a large blast radius against the most
behavior-sensitive path (review triggering), risking regressions the spec warns about.

### Can the enqueue closure cleanly move into a platform-neutral usecase?

Not cleanly in Stage 3. The closure captures (a) `executeReview` (already a usecase — fine), but
also (b) per-platform agent/baseUrl/skill/quality config read from `@/config`, (c)
`gateClaudeInvocation` + actor-trust, (d) budget + broadcast. (b)–(d) are platform/HTTP/config
concerns. A platform-neutral `processReview` usecase would need all of them injected and would have
to *return* the gate's 3-way verdict for the controller to format — which is precisely Stage 4's
contract. **Conclusion: it must stay controller-side for Stage 3; flag it as the natural seam Stage 4
will cut.** The `followup-push` eligibility *decision* (recordPush + checkFollowupNeeded +
autoFollowup) IS platform-neutral and DOES move into the orchestrator; only the subsequent
budget+gate+enqueue tail stays controller-side.

---

## 5. File list (create / modify) — verified real paths

### Create
| Path | Purpose |
|---|---|
| `src/modules/platform-integration/entities/webhookEvent/webhookEvent.ts` | `WebhookEvent` discriminated union (entity layer) |
| `src/modules/platform-integration/usecases/processWebhook.usecase.ts` | Orchestrator: `processWebhook(event, deps)`, `ProcessWebhookResult`, `ProcessWebhookDependencies` |
| `src/tests/units/modules/platform-integration/usecases/processWebhook.usecase.test.ts` | Unit tests (inside-out) for the orchestrator |
| `src/tests/acceptance/73-process-webhook.acceptance.test.ts` | SDD outer loop (RED → GREEN) |

> `WebhookEvent` is a pure type union → no `.test.ts` of its own (nothing to assert at runtime;
> it is exercised through the orchestrator + controller-mapper tests). No guard/factory needed.

### Modify
| Path | Change |
|---|---|
| `src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts` | Map parsed close/merge/approve/followup events → `WebhookEvent`; call `deps.processWebhook`; map `ProcessWebhookResult` → existing reply. Review-request async path UNCHANGED. Add `processWebhook` to `GitLabWebhookDependencies`. |
| `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts` | Same mapping for close/approve(review-hook)/followup. Add `processWebhook` to `GitHubWebhookDependencies`. |
| `src/main/routes.ts` | Instantiate `processWebhook` deps (compose existing usecases) and inject into both controller dep objects. |
| `src/tests/units/.../webhook/gitlab.controller.test.ts` (+ github) | Update to assert delegation to `processWebhook` for the synchronous variants; preserve reply-shape assertions. (Existing files — locate the real mirror path before editing.) |

> `eventFilter.ts` is NOT modified — its `filter*` functions stay and become the mappers the
> controllers use to build `WebhookEvent` (spec "Out of Scope"). Confirmed: `FilterResult` already
> exposes `mergeRequestNumber`, `projectPath`, `mergeRequestUrl`, `sourceBranch`, `targetBranch`,
> `isFollowup` — the exact fields the union needs.

---

## 6. TDD test plan (outer loop SDD → inner loop inside-out)

### Outer loop (write FIRST, stays RED during impl, GREEN at end)
`src/tests/acceptance/73-process-webhook.acceptance.test.ts` — drives `processWebhook` directly
(no HTTP fixtures), mirroring the Stage-2 acceptance style (harness builder + stub gateways):
- close → `{ type:'closed', jobCancelled, trackingArchived }`, one shared path for both platforms.
- merge → `{ type:'merged' }`, transitionState called with `targetState:'merged'`, worktree removal best-effort.
- approve happy → `{ type:'approved' }`; quality-gate fail + reverted → `{ type:'approval-revoked', reason }`; not-tracked → `{ type:'approval-ignored' }`.
- followup-push eligible (pending-fix + open threads + autoFollowup) → `{ type:'followup-eligible' }`.
- followup-push skipped: auto-followup disabled / no open threads / not tracked → `{ type:'followup-skipped', reason }`.
- ignored → `{ type:'ignored', reason }`.
- **Platform-neutrality assertion**: the test imports NO `GitLab*`/`GitHub*` event type; it builds
  `WebhookEvent` values directly — proving the usecase is platform-agnostic.

### Inner loop (inside-out, Red→Green→Refactor per behavior)
1. **Entity**: `WebhookEvent` union compiles + is consumed by a trivial exhaustive `switch`
   (compile-time exhaustiveness via `never` in the default branch of the orchestrator). No separate
   runtime test (pure type).
2. **Usecase**: `processWebhook.usecase.test.ts` — one `describe` per variant, state-based asserts
   on stub gateways (reuse `StubReviewContextGateway`, `InMemoryReviewRequestTrackingGateway`,
   `createStubLogger`; add lightweight fn stubs for `transitionState`/`handlePlatformApproval`/
   `recordPush`/`checkFollowupNeeded`/`removeWorktree`/`getQualityThreshold`). Mirrors the
   `buildHarness(overrides?)` pattern from the Stage-2 test.
3. **Controller mapping**: extend existing controller tests to assert (a) close/merge/approve/
   followup now delegate to `processWebhook` and (b) the HTTP reply for each result variant is
   byte-for-byte what the controller produced before (status code + body keys, incl. GitLab
   `mrNumber` vs GitHub `prNumber`). Review-request tests stay green unchanged (path untouched).

### Verification gate
`yarn verify` (typecheck + lint + `test:ci`) green; acceptance GREEN at the end.
(Worktree caveat from MEMORY: ensure `node_modules` is linked before running tests.)

---

## 7. Smallest honest change note — what I deliberately do NOT touch

- **Review-request enqueue path** (budget gate, processor closure capturing `executeReview`,
  `gateClaudeInvocation`, actor-trust, `enqueueReview`, 3-way reply): left 100% in the controllers.
  This is the largest, most behavior-sensitive block — moving it is Stage 4.
- **HTTP reply shapes**: preserved exactly (incl. the `mrNumber`/`prNumber` divergence and all
  current status strings). No unification — that is Stage 4's named deliverable.
- **`eventFilter.ts`**: untouched (out of scope per spec). It supplies the mapper inputs.
- **Note/issue-comment/bypass hooks, idempotency guard, `enforceBudget`, `broadcastBudgetExceeded`,
  `extractBaseUrl`, `_trackingGateway` param removal**: all untouched. The unused `_trackingGateway`
  param removal is explicitly deferred to Stage 4 by the spec.
- **`executeReview` / `handleClose` usecases**: consumed as-is, contracts unchanged.
- **No new dependency, no `as Type`, no `undefined` in the new domain type, full words throughout.**

---

## 8. Anti-overengineering check (honest)

**Is the orchestrator earning its place in Stage 3, or is it transitional scaffolding?**

Partly transitional — and I am flagging it rather than hiding it.

What it genuinely earns NOW:
- **De-duplicates real shared logic**: close/merge/approve handling is structurally duplicated
  across both controllers today (verified: gitlab.controller.ts:287-451 vs
  github.controller.ts:355-383 + 120-240). One orchestrator collapses that duplication and makes
  it testable without HTTP fixtures — concrete value, matching the spec's core motivation.
- **Introduces the platform-neutral seam** (`WebhookEvent` in entities) that Stage 4 needs; doing it
  now with the synchronous subset is a low-risk way to land the type and the import direction.

Where it is scaffolding:
- The `ProcessWebhookResult` → reply mapping in controllers is temporary glue that Stage 4 deletes
  when HTTP shapes unify. The result union's shape is chosen to *minimize* that glue, not to be a
  final contract.
- The event union carries `review-requested` / `followup-push` async fields the Stage-3 orchestrator
  does not consume — present for completeness/Stage-4, not yet load-bearing.

Verdict: **proceed, but keep it minimal.** The orchestrator pays for itself on close/merge/approve
de-duplication alone; the rest is a deliberately thin bridge to Stage 4. Guard against scope creep:
do NOT add a `review-requested` result variant, do NOT move budget/gate/enqueue inward, do NOT touch
reply shapes. If, during TDD, the approve verdict-vs-I/O split (§3) proves invasive, de-scope approve
to stay controller-side and ship close/merge/followup-eligibility only — still a net win, still honest.

```
ACCEPTANCE_TEST:
  file: src/tests/acceptance/73-process-webhook.acceptance.test.ts
  note: "SDD outer loop — written first by implementer, RED during impl, GREEN at the end"
```

---

## REFERENCE_FILES (read before implementing)

- `src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts` — close (287-315), merge (317-354), approve (356-451), followup (470-628), review enqueue (630-786, STAYS); reply shapes to preserve.
- `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts` — close (355-383), approve via review-hook (120-240), followup (404-537), review enqueue (539-684, STAYS).
- `src/modules/platform-integration/interface-adapters/controllers/webhook/eventFilter.ts` — `FilterResult` fields + `filter*` mappers (NOT modified; they build the union).
- `src/modules/review-execution/usecases/handleClose.usecase.ts` — `HandleClose` signature consumed by orchestrator.
- `src/modules/review-execution/usecases/executeReview.usecase.ts` — STAYS in the controller-owned processor closure (read to confirm it is not moved inward).
- `src/modules/review-execution/usecases/triggerReview.usecase.ts` — function-style + `deps` template to mirror.
- `src/modules/review-execution/usecases/handleReviewRequestPush.usecase.ts` — existing followup-eligibility logic to mirror/compose (recordPush + state + open-threads checks).
- `src/modules/review-execution/usecases/gateClaudeInvocation.usecase.ts` — confirms the gate/enqueue knot that STAYS controller-side.
- `src/modules/tracking/usecases/tracking/transitionState.usecase.ts` — `targetState:'merged'|'approved'`, `qualityCheck`, `TransitionStateResult` (`ok`/`reason`).
- `src/modules/tracking/usecases/tracking/{recordPush,checkFollowupNeeded,handlePlatformApproval,syncThreads}.usecase.ts` — composed dependency signatures.
- `src/modules/tracking/entities/tracking/reviewRequestTracking.gateway.ts` — `Platform` type source + `archive`/`getById`.
- `src/modules/shared-kernel/entities/language/language.schema.ts` — `Language` = `'en'|'fr'`.
- `src/modules/worktree-management/entities/worktree/worktree.schema.ts` — `RemoveWorktreeAction`, `RemoveResult`.
- `src/tests/acceptance/73-handle-close.acceptance.test.ts` — harness/stub style to mirror for the new acceptance test.
- `src/main/routes.ts` — composition root; wire `processWebhook` deps here (LAST step).
```
```
