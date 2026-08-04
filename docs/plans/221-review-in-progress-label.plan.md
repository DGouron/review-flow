# Plan — Signal an in-progress review with a platform label (spec 221)

Spec: [`docs/specs/221-review-in-progress-label.md`](../specs/221-review-in-progress-label.md)

```
PLAN:
  scope: review-in-progress label (server-side, deterministic)
  is_new_module: false          # new entity folder inside the existing platform-integration module
```

## Scope challenge (`/anti-overengineering`)

| Layer | Verdict | Why |
|-------|---------|-----|
| Entity (constant + gateway contract) | KEEP | The contract is the seam that lets one use case serve two platforms. The "entity" is a 1-line constant + an interface — no class, no schema, no guard. |
| Zod schema / guard | **DROPPED** | No external data crosses a boundary inward. Nothing to validate: the label name is a literal, the target comes from an already-validated `ReviewJob`. Adding `reviewLabel.schema.ts` + `.guard.ts` would be pure boilerplate. |
| Value object | **DROPPED** | `review-in-progress` is a constant, not an invariant-bearing type. No branded type either — `projectPath`/`mrNumber` are already passed raw everywhere else (`NoteCommentPostInput`). |
| 2 use cases | KEEP | Imposed and justified: two distinct intentions with different best-effort boundaries (mark = ensure+add, clear = remove). |
| 2 CLI gateways | KEEP | One per platform, exact `noteCommentPost` precedent. |
| Presenter / view / controller | N/A | Nothing inbound, nothing rendered. |
| Factory | **DROPPED** | No new entity to build in tests; `ReviewJobFactory` already provides `projectPath`/`mrNumber`. |

Net: **5 production files + 1 entity constant file, 4 test files, 3 files edited.**

## ENTITIES

```
ENTITIES:
  - name: ReviewLabel (constant + gateway contract only — no class, no schema, no guard)
      constant_file: src/modules/platform-integration/entities/reviewLabel/reviewLabel.ts
      gateway_contract: src/modules/platform-integration/entities/reviewLabel/reviewLabel.gateway.ts
      test: none (a constant and an interface have no behaviour; covered by gateway + use case tests)
      factory: none
```

### `reviewLabel.ts`

Exports the single domain constant:

- `REVIEW_IN_PROGRESS_LABEL = 'review-in-progress'` — spec rule "not configurable in this iteration".

No colour here. Label colour is a **creation detail of each CLI** (GitHub wants `fbca04`, GitLab wants `#fbca04`) and the spec puts colour management out of scope — it stays a private module constant inside each gateway implementation, so the hex-format divergence never leaks into the domain.

### `reviewLabel.gateway.ts`

Mirrors `noteCommentPost.gateway.ts` exactly (plain `interface`, `Promise<void>` methods, input types as `interface`, no branded types):

```
EnsureReviewLabelInput { projectPath: string; label: string }
ReviewLabelInput       { projectPath: string; mrNumber: number; label: string }

interface ReviewLabelGateway {
  ensureLabelExists(input: EnsureReviewLabelInput): Promise<void>;  // idempotent, never throws
  addLabel(input: ReviewLabelInput): Promise<void>;
  removeLabel(input: ReviewLabelInput): Promise<void>;
}
```

Design notes to carry into the code (as JSDoc, not comments-noise):
- The label name is a **parameter**, not hard-coded in the gateway: the gateway stays a dumb platform capability; the domain constant is supplied by the use case. This is what makes the gateway unit-testable without importing the constant.
- `ensureLabelExists` is contractually **non-throwing** (see "Idempotency decision" below).

## USECASES

```
USECASES:
  - name: markReviewInProgress
      file: src/modules/platform-integration/usecases/markReviewInProgress.usecase.ts
      test: src/tests/units/modules/platform-integration/usecases/markReviewInProgress.usecase.test.ts
      type: command
      input: { projectPath: string; mrNumber: number }
      output: Promise<void>   # never rejects
      deps: { reviewLabelGateway: ReviewLabelGateway; logger: Logger }
      body: ensureLabelExists(REVIEW_IN_PROGRESS_LABEL) then addLabel(...), whole sequence in one
            try/catch → logger.warn on failure, swallowed

  - name: clearReviewInProgress
      file: src/modules/platform-integration/usecases/clearReviewInProgress.usecase.ts
      test: src/tests/units/modules/platform-integration/usecases/clearReviewInProgress.usecase.test.ts
      type: command
      input: { projectPath: string; mrNumber: number }
      output: Promise<void>   # never rejects
      deps: { reviewLabelGateway: ReviewLabelGateway; logger: Logger }
      body: removeLabel(REVIEW_IN_PROGRESS_LABEL) in try/catch → logger.warn, swallowed
```

Shape: classes with a constructor taking a single deps object, `execute(input): Promise<void>` — precedent `PersistJobRecordUseCase({ jobHistoryGateway, logger })` (a use case legitimately holding a `Logger`). They do **not** implement `UseCase<I, O>` from `src/shared/foundation/usecase.base.ts` unless it types cleanly with `Promise<void>` as `TOutput` (it does: `UseCase<MarkReviewInProgressInput, Promise<void>>`) — implement it, it is free.

**Best-effort lives in the use case, not in `executeReview`.** Consequence to document in the JSDoc of both `execute` methods: *"Never throws — a label failure is logged and swallowed (spec 221)."* This is what keeps `executeReview` free of any try/catch for labels and guarantees rule "if applying the label failed, the removal attempt still runs".

Flat placement (`usecases/`, no `label/` subfolder) matches the module: only `transport/` is nested today.

## GATEWAYS

```
GATEWAYS:
  - name: ReviewLabelGateway
      contract: src/modules/platform-integration/entities/reviewLabel/reviewLabel.gateway.ts
      implementations:
        - src/modules/platform-integration/interface-adapters/gateways/cli/reviewLabel.github.cli.gateway.ts
            class: GitHubReviewLabelCliGateway
            executor: CommandExecutor from
              '@/modules/platform-integration/interface-adapters/gateways/threadFetch.github.gateway.js'
              # type: (command: string) => string — execSync, THROWS on non-zero exit
        - src/modules/platform-integration/interface-adapters/gateways/cli/reviewLabel.gitlab.cli.gateway.ts
            class: GitLabReviewLabelCliGateway
            executor: CommandExecutor from
              '@/modules/platform-integration/interface-adapters/gateways/threadFetch.gitlab.gateway.js'
      stub: src/tests/stubs/reviewLabel.stub.ts  (StubReviewLabelGateway, records calls + injectable failure)
      methods: ensureLabelExists | addLabel | removeLabel
```

Both classes copy `noteCommentPost.*.cli.gateway.ts` line for line in style: local `shellQuote(value)` helper (single-quote + `'\''` escaping), `this.executor(command)`, GitLab encodes `projectPath` with `.replace(/\//g, '%2F')`.

### Exact CLI commands

`<L>` = `shellQuote(label)`. Every value that reaches the shell is quoted — the label is a constant today but the gateway must not assume it.

**GitHub (`gh api`)**

| Op | Command | Provenance |
|----|---------|------------|
| ensure | `gh api --method POST repos/<projectPath>/labels --field name=<L> --field color=<COLOR>` | REST `POST /repos/{owner}/{repo}/labels`. **No in-repo precedent** — asserted from the GitHub REST API. Same `gh api --method POST … --field` shape as every other gateway here. Returns **422 already_exists** when the label is present → `gh` exits non-zero → swallowed inside `ensureLabelExists`. |
| add | `gh api --method POST repos/<projectPath>/issues/<mrNumber>/labels --field <quoted 'labels[]=<label>'>` | **Verified in-repo**: `reviewAction.github.cli.gateway.ts:56-67` already ships this exact endpoint + `labels[]=` field for `ADD_LABEL`. |
| remove | `gh api --method DELETE repos/<projectPath>/issues/<mrNumber>/labels/<encodeURIComponent(label)>` | REST `DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}`. **No in-repo precedent** — asserted from the GitHub REST API. |

`COLOR`: `'fbca04'` (GitHub wants hex **without** `#`), private module constant.

Note on `labels[]=`: quote the **whole token** — `--field 'labels[]=review-in-progress'` — i.e. `shellQuote(\`labels[]=${label}\`)`. The unquoted form currently used by `reviewAction.github.cli.gateway.ts` is safe there only because that gateway passes an `args[]` array to `execFile`-style execution; this gateway concatenates into a `/bin/sh` string where `[]` is a glob character class.

**GitLab (`glab api`)**, `<P>` = `projectPath.replace(/\//g, '%2F')`

| Op | Command | Provenance |
|----|---------|------------|
| ensure | `glab api --method POST projects/<P>/labels --field name=<L> --field color=<COLOR>` | REST `POST /projects/:id/labels` (name + color required). **No in-repo precedent** — asserted from the GitLab API. Returns **409** when the label exists → non-zero exit → swallowed. |
| add | `glab api --method PUT projects/<P>/merge_requests/<mrNumber> --field add_labels=<L>` | **Verified in-repo**: `reviewAction.gitlab.cli.gateway.ts:63-67`. |
| remove | `glab api --method PUT projects/<P>/merge_requests/<mrNumber> --field remove_labels=<L>` | Exact mirror of the verified `add_labels` form (MR-update API `remove_labels`). **No in-repo precedent** — this is the safest available form given the codebase. |

`COLOR`: `'#fbca04'` (GitLab wants the leading `#`), private module constant.

**Fallbacks if a form misbehaves in the field** (do NOT implement now, record only): `gh label create <name> --repo <projectPath> --force` for ensure and `gh pr edit <mrNumber> --repo <projectPath> --remove-label <name>` for remove. They are the `gh`-native equivalents but break the `gh api` uniformity of every other gateway in this codebase, so `gh api` wins by default.

### Idempotency decision (important)

`ensureLabelExists` **catches and discards executor errors inside the gateway**. Rationale, to be captured as JSDoc:

- neither `gh api` nor `glab api` offers an idempotent create; duplicate creation is 422/409 → non-zero exit → `execSync` throws;
- distinguishing "already exists" from "no permission" would require parsing CLI stderr — noise for zero behavioural gain;
- if the failure is genuine (missing scope), it surfaces one line later as an `addLabel` failure, which the use case logs as a warning.

Consequence, accepted: a project where the daemon cannot create labels logs an *add* warning, not an *ensure* warning. Alternative rejected: warn on every ensure → one warning per review on every already-labelled project (log noise), and if the use case aborted on ensure failure it would skip `addLabel`, breaking the spec rule "ensure step is a no-op, label applied".

## CONTROLLERS

None. Nothing inbound changes; no webhook/http/mcp surface.

## PRESENTERS

None (spec: "Exposing the label state on the dashboard" is out of scope).

## VIEWS

None.

## `executeReview` restructuring

`executeReview` (`src/modules/review-execution/usecases/executeReview.usecase.ts:232-316`) is **85 lines** today — already ~3x the 30-line oxlint warning. Four terminal returns must clear the label: `cancelled` (:250), `failed` on invoke (:255), `failed` on unreadable context (:267), `completed` (:304).

**Chosen approach — `try/finally` wrapper, zero edits inside the long function:**

1. Rename the current `export async function executeReview` to a private `async function runReviewPipeline(input, deps)` — **body byte-identical**, no line moved.
2. Add a new exported `executeReview` of ~10 lines:

```
export async function executeReview(input, deps): Promise<ExecuteReviewResult>
  if (input.isFollowup) return runReviewPipeline(input, deps)         // rule: follow-ups untouched
  const target = { projectPath: input.job.projectPath, mrNumber: input.job.mrNumber }
  await deps.markReviewInProgress.execute(target)
  try    { return await runReviewPipeline(input, deps) }
  finally{ await deps.clearReviewInProgress.execute(target) }
```

Why this and not "one clear call at each of the 4 returns":
- **no path can be missed** — `finally` covers the 4 documented terminal states *and* an unexpected throw from `claudeInvoker.invoke` (which today propagates uncaught) at no extra cost;
- **zero diff inside the 85-line function** → no risk of breaking the 20+ existing `executeReview` tests, smallest possible review surface;
- the `isFollowup` gate exists exactly once;
- the new exported function is ~10 lines → **satisfies the ≤30-line rule**; the pre-existing 85-line body keeps its existing warning, unchanged (no new debt).
- No further splitting of `runReviewPipeline` is proposed. It would be a second, unrelated scope (`/scope-discipline`) and would balloon the diff for a feature that adds two calls.

**Accepted deviation to flag to the reviewer**: with this shape the mark happens *just before* `sendNotification('Review démarrée')` instead of *after* `createReviewContext`. The spec's only ordering constraint — "before `claudeInvoker.invoke` is called" — is satisfied, and applying the label as early as possible is arguably better (the human signal lands sooner). If the exact "after `createReviewContext`" position is required, the alternative is: move the single `markReviewInProgress` call to line 244 of the pipeline behind `if (!isFollowup)`, keeping `clear` in the wrapper's `finally` — cost: the `isFollowup` gate is then duplicated.

**Dependency additions** to `ExecuteReviewDependencies` (:76-90), following the `recordCompletion` / `syncThreads` precedent of injecting a use case narrowed with `Pick`:

```
markReviewInProgress:  Pick<MarkReviewInProgressUseCase, 'execute'>;
clearReviewInProgress: Pick<ClearReviewInProgressUseCase, 'execute'>;
```

Type-only cross-module import (`@/modules/platform-integration/usecases/…usecase.js`) — allowed: `.oxlintrc.json:57-65` restricts `src/modules/**/usecases/**` from importing `interface-adapters/`, `frameworks/`, `main/` only, and `executeReview.usecase.ts:22` already imports a use case from another module (`@/modules/tracking/usecases/…`).

## WIRING

```
WIRING:
  src/main/executeReviewWiring.ts
    - ExecuteReviewWiringDependencies (:129-141) += reviewLabelGateway: ReviewLabelGateway
      (placed next to noteCommentPostGateway — identical flow: routes.ts builds it, wiring consumes it)
    - buildExecuteReview destructuring (:144-156) += reviewLabelGateway
    - ExecuteReviewDependencies literal (:163-207) +=
        markReviewInProgress:  new MarkReviewInProgressUseCase({ reviewLabelGateway, logger })
        clearReviewInProgress: new ClearReviewInProgressUseCase({ reviewLabelGateway, logger })
      Rationale: routes.ts passes ONE gateway instead of TWO use cases → half the churn at the two
      call sites; executeReviewWiring.ts is part of the composition root, so instantiating there is
      legitimate (it already builds claudeInvoker in place).
    - imports: type ReviewLabelGateway + the two use case classes

  src/main/routes.ts
    - after the noteCommentPost pair (:383-394), add the platform pair:
        const gitLabReviewLabelGateway = new GitLabReviewLabelCliGateway(defaultGitLabExecutor);
        const gitHubReviewLabelGateway = new GitHubReviewLabelCliGateway(defaultGitHubExecutor);
      (no EgressScanned wrapper: a constant label name carries no model-authored text, so it is not
       an egress-scan subject — unlike note bodies)
    - buildExecuteReview call site 1 (:479-491, gitlab)  += reviewLabelGateway: gitLabReviewLabelGateway
    - buildExecuteReview call site 2 (:492-504, github)  += reviewLabelGateway: gitHubReviewLabelGateway
    - 2 imports
```

### Complete `buildExecuteReview` call-site census (verified by repo-wide grep)

| Site | Needs the new field? |
|------|----------------------|
| `src/main/routes.ts:479` (gitlab) | **YES** |
| `src/main/routes.ts:492` (github) | **YES** |
| everything else | **NO — none exist.** `buildExecuteReview` is called from exactly these two places. |

Sites that consume the *already-built* `ExecuteReview` function and therefore need **no change**: `routes.ts:513`, `:522` (processor deps), `:644`, `:729` (webhook route deps), `gitlab.controller.ts:90/114/606/835`, `github.controller.ts:77/122/558/791`. Dashboard-manual and webhook-followup runs flow through `ProcessorRegistry` over the same two `ExecuteReview` instances → covered for free.

`src/main/server.ts:135-166` (`buildRecoveryExecuteActions`, the per-platform `NoteCommentPost` gateway pair around :148) **must NOT be touched**: it replays context actions after a crash, it never calls `executeReview`, and startup label reconciliation is explicitly out of scope.

`mrTrackingAdvancedRoutes` (`routes.ts:396-421`, receives `noteCommentPostGatewayFactory`) does **not** call `buildExecuteReview` → no change. No `reviewLabelGatewayFactory` is introduced.

## Test plan

```
NEW test files:
  src/tests/units/modules/platform-integration/interface-adapters/gateways/cli/reviewLabel.cli.test.ts
  src/tests/units/modules/platform-integration/usecases/markReviewInProgress.usecase.test.ts
  src/tests/units/modules/platform-integration/usecases/clearReviewInProgress.usecase.test.ts
  src/tests/stubs/reviewLabel.stub.ts                      (StubReviewLabelGateway)
  src/tests/acceptance/221-review-in-progress-label.acceptance.test.ts

EXTENDED test files (compile-breaking: ExecuteReviewDependencies gains 2 required fields):
  src/tests/units/modules/review-execution/usecases/executeReview.usecase.test.ts   (harness :73-107)
  src/tests/acceptance/73-execute-review-usecase.acceptance.test.ts                 (buildDependencies :39-72)
```

### `reviewLabel.cli.test.ts` (both gateways, one file — precedent `noteCommentPost.cli.shellSafety.test.ts`)

Capture the command string via an inline executor `(command) => { captured = command; return ''; }` and assert the **exact** command per operation, 6 assertions total (3 ops x 2 platforms). Plus:
- GitLab project path is `%2F`-encoded;
- `ensureLabelExists` **resolves** when the executor throws (idempotency contract) — the decisive test;
- `addLabel` / `removeLabel` **reject** when the executor throws (best-effort belongs to the use case, not the gateway);
- shell-validity of a label containing a quote, via the `execFileSync('/bin/sh', ['-n', '-c', command])` helper already used in `noteCommentPost.cli.shellSafety.test.ts`.

### Use case tests (over `StubReviewLabelGateway`)

`markReviewInProgress`: ensure-then-add ordering and both called with `REVIEW_IN_PROGRESS_LABEL`; resolves and logs one `warn` when `addLabel` rejects; resolves when `ensureLabelExists` rejects (defensive). Use `createStubLogger` / `capturingLogger.stub.ts` to assert the warn.
`clearReviewInProgress`: `removeLabel` called with the constant; resolves + warns when it rejects.

### `executeReview.usecase.test.ts` — harness change

The harness object literal at :73-107 gains, built Detroit-style (real use cases over the stub gateway, stub only at the I/O boundary):

```
const reviewLabelGateway = new StubReviewLabelGateway();
markReviewInProgress:  new MarkReviewInProgressUseCase({ reviewLabelGateway, logger }),
clearReviewInProgress: new ClearReviewInProgressUseCase({ reviewLabelGateway, logger }),
```
and exposes `reviewLabelGateway` on `Harness` so tests assert recorded calls. New `describe('review-in-progress label')` cases, one per spec scenario:

| Scenario | Assertion |
|----------|-----------|
| initial review success | ensure + add recorded, then remove recorded; `status === 'completed'`; stats unchanged |
| add happens before invoke | stub records the `addLabel` call index vs. `claudeInvoker` call — use `ClaudeReviewInvokerStub.onInvoke` to snapshot the gateway calls at invoke time (existing hook, :172) |
| cancelled | remove recorded, `status === 'cancelled'` |
| failed on invoke | remove recorded, `status === 'failed'` with the same reason as today |
| failed on unreadable context | `dropContextDuringInvoke` (:183) + remove recorded + `CONTEXT_UNREADABLE_REASON` |
| mark fails | gateway configured to throw on add → `claudeInvoker` still invoked, result identical to the baseline success case |
| remove fails | gateway throws on remove → still `completed` |
| follow-up | `isFollowup: true` → zero recorded calls on the label gateway |

`73-execute-review-usecase.acceptance.test.ts` gets the same two fields in `buildDependencies` — mechanical, no new cases (that spec's assertions are unrelated).

### Acceptance test

```
ACCEPTANCE_TEST:
  file: src/tests/acceptance/221-review-in-progress-label.acceptance.test.ts
  note: "SDD outer loop — written first by implementer, RED during impl, GREEN at the end"
  shape: drives the real executeReview + the real two use cases + the real CLI gateway of each
         platform behind a capturing executor, so the assertions are on the emitted gh/glab
         command strings (end-to-end through every new layer, one stub at the process boundary
         only). One `it` per spec scenario, GitHub and GitLab both covered.
```

## IMPLEMENTATION_ORDER

Walking skeleton = steps 1-5 (constant → contract → GitHub gateway → mark use case → wired into `executeReview` with its test): the first slice that crosses every layer and produces an observable command.

1. `src/tests/acceptance/221-review-in-progress-label.acceptance.test.ts` — SDD outer loop, written first, RED throughout.
2. `src/modules/platform-integration/entities/reviewLabel/reviewLabel.ts` — the domain constant; nothing can be named without it.
3. `src/modules/platform-integration/entities/reviewLabel/reviewLabel.gateway.ts` — the contract both implementations and both use cases compile against (innermost layer, Dependency Rule).
4. `src/tests/stubs/reviewLabel.stub.ts` — needed by the use case tests in step 6.
5. `…/gateways/cli/reviewLabel.github.cli.gateway.ts` + its half of `reviewLabel.cli.test.ts` — TDD on exact command strings; GitHub first because its `add` form is the one verified in-repo.
6. `…/usecases/markReviewInProgress.usecase.ts` + test — first vertical slice closed (constant → contract → CLI → use case).
7. `…/gateways/cli/reviewLabel.gitlab.cli.gateway.ts` + its half of `reviewLabel.cli.test.ts` — second platform, same shape.
8. `…/usecases/clearReviewInProgress.usecase.ts` + test — symmetric, trivial once step 6 exists.
9. `src/modules/review-execution/usecases/executeReview.usecase.ts` — rename to `runReviewPipeline` + new 10-line wrapper + 2 deps fields; extend `executeReview.usecase.test.ts` harness and add the 8 scenario cases (RED first per case).
10. `src/tests/acceptance/73-execute-review-usecase.acceptance.test.ts` — mechanical deps fix to restore the build.
11. `src/main/executeReviewWiring.ts` — wiring dependency + use case instantiation.
12. `src/main/routes.ts` — composition root, **last**: gateway pair + both `buildExecuteReview` call sites.
13. Acceptance test turns GREEN; `yarn verify`; `docs/reports/221-review-in-progress-label.report.md`; tracker → `implemented`.

## REFERENCE_FILES

- `src/modules/platform-integration/entities/noteComment/noteCommentPost.gateway.ts` — the contract shape to clone (plain interface, `Promise<void>`, input interfaces).
- `src/modules/platform-integration/interface-adapters/gateways/cli/noteCommentPost.github.cli.gateway.ts` / `.gitlab.cli.gateway.ts` — `CommandExecutor` injection, `shellQuote`, `%2F` encoding.
- `src/modules/review-execution/interface-adapters/gateways/cli/reviewAction.github.cli.gateway.ts:56-67` and `reviewAction.gitlab.cli.gateway.ts:63-67` — the **verified** add-label endpoints/fields.
- `src/modules/review-execution/usecases/executeReview.usecase.ts:76-90, 232-316` — deps interface + the 4 terminal returns.
- `src/main/executeReviewWiring.ts:129-207` — how a gateway travels from `routes.ts` into `ExecuteReviewDependencies`.
- `src/main/routes.ts:383-394, 479-504` — the per-platform gateway pair pattern and the only two `buildExecuteReview` call sites.
- `src/tests/units/modules/review-execution/usecases/executeReview.usecase.test.ts:32-136, 167-187` — harness + `onInvoke` / `dropContextDuringInvoke` hooks reused for ordering and failure scenarios.
- `src/tests/acceptance/73-execute-review-usecase.acceptance.test.ts:18-75` — the second deps literal to extend.
- `src/tests/units/modules/platform-integration/interface-adapters/gateways/cli/noteCommentPost.cli.shellSafety.test.ts` — capturing-executor + `sh -n` command-assertion pattern.
- `src/tests/stubs/noteCommentPost.stub.ts` — stub shape to clone.
- `src/shared/foundation/usecase.base.ts` — `UseCase<TInput, TOutput>`.
- `.oxlintrc.json:43-77` — confirms the cross-module type import in `executeReview.usecase.ts` is legal.

## RISKS

1. **Two of the six CLI commands have no in-repo precedent** — GitHub `DELETE …/issues/{n}/labels/{name}` and GitLab `--field remove_labels=…`, plus both label-creation calls. They are asserted from the platform REST APIs, not verified against a live CLI. Mitigation: best-effort semantics mean a wrong form degrades to a logged warning, never a failed review; validate manually against one real MR/PR before closing the spec.
2. **`ensureLabelExists` swallows everything**, so a genuine permission problem is only visible through the subsequent `addLabel` warning. Documented trade-off, not a defect.
3. **`labels[]=` quoting**: `[]` is a glob character class in `/bin/sh`. The existing `reviewAction` gateway escapes this only because it executes via an args array. The new gateway must `shellQuote` the whole `labels[]=<label>` token — a silent-failure trap if copied naively from `reviewAction.github.cli.gateway.ts`.
4. **Two required deps fields break compilation of two existing test files** — expected and listed (steps 9-10); do not make the fields optional to dodge it, that would let a future call site silently skip the label.
5. **No crash reconciliation** (spec out of scope): a daemon killed mid-review leaves a stale `review-in-progress` label on the MR, cleared only by the next review of that MR. Worth a follow-up spec if it bites.
6. **Ordering deviation** from the position suggested during planning (mark before `sendNotification` rather than after `createReviewContext`) — spec-compliant, one-line change if the reviewer disagrees. See the restructuring section.
7. **Label spam risk is nil** but note: nothing dedupes concurrent runs on the same MR; two overlapping runs (queue dedupes by job id, so unlikely) would have the second `remove` clear the label while the first still runs. Out of spec, no mitigation planned.
