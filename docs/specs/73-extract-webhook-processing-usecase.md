---
title: "SPEC-073: Extract Webhook Processing Use Case"
status: implemented
issue: "#73 (absorbs #76)"
labels: refactor, P2-important, webhook, architecture
milestone: "Architecture Cleanup"
---

# SPEC-073: Extract Webhook Processing Use Case

## Status: implemented (all 4 stages done)

> The codebase was restructured into a modular monolith (`src/modules/<context>/...`) after
> this spec was drafted; the original flat `src/usecases/` paths below are stale. See the
> plan/report for the real paths.

## Implementation (Stage 1 — `executeReview` extraction)

Plan: `docs/plans/73-execute-review-usecase.plan.md` · Report: `docs/reports/73-execute-review-usecase.report.md`

The shared review-execution block (create context → invoke Claude → track progress →
execute post-review actions → record stats → notify), previously copy-pasted across 4
processor paths (GitLab review + followup, GitHub review + followup), is extracted into a
single function-based use case. All 4 paths now delegate to it.

**Artefacts**
- Use case: `src/modules/review-execution/usecases/executeReview.usecase.ts`
- Ports (entities, Dependency Rule): `entities/review/claudeReviewInvoker.gateway.ts`, `entities/progress/progressWatcher.gateway.ts`
- Composition root: `src/main/executeReviewWiring.ts` (`buildExecuteReview`, `buildGitHubInventoryGateway`) wired in `src/main/routes.ts`
- Both webhook controllers now delegate to `deps.executeReview` (no inlined review-execution logic)

**Decisions** — fallback executor unified on `dispatchConstrainedActions` for both platforms
(GitHub gains the SPEC-198 constrained chokepoint via a thin inventory adapter derived from
its thread-fetch gateway); GitHub review **dual-action-execution bug fixed** (single
primary/fallback path, regression-tested); per-site thread-fetch strategy preserved
(GitLab pinned, GitHub plain).

**Verification** — `yarn verify` green (465 files / 3865 tests pass); acceptance test GREEN.

## Implementation (Stage 2 — `handleClose` extraction)

Plan: `docs/plans/73-handle-close.plan.md` · Report: `docs/reports/73-handle-close.report.md`

The close/cleanup block (cancel running job → archive tracking → delete review context →
remove worktree), copy-pasted in both controllers' close handlers, is extracted into one
function-based use case. Both controllers' close paths now delegate to it.

**Artefacts**
- Use case: `src/modules/review-execution/usecases/handleClose.usecase.ts` (4-effect cleanup,
  best-effort worktree removal; `mergeRequestId` built internally — the only platform divergence)
- `RemoveWorktreeAction` type moved to the worktree entity layer
  (`src/modules/worktree-management/entities/worktree/worktree.schema.ts`) so the use case
  imports it inward-safely (Dependency Rule)
- Both webhook controllers' close handlers delegate to `deps.handleClose`; wired in `routes.ts`

**Decisions** — `cancelJob`/`buildJobId` injected as plain fns (no port); merge/approve
transitions LEFT in controllers (already composed from `TransitionStateUseCase` — wrapping
them would drag platform-divergent HTTP gateways into a use case); HTTP reply shapes preserved
(unification deferred to Stage 4). Known pre-existing asymmetry flagged: a merged GitHub PR
arrives as a close event and is archived, not recorded as `state:'merged'` (out of scope).

**Verification** — `yarn verify` green (467 files / 3879 tests pass); acceptance test GREEN.

## Implementation (Stage 3 — `ProcessWebhook` orchestrator + `WebhookEvent` union)

Plan: `docs/plans/73-process-webhook.plan.md` · Report: `docs/reports/73-process-webhook.report.md`

A platform-neutral `WebhookEvent` discriminated union (entity layer) plus a function-based
`processWebhook(event, deps)` orchestrator that routes the **synchronous** webhook outcomes
(`close`, `merge`, `followup-push` eligibility, `ignored`) to the existing extracted use cases.
Both webhook controllers map their already-parsed close/merge/followup events into `WebhookEvent`,
call `deps.processWebhook`, and map the `ProcessWebhookResult` back to their **exact** existing HTTP
replies (status code + body keys byte-for-byte, incl. GitLab `mrNumber` vs GitHub `prNumber`).

**Artefacts**
- Entity: `src/modules/platform-integration/entities/webhookEvent/webhookEvent.ts` — `WebhookEvent`
  discriminated union (6 variants), pure type module (no Zod guard; data validated upstream by the
  platform guards). Imports only `Language` + `Platform` entity types.
- Use case: `src/modules/platform-integration/usecases/processWebhook.usecase.ts` — `processWebhook`,
  `ProcessWebhookResult`, `ProcessWebhookDependencies`, `ProcessWebhook` type. Imports only `entities/`
  + sibling `usecases/` (Dependency Rule verified: no `interface-adapters/`, no `frameworks/`, no
  platform-specific event type / gateway).
- Composition root: `src/main/routes.ts` — `processWebhook` composed per-platform from existing use
  cases, injected into both controller dependency objects.

**Decisions** — Scope locked to the **synchronous** routing only. The `approve` and `review-requested`
paths stay 100% controller-side (the union carries both variants for completeness, but the orchestrator
returns `{ type:'ignored', reason:'<variant>-handled-by-controller' }` for them, keeping the switch total
without a `never` throw). The async enqueue tail — budget gate, processor closure capturing
`executeReview`, `gateClaudeInvocation`, actor-trust, `enqueueReview`, and the 3-way 202/200 reply shapes
— remains controller-side: moving it inward IS Stage 4. HTTP reply shapes preserved exactly (unification
deferred to Stage 4). `eventFilter.ts` untouched (its `filter*` functions are the controller-side mappers).

**Verification** — `yarn verify` green (473 files / 3921 tests pass); 13 unit + 8 acceptance Stage-3
tests GREEN; acceptance asserts platform-neutrality (imports no `GitLab*`/`GitHub*` type).

**Remaining (out of scope here, future runs):** Stage 4 full controller thinning — move the
`review-requested` enqueue path and `approve` verdict inward, unify HTTP reply shapes, and remove the
now-unused `_trackingGateway` controller param.

## Implementation (Stage 4 — final controller thinning)

Plan: `docs/plans/73-stage4-controller-thinning.plan.md` · Reports:
`docs/reports/73-stage4d-drop-tracking-gateway.report.md`,
`docs/reports/73-stage4c-reply-mapper.report.md`,
`docs/reports/73-stage4b-approve-verdict.report.md`,
`docs/reports/73-stage4a-review-request-tail.report.md`

Stage 4 was split into 4 independently `yarn verify`-green sub-commits (lowest risk first):

- **4d** — drop the dead `_trackingGateway` controller param from both webhook handlers + `routes.ts`
  call sites + all positional test sites. Mechanical, no behavior change.
- **4c** — centralize HTTP reply shaping into a shared `webhookReply` mapper parameterised by
  `numberKey` (`mrNumber` vs `prNumber`). Byte-for-byte preserved — the platform number-key wire
  contract is NOT unified to a single key.
- **4b** — move the platform-neutral `approve` verdict decision inward into `processWebhook`
  (returns `approved` / `approval-revoked` / `approval-ignored`); platform I/O (approval revoke arg
  shape + FR dismissal label + note comment) stays controller-side. `WebhookEvent` `approve` variant
  gains `reviewId: number | null`.
- **4a** — extract the review-request + followup enqueue sequencing (budget → actor trust → gate →
  enqueue + verdict classification) into a function-style `processReviewRequest` usecase (Option A).
  4 copy-pasted controller sites collapse into 1. Config-bound assembly, processor closures, and the
  `broadcastBudgetExceeded` WebSocket I/O stay controller-side (per the anti-overengineering analysis
  in the plan §7 — no single-implementation ports invented).

**Artefacts**
- `…/interface-adapters/controllers/webhook/webhookReply.ts` — shared reply mapper (4c)
- `…/usecases/processReviewRequest.usecase.ts` — review/followup enqueue sequencing (4a)
- `…/usecases/processWebhook.usecase.ts` — extended with the `approve` routing (4b)
- `…/entities/webhookEvent/webhookEvent.ts` — `approve` variant `reviewId` (4b)
- Both webhook controllers thinned; `src/main/routes.ts` wiring updated

**Decisions** — DoD bar is "no business logic in controllers" (no raw `enqueueReview`/budget-decision/
verdict logic), NOT "everything inside `processWebhook`". The queue was already behind the
`EnqueueReviewFunction` port — no new port created. WebSocket broadcast, `@/config` reads, and
platform-specific `ReviewJob`/processor assembly remain controller-side as legitimate ACL work.
HTTP wire contract preserved byte-for-byte.

**Verification** — `yarn verify` green (478 files / 3994 tests) after the final sub-stage; regression
net (spec-46/197/200 + 73-process-webhook acceptance) green with unchanged assertions.

## User Story

As a maintainer of ReviewFlow,
I want webhook business logic extracted from controllers into dedicated use cases,
so that controllers only handle HTTP concerns, platform-specific logic is isolated behind clean interfaces, and duplicated processing logic between GitHub and GitLab is eliminated.

## Context

### Problem

The two webhook controllers (`gitlab.controller.ts` at 647 lines and `github.controller.ts` at 370 lines) violate the Single Responsibility Principle. They mix HTTP concerns (request parsing, response codes, reply formatting) with business logic (event filtering, tracking, job creation, review context creation, post-review action execution, stats recording). This causes three concrete problems:

1. **Business logic is untestable without HTTP fixtures.** Testing the "create context, invoke review, execute actions, record stats" flow requires constructing full Fastify request/reply mocks. The logic itself has nothing to do with HTTP.

2. **Identical logic is duplicated.** The "create review context, invoke Claude, track progress, execute actions, record completion" block is copy-pasted across both controllers (~80 lines each), with minor platform-string differences. Bug fixes must be applied in two places -- and already diverge (GitHub executes both stdout markers AND context actions instead of using the primary/fallback pattern that GitLab uses; GitHub does not throw on review failure).

3. **Adding platform support means duplicating the entire controller.** If a third platform (Bitbucket, Azure DevOps) were supported, the entire 600+ line controller would need to be copied again.

Issue #74 (dependency injection in controllers) is closed, meaning the DI infrastructure prerequisite is satisfied. Issue #76 (deduplicate controllers) is absorbed into this issue since deduplication is achieved by extracting shared logic into use cases.

### What belongs in a controller vs. a use case

| Belongs in **Controller** | Belongs in **Use Case** |
|---------------------------|-------------------------|
| Verify webhook signature | Decide whether an event should trigger a review |
| Parse HTTP headers for event type | Track MR assignment |
| Validate payload with guard | Create and enqueue review job |
| Format HTTP response codes and bodies | Create review context (threads, agents, diff metadata) |
| Extract platform-specific fields from payload | Invoke Claude and track progress |
| | Execute post-review actions (context or stdout fallback) |
| | Record review completion with stats |
| | Handle close/cleanup (cancel job, archive tracking, delete context) |
| | Handle merge/approve state transitions |

### Current architecture (before)

```
Fastify Route Handler
  └── Controller (handleGitLabWebhook / handleGitHubWebhook)
        ├── HTTP concerns (verify, parse, respond)
        ├── Business logic (filter, track, enqueue, context, invoke, actions, stats)
        └── Platform-specific details mixed throughout
```

### Target architecture (after)

```
Fastify Route Handler
  └── Controller (thin adapter)
        ├── HTTP concerns (verify, parse, respond)
        └── Calls use case with platform-neutral input
              └── ProcessWebhookUseCase
                    ├── Event filtering & routing
                    ├── ProcessReviewUseCase (enqueue, context, invoke, actions, stats)
                    ├── ProcessFollowupUseCase (enqueue, context, invoke, actions, sync, stats)
                    ├── HandleCloseUseCase (cancel, archive, delete context)
                    └── HandleStateTransitionUseCase (merge, approve)
```

### Existing use case patterns in the codebase

The codebase uses two use case styles:

1. **Class-based** with `UseCase<TInput, TOutput>` interface from `shared/foundation/usecase.base.ts`:
   - `TrackAssignmentUseCase`, `RecordReviewCompletionUseCase`, etc.
   - Constructor receives gateway dependencies.
   - Single `execute(input)` method.

2. **Function-based** with explicit dependencies parameter:
   - `triggerReview(params, deps)`, `cancelReview(jobId, deps)`, `handleReviewRequestPush(params, deps)`
   - Dependencies passed as second argument.
   - Returns discriminated union result type.

Both patterns are valid. The function-based style is better suited here because the `ProcessWebhookUseCase` orchestrates multiple sub-operations and needs a logger, making constructor injection cumbersome.

### Shared logic to extract (measured from source)

| Block | GitLab lines | GitHub lines | Identical? |
|-------|-------------|-------------|------------|
| Close/cleanup handling | 97-141 | 71-114 | Structurally identical, different ID format |
| Review assignment tracking | 425-445 | 154-175 | Identical logic, different assignee field extraction |
| Job creation + enqueue | 452-632 | 182-355 | Structurally identical, 80+ lines duplicated |
| Review context creation | 486-520 | 213-247 | Identical |
| Progress tracking callback | 523-537 | 250-264 | Identical |
| Post-review action execution | 553-588 | 280-313 | **Divergent**: GitLab uses primary/fallback, GitHub runs both |
| Stats recording | 592-616 | 317-341 | Identical |
| Notification sending | scattered | scattered | Identical except "MR !/PR #" prefix |

## Gherkin Scenarios

### Feature: Webhook Event Processing via Use Case

```gherkin
Feature: Webhook event processing delegates to use cases

  Background:
    Given the ReviewFlow server is running
    And a repository is configured with a valid webhook secret

  # --- Review Request Processing ---

  Scenario: GitLab reviewer assignment triggers a review
    Given a GitLab MR webhook payload with a reviewer assignment event
    When the webhook is received
    Then the controller verifies the GitLab signature
    And the controller parses the payload with the GitLab guard
    And the controller delegates to ProcessWebhookUseCase with platform "gitlab"
    And a review job is enqueued with jobType "review"
    And the MR assignment is tracked
    And the HTTP response is 202 with status "queued"

  Scenario: GitHub review request triggers a review
    Given a GitHub PR webhook payload with action "review_requested"
    When the webhook is received
    Then the controller verifies the GitHub signature
    And the controller parses the payload with the GitHub guard
    And the controller delegates to ProcessWebhookUseCase with platform "github"
    And a review job is enqueued with jobType "review"
    And the PR assignment is tracked
    And the HTTP response is 202 with status "queued"

  # --- Event Filtering (rejects) ---

  Scenario: Non-review event is ignored
    Given a webhook payload for a MR/PR update that is not a reviewer assignment
    And the event is not a close, merge, approve, or push
    When the webhook is received
    Then the use case returns result "ignored" with a reason
    And the HTTP response is 200 with status "ignored"

  Scenario: Draft MR/PR is ignored
    Given a webhook payload for a draft MR/PR
    When the webhook is received
    Then the use case returns result "ignored" with reason "draft"
    And no review job is enqueued

  Scenario: Unconfigured repository is ignored
    Given a webhook payload for a project not in ReviewFlow's configuration
    When the webhook is received
    Then the use case returns result "ignored" with reason "Repository not configured"
    And no review job is enqueued

  # --- Close Handling ---

  Scenario: MR/PR close cancels job and archives tracking
    Given a running review job for MR/PR #42
    And MR/PR #42 is tracked in ReviewFlow
    When a close event is received for MR/PR #42
    Then the running job is cancelled
    And the tracking record is archived
    And the review context file is deleted
    And the HTTP response is 200 with status "cleaned"

  Scenario: Close on unconfigured repo is acknowledged
    Given a close event for a project not in ReviewFlow's configuration
    When the webhook is received
    Then the HTTP response is 200 with status "ignored"
    And no cleanup actions are performed

  # --- State Transitions (GitLab-specific) ---

  Scenario: GitLab MR merge updates tracking state
    Given MR #42 is tracked in ReviewFlow
    When a merge event is received for MR #42
    Then the tracking state is transitioned to "merged"
    And the HTTP response is 200 with status "merged"

  Scenario: GitLab MR approval updates tracking state
    Given MR #42 is tracked in ReviewFlow
    When an approval event is received for MR #42
    Then the tracking state is transitioned to "approved"
    And the HTTP response is 200 with status "approved"

  # --- Review Execution (use case internals) ---

  Scenario: Review job creates context, invokes Claude, executes actions, and records stats
    Given a review job is dequeued for MR/PR #42
    When the review execution callback runs
    Then threads are fetched from the platform
    And diff metadata is fetched from the platform
    And a review context file is created with agents and threads
    And Claude is invoked with progress tracking
    And post-review actions are executed from context file (primary)
    And if no context actions exist, stdout markers are used (fallback)
    And review completion is recorded with stats (score, blocking, warnings, suggestions)
    And a completion notification is sent

  Scenario: Review context creation failure does not block review
    Given a review job is dequeued
    When thread fetching fails
    Then a warning is logged
    And the review proceeds without pre-fetched context
    And Claude is still invoked

  Scenario: Diff metadata fetch failure does not block review
    Given a review job is dequeued
    And threads are fetched successfully
    When diff metadata fetching fails
    Then a warning is logged
    And the review context is created without diff metadata
    And Claude is still invoked

  Scenario: Cancelled review sends cancellation notification
    Given a review job is running
    When the job is cancelled via the queue
    Then a cancellation notification is sent
    And no stats are recorded

  Scenario: Failed review throws for retry
    Given a review job is running
    When Claude returns a non-zero exit code
    Then a failure notification is sent
    And an error is thrown so the queue can retry

  # --- Deduplication ---

  Scenario: Duplicate review request is deduplicated
    Given a review job is already active for MR/PR #42
    When another review request webhook arrives for MR/PR #42
    Then the use case returns result "deduplicated"
    And the HTTP response is 200 with status "deduplicated"
```

### Feature: Followup Review Processing via Use Case

```gherkin
Feature: Followup review processing delegates to use case

  Background:
    Given the ReviewFlow server is running
    And a repository is configured with a valid webhook secret

  Scenario: Push on reviewed MR/PR triggers followup
    Given MR/PR #42 has been reviewed with blocking threads
    And MR/PR #42 is in "pending-fix" state
    And autoFollowup is enabled
    When a push event is received for MR/PR #42
    Then the push is recorded on the tracked MR/PR
    And followup eligibility is checked
    And a followup review job is enqueued with jobType "followup"
    And the HTTP response is 202 with status "followup-queued"

  Scenario: Followup job resolves threads and records stats
    Given a followup review job completes successfully
    Then actions are executed from context file (primary) or stdout markers (fallback)
    And threads are synced from the platform
    And followup completion is recorded with thread close count
    And a completion notification is sent

  Scenario: No followup when autoFollowup is disabled
    Given MR/PR #42 has autoFollowup set to false
    When a push event is received for MR/PR #42
    Then the push is recorded
    But no followup job is enqueued
    And the HTTP response is 200 with reason "Auto-followup disabled"

  Scenario: No followup when MR/PR does not need one
    Given MR/PR #42 has 0 open threads
    When a push event is received
    Then the push is recorded
    But checkFollowupNeeded returns false
    And no followup job is enqueued
```

## Out of Scope

- **Removing platform-specific event filter functions.** `filterGitLabEvent`, `filterGitHubEvent`, etc. stay in `eventFilter.ts`. They are pure functions called by controllers to translate platform events into the use case's platform-neutral input. No changes needed.
- **Refactoring the `invokeClaudeReview` function.** The Claude invocation mechanism stays as-is. The use case calls it the same way controllers do today.
- **Refactoring the queue adapter (`pQueueAdapter`).** The `enqueueReview` function and `ReviewJob` type stay as-is.
- **Adding new platform support (Bitbucket, etc.).** This refactoring makes it easier but does not implement it.
- **Standardizing PR/MR vocabulary (#77).** Terminology unification is a separate issue. The use case will use "mergeRequest" as the generic term internally, matching the existing `mergeRequestNumber` field in `FilterResult`.
- **Modifying the existing `triggerReview` or `handleReviewRequestPush` use cases.** These may be composed into the new use case, but their contracts do not change.
- **Changing notification message text.** French notification strings stay as-is.
- **Moving `extractBaseUrl` to a shared utility.** This would be a nice cleanup but is out of scope for this issue.
- **Fixing the GitHub action execution order bug.** The current GitHub controller runs both stdout markers and context actions instead of using the primary/fallback pattern. This bug should be fixed as part of this extraction (since the shared code path implements it correctly), but if it introduces risk, it can be deferred.

## INVEST Validation

| Criterion | Pass | Rationale |
|-----------|------|-----------|
| **Independent** | Yes | Depends only on #74 (closed). No other in-flight work modifies these controllers. #77 (vocabulary) is additive and non-conflicting. |
| **Negotiable** | Yes | The extraction granularity is negotiable: one monolithic `ProcessWebhookUseCase` vs. multiple smaller use cases (`ProcessReviewUseCase`, `ProcessFollowupUseCase`, `HandleCloseUseCase`). The controller boundary (what stays in controller vs. moves to use case) can be adjusted. |
| **Valuable** | Yes | Eliminates ~160 lines of duplicated business logic. Makes webhook processing testable without HTTP fixtures. Closes both #73 and #76. Unblocks adding new platform support. |
| **Estimable** | Yes | 3-4 days. The logic already exists and is well-understood. This is a mechanical extraction, not a design exercise. The existing use case patterns provide clear templates. |
| **Small** | Yes | 5-8 files modified/created. No new external dependencies. No domain model changes. The controllers shrink significantly; the use cases are extracted logic, not new logic. |
| **Testable** | Yes | Every scenario is deterministic and verifiable. Use cases are testable with stub gateways (no HTTP mocking needed). Controllers become thin enough to test with simple integration tests. |

## Definition of Done

### Use case extraction

- [ ] `ProcessWebhookUseCase` (or equivalent function) created in `src/usecases/` with platform-neutral input type
- [ ] Review execution logic (context creation, Claude invocation, action execution, stats recording) extracted into a shared function/use case, called by both review and followup paths
- [ ] Close/cleanup logic extracted into use case (cancel job, archive tracking, delete context)
- [ ] State transition logic (merge, approve) extracted into use case or composed from existing `TransitionStateUseCase`
- [ ] Followup eligibility check and job creation extracted into use case

### Platform-neutral input type

- [ ] A `WebhookEvent` (or similar) discriminated union type defined, representing the possible webhook outcomes: `review-requested`, `followup-push`, `close`, `merge`, `approve`, `ignored`
- [ ] Controllers map platform-specific parsed events into this type before calling the use case
- [ ] The use case never imports platform-specific types (no `GitLabMergeRequestEvent`, no `GitHubPullRequestEvent`)

### Controller thinning

- [ ] `gitlab.controller.ts` reduced to: verify signature, check event type, parse payload, map to use case input, call use case, format HTTP response
- [ ] `github.controller.ts` reduced to the same pattern
- [ ] No business logic remains in controllers (no `enqueueReview`, no `invokeClaudeReview`, no `recordCompletion`, no `parseReviewOutput` calls)
- [ ] Controllers do not import use case dependencies beyond the extracted webhook processing use case

### Bug fix (included in extraction)

- [ ] GitHub post-review action execution uses the same primary/fallback pattern as GitLab (context actions primary, stdout markers fallback -- not both)
- [ ] GitHub review failure throws an error for retry (matching GitLab behavior)

### Composition root

- [ ] `routes.ts` updated to instantiate and inject the extracted use case(s)
- [ ] Dependency count per controller is reduced (controller receives the use case, not individual sub-dependencies)

### Tests

- [ ] Unit tests for `ProcessWebhookUseCase` covering: review trigger, followup trigger, close handling, state transitions, ignored events, deduplication
- [ ] Unit tests for the shared review execution logic: context creation, action execution (primary/fallback), stats recording, failure handling, cancellation handling
- [ ] Existing controller tests updated to reflect the thin adapter pattern
- [ ] All tests in English
- [ ] `yarn verify` passes (typecheck + lint + test:ci)

### Quality

- [ ] No new external dependencies
- [ ] Naming follows codebase conventions (full words, camelCase files, no abbreviations)
- [ ] Imports use `@/` alias with `.js` extension
- [ ] No `as Type` assertions
- [ ] Dependency Rule respected: use cases do not import from `interface-adapters/` or `frameworks/` (except through gateway contracts defined in `entities/`)

## Technical Notes

### Suggested file structure

```
src/usecases/
├── processWebhook.usecase.ts        # Orchestrator: routes event to sub-use-cases
├── executeReview.usecase.ts          # Shared: context, invoke, actions, stats
├── handleClose.usecase.ts            # Cancel job, archive, delete context
└── tracking/
    ├── trackAssignment.usecase.ts    # (existing, unchanged)
    ├── recordReviewCompletion.usecase.ts  # (existing, unchanged)
    ├── transitionState.usecase.ts    # (existing, unchanged)
    └── ...
```

### Platform-neutral event type (sketch)

```typescript
type WebhookEvent =
  | { type: 'review-requested'; platform: Platform; projectPath: string; localPath: string;
      mergeRequestNumber: number; mergeRequestUrl: string; sourceBranch: string;
      targetBranch: string; title: string; description: string | null;
      assignedBy: { username: string; displayName?: string }; skill: string; language?: Language }
  | { type: 'followup-push'; platform: Platform; projectPath: string; localPath: string;
      mergeRequestNumber: number; mergeRequestUrl: string; sourceBranch: string;
      targetBranch: string }
  | { type: 'close'; platform: Platform; projectPath: string; localPath: string;
      mergeRequestNumber: number }
  | { type: 'merge'; platform: Platform; projectPath: string; localPath: string;
      mergeRequestNumber: number }
  | { type: 'approve'; platform: Platform; projectPath: string; localPath: string;
      mergeRequestNumber: number }
  | { type: 'ignored'; reason: string };
```

### Dependencies for the extracted use case

```typescript
interface ProcessWebhookDependencies {
  reviewContextGateway: ReviewContextGateway;
  threadFetchGateway: ThreadFetchGateway;
  diffMetadataFetchGateway: DiffMetadataFetchGateway;
  trackAssignment: TrackAssignmentUseCase;
  recordCompletion: RecordReviewCompletionUseCase;
  recordPush: RecordPushUseCase;
  transitionState: TransitionStateUseCase;
  checkFollowupNeeded: CheckFollowupNeededUseCase;
  syncThreads: SyncThreadsUseCase;
  trackingGateway: ReviewRequestTrackingGateway;
  logger: Logger;
}
```

### Implementation approach

**Stage 1: Extract review execution logic** (shared between review and followup)
- Create `executeReview.usecase.ts` with the shared "create context, invoke, track progress, execute actions, record stats" block.
- Both controllers call this instead of inlining the logic.
- This alone eliminates ~80 lines of duplication and fixes the GitHub action execution order bug.

**Stage 2: Extract close and state transition handling**
- Create `handleClose.usecase.ts` (cancel job, archive, delete context).
- Compose state transitions from existing `TransitionStateUseCase`.

**Stage 3: Create ProcessWebhookUseCase orchestrator**
- Define the `WebhookEvent` discriminated union.
- Controllers map parsed events to `WebhookEvent` and call the orchestrator.
- The orchestrator routes to the appropriate sub-use-case.

**Stage 4: Thin the controllers**
- Remove all business logic from controllers.
- Controllers become: verify, parse, map, call use case, format response.

Each stage is independently committable and verifiable with `yarn verify`.

### Risks and mitigations

| Risk | Mitigation |
|------|------------|
| The `enqueueReview` callback closure captures many deps | Pass deps explicitly to the extracted function; the callback becomes a thin wrapper |
| `invokeClaudeReview` is an async side-effect that is hard to stub | Accept it as an infrastructure dependency injected through the use case's dependency interface |
| `startWatchingReviewContext` / `stopWatchingReviewContext` are WebSocket side-effects | Inject via a `ProgressWatcher` interface to keep use case pure |
| The GitLab controller has the `extractBaseUrl` utility | Leave it where it is for now (out of scope), or inline its single call site |
| GitHub and GitLab have different repository lookup strategies (`findRepositoryByProjectPath` vs `findRepositoryByRemoteUrl`) | The controller handles this before calling the use case; the use case receives `localPath` already resolved |
