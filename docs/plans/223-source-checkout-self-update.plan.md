# Plan: 223 — Source-checkout self-update

Spec: `docs/specs/223-source-checkout-self-update.md` (revised — two shared preconditions, structured refusal motive)
Module: `src/modules/cli-configuration/` (existing bounded context — version check, install-type detection, self-update, CLI daemon lifecycle)

> Revision note: this plan supersedes the first draft. Two of the original "Ambiguities" were settled by
> the coordinator/user and the spec itself was amended; the differences are summarized at the bottom of
> this revision's changelog section.

## Key architectural decisions (read before the artifact list)

1. **Preconditions live in exactly two functions, split at the exact point the spec now names.**
   The revised spec is explicit: preconditions 1 (local machine) and 2 (no review running/waiting) are
   evaluated **before** `installTypeDetector.detect()` and apply to **both** install kinds; preconditions
   3-5 (branch, clean checkout, tools reachable) only make sense for a checkout and are evaluated **after**
   that decision. This is no longer an implementation choice, it is dictated by the spec's own ordering
   rule. Decision: `triggerSelfUpdate` (the existing dispatcher) evaluates 1-2 itself, then — only for
   `source-checkout` — delegates to `runSourceCheckoutSelfUpdate`, which evaluates 3-5 and runs
   fetch→rebuild→restart-signal. For `global-npm`, once 1-2 pass, `triggerSelfUpdate` proceeds exactly as
   it does today (`selfUpdateCommand.runGlobalUpdate()`), unchanged.

2. **Loopback detection is a new, autonomous pure function, not a reuse of `isIpInCidr` + `transportGuardMiddleware`.**
   `isIpInCidr` (`src/modules/platform-integration/entities/transport/cidr.ts:21`) is IPv4-only (verified:
   `ipv4ToInteger` rejects non-4-octet input, so `::1` and `::ffff:127.0.0.1` both resolve to `false`).
   `transportGuardMiddleware` solves a different problem (CIDR allow-lists for platform webhooks behind a
   trusted reverse-proxy hop) and pulls in `ClientIpResolver`/`evaluateTransport`, machinery this feature
   doesn't need. Decision: write `isLocalOrigin(ip: string): boolean` in
   `entities/selfUpdateSequence/localOrigin.ts`, reusing `isIpInCidr(ip, '127.0.0.0/8')` for the IPv4 case
   and adding explicit checks for `'::1'` and `'::ffff:127.0.0.1'`. It is now called from
   `triggerSelfUpdate`, still with zero I/O.

3. **`QueueActivityGateway` is a dependency of `triggerSelfUpdate` itself, not only of the source-checkout
   use case.** Since precondition 2 gates both install kinds, the dispatcher needs
   `countActiveOrWaiting()` directly. `runSourceCheckoutSelfUpdate` no longer needs it at all — it only
   receives `sourceCheckoutUpdateGateway` now, which shrinks its dependency surface back to exactly the 3
   remaining preconditions + the 2 sequence steps.

4. **One new gateway per external capability, not a reuse of neighbouring bounded-context gateways.**
   `worktree-management`'s `GitCommandExecutor` (`entities/gitCommand/gitCommand.gateway.ts`) already runs
   git commands, but it is scoped to worktree lifecycle (fetch into a worktree, `worktree-add/remove/prune`,
   `reset-hard`) — a different bounded context with a different reason to change. Decision:
   `cli-configuration` gets its own `SourceCheckoutUpdateGateway` port + CLI implementation, resolving its
   own checkout root the same way `InstallTypeDetectorFsGateway` already does (walk up from
   `import.meta.url` for `.git`). Minor, accepted duplication of ~10 lines of directory-walk logic.

5. **The pid-file/orphan bug fix is the smallest possible change, shared automatically by both paths.**
   Verified root cause: `selfUpdate.cli.gateway.ts:24-27` (`defaultSpawnDaemonDelayed`) builds
   `['start', '--skip-dependency-check']` — **no `--daemon`**. Compare with the working boot path
   (`start.command.ts:41-65`): `daemon: true` routes through `StartDaemonUseCase`, which calls
   `spawnDaemon()` and **writes the pid file**. Without `--daemon`, the respawned process runs the
   foreground branch — no pid file write. Fix: add `'--daemon'` to the args array, extracted into an
   exported pure `buildRestartArgs(port): string[]` so the fix is directly unit-testable. Because
   `restartDaemon()` is shared by both the global-npm restart call and the new source-checkout sequence,
   this single fix satisfies "the same guarantee applies to the existing global-install update path,
   which shares the restart".

6. **The `{status:'started'}` result and its existing restart wiring are reused as-is for the
   source-checkout happy path.** `version.routes.ts:68-72` already does
   `setTimeout(() => restartDaemonSilently(...), 1000)` whenever the use case returns
   `{status: 'started'}`, regardless of install type. Both branches converge on that same status once
   their respective work succeeds — no new status value, no new route branch for the happy path.

7. **The existing `'source-checkout'` status/manual-command passthrough is removed, not extended.**
   `SOURCE_CHECKOUT_MANUAL_COMMAND`, the `'source-checkout'` `SelfUpdateResult` variant, the
   `version-source-checkout-btn` markup branch, `showSourceCheckoutUpdate()` and the
   `version.sourceCheckoutTooltip` / `version.sourceCheckoutNotice` i18n keys become dead once the button
   performs the real sequence, and are deleted. Verified: `version.sourceCheckoutNotice` is already unused
   today (zero call sites) and `version.sourceCheckoutTooltip` has exactly one, the branch being removed.
   No existing test locks either variant in.

8. **The two buttons (`version-update-btn` / `version-source-checkout-btn`) are unified into one.**
   Confirmed by re-reading the code with the coordinator: `fetchStatus()` (`index.html:2266-2273`)
   re-renders the button area every 5 seconds **without** passing `installType`, while `checkForUpdates()`
   (`index.html:3329`) does pass it — so the source-checkout-specific branch already stops rendering on
   every periodic poll today, an existing, fact-verified bug. Unifying removes that inconsistency as a side
   effect of the button now doing the same kind of work for both install types.

9. **Refusals travel as a structured motive, not a ready-made sentence — REVISED from the first draft.**
   The spec was amended: "a refusal travels as a structured motive (an identifier plus whatever the
   message needs, ... ) never as a ready-made sentence: the dashboard is bilingual, so the wording is
   resolved at display time and exists in both languages." Decision: the `'refused'` `SelfUpdateResult`
   variant carries `motive: SelfUpdateRefusalMotive`, a discriminated union with exactly the data each
   refusal kind needs (no optional/floating fields, no `undefined`):
   ```
   type SelfUpdateRefusalMotive =
     | { kind: 'local-only' }
     | { kind: 'reviews-in-progress'; count: number }
     | { kind: 'wrong-branch' }
     | { kind: 'dirty-checkout' }
     | { kind: 'missing-tool'; tool: 'git' | 'yarn' }
     | { kind: 'fetch-failed'; detail: string }
     | { kind: 'rebuild-failed' };
   ```
   `detail` on `fetch-failed` is the external tool's own (untranslated) output, per "a failure reported by
   an external tool also carries that tool's own detail, which is passed through as-is and is not
   translated" — it is concatenated to the translated fixed sentence at display time, never itself run
   through `t()`. Wording resolution moves entirely to the dashboard: a new pure function
   (`resolveRefusalWording(motive, translate)` in `versionUpdate.js`) maps each `kind` to a translated
   template, filling in `count`/`tool`/`detail` as needed. This replaces the rejected first-draft decision
   of raw French strings built server-side.

10. **No schema/guard artifacts.** `POST /api/version/update` has no request body; the only externally-
    sourced value is `request.ip` (a string Fastify already types). `SelfUpdateRefusalMotive` is an
    internal, statically-typed result shape produced by trusted code paths, not deserialized external
    input — it gets a plain TypeScript union, not a Zod schema/guard pair, consistent with how
    `SelfUpdateResult` itself has none today.

11. **"reports the current step" is now literally "states that an update is in progress", nothing more —
    this is a rule, not an ambiguity.** The spec was corrected: "while the sequence runs, the button is
    disabled and states that an update is in progress; it does not announce which individual step is
    running, since the whole sequence is one call." The button shows one generic in-progress label for the
    whole call (reusing the existing `version.updating` state), then `version.restarting` + health-polling
    once the response comes back — identical to today's global-npm UX, and now spec-compliant by
    definition rather than a judgment call.

## PLAN

```
PLAN:
  scope: source-checkout self-update (fetch → rebuild → restart) gated by 5 ordered preconditions (2 of
         them shared with the global-npm path), structured bilingual refusal motives, shared pid-file
         restart fix, unified dashboard button
  is_new_module: false (extends src/modules/cli-configuration/)

  ENTITIES:
    - name: (pure function, no class) isLocalOrigin
      file: src/modules/cli-configuration/entities/selfUpdateSequence/localOrigin.ts
      test: src/tests/units/entities/selfUpdateSequence/localOrigin.test.ts
      note: no schema/guard — pure IPv4/IPv6 loopback check; called from triggerSelfUpdate, not from
            runSourceCheckoutSelfUpdate (moved per decision #1)

    - name: SelfUpdateRefusalMotive (type only — replaces the first draft's refusalMessages.ts)
      file: src/modules/cli-configuration/entities/selfUpdateSequence/selfUpdateRefusalMotive.ts
      test: src/tests/units/entities/selfUpdateSequence/selfUpdateRefusalMotive.test.ts
      exports: the SelfUpdateRefusalMotive discriminated union shown in decision #9; no message-building
               functions — wording resolution is dashboard-only (see VIEWS)
      test_shape: mirrors the existing "SelfUpdateResult type" describe block convention in
                  packageVersion.test.ts — one case per motive kind constructing and narrowing it

    - name: QueueActivityGateway (port only)
      file: src/modules/cli-configuration/entities/selfUpdateSequence/queueActivity.gateway.ts
      gateway_contract: countActiveOrWaiting(): number
      test: none (interface only)
      note: now a dependency of triggerSelfUpdate directly (decision #3), used for both install kinds

    - name: SourceCheckoutUpdateGateway (port only)
      file: src/modules/cli-configuration/entities/selfUpdateSequence/sourceCheckoutUpdate.gateway.ts
      gateway_contract: |
        getCurrentBranch(): Promise<string>
        hasUncommittedChanges(): Promise<boolean>
        resolveToolPath(tool: 'git' | 'yarn'): Promise<string | null>
        fetchLatest(): Promise<{ success: boolean; error: string | null }>
        rebuild(): Promise<{ success: boolean; error: string | null }>
      test: none (interface only)
      note: unchanged from the first draft — still exactly the 3-5 preconditions + 2 sequence steps, now
            the ONLY dependency of runSourceCheckoutSelfUpdate

    - name: SelfUpdateResult (extend existing entity, do not create new file)
      file: src/modules/cli-configuration/entities/packageVersion/packageVersion.ts
      change: add `{ status: 'refused'; motive: SelfUpdateRefusalMotive }`; remove
              `{ status: 'source-checkout'; manualCommand: string }`
      test: src/tests/units/entities/packageVersion/packageVersion.test.ts (extend existing describe block;
            no existing test assumes the 'source-checkout' variant — verified)

  USECASES:
    - name: runSourceCheckoutSelfUpdate (shrunk from the first draft)
      file: src/modules/cli-configuration/usecases/version/runSourceCheckoutSelfUpdate.usecase.ts
      test: src/tests/units/usecases/version/runSourceCheckoutSelfUpdate.usecase.test.ts
      type: command
      input: none (no requestOrigin — moved to triggerSelfUpdate)
      output: SelfUpdateResult ('refused' with motive kind in
              {wrong-branch, dirty-checkout, missing-tool, fetch-failed, rebuild-failed} | 'started')
      dependencies: { sourceCheckoutUpdateGateway: SourceCheckoutUpdateGateway }
      behaviour: evaluates preconditions 3-5 in order, short-circuiting on the first unmet one; on all met,
                 calls fetchLatest() then, only on success, rebuild(); returns the matching motive on any
                 refusal/failure, otherwise { status: 'started' }

    - name: triggerSelfUpdate (existing file, modified — now genuinely uses its new deps)
      file: src/modules/cli-configuration/usecases/version/triggerSelfUpdate.usecase.ts
      test: src/tests/units/usecases/version/triggerSelfUpdate.usecase.test.ts
      type: command
      input: { requestOrigin: string }
      output: SelfUpdateResult
      change: |
        - evaluates precondition 1 (isLocalOrigin(requestOrigin)) first, for BOTH install kinds; on fail,
          returns { status: 'refused', motive: { kind: 'local-only' } } without calling any gateway
        - evaluates precondition 2 (queueActivityGateway.countActiveOrWaiting()) second, for BOTH install
          kinds; on count > 0, returns { status: 'refused', motive: { kind: 'reviews-in-progress', count } }
        - only then calls installTypeDetector.detect(); on 'source-checkout', delegates to
          runSourceCheckoutSelfUpdate({ sourceCheckoutUpdateGateway }); on 'global-npm', proceeds exactly
          as today (selfUpdateCommand.runGlobalUpdate() / permission-denied / failed / started) — unchanged
          behaviour, now reached only after 1-2 pass
        - the old manual-command passthrough branch is gone (superseded by decision #1/#7)

  GATEWAYS:
    - name: QueueActivityGateway
      contract: src/modules/cli-configuration/entities/selfUpdateSequence/queueActivity.gateway.ts
      implementation: src/modules/cli-configuration/interface-adapters/gateways/queueActivity.pQueue.gateway.ts
      stub: src/tests/stubs/queueActivity.stub.ts
      methods: countActiveOrWaiting() — wraps getQueueStats() from @/frameworks/queue/pQueueAdapter.js
               (size + pending); this is the one place outside health.routes.ts allowed to import
               frameworks/pQueueAdapter.js, since usecases/** cannot per .oxlintrc.json layering
      test: src/tests/units/interface-adapters/gateways/queueActivity.pQueue.gateway.test.ts

    - name: SourceCheckoutUpdateGateway
      contract: src/modules/cli-configuration/entities/selfUpdateSequence/sourceCheckoutUpdate.gateway.ts
      implementation: src/modules/cli-configuration/interface-adapters/gateways/sourceCheckoutUpdate.cli.gateway.ts
      stub: src/tests/stubs/sourceCheckoutUpdate.stub.ts
      methods: getCurrentBranch, hasUncommittedChanges, resolveToolPath, fetchLatest, rebuild
      implementation_notes: |
        - constructor takes an injectable checkoutPath (default: walk up from import.meta.url for `.git`)
          and an injectable execFileAsync, matching the SelfUpdateCliDependencies DI pattern
        - resolveToolPath must not rely solely on inherited process.env.PATH (launchd gives a minimal
          PATH); it must probe explicit candidate locations and/or an augmented PATH before returning null
          (never throw) — exact strategy left to the implementer
        - getCurrentBranch: `git rev-parse --abbrev-ref HEAD`; hasUncommittedChanges: `git status --porcelain`
          non-empty; fetchLatest: `git pull`; rebuild: `yarn build`, using the resolved absolute tool paths
        - fetchLatest's `error` field becomes the fetch-failed motive's `detail` verbatim, untranslated
      test: src/tests/units/interface-adapters/gateways/sourceCheckoutUpdate.cli.gateway.test.ts

    - name: SelfUpdateCliGateway (existing file, bug fix only — unchanged from the first draft)
      contract: src/modules/cli-configuration/entities/packageVersion/selfUpdateCommand.gateway.ts (unchanged)
      implementation: src/modules/cli-configuration/interface-adapters/gateways/selfUpdate.cli.gateway.ts
      change: defaultSpawnDaemonDelayed adds '--daemon' to its args array, extracted into an exported
              buildRestartArgs(port): string[]
      test: src/tests/units/interface-adapters/gateways/selfUpdate.cli.gateway.test.ts (new case asserting
            buildRestartArgs(port) includes '--daemon')

  CONTROLLERS:
    - name: versionRoutes (existing file, modified)
      file: src/modules/cli-configuration/interface-adapters/controllers/http/version.routes.ts
      test: src/tests/units/interface-adapters/controllers/http/version.routes.test.ts
      change: |
        - POST /api/version/update reads request.ip and passes it as requestOrigin to triggerSelfUpdate
        - VersionRoutesOptions gains queueActivityGateway and sourceCheckoutUpdateGateway, forwarded as
          triggerSelfUpdate dependencies (both now required by the dispatcher itself, not conditionally)
        - the 'source-checkout' response branch (200, manualCommand) is deleted; the 'started' →
          restartDaemonSilently(setTimeout 1000ms) branch is untouched and fires for both install kinds
        - 'refused' maps to HTTP 200 (a well-formed business outcome, not a server error) and returns
          { status: 'refused', motive } verbatim as JSON — no server-side wording, no new HTTP status
      dependencies: [checkVersion, triggerSelfUpdate, currentVersion, packageVersionGateway, versionCache,
                     selfUpdateCommand, installTypeDetector, serverPort, queueActivityGateway,
                     sourceCheckoutUpdateGateway]

  PRESENTERS: none — the route returns SelfUpdateResult verbatim as JSON, already presentation-ready at
    the wire level. The wording *resolution* is dashboard-side (see VIEWS), driven by the bilingual i18n
    requirement, not by a backend presenter — matches decision #9's placement of that responsibility.

  VIEWS:
    - name: versionUpdate (existing file, modified — now also owns motive→wording resolution)
      file: src/dashboard/modules/versionUpdate.js
      test: src/tests/units/dashboard/modules/versionUpdate.test.ts
      change: |
        - renderVersionUpdateArea: delete the installType === 'source-checkout' branch entirely; always
          render version-update-btn with the download icon and onclick="triggerVersionUpdate()"
        - setVersionCheckState: add explicit handling for any non-updating/non-restarting status (in
          particular 'idle') to reset updateBtn.disabled = false and restore its default label — backs the
          rule "after a refusal or a failure, the button returns to its normal clickable state"
        - NEW export resolveRefusalWording(motive, translate): maps each SelfUpdateRefusalMotive.kind to a
          translated string using the new i18n keys below; for 'reviews-in-progress' computes a
          plural param ('' | 's') from count so the French wording matches "1 review en cours" /
          "2 reviews en cours" exactly; for 'fetch-failed' appends motive.detail untranslated after the
          translated fixed sentence
      input: { currentVersion, updateAvailable, latestVersion } for renderVersionUpdateArea (installType
             no longer read); { motive, translate } for resolveRefusalWording
      output: HTML string / plain translated string

    - name: index.html inline script (existing file, modified)
      file: src/dashboard/index.html
      test: covered by src/tests/units/dashboard/modules/html.test.ts (static checks) and the acceptance
            test's dashboard-facing assertions on resolveRefusalWording
      change: |
        - triggerVersionUpdate(): add an explicit `else if (data.status === 'refused')` branch calling
          showToast(resolveRefusalWording(data.motive, t), 'error') then setVersionCheckState('idle', t) —
          before the generic fallback else, so a known reason is never swallowed by the generic message
        - delete showSourceCheckoutUpdate() and its window.showSourceCheckoutUpdate binding
        - showManualUpdateCommand / copyUpdateCommand / their window bindings are untouched (still used by
          the global-npm permission-denied path)

  I18N:
    file: src/dashboard/modules/i18n.js
    removed_keys: 'version.sourceCheckoutTooltip' (en + fr), 'version.sourceCheckoutNotice' (en + fr) —
                  dead once the source-checkout button branch is deleted (sourceCheckoutNotice was already
                  unused before this feature, verified by grep)
    new_keys: |
      7 motives x 2 languages = 14 entries, added under both 'en' (near line 5) and 'fr' (near line 484):
        version.refusal.localOnly
        version.refusal.reviewsInProgress   ({{count}}, {{plural}})
        version.refusal.wrongBranch
        version.refusal.dirtyCheckout
        version.refusal.missingTool         ({{tool}})
        version.refusal.fetchFailed         (fixed sentence only — motive.detail appended by
                                              resolveRefusalWording, never passed through t())
        version.refusal.rebuildFailed
      French wording for localOnly / reviewsInProgress / wrongBranch / dirtyCheckout / missingTool /
      fetchFailed / rebuildFailed is taken verbatim from the spec's Scenarios section. English wording is
      not dictated by the spec (only "the English wording of the same motive, with the same count" is
      required) — left to the implementer, flagged under Ambiguities.

  WIRING:
    routes: |
      src/main/routes.ts — versionRoutes registration (around line 438) gains queueActivityGateway and
      sourceCheckoutUpdateGateway options; both instantiated once near the existing
      `const selfUpdateCommand = new SelfUpdateCliGateway();` / `installTypeDetector` block (around
      line 191-192)
    dependencies:
      - new PQueueActivityGateway() — no constructor args
      - new SourceCheckoutUpdateCliGateway() — no constructor args in production

  IMPLEMENTATION_ORDER:
    1. entities/selfUpdateSequence/localOrigin.ts + test — pure, no dependency
    2. entities/selfUpdateSequence/selfUpdateRefusalMotive.ts + test — pure type, unlocks every result
       shape the two use cases will need
    3. entities/selfUpdateSequence/queueActivity.gateway.ts (interface only, no test)
    4. entities/selfUpdateSequence/sourceCheckoutUpdate.gateway.ts (interface only, no test)
    5. entities/packageVersion/packageVersion.ts edit ('refused'+motive added, 'source-checkout' removed)
       + packageVersion.test.ts edit
    6. tests/stubs/queueActivity.stub.ts, tests/stubs/sourceCheckoutUpdate.stub.ts
    7. usecases/version/runSourceCheckoutSelfUpdate.usecase.ts + test — preconditions 3-5 + sequence,
       zero I/O (stub only)
    8. usecases/version/triggerSelfUpdate.usecase.ts edit + test edit — preconditions 1-2 for BOTH install
       kinds, then dispatch; covers the 4 new/changed global-npm scenarios and delegates to step 7 for
       source-checkout
    -- iteration boundary: all 5 preconditions + dispatch, for both install kinds, fully covered above
       with zero real I/O --
    9. interface-adapters/gateways/queueActivity.pQueue.gateway.ts + test
    10. interface-adapters/gateways/sourceCheckoutUpdate.cli.gateway.ts + test
    11. interface-adapters/gateways/selfUpdate.cli.gateway.ts edit (--daemon fix + buildRestartArgs) + test edit
    12. interface-adapters/controllers/http/version.routes.ts edit + test edit
    13. dashboard/modules/versionUpdate.js edit + test edit — button unification, idle-state fix,
        resolveRefusalWording
    14. dashboard/modules/i18n.js edit — 14 new keys + 2 dead keys removed (moved before index.html since
        index.html's new branch calls a key resolveRefusalWording depends on)
    15. dashboard/index.html edit — triggerVersionUpdate 'refused' branch, dead handler removal
    16. main/routes.ts edit — composition root wiring (always last)
    17. tests/acceptance/223-source-checkout-self-update.acceptance.test.ts — written first per SDD outer
        loop (RED before step 1, GREEN after step 16), listed last here only because it is described last

  REFERENCE_FILES:
    - src/modules/cli-configuration/interface-adapters/controllers/http/version.routes.ts — current
      POST /api/version/update handler and its restartDaemonSilently/setTimeout mechanism, reused as-is
    - src/modules/cli-configuration/usecases/version/triggerSelfUpdate.usecase.ts — the dispatcher now
      carrying preconditions 1-2 itself
    - src/modules/cli-configuration/entities/packageVersion/packageVersion.ts — SelfUpdateResult union
      being extended
    - src/modules/cli-configuration/entities/packageVersion/installTypeDetector.gateway.ts +
      interface-adapters/gateways/installTypeDetector.fs.gateway.ts — pattern for a small, self-contained
      gateway that walks up directories for `.git`, reused by the new SourceCheckoutUpdateGateway impl
    - src/modules/cli-configuration/entities/packageVersion/selfUpdateCommand.gateway.ts +
      interface-adapters/gateways/selfUpdate.cli.gateway.ts — restartDaemon/defaultSpawnDaemonDelayed is
      where the pid-file bug fix lands (args built without '--daemon' at lines 24-27)
    - src/shared/services/pidFileManager.ts, daemonPaths.ts, daemonSpawner.ts — pid file contract and the
      correct spawn+write sequence to compare the bug fix against
    - src/main/commands/start.command.ts + usecases/cli/startDaemon.usecase.ts — working reference for
      what `--daemon` actually triggers (StartDaemonUseCase writes the pid file)
    - src/modules/platform-integration/entities/transport/cidr.ts — isIpInCidr, reused for the IPv4 half
      of isLocalOrigin; verified IPv4-only, hence the explicit ::1 / ::ffff:127.0.0.1 handling
    - src/modules/platform-integration/interface-adapters/controllers/webhook/transportGuard.middleware.ts —
      read for contrast, deliberately not reused (decision #2)
    - src/frameworks/queue/pQueueAdapter.ts (getQueueStats) — wrapped by QueueActivityGateway's
      implementation; usecases/** may not import frameworks/** directly (.oxlintrc.json layering)
    - src/modules/cli-configuration/interface-adapters/controllers/http/health.routes.ts — the only other
      existing direct consumer of getQueueStats, confirms the import is legal at the interface-adapters layer
    - src/modules/worktree-management/entities/gitCommand/gitCommand.gateway.ts +
      interface-adapters/gateways/gitCommand.cli.gateway.ts — read to evaluate reuse, rejected (decision #4)
    - src/modules/setup-wizard/interface-adapters/gateways/gitRemote.cli.gateway.ts — sibling example of a
      small, injectable git-invoking CLI gateway, pattern followed for SourceCheckoutUpdateCliGateway's DI shape
    - src/shared/services/dependencyChecker.ts — existing "is this CLI tool available" pattern, contrasted
      with resolveToolPath, which must return the missing tool's name, not just a boolean
    - src/dashboard/modules/versionUpdate.js, src/dashboard/index.html:3340-3488 — button rendering +
      click-handler logic being unified
    - src/dashboard/modules/i18n.js:1-40 (t() implementation, generic {{param}} replaceAll — confirmed it
      supports multiple params, used for the {{count}}/{{plural}}/{{tool}} substitutions),
      :452-467 (en) / :939-954 (fr) — version.* keys, two of which are removed, 14 new ones added
    - src/tests/units/interface-adapters/controllers/http/version.routes.test.ts,
      src/tests/units/usecases/version/triggerSelfUpdate.usecase.test.ts,
      src/tests/units/interface-adapters/gateways/selfUpdate.cli.gateway.test.ts,
      src/tests/units/dashboard/modules/versionUpdate.test.ts,
      src/tests/units/entities/packageVersion/packageVersion.test.ts,
      src/tests/stubs/selfUpdate.stub.ts, src/tests/stubs/installTypeDetector.stub.ts — existing tests/
      stubs extended rather than duplicated
    - src/tests/acceptance/201-transport-provenance-hardening.acceptance.test.ts — style reference for an
      acceptance test driving a guard/use-case function directly with hand-built request fakes
    - .oxlintrc.json — confirms the entities/usecases import-layering restrictions that force
      QueueActivityGateway/SourceCheckoutUpdateGateway to exist as ports rather than direct framework calls

  ACCEPTANCE_TEST:
    file: src/tests/acceptance/223-source-checkout-self-update.acceptance.test.ts
    note: "SDD outer loop — written first by implementer, RED during impl, GREEN at the end"
    structure: |
      Two layers:
      1. Usecase-level (13 of 15 scenarios) — calls triggerSelfUpdate directly with hand-built stubs
         (StubQueueActivity, StubSourceCheckoutUpdate, StubInstallTypeDetector, StubSelfUpdateCommand),
         asserting the exact SelfUpdateResult (including motive shape) for each scenario
      2. Route-level (nominal + one remote-request case) — registers versionRoutes on a real Fastify
         instance and injects a request with a spoofed remote address, proving request.ip is correctly
         extracted and forwarded, and that a non-loopback origin never reaches any gateway
      3. Dashboard-level (refusal wording in English) — calls resolveRefusalWording(motive, t) directly
         with the dashboard's t() switched to 'en', asserting the count/tool/detail surface correctly and
         the wording differs from the French one
```

## Rule-to-artifact mapping

| Rule (spec) | Artifact | Test |
|---|---|---|
| Sequence order fetch → rebuild → restart, each gated on the previous | `runSourceCheckoutSelfUpdate.usecase.ts` | `runSourceCheckoutSelfUpdate.usecase.test.ts` |
| Preconditions evaluated in fixed order, first unmet refuses everything | `triggerSelfUpdate.usecase.ts` (1-2) + `runSourceCheckoutSelfUpdate.usecase.ts` (3-5) | both usecase test files |
| Precondition 1: local machine only, both install kinds | `localOrigin.ts` + `triggerSelfUpdate.usecase.ts` | `localOrigin.test.ts` + `triggerSelfUpdate.usecase.test.ts` ("remote request", "global install, remote request") |
| Precondition 2: no review running/waiting, both install kinds, refusal states the count | `queueActivity.gateway.ts` port + `triggerSelfUpdate.usecase.ts` + `SelfUpdateRefusalMotive` (`reviews-in-progress`) | `triggerSelfUpdate.usecase.test.ts` ("review running", "global install, review running") |
| Preconditions 1-2 evaluated before install-type dispatch | `triggerSelfUpdate.usecase.ts` (call order) | `triggerSelfUpdate.usecase.test.ts` (asserts installTypeDetector/sourceCheckoutUpdateGateway never called on refusal) |
| Precondition 3: default branch only (source-checkout) | `sourceCheckoutUpdate.gateway.ts#getCurrentBranch` + motive `wrong-branch` | `runSourceCheckoutSelfUpdate.usecase.test.ts` |
| Precondition 4: clean checkout only (source-checkout) | `sourceCheckoutUpdate.gateway.ts#hasUncommittedChanges` + motive `dirty-checkout` | `runSourceCheckoutSelfUpdate.usecase.test.ts` |
| Precondition 5: tools resolved explicitly, refusal names the tool (source-checkout) | `sourceCheckoutUpdate.gateway.ts#resolveToolPath` + motive `missing-tool` | `runSourceCheckoutSelfUpdate.usecase.test.ts` + `sourceCheckoutUpdate.cli.gateway.test.ts` |
| Fetch success without new commits still continues | no dedicated artifact — natural fallthrough of `fetchLatest().success` | `runSourceCheckoutSelfUpdate.usecase.test.ts` "already current" |
| Fetch failure stops everything, reason reported | motive `fetch-failed` (carries `detail`) | `runSourceCheckoutSelfUpdate.usecase.test.ts` "fetch conflict" / "no remote branch" |
| Rebuild failure stops restart, server keeps running | motive `rebuild-failed` | `runSourceCheckoutSelfUpdate.usecase.test.ts` "rebuild fails" |
| Restart only after successful rebuild | `runSourceCheckoutSelfUpdate.usecase.ts` (sequencing) | same test, asserts restart never signalled on rebuild failure |
| Restarted server stays controllable (pid file rewritten) | `selfUpdate.cli.gateway.ts` `--daemon` fix + `buildRestartArgs` | `selfUpdate.cli.gateway.test.ts` new case |
| Global-install path shares the restart fix + the two preconditions | `triggerSelfUpdate.usecase.ts` (1-2) + shared `restartDaemon` | `triggerSelfUpdate.usecase.test.ts` (3 new global-npm scenarios) |
| Every refusal/failure toasts the actual reason; generic message never replaces a known reason | explicit `'refused'` branch before the generic `else` in `triggerVersionUpdate` | manual review of branch order (no DOM test framework wired for this inline script beyond `html.test.ts`'s static checks) |
| Refusal travels as a structured motive, not a sentence | `SelfUpdateRefusalMotive` union | `selfUpdateRefusalMotive.test.ts` |
| Wording resolved at display time, exists in both languages | `resolveRefusalWording()` + 14 new i18n keys | `versionUpdate.test.ts` (fr + en cases) |
| External tool detail passed through as-is, not translated | motive `fetch-failed.detail` appended untranslated in `resolveRefusalWording` | `versionUpdate.test.ts` |
| Button returns to clickable state after refusal/failure | `setVersionCheckState` idle-handling fix | `versionUpdate.test.ts` new case |
| Button disabled + states "update in progress", no per-step announcement | reuses existing `version.updating` / `version.restarting` states, no new mechanism | no new artifact — now a confirmed rule, not an ambiguity |
| Dashboard reloads once server is back up | reuses existing health-poll block in `triggerVersionUpdate` | not independently tested (pre-existing, unmodified logic) |
| Global-install update keeps current behaviour apart from the two shared preconditions + shared restart | `triggerSelfUpdate.usecase.ts` global-npm branch, reached only after 1-2 pass | `triggerSelfUpdate.usecase.test.ts` (existing cases + "global install, nothing running") |

## Scenario-to-test mapping (15 scenarios)

| # | Scenario | Test location |
|---|---|---|
| 1 | nominal | `runSourceCheckoutSelfUpdate.usecase.test.ts` + acceptance (usecase-level) |
| 2 | already current | `runSourceCheckoutSelfUpdate.usecase.test.ts` + acceptance |
| 3 | remote request | `localOrigin.test.ts` (unit) + `triggerSelfUpdate.usecase.test.ts` + acceptance (route-level, spoofed IP) |
| 4 | review running | `triggerSelfUpdate.usecase.test.ts` + acceptance |
| 5 | wrong branch | `runSourceCheckoutSelfUpdate.usecase.test.ts` + acceptance |
| 6 | dirty checkout | `runSourceCheckoutSelfUpdate.usecase.test.ts` + acceptance |
| 7 | missing tool | `runSourceCheckoutSelfUpdate.usecase.test.ts` + acceptance |
| 8 | fetch conflict | `runSourceCheckoutSelfUpdate.usecase.test.ts` + acceptance |
| 9 | no remote branch | `runSourceCheckoutSelfUpdate.usecase.test.ts` + acceptance |
| 10 | rebuild fails | `runSourceCheckoutSelfUpdate.usecase.test.ts` + acceptance |
| 11 | restarted server is controllable | `selfUpdate.cli.gateway.test.ts` (new `buildRestartArgs` case) + acceptance (asserts `{status:'started'}` reached — real process/pid behaviour out of reach of a unit/acceptance test, see Ambiguities) |
| 12 | global install, nothing running | `triggerSelfUpdate.usecase.test.ts` (existing 'started' case, now reached after 1-2 pass) |
| 13 | global install, review running | `triggerSelfUpdate.usecase.test.ts` (new case, motive `reviews-in-progress` count=1) |
| 14 | global install, remote request | `triggerSelfUpdate.usecase.test.ts` (new case, motive `local-only`) |
| 15 | refusal wording in English | `versionUpdate.test.ts` (`resolveRefusalWording` with `t` set to English) + acceptance (dashboard-level) |

## Ambiguities / infeasibilities

1. **Scenario 11 ("restarted server is controllable") is not verified end-to-end.** Proving the real OS
   process ends up alive, discoverable by `reviewflow status`, and stoppable by `reviewflow stop` requires
   spawning real child processes, which no existing test in this suite does for the daemon (all
   `selfUpdate.cli.gateway.test.ts` cases inject fake `spawnDaemonDelayed`/`killProcess`). This plan
   verifies the fix at the smallest correct unit (the real spawn command's args include `--daemon`) and
   trusts the already-tested `StartDaemonUseCase` to correctly write the pid file once invoked with that
   flag. Recommend NOT adding a full process-level test (slow, flaky, platform-sensitive) — flagged as a
   judgment call, not a proven guarantee. (Unchanged from the first draft; the coordinator agreed to keep
   this as-is.)

2. **Exact wording of the fetch-failure "detail".** The scenario says the failure reason travels "with the
   reported detail" without specifying its exact shape (raw git stderr? a parsed summary?). This plan
   passes through whatever `SourceCheckoutUpdateGateway#fetchLatest()` returns as `error` verbatim into
   `motive.detail`, appended untranslated after the translated fixed sentence. If the acceptance test's
   exact string assertions need a specific detail format, that will surface as a RED test in the
   implementer's outer loop and should be resolved by that failing test, not guessed now. (Unchanged from
   the first draft; the coordinator agreed to keep this as-is.)

3. **English wording of the 7 refusal templates is not dictated by the spec.** Only the French strings are
   given verbatim (Scenarios section); the spec only requires that "refusal wording in English" shows *a*
   correctly-parameterized English sentence for the same motive. The 14 i18n key values proposed under
   I18N are the implementer's best-effort English phrasing and are negotiable — the RED acceptance test for
   scenario 15 should assert on structure (count/tool present, sentence differs from the French one), not
   on an exact English string this plan invents.

## Iterations

- **Iteration 1 — Preconditions & dispatch (pure/unit, zero I/O):** IMPLEMENTATION_ORDER steps 1-8.
  Deliverable: `triggerSelfUpdate` fully covers preconditions 1-2 for both install kinds before any
  dispatch; `runSourceCheckoutSelfUpdate` fully covers preconditions 3-5 + the fetch/rebuild sequence
  against a stub gateway. This is the walking skeleton's business-logic core, including every one of the
  15 scenarios' refusal/success shape, and must land first regardless of what follows.

- **Iteration 2 — Execution gateways, pid-file fix, controller wiring:** IMPLEMENTATION_ORDER steps 9-12.
  Deliverable: real git/yarn execution, the shared restart bug fix, and the HTTP route forwarding
  `request.ip` and the two gateways end to end.

- **Iteration 3 — Dashboard unification, bilingual wording, composition root:** IMPLEMENTATION_ORDER steps
  13-16, plus the acceptance test finalized GREEN (step 17, written first per SDD but only fully green
  here).

## Changelog vs. the first draft

- Decisions #1/#2 merged and reversed: preconditions 1-2 now live in `triggerSelfUpdate`, evaluated for
  both install kinds before the install-type dispatch; only 3-5 remain in `runSourceCheckoutSelfUpdate`.
- `QueueActivityGateway` and `isLocalOrigin` are now dependencies/calls of `triggerSelfUpdate`, not of
  `runSourceCheckoutSelfUpdate`; `runSourceCheckoutSelfUpdate`'s dependency surface shrinks to
  `sourceCheckoutUpdateGateway` only, and it no longer takes a `requestOrigin` input.
- `entities/selfUpdateSequence/refusalMessages.ts` (French sentence builders) is removed from the plan;
  replaced by `entities/selfUpdateSequence/selfUpdateRefusalMotive.ts` (a pure discriminated-union type,
  no message-building functions).
- `SelfUpdateResult`'s `'refused'` variant now carries `motive: SelfUpdateRefusalMotive` instead of
  `message: string`.
- New dashboard responsibility: `resolveRefusalWording(motive, translate)` in `versionUpdate.js`, plus 14
  new i18n keys (7 motives x en/fr) added to `src/dashboard/modules/i18n.js`; the I18N section's
  `new_keys: none` from the first draft is replaced by this explicit list.
- Ambiguity "progress per step" is removed — it is now rule #11 (a spec rule, not a design call).
- Ambiguity "does no-review gate global-npm" is removed — resolved by the spec amendment (decision #1);
  the global-npm branch now also carries the two shared preconditions.
- 3 new global-npm scenarios (`global install, nothing running` / `review running` / `remote request`) and
  1 new dashboard scenario (`refusal wording in English`) added to the scenario-to-test mapping, replacing
  the old single `global install unchanged` row.
- File count: 24 → 26 production/test artifacts (net: -1 for the deleted `refusalMessages.ts`/test pair,
  +2 for `selfUpdateRefusalMotive.ts`/test, +1 net test case volume in `triggerSelfUpdate.usecase.test.ts`
  covering the 3 new global-npm scenarios, +1 for the dashboard `resolveRefusalWording` addition covered
  inside the existing `versionUpdate.test.ts` file rather than a new file). Iteration split and inside-out
  TDD order are unchanged.
