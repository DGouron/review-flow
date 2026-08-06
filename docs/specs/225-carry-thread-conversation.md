# Carry the whole thread conversation into the review context

## Status: implemented

## Context

`get_threads({ jobId })` gives a review agent one `body` per thread, and that body is the review's
own opening comment. Everything the merge request author replied afterwards is dropped before it
reaches the context file: both gateways keep only the first comment of a thread
(`comments(first: 1)` on GitHub, `discussion.notes[0]` on GitLab), and `ReviewContextThread` has no
field to hold the rest anyway.

A follow-up review is therefore structurally deaf to the author. It cannot read "intentional, the
gateway already guarantees non-null", so it re-files the finding it already filed, or resolves a
thread on a promise it never read. The consuming skill (`review-followup`) already knows how to weigh
an author's reply as an argument — it currently shells out to `gh api graphql` itself to get the data
this context file should have carried.

Widening this payload also widens an existing injection surface: comment bodies are written by anyone
with access to the merge request, and both gateways build their command by string interpolation and
run it through a shell (`execSync`). Attacker-influenced text must never reach a command line, so the
two thread-fetch gateways move to an argv-array executor with no shell in this same change.

## Rules

- `ReviewContextThread` carries `comments`, the ordered conversation of the thread; each comment has
  an `author`, a `body`, and a `createdAt`
- `body` keeps its current meaning — the opening comment of the thread — and stays required
- comment order is part of the contract: oldest first, so index `0` is the comment that opened the
  thread (the review's own finding) and later indexes are replies
- `author` is nullable: GitHub returns `author: null` for a deleted account or some bots, and the
  payload must not claim a login it does not have
- no comment carries an `isAuthor` / `isReviewer` flag derived from the login: ReviewFlow posts its
  findings with the maintainer's own token, so a finding and an author reply can share the same
  login — position, not identity, discriminates them
- `comments` is optional in `reviewContextThreadSchema`: the context file is a persisted artefact, and
  a context written by an older version must still parse after an upgrade
- the GitHub gateway fetches up to 50 comments per thread with their author login and creation date
- the GitLab gateway maps every note of a resolvable discussion to a comment, using
  `author.username` and `created_at`; the first note still decides the thread's position, status,
  and `body`
- neither thread-fetch gateway passes a value through a shell: the command name and its arguments are
  handed to the executor as an argv array, and GraphQL inputs travel as GraphQL variables (`-F`/`-f`)
  rather than being interpolated into the query string
- no fetched comment body is ever concatenated into another field, into a command line, or into the
  agent prompt scaffolding: each comment stays a separate structured field
- comment bodies are never rewritten, stripped, or sanitised — the review's job is to read what the
  author actually wrote
- `getThreads` keeps returning `reviewContext.threads` verbatim, so the conversation reaches the MCP
  consumer with no further change

## Scenarios

- multi-comment GitHub thread: {thread with a finding then two author replies} → `body` is the
  finding, `comments` has 3 entries in that order with logins and dates
- GitHub thread with a deleted author: {`author: null` on one comment} → that comment's `author` is
  `null`, the rest of the conversation is intact
- single-comment GitHub thread: {only the review's finding} → `comments` has 1 entry equal to `body`
- multi-note GitLab discussion: {resolvable discussion with 3 notes} → `body` is the first note,
  `comments` has 3 entries with `author.username` and `created_at`
- non-resolvable GitLab discussion: {system note discussion} → skipped, exactly as today
- injected project path: {`projectPath` containing a quote and a shell metacharacter} → the value
  reaches the CLI as one argv element, no shell expansion, no command substitution
- older context file: {persisted context whose threads have no `comments`} → parses, threads readable
- MCP consumer: {context with conversations} → `get_threads` returns the threads with their
  `comments` untouched

## Out of Scope

- `UPDATE_COMMENT` action to rewrite the previous follow-up report in place instead of stacking a new
  one per pass. Real problem, independent change: it needs a new action type, a body marker
  convention, and a platform-specific edit path (`PATCH .../issues/comments/<id>` /
  `PUT .../notes/<id>`). Deliberately deferred to its own spec.
- Exposing merge-request-level comments (the plain PR comments that answer a 💬 Discussion, which have
  no inline thread to land in). GitHub needs a second query — `reviewThreads` never returns them — and
  GitLab needs the `resolvable` filter relaxed, which changes what a "thread" is. Not a small
  addition; reported, not done.
- Converting the other CLI gateways (note post, review label, approval revocation, diff stats) to the
  argv executor. Same latent shell-quoting weakness, but their payloads are not what this change
  widens.
- Any threading of replies (GitLab and GitHub both give a flat list; the payload stays flat).

## Glossary

| Term | Definition |
|------|------------|
| conversation | The ordered list of comments of one thread, opener first |
| opener | The comment at index `0` — the review's own finding, since the review opened the thread |
| argv executor | `(command: string, args: string[]) => string` — spawns without a shell |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | One entity field, two gateways, one prompt line |
| Negotiable | OK | Shape settled: flat, ordered, position-discriminated, nullable author |
| Valuable | OK | Removes the consumer's `gh api graphql` workaround and the deaf follow-up |
| Estimable | OK | 2 gateways + entity + schema + wiring + tests |
| Small | OK | No new use case, no new gateway |
| Testable | OK | Each rule maps to a scenario over a fake executor |

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md`.

## Implementation

### Artefacts

- **Entity/schema (modified)**: `reviewContext.ts`, `reviewContext.schema.ts` — `comments` on
  `ReviewContextThread`, optional in the schema.
- **Gateways (modified)**: `threadFetch.github.gateway.ts` (GraphQL variables, `comments(first: 50)`),
  `threadFetch.gitlab.gateway.ts` (every note becomes a comment), both on an argv executor.
- **Executor (modified)**: `scopedGitLabExecutor.ts` — `createScopedGitLabArgvExecutor`;
  `commandExecutor.ts` — `ArgvCommandExecutor`.
- **Prompt (modified)**: `claudeInvoker.ts` — payload shape + untrusted-data framing.
- **Tests**: acceptance suite for this spec, plus gateway, executor, and schema unit tests.

### Decisions

- `comments` optional, not required with a default: the context file is persisted and read back mid
  review, so a required field would fail an in-flight review on upgrade.
- A new `ArgvCommandExecutor` type instead of converting the shared string executor: the latter is
  used by ~8 other CLI gateways, which this spec does not widen.

Full report: [docs/reports/225-carry-thread-conversation.report.md](../reports/225-carry-thread-conversation.report.md).
