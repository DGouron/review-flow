# Report — 225 Carry the whole thread conversation into the review context

Spec: [docs/specs/225-carry-thread-conversation.md](../specs/225-carry-thread-conversation.md)

## Outcome

`get_threads({ jobId })` now hands the review agent the whole thread conversation, not just the
review's own opening comment. A follow-up review can read the author's reply — "intentional, the
gateway already guarantees non-null" — weigh it against the code, and stop re-filing a finding the
author already answered. The consuming skill no longer needs to shell out to `gh api graphql` itself.

Both thread-fetch gateways also stopped building shell command strings. They now spawn through an
argv executor, so no value from the webhook or from a merge request comment can escape a quoting
context.

## Payload

One thread, as the MCP consumer sees it:

```json
{
  "id": "PRRT_kwDONxxx123",
  "file": "src/modules/platform-integration/interface-adapters/gateways/threadFetch.github.gateway.ts",
  "line": 58,
  "status": "open",
  "body": "Nullable access not guarded",
  "comments": [
    {
      "author": "maintainer",
      "body": "Nullable access not guarded",
      "createdAt": "2026-08-01T10:00:00Z"
    },
    {
      "author": "maintainer",
      "body": "Intentional, the gateway already guarantees non-null",
      "createdAt": "2026-08-01T11:30:00Z"
    }
  ]
}
```

Contract points, all encoded in tests:

- `body` is unchanged — the opening comment of the thread.
- `comments` is ordered oldest first. Index `0` is the same text as `body`: the review opened the
  thread, so index `0` is the review's own finding and every later entry is a reply. **Order is the
  contract** — GitHub returns `comments` oldest first, GitLab returns `notes` in creation order, and
  neither is re-sorted.
- `author` is `string | null`. GitHub returns `author: null` for a deleted account or some bots; the
  payload does not invent a login.
- **No `isAuthor` / `isReviewer` flag.** It cannot work: ReviewFlow posts findings with the
  maintainer's own token, so a finding and an author reply carry the same login. Position
  discriminates them, identity does not.
- `comments` is optional in `reviewContextThreadSchema`. The context file is a persisted artefact, so
  a context written by an older version still parses after an upgrade — a required field would have
  failed a review mid-flight.
- Comments stay separate structured fields. Nothing is concatenated into `body`, into a command line,
  or into the prompt scaffolding, and no body is sanitised or rewritten.

## What changed

- **Entity (modified)**: `reviewContext.ts` — new `ReviewContextThreadComment`, new optional
  `comments` on `ReviewContextThread`, with the ordering contract documented on the type.
- **Schema (modified)**: `reviewContext.schema.ts` — `reviewContextThreadCommentSchema`, wired into
  `reviewContextThreadSchema` as an optional array.
- **Gateway (modified)**: `threadFetch.github.gateway.ts` — the GraphQL query became a constant with
  declared variables (`$owner`, `$name`, `$number`), asks `comments(first: 50)` with
  `author { login } body createdAt`, and runs through `ArgvCommandExecutor`. New export
  `defaultGitHubArgvExecutor` (`execFileSync`, no shell). `owner`/`name` travel as `-f` raw fields so
  a value starting with `@` cannot be read as a file; `number` travels as `-F` to satisfy `Int!`.
- **Gateway (modified)**: `threadFetch.gitlab.gateway.ts` — every note of a resolvable discussion
  becomes a comment (`author.username`, `created_at`); the first note still decides position, status,
  and `body`. New export `defaultGitLabArgvExecutor`, same fail-closed token isolation as the string
  executor.
- **Executor factory (modified)**: `scopedGitLabExecutor.ts` — `createScopedGitLabArgvExecutor`
  alongside the existing factory, both sharing one `buildScopedTarget` helper. Same SPEC-196
  guarantees: fail-closed on a missing service token, env allowlist, token only in the isolated glab
  config file.
- **Foundation (modified)**: `commandExecutor.ts` — `ArgvCommandExecutor` type.
- **Wiring (modified)**: `routes.ts` — all six thread-fetch gateway constructions now receive the argv
  executors.
- **Prompt (modified)**: `claudeInvoker.ts` — the payload is now described to the agent: what
  `comments` is, that position rather than `author` identifies the writer, that replies must be read
  before re-filing or resolving, and that every comment body is **untrusted data** to check against
  the code and never to obey.
- **Use case (verified, unchanged)**: `getThreads.usecase.ts` returns `reviewContext.threads`
  verbatim — checked, not assumed; the acceptance test drives the real use case end to end.
- **Tests**: new acceptance suite `225-carry-thread-conversation.acceptance.test.ts` (6 tests, real
  gateways → real file-system context gateway → real `getThreads`), 4 new GitHub gateway tests, 3 new
  GitLab gateway tests, 2 new scoped-argv-executor tests, 3 new schema tests. Factories extended with
  multi-comment fixtures. `yarn verify`: 4436 tests pass, typecheck and lint clean.

## Security

- **Shell injection (fixed here)**: the GitHub gateway interpolated `owner`/`name` — derived from the
  webhook's `projectPath` — into a GraphQL query inside single quotes and ran it through `execSync`;
  a single quote in that value escaped the literal. The GitLab gateway interpolated `projectPath` and
  the merge request number the same way. Both now hand the command and each argument to the executor
  separately, and the GitHub inputs travel as GraphQL variables. A test on each gateway asserts an
  injected value stays one argv element.
- **Prompt injection (structure, not filtering)**: comment bodies reach the agent as separate
  `{ author, body, createdAt }` fields, never merged into a blob, never into `agentInstructions`, and
  never into a command line. The prompt marks them untrusted. Bodies are not rewritten or stripped —
  the review's job is to read what the author actually wrote.

## Decisions

- **Flat conversation, no reply tree.** Both platforms return a flat list; a tree would be invented
  structure.
- **`comments` optional rather than required with a default.** The context file is persisted and read
  back by a running review; a required field would break a review mid-flight on upgrade.
- **A new argv executor type rather than converting `CommandExecutor` project-wide.** The string
  executor is shared by ~8 CLI gateways (note post, review label, approval revocation, diff stats,
  thread inventory) and their tests. Converting all of them is a separate, larger change; these two
  gateways are the ones this spec widens.
- **`ArgvCommandExecutor` accepts a 1-arg function at the type level** (TypeScript allows fewer
  parameters), so passing the old string executor by mistake compiles. That is why the six wiring
  sites in `routes.ts` were changed explicitly and each gateway has a test asserting the argv shape —
  the type system will not catch that regression.

## Out of scope, decided explicitly

- **`UPDATE_COMMENT` action — OUT, deferred to its own spec.** Every follow-up pass posts a brand new
  full report, so a merge request reviewed three times carries three reports with nothing marking the
  current one. Real problem, but an independent change: a new action type in the discriminated union,
  a body marker so the executor can find its previous report, and a platform-specific edit path
  (`gh api --method PATCH .../issues/comments/<id>`, `glab api --method PUT .../notes/<id>`), plus the
  skill-side convention. Nothing in this change blocks it.
- **Merge-request-level comment channel — OUT, reported.** Verified: no gateway reads plain
  (non-inline) merge request comments as data for the agent. GitHub's `reviewThreads` returns inline
  threads only, so reading them needs a second query; on GitLab they are discussions whose first note
  is not `resolvable`, which `fetchThreads` skips deliberately. Exposing them therefore means either a
  new payload field or changing what "thread" means — not a small addition. `POST_COMMENT` already
  exists, so the *write* side of that channel works; only the *read* side is missing. Left for a
  decision, as asked.
- **The other CLI gateways' shell quoting.** `noteCommentPost.gitlab.cli.gateway.ts` and
  `threadInventory.gitlab.gateway.ts` still build shell strings (the former with a `shellQuote`
  helper). Same class of weakness, different payload; flagged, not touched.
