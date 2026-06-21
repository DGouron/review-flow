# Plan — SPEC-073 Stage 4: Controller thinning (final)

> Scope: Stage 4 ONLY. Stages 1-3 (`executeReview`, `handleClose`, `processWebhook` orchestrator +
> `WebhookEvent` union) are DONE and MERGED on master. Do NOT re-plan them.
> The spec (`docs/specs/73-extract-webhook-processing-usecase.md`) flat `src/usecases/` paths are STALE —
> all paths below are verified against the real `src/modules/<context>/...` tree on this worktree HEAD.

```
PLAN:
  scope: Stage 4 — move review-requested async tail + approve verdict inward, unify HTTP reply shapes, drop _trackingGateway
  is_new_module: false
```

---

## 0. Headline decision (read this first)

**The DoD line that governs everything is: "No business logic remains in controllers (no
`enqueueReview`, no `invokeClaudeReview`, no `recordCompletion`, no `parseReviewOutput` calls)."**
That is the contract. It does NOT say "every line of the async tail must live inside a
platform-neutral `processWebhook` usecase". Those are different bars, and conflating them is the
trap.

After reading both controllers end-to-end (gitlab 786 lines, github 700 lines), the honest finding:

- **The genuinely shared, platform-neutral *business decisions* in the async tail are already
  extracted.** `executeReview` (Stage 1) owns context/invoke/actions/stats. `gateClaudeInvocation`
  (pre-existing) owns the park-vs-enqueue *decision* AND already captures `enqueue: enqueueReview`
  as an injected port inside its own deps (routes.ts:319). `enforceBudget` is already a usecase.
  `isTrustedActor` is already a usecase. `recordPush` / `checkFollowupNeeded` / `transitionState` /
  `handlePlatformApproval` are already usecases.
- **What remains in the controller async tail is *assembly + HTTP shaping*, not business logic**:
  building the `ReviewJob` literal from the parsed event, building the per-platform processor
  closure (which reads `@/config` for agents/baseUrl/quality), calling the already-extracted
  usecases in sequence, and mapping their results to status codes / body keys.

This reframes Stage 4. **The minimal honest version of "thin the controller" is NOT inventing a
new platform-neutral `processReview` usecase that re-injects budget+gate+queue (that would be
single-implementation ports built only to satisfy a rule — over-engineering, see §7). It is:**

1. **Extract the assembly into a *function-style use case per concern* that the controller calls**,
   keeping the controller as: verify → parse → map to input → call use case → format reply.
2. **Move the `approve` *verdict decision* inward** (it IS platform-neutral) while leaving the
   platform *I/O* (revoke + FR comment) in the controller, signalled by the result variant.
3. **Unify the reply *mapping* into one shared mapper** that takes a neutral result + a platform
   field-name choice (`mrNumber` vs `prNumber`) — preserving the wire contract byte-for-byte.
4. **Drop `_trackingGateway`** (trivial, mechanical).

**Recommendation up front: Stage 4 is too big for one commit. Split into 4 sub-stages (4a–4d),
each independently `yarn verify`-green and committable.** See §8. If forced to ship less, 4d
(drop `_trackingGateway`) + 4c (reply unification) are the safe, high-value, low-risk wins; 4a
(review-requested tail) is the risky one and should be its own isolated commit with the existing
spec-46 / spec-197 / idempotency acceptance suites as the regression net.

---

## 1. The 4 Stage-4 items mapped to Clean Architecture layers

| # | Item | Where the *decision* belongs | Where the *I/O* must stay | New layer artefact |
|---|------|------------------------------|---------------------------|--------------------|
| 1 | review-requested async enqueue tail | Application (usecase): budget check sequencing, gate invocation, trust resolution ordering, result classification | Interface-adapter (controller): `ReviewJob` literal assembly from parsed event, processor closure reading `@/config`, `enqueueReview`/`gateClaudeInvocation` *instances* (composition root) | A function-style `processReviewRequest` usecase **OR** (preferred minimal) keep assembly in a controller helper + return a neutral verdict. See §2 + §7. |
| 2 | approve verdict path | Application: tracked? gate passed? reverted? → already in `transitionState` + `handlePlatformApproval` (usecases). Stage 4 routes them *through `processWebhook`* | Interface-adapter: `approvalRevocationGateway.revoke` + `noteCommentPostGateway.postComment` (platform CLI gateways) stay controller-side | Extend `ProcessWebhookResult` with `approved` / `approval-revoked` / `approval-ignored`; route `approve` in orchestrator |
| 3 | unify HTTP reply shapes | Interface-adapter only (presentation concern — NOT a usecase) | Controller boundary | A shared reply mapper fn `sendWebhookReply(reply, result, { numberKey })` in the controllers' folder |
| 4 | remove `_trackingGateway` | Interface-adapter (signature) + composition root | — | Signature edit + routes.ts edit |

**Dependency Rule guard rails (the hard part, mapped explicitly):**

- `processWebhook` / any new usecase may import ONLY `entities/` + sibling `usecases/`.
- `enqueueReview` (`@/frameworks/queue/pQueueAdapter`), `gateClaudeInvocation` *instance*,
  `enforceBudget` *instance*, `broadcastBudgetExceeded`, `@/config` readers (`loadProjectConfig`,
  `getProjectAgentsOrFocusDefaults`, `getFollowupAgents`, `extractBaseUrl`) are **framework /
  config** — a usecase may consume them ONLY behind a port type. `gateClaudeInvocation` and
  `enforceBudget` are already class usecases (consumable directly). `enqueueReview` is already
  abstracted as the `EnqueueReviewFunction` port inside `gateClaudeInvocation` — **so the queue
  call does NOT need a new port; it is already behind one.**
- `approvalRevocationGateway` / `noteCommentPostGateway` are platform CLI gateways (interface-
  adapters). They must NEVER be injected into a platform-neutral usecase. The approve verdict
  usecase returns "revoke with this message"; the controller performs the revoke. This split is
  the load-bearing design decision of item 2.

---

## 2. Item 1 — review-requested async enqueue tail (HIGHEST RISK)

### What the tail actually contains today (verified, gitlab.controller.ts:600-756, github 529-674)

In order, per platform:
1. `findRepositoryBy{ProjectPath,RemoteUrl}` → repo config (controller — config lookup).
2. Build `assignedBy` / `author` / `sizeMetrics` from the parsed platform event (controller — payload extraction).
3. `trackAssignment.execute({...})` (usecase, already extracted).
4. `createJobId(...)` + build the `ReviewJob` literal (controller — assembly; reads `getProjectLanguage`, `repoConfig.skill`).
5. `enforceBudget.execute({ localPaths })` → on reject: `broadcastBudgetExceeded(...)` + `200 {status:'rejected'}` (usecase + WS side-effect + HTTP).
6. Build the processor closure via `buildGitLab/GitHubReviewProcessor` → captures `executeReview`, `getProjectAgentsOrFocusDefaults`, `extractBaseUrl(remoteUrl)` (GitLab) / `null` (GitHub), `loadProjectConfig().qualityThreshold` (controller — reads `@/config`).
7. **GitLab only**: `resolveActorTrust(...)` → `actorTrusted` (uses `deps.isTrustedActor`, already a usecase; GitHub does not gate review-request on trust).
8. `gateClaudeInvocation.execute({ job, triggerSource:'webhook-initial', processor, actorTrusted })` → `pending` | `enqueued` | `rejected`; OR fallback raw `enqueueReview(job, processor)` when no gate wired.
9. Map the 3-way verdict to `202 pending-confirmation` / `202 queued` / `200 deduplicated` (HTTP).

### The honest classification

| Step | Business decision? | Can move to a platform-neutral usecase cleanly? |
|---|---|---|
| 1 repo lookup | no (config) | no — stays controller |
| 2 payload extraction | no (platform-specific) | no — stays controller (this is exactly the ACL job) |
| 3 trackAssignment | yes | already a usecase ✔ |
| 4 ReviewJob assembly | no (data mapping) | could, but it reads `@/config` (skill, language) → controller |
| 5 budget gate | yes (decision) but `broadcastBudgetExceeded` is a WS I/O + HTTP shape | partially — see below |
| 6 processor closure | no — captures `@/config` + `executeReview` | **no — this is the crux; it is config+framework-bound** |
| 7 actor trust | yes | already a usecase (`isTrustedActor`) ✔ |
| 8 gate vs enqueue | yes (decision) | already a usecase (`gateClaudeInvocation`) ✔, queue already behind its port ✔ |
| 9 verdict→HTTP | no (presentation) | no — controller (unify in item 3) |

**The only "business logic" the DoD names that still sits raw in the controller is the *sequencing*
of budget → gate → enqueue and the `ReviewJob` assembly. Everything with real domain meaning is
already a usecase.** Step 6 (the processor closure) is the wall: it must read `@/config` for agents/
baseUrl/quality and capture `executeReview`. A platform-neutral usecase cannot read `@/config`
(framework) and cannot build a platform-specific processor — so the closure stays controller-side
no matter what.

### Two viable shapes — recommendation

**Option A (PREFERRED, minimal):** extract a thin function-style usecase
`processReviewRequest(input, deps)` that owns ONLY the platform-neutral *sequence* and returns a
neutral verdict; the controller keeps assembly + processor-closure + reply mapping.

```
ReviewRequestVerdict =
  | { type: 'budget-exceeded'; status: BudgetStatus }
  | { type: 'pending'; pendingId: string | null; reason?: 'untrusted-actor' }
  | { type: 'queued'; jobId: string }
  | { type: 'deduplicated'; jobId: string }
```

`ProcessReviewRequestDependencies` = `{ enforceBudget: Pick<EnforceBudgetUseCase,'execute'>;
gateClaudeInvocation?: GateClaudeInvocationUseCase; isTrustedActor?: IsTrustedActorUseCase;
enqueue: EnqueueReviewFunction; logger }` — **every one already a usecase or an existing port.
No new single-implementation port invented.** Input carries `{ job: ReviewJob, processor:
GateClaudeInvocationProcessor, localPaths: string[], actorUsername: string, projectPath: string,
gateActorTrust: boolean }`. The controller builds `job` + `processor` (config-bound) and passes
them in; the usecase runs steps 5/7/8 in the right order and returns the verdict. The controller
maps verdict→reply (item 3) and calls `broadcastBudgetExceeded` on `budget-exceeded` (WS I/O stays
controller-side).

This satisfies the DoD ("no `enqueueReview` call in the controller" — the queue call moves behind
`enqueue` inside the usecase / `gateClaudeInvocation`) WITHOUT dragging `@/config` or
platform processors inward. It de-duplicates the budget→gate→enqueue knot across both controllers
(currently copy-pasted twice for review + twice for followup = 4 sites). Honest value.

**Option B (AVOID unless A proves leaky):** fold the tail into `processWebhook` by adding a
`review-requested` result and injecting the above deps into `ProcessWebhookDependencies`. Rejected
as the default because it bloats the orchestrator deps with budget/gate/queue (currently clean:
handleClose/transitionState/recordPush/checkFollowupNeeded/removeWorktree/logger) and forces the
processor closure to be passed *through* the orchestrator — more indirection, same controller-side
config binding. Only do this if the team wants a single webhook entry usecase; flagged as heavier.

### Followup tail = same shape

The followup async tail (gitlab 494-592, github 441-521) is the identical budget→processor→gate→
enqueue knot with `triggerSource:'webhook-followup'` and followup agents/skill. **`processReviewRequest`
(Option A) covers it too** — only the controller-built `job` + `processor` differ. This collapses 4
copy-pasted sites into 1 usecase. This is the single biggest de-duplication win in Stage 4.

### Risk: HIGHEST

This is the most behavior-sensitive path (review triggering) and is covered by spec-46 (github
followup), spec-197 (trusted-actor provenance gate), spec-200 (idempotency) acceptance tests.
Mitigation: do 4a as its own commit; run the full acceptance suite as the net; preserve the exact
verdict→reply mapping; do NOT touch `extractBaseUrl`, processor builders' config reads, or the
`gateClaudeInvocation` fallback branch semantics (`deps.gateClaudeInvocation ?` vs raw enqueue).

---

## 3. Item 2 — approve verdict path inward

### Today (gitlab.controller.ts:343-438 inline; github.controller.ts:122-242 in `handleGitHubPullRequestReviewHook`)

Structurally identical across platforms:
1. resolve repo config; if absent → fall through (GitLab) / `200 ignored repo-not-configured` (GitHub).
2. build `mrId`; `threshold = getQualityThreshold(localPath)`.
3. `transitionState.execute({ targetState:'approved', qualityCheck: evaluateQualityGate(...) })`.
4. `ok` → `200 {status:'approved'}`.
5. `reason==='quality-gate'` → `handlePlatformApproval.execute(...)`:
   - `reverted` → `approvalRevocationGateway.revoke(...)` (platform CLI, args differ: GitLab no
     reviewId/dismissalMessage; GitHub passes `reviewId` + `dismissalMessage` from
     `shortDismissalLabel`) + `noteCommentPostGateway.postComment(verdict.message)` → `200 {status:'unapproved', reason}`.
   - else → `200 {status:'ignored', reason: verdict.kind}`.
6. else (not tracked) → `200 {status:'ignored', reason: transitionResult.reason}`.

### Plan: route the verdict through `processWebhook`, keep the I/O in the controller

Steps 2–6 *decisions* are platform-neutral (`transitionState`, `handlePlatformApproval`,
`evaluateQualityGate`, `getQualityThreshold` are all usecase/entity). The ONLY platform-specific
parts are: (a) the `revoke` argument shape, (b) the FR dismissal label, (c) the post-comment.
Those are I/O and stay in the controller.

- Extend `ProcessWebhookResult` with:
  `| { type:'approved'; mergeRequestNumber }`
  `| { type:'approval-revoked'; mergeRequestNumber; reason:'below-threshold'|'blockers-present'; revokeMessage:string }`
  `| { type:'approval-ignored'; mergeRequestNumber; reason:string }`
- Route `approve` in `processWebhook` (it currently returns `ignored:'approve-handled-by-controller'`):
  call `transitionState` + (on `quality-gate`) `handlePlatformApproval`, return the verdict +
  `verdict.message` as `revokeMessage`. Add `transitionState` (already present),
  `handlePlatformApproval`, `getQualityThreshold` to `ProcessWebhookDependencies`.
- Controller `approve` branch becomes: map parsed approve event → `WebhookEvent` `approve`, call
  `deps.processWebhook`, then:
  - `approved` → `200 {status:'approved', mrNumber/prNumber}`.
  - `approval-revoked` → `approvalRevocationGateway.revoke({...platform args...})` (GitLab:
    `{projectPath, mrNumber}`; GitHub: `{projectPath, mrNumber, reviewId, dismissalMessage:
    shortDismissalLabel(reason)}`) + `noteCommentPostGateway.postComment(revokeMessage)` →
    `200 {status:'unapproved', ..., reason}`.
  - `approval-ignored` → `200 {status:'ignored', ..., reason}`.

**Note the GitHub asymmetry:** GitHub's approve arrives via `pull_request_review` hook
(`handleGitHubPullRequestReviewHook`), carrying `reviewId`. The `WebhookEvent` `approve` variant
must carry `reviewId: string | null` (null for GitLab) so the controller can pass it to the GitHub
revoke gateway. This is a wire-contract-preserving addition to the union.

### Risk: MEDIUM

Touches platform approval revocation (security-adjacent: a wrongly-not-revoked approval lets a
sub-threshold MR merge). Mitigation: the verdict logic is already tested in
`transitionState`/`handlePlatformApproval` unit tests; add `approve` cases to the processWebhook
unit + acceptance suites; preserve the exact revoke arg shapes per platform (the easiest place to
regress). If the verdict/I-O split proves leaky during TDD, acceptable de-scope: leave approve
fully controller-side (it is already de-duplicated within each platform; cross-platform dedup is
the only loss) — flagged.

---

## 4. Item 3 — unify HTTP reply shapes

### The wire-contract question (answered honestly)

**True structural unification is NOT safe.** The bodies differ by the number-field key (`mrNumber`
vs `prNumber`) and that key is part of the public webhook response contract consumed by the
dashboard/clients and asserted byte-for-byte across the controller + acceptance test suites
(spec-46/197/200 et al.). Renaming to a unified `number` would silently break the wire contract —
forbidden by the task constraints.

**What "unify" can safely mean: collapse the duplicated *mapping logic* into one shared mapper that
is parameterised by the platform's number-key.** The mapper lives at the controller boundary
(presentation, interface-adapter layer — NOT a usecase). It takes the neutral `ProcessWebhookResult`
(+ the new `ReviewRequestVerdict` from item 1) and the platform's `numberKey: 'mrNumber'|'prNumber'`
and produces the exact status code + body. Byte-for-byte identical output, single source of truth.

```
// interface-adapters/controllers/webhook/webhookReply.ts (new, presentation helper)
function sendProcessWebhookReply(reply, result, opts: { numberKey: 'mrNumber'|'prNumber' }): void
function sendReviewRequestReply(reply, verdict, opts: { numberKey, jobId }): void
```

Each branch reproduces the precise current shape (incl. `jobCancelled`/`trackingArchived` on
`cleaned`, `reason` on `unapproved`/`ignored`, `pendingId` on pending, `jobId` on queued/dedup).
A snapshot-style assertion in the controller tests proves no drift.

### Risk: LOW-MEDIUM

Pure mechanical re-routing of already-tested shapes through one function. The risk is an off-by-one
in a body key. Mitigation: the existing controller tests already assert every shape; they become
the mapper's regression net unchanged.

---

## 5. Item 4 — remove `_trackingGateway` param

`handleGitLabWebhook` / `handleGitHubWebhook` take `_trackingGateway: ReviewRequestTrackingGateway`
as the 4th positional param (gitlab:237, github:317). It is unused in both bodies (only
`deps.trackAssignment` etc. are consumed; the underscore prefix already signals dead). Drop the
param from both signatures, remove the `trackingGw` positional argument from both call sites in
`routes.ts` (578, 652), and remove the now-orphan `ReviewRequestTrackingGateway` import if nothing
else in the file uses it (verify: GitLab keeps it in `GitLabWebhookDependencies`? — NO, the deps
interfaces do NOT reference it; confirm and drop the import). Update all controller test call sites
that pass the positional `trackingGateway` arg.

### Risk: LOW (mechanical). Do this FIRST (4d → can ship alone, smallest diff, immediate clarity win).

---

## 6. Per-item risk assessment (summary)

| Item | Risk | Blast radius | Net architectural value | Recommended order |
|---|---|---|---|---|
| 4 drop `_trackingGateway` | LOW | signatures + routes + tests | clarity (dead param) | **1st (4d)** |
| 3 unify reply mapping | LOW-MED | both controllers + tests | dedup presentation, single shape source | **2nd (4c)** |
| 2 approve verdict inward | MED | processWebhook + both approve branches + tests | cross-platform dedup of approve decision; controller loses verdict logic | **3rd (4b)** |
| 1 review-requested tail | **HIGH** | most behavior-sensitive path; spec-46/197/200 nets | dedup budget→gate→enqueue across 4 sites; controller loses sequencing + `enqueueReview` | **4th (4a)** |

---

## 7. Anti-overengineering challenge (honest — this is the section the task demanded)

**Question: is moving ALL of item 1 inward justified, or is some of it legitimately controller/
composition-boundary work?**

**Finding: full inward-move is NOT justified, and forcing it would be over-engineering.** Concretely:

- **The `enqueueReview` queue call does NOT need a new port.** It is already abstracted as
  `EnqueueReviewFunction` and injected into `gateClaudeInvocation` (routes.ts:319). The DoD's "no
  `enqueueReview` call in the controller" is satisfied by routing the call through
  `gateClaudeInvocation` (already happening) or through the thin `processReviewRequest` usecase's
  injected `enqueue` — no new abstraction.
- **The budget gate already IS a usecase** (`enforceBudget`). Its *result→HTTP* mapping and the
  `broadcastBudgetExceeded` WebSocket call are presentation/transport — they legitimately belong at
  the controller boundary. Pushing `broadcastBudgetExceeded` into a usecase would require a
  single-implementation `BudgetBroadcastPort` invented only to satisfy the rule. **Don't.** Leave
  the WS broadcast controller-side; the usecase returns `budget-exceeded` and the controller
  broadcasts + replies.
- **The processor closure MUST stay controller-side.** It reads `@/config`
  (`getProjectAgentsOrFocusDefaults`, `getFollowupAgents`, `extractBaseUrl`, `loadProjectConfig`)
  and builds a platform-specific processor capturing `executeReview`. A platform-neutral usecase
  cannot read `@/config` (framework) without — again — inventing config ports. The closure is the
  ACL's job: translate config+platform into a ready-to-run processor. Keep it.
- **Payload extraction (`assignedBy`/`author`/`sizeMetrics`/`ReviewJob` literal) is the textbook
  Interface-Adapter responsibility** (translate external format → domain). Moving it inward would
  drag platform field names into the application layer — the exact anti-pattern Stages 1-3 avoided.

**Therefore the minimal version that achieves "no business logic in controllers":** extract the
*sequencing decision* (budget→trust→gate→enqueue ordering + result classification) into
`processReviewRequest` (Option A, §2) using only already-existing usecases/ports; leave assembly,
config-bound processor, WS broadcast, and HTTP shaping at the boundary. This removes the raw
`enqueueReview` calls, the inline budget-decision branching, and the duplicated gate handling from
both controllers — which is what the DoD actually targets — without manufacturing a single port
purely to relocate code across the line.

**Verdict:** proceed with Option A for item 1, route-through for item 2, shared-mapper for item 3,
mechanical drop for item 4. Reject Option B (orchestrator absorbs budget/gate/queue) and reject any
new `BudgetBroadcastPort` / `ConfigPort` / `QueuePort`-beyond-existing. **Flagged over-engineering
risks to refuse during implementation:** (a) inventing ports for WS broadcast or `@/config`;
(b) pushing the `ReviewJob` assembly or processor closure into a usecase; (c) renaming
`mrNumber`/`prNumber` to a unified key (breaks wire contract).

---

## 8. Recommended staged breakdown (Stage 4 is too big for one commit)

Per scope-discipline (>3 files, multiple distinct scopes), split into 4 independently-verifiable
commits. Suggested order = lowest risk first so the risky 4a lands last against a clean tree:

- **4d — drop `_trackingGateway`** (smallest, mechanical). Files: 2 controllers + routes.ts + 2-5
  test files. `yarn verify` green. Commit: `refactor(webhook): drop unused _trackingGateway controller param (spec-073 stage 4d)`.
- **4c — unify reply mapping** into `webhookReply.ts` shared helpers. Files: new `webhookReply.ts`
  + 2 controllers + reply tests. No behavior change (byte-for-byte). Commit:
  `refactor(webhook): centralize HTTP reply shaping (spec-073 stage 4c)`.
- **4b — approve verdict inward**: route `approve` through `processWebhook`, extend result union +
  deps, add `reviewId` to the union's `approve` variant, controllers do I/O only. Files: union +
  processWebhook usecase + 2 controllers + routes.ts (wire `handlePlatformApproval`/
  `getQualityThreshold` into processWebhook deps) + unit/acceptance. Commit:
  `refactor(webhook): move approve verdict into processWebhook (spec-073 stage 4b)`.
- **4a — review-requested tail** (HIGH risk, last): new `processReviewRequest` usecase (Option A),
  both controllers delegate review + followup tails to it, reply via 4c mapper. Files: new usecase +
  2 controllers + routes.ts + unit/acceptance. Run spec-46/197/200 suites. Commit:
  `refactor(webhook): extract review-request enqueue sequencing into usecase (spec-073 stage 4a)`.

After 4a, the spec DoD "Controller thinning" + "Composition root" are met and SPEC-073 closes.

> If time-boxed: ship 4d+4c (safe, real cleanup, closes 2 of 4 DoD items) and re-scope 4a/4b as a
> follow-up. Do NOT half-do 4a (a partially-moved tail is worse than an untouched one).

---

## 9. File list (create / modify) — verified real paths

### Create
| Path | Sub-stage | Purpose |
|---|---|---|
| `src/modules/platform-integration/interface-adapters/controllers/webhook/webhookReply.ts` | 4c | Shared reply mappers (`sendProcessWebhookReply`, `sendReviewRequestReply`), parameterised by `numberKey`. Presentation helper (interface-adapter layer). |
| `src/tests/units/modules/platform-integration/interface-adapters/controllers/webhook/webhookReply.test.ts` | 4c | Byte-for-byte reply-shape assertions per result variant + numberKey. |
| `src/modules/platform-integration/usecases/processReviewRequest.usecase.ts` | 4a | Function-style `processReviewRequest(input, deps)` owning budget→trust→gate→enqueue sequencing; returns `ReviewRequestVerdict`. Imports only entities + sibling usecases + existing ports (`EnforceBudgetUseCase`, `GateClaudeInvocationUseCase`, `IsTrustedActorUseCase`, `EnqueueReviewFunction`). |
| `src/tests/units/modules/platform-integration/usecases/processReviewRequest.usecase.test.ts` | 4a | Verdict cases: budget-exceeded, pending (semi-auto), pending (untrusted), queued, deduplicated. State-based on fn/usecase stubs. |
| `src/tests/acceptance/73-stage4-controller-thinning.acceptance.test.ts` | 4a/4b | SDD outer loop — RED during impl, GREEN at end. Drives both new usecases platform-neutrally + asserts approve verdict routing. |

### Modify
| Path | Sub-stage | Change |
|---|---|---|
| `…/entities/webhookEvent/webhookEvent.ts` | 4b | Add `reviewId: string \| null` to the `approve` variant (carries GitHub review id; null for GitLab). |
| `…/usecases/processWebhook.usecase.ts` | 4b | Route `approve`: call `transitionState` + `handlePlatformApproval` + `getQualityThreshold`; return `approved`/`approval-revoked`(+`revokeMessage`)/`approval-ignored`. Extend `ProcessWebhookResult` + `ProcessWebhookDependencies`. |
| `…/controllers/webhook/gitlab.controller.ts` | 4a,4b,4c,4d | 4d: drop `_trackingGateway` param. 4b: approve branch → `processWebhook` + I/O only. 4c: replies via `webhookReply`. 4a: review + followup tails → `processReviewRequest`; keep assembly + processor closure + `broadcastBudgetExceeded`. |
| `…/controllers/webhook/github.controller.ts` | 4a,4b,4c,4d | Same, incl. `reviewId`/`dismissalMessage` on approve revoke; GitHub review-request has no actor-trust gate (preserve). |
| `src/main/routes.ts` | 4b,4a,4d | 4d: drop `trackingGw` positional arg (578, 652). 4b: add `handlePlatformApproval`/`getQualityThreshold` to the two `processWebhook(event, {...})` dep objects. 4a: nothing new to instantiate (reuses `enforceBudget`, `gateClaudeInvocation`, `enqueueReview`, `isTrustedActor` already in scope) — pass them into the controllers' deps for `processReviewRequest` composition. |
| controller test files (`gitlab.controller.test.ts`, `github.controller.test.ts`, `gitlabIdempotency.controller.test.ts`) | all | Drop positional `trackingGateway` arg; assert delegation to new usecases; reply assertions preserved (now via mapper). |

> `eventFilter.ts` NOT modified (out of scope per spec — supplies mapper inputs).
> `extractBaseUrl`, `buildGitLab/GitHubReviewProcessor`, processor `@/config` reads: UNCHANGED
> (stay controller-side per §7).

---

## 10. TDD test plan

### Outer loop (SDD — write FIRST, RED during impl, GREEN at end)
`src/tests/acceptance/73-stage4-controller-thinning.acceptance.test.ts`:
- approve happy → `{type:'approved'}`; quality-gate + reverted → `{type:'approval-revoked', reason, revokeMessage}`; not-tracked → `{type:'approval-ignored'}` (drives `processWebhook` directly, platform-neutral, imports NO `GitLab*`/`GitHub*`).
- review-request: budget-exceeded → `{type:'budget-exceeded'}`; full-auto trusted → `{type:'queued'}`; semi-auto → `{type:'pending'}`; untrusted (gate on) → `{type:'pending', reason:'untrusted-actor'}`; dedup → `{type:'deduplicated'}` (drives `processReviewRequest` directly).

### Inner loop (inside-out, Red→Green→Refactor)
1. **Entity** (4b): `webhookEvent.ts` `approve` gains `reviewId` — compile-time only.
2. **Usecase** (4b): `processWebhook.usecase.test.ts` — add approve describe block; stub `transitionState`/`handlePlatformApproval`/`getQualityThreshold`; assert each verdict.
3. **Usecase** (4a): `processReviewRequest.usecase.test.ts` — `buildHarness(overrides)` mirroring Stage-3 style; stub `enforceBudget`/`gateClaudeInvocation`/`isTrustedActor`/`enqueue`; assert sequencing + verdict (incl. the no-gate fallback raw-enqueue branch).
4. **Presentation** (4c): `webhookReply.test.ts` — every result/verdict variant × `numberKey` → exact status+body.
5. **Controllers** (all): extend existing tests — assert delegation, drop `_trackingGateway` arg, replies byte-for-byte via mapper. Review-request + approve + followup paths stay green.

### Regression net (4a/4b)
Run `73-process-webhook`, `46-github-followup-review-on-push`, `197-trusted-actor-provenance-gate`,
`200-webhook-event-idempotency` acceptance suites unchanged — they guard the behavior-sensitive paths.

### Verification gate
`yarn verify` (typecheck + lint + format:check + test:ci) green after EACH sub-stage; acceptance
GREEN at the end. (MEMORY caveat: link worktree `node_modules` before running tests.)

---

## 11. Definition of Done checklist (derived from spec §Controller thinning + Bug fix + Composition root + Tests)

### Controller thinning
- [ ] `gitlab.controller.ts` review-request + followup tails delegate to `processReviewRequest`; no inline budget-decision branching, no raw `enqueueReview` call.
- [ ] `github.controller.ts` same (review-request has no actor-trust gate — preserved).
- [ ] approve branch in both controllers: maps to `WebhookEvent` `approve`, calls `processWebhook`, performs ONLY platform I/O (revoke + comment) on `approval-revoked`.
- [ ] No business logic remains in controllers (no inline `enqueueReview`/budget-decision/verdict logic); `executeReview`/`recordCompletion` only inside the controller-built processor closure (allowed — ACL assembly), not as inline orchestration.
- [ ] Controllers map `ProcessWebhookResult` + `ReviewRequestVerdict` to replies via the shared `webhookReply` mapper.

### Bug fix (carried from spec; already shipped in Stage 1 — re-verify, do not re-do)
- [ ] GitHub post-review action execution uses primary/fallback (NOT both) — already via `executeReview` (Stage 1). Confirm still true; no Stage-4 change.
- [ ] GitHub review failure throws for retry — already via `runGitHubReview` throwing on `failed`. Confirm; no Stage-4 change.

### Composition root
- [ ] `routes.ts`: `_trackingGateway` positional arg removed from both call sites.
- [ ] `routes.ts`: `processWebhook` dep objects extended with `handlePlatformApproval` + `getQualityThreshold` (4b).
- [ ] `routes.ts`: review-request usecase composed from already-instantiated `enforceBudget`/`gateClaudeInvocation`/`enqueueReview`/`isTrustedActor` — NO new gateway instances invented.

### `_trackingGateway`
- [ ] Param dropped from both controller signatures; orphan `ReviewRequestTrackingGateway` import removed if unused; all test call sites updated.

### HTTP wire contract
- [ ] Reply shapes byte-for-byte identical (status code + body keys, incl. `mrNumber` vs `prNumber`) — proven by `webhookReply.test.ts` + unchanged controller/acceptance assertions.
- [ ] No structural unification that renames the platform number key.

### Tests
- [ ] Unit: `processReviewRequest` (sequencing + verdicts) and `processWebhook` approve cases.
- [ ] Unit: `webhookReply` mapper per variant × numberKey.
- [ ] Acceptance: `73-stage4-controller-thinning.acceptance.test.ts` GREEN at end (platform-neutral).
- [ ] Regression: spec-46/197/200 + `73-process-webhook` suites stay GREEN.
- [ ] All tests English.
- [ ] `yarn verify` green after each sub-stage.

### Quality
- [ ] No new external dependencies.
- [ ] `@/` alias + `.js` everywhere (source AND tests); no relative; no barrel.
- [ ] No `as Type`; no `any`; `null` not `undefined` in domain types (`reviewId: string|null`).
- [ ] Dependency Rule: new usecases import ONLY `entities/` + sibling `usecases/` + existing ports
      (`EnforceBudgetUseCase`, `GateClaudeInvocationUseCase`, `IsTrustedActorUseCase`,
      `EnqueueReviewFunction`); NO `interface-adapters/`, NO `frameworks/`, NO `@/config`, NO
      platform-specific event/gateway types.
- [ ] No invented single-implementation ports (no `BudgetBroadcastPort`/`ConfigPort`); WS broadcast
      + `@/config` reads + processor closure stay controller-side (§7).

---

## ACCEPTANCE_TEST
```
ACCEPTANCE_TEST:
  file: src/tests/acceptance/73-stage4-controller-thinning.acceptance.test.ts
  note: "SDD outer loop — written first by implementer, RED during impl, GREEN at the end. Drives processReviewRequest + processWebhook(approve) directly, platform-neutral (imports no GitLab*/GitHub* type)."
```

---

## REFERENCE_FILES (read before implementing)

- `src/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.ts` — review tail (600-756), followup tail (494-592), approve inline (343-438), `extractBaseUrl` (63-79), `buildGitLabReviewProcessor` (767-786), `_trackingGateway` param (237).
- `src/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.ts` — review tail (529-674), followup tail (441-521), approve via `handleGitHubPullRequestReviewHook` (122-242, note `reviewId` + `shortDismissalLabel`), `buildGitHubReviewProcessor` (685-700), `_trackingGateway` param (317).
- `src/modules/platform-integration/usecases/processWebhook.usecase.ts` — current result/deps unions + the `approve` placeholder branch (153-154) to replace in 4b.
- `src/modules/platform-integration/entities/webhookEvent/webhookEvent.ts` — `approve` variant to extend with `reviewId` (4b).
- `src/modules/review-execution/usecases/gateClaudeInvocation.usecase.ts` — `GateClaudeInvocationUseCase`, `EnqueueReviewFunction` port (queue already abstracted — no new port needed), 3-way result.
- `src/modules/review-execution/usecases/triggerReview.usecase.ts` — function-style `(params, deps)` template + `ReviewQueuePort` precedent to mirror for `processReviewRequest`.
- `src/modules/token-accounting/usecases/enforceBudget/enforceBudget.usecase.ts` — `EnforceBudgetUseCase.execute` result shape (`accepted`/`status.limitUsd`/`status.consumedUsd`).
- `src/modules/platform-integration/usecases/isTrustedActor.usecase.ts` — `IsTrustedActorUseCase.execute` (GitLab review/followup gate only).
- `src/modules/tracking/usecases/tracking/{transitionState,handlePlatformApproval}.usecase.ts` — approve verdict logic + `evaluateQualityGate` usage.
- `src/modules/tracking/entities/qualityGate/qualityGate.ts` — `evaluateQualityGate` (entity, inward-safe).
- `src/main/routes.ts` — wiring (578-619 GitLab, 652-691 GitHub); `gateClaudeInvocation` build (316-321 with `enqueue: enqueueReview`); composition root (LAST step each sub-stage).
- `src/tests/acceptance/73-process-webhook.acceptance.test.ts` — harness/stub style to mirror for the new acceptance test.
- `src/tests/acceptance/{46-github-followup-review-on-push,197-trusted-actor-provenance-gate,200-webhook-event-idempotency}.acceptance.test.ts` — the regression net for 4a/4b.
```
```
