# Launch, count and clean up the role sessions of an orchestrated review

## Status: implemented

## Context

Today one Claude session does a whole review. The orchestrated review (next step) splits it into
role sessions: a clerk ("greffe") launches four audit lots, then a contradiction role and an
arbiter, each in its own fresh `claude --bg` session. Before that, ReviewFlow must be able to
launch, count and clean up role sessions without leaking any. Nothing uses them yet:
`review.mode` stays `single` by default, so current reviews are unchanged.

Delivered in three stacked lots: A (launcher), B (cleanup: `end` and `sweep`), C (the review job
ends its role sessions and accounts their tokens).

## Rules

### Roles and project configuration (lot A)

- the roles are `greffe`, `lot:bugs`, `lot:securite`, `lot:architecture`, `lot:lisibilite`,
  `contradiction`, `arbitre`
- the project config accepts an optional `review` object: `review.mode` is `single` (default) or
  `orchestrated`; `review.roles.<role>.model` is `haiku`, `sonnet` or `opus`
- default models: `greffe` sonnet, `lot:bugs` opus, `lot:securite` opus, `lot:architecture`
  sonnet, `lot:lisibilite` sonnet, `contradiction` opus, `arbitre` opus
- a config without `review` stays valid and uses the defaults; an unknown mode, an unknown role or
  an unknown model makes the config invalid
- saving the project settings keeps the `review` object as written

### Launching a role session (lot A)

- `reviewflow session launch --role <role> --brief <file> --job <jobId>` starts one `claude --bg`
  session with the role's model, the brief as its prompt and the job's worktree as its working
  directory
- a role session can only read: its only tools are Read, Glob and Grep (no Bash: even `git log`
  writes files through `--output=<file>`), every other tool call is denied, no MCP server is loaded,
  and only the user's own settings apply — the project and local settings a reviewed pull request
  may ship are ignored; the diff reaches the role through its brief or a file it reads
- the session is named `<subject> · <role in words>`: subject `Revue #<n>` for a review,
  `Suivi #<n>` for a follow-up; role in words `greffe`, `lot bugs`, `lot sécurité`,
  `lot architecture`, `lot lisibilité`, `contradiction`, `arbitre`; no internal id
- the launch appends `{ sessionId, role, launchedAt }` to `roleSessions` in the job file; a
  relaunch of the same role appends a new entry and keeps the old one
- success prints `LAUNCHED <sessionId> <name>` and exits 0
- refusals print one line `ERROR <reason>` and exit 1: unknown role, missing or empty brief,
  unknown job, job without a worktree yet, five live role sessions already for that job (a job's
  role session is live while `claude agents` lists it in a state other than done, stopped or
  failed), Claude sessions cannot be listed, dispatch failure
- an entry of the `claude agents` listing that cannot be read is skipped, the others are kept
- if the session was dispatched but cannot be recorded, it is stopped and removed at once and the
  launch is refused
- two launches for the same job never interleave (the job file is locked while one launches); a
  launch only ever removes its own lock, and a lock older than 2 minutes is taken over

### Ending and sweeping (lot B)

- `reviewflow session end <id>` stops then removes the session, never with a force option, prints
  `REMOVED <name>` and exits 0; on a session that no longer exists it prints `ALREADY-GONE <id>`
  and exits 0; a failed stop or remove prints `ERROR <reason>` and exits 1
- a role session is a Claude background session whose working directory is inside the ReviewFlow
  worktree root and whose name ends with ` · <role in words>`, or whose id is recorded in a job
  file
- `reviewflow session sweep` removes a role session when its job is no longer active (no job file
  records its id, and it was started at least 5 minutes ago — a launch may not have recorded it
  yet) or when it was started longer ago than the age limit: the review timeout, and at least
  2 hours; it prints one line per role
  session: `REMOVED <id> <name> (<reason>)`, `KEPT <id> <name> (job <jobId> active)` or
  `FAILED <id> <name> (<reason>)`
- `--dry-run` removes nothing and prints `WOULD-REMOVE <id> <name> (<reason>)` instead of
  `REMOVED`
- the daily worktree sweep also sweeps role sessions

### The review job (lot C)

- when a review job ends, whatever its outcome, it takes the job lock, marks the job closed to new
  role sessions (a launch for a closed job is refused) and reads the role sessions its job file
  records, before the job file is deleted
- each role session is stopped, then measured, then removed: the measure includes every token
  spent until the stop
- a failure to end one never fails the job; the warnings of the cleanup are logged
- each measured role session yields one token usage record carrying its `role`
- the budget guard counts those records like any other
- the consumption views show the role of a record when it has one; the monthly summary adds the
  cost of role sessions but does not count them as sessions or reviews

## Scenarios

- default models: {config without `review`} → `lot:bugs` opus + `greffe` sonnet + mode `single`
- override: {`review.roles["lot:lisibilite"].model` = "opus"} → `lot:lisibilite` opus
- invalid role: {`review.roles["lot:perf"]`} → config invalid
- launch: {job 2111 review, worktree `/wt/github-acme-app-2111`, role `lot:bugs`} →
  `LAUNCHED <id> Revue #2111 · lot bugs` + model opus + cwd `/wt/github-acme-app-2111` +
  `roleSessions` has one entry
- relaunch: {role `lot:bugs` launched twice} → `roleSessions` has two entries with role `lot:bugs`
- cap: {five live role sessions recorded for the job} → `ERROR` + exit 1 + nothing dispatched
- unknown job: {no job file} → `ERROR unknown job <id>` + exit 1
- end: {live session "Revue #2111 · lot bugs"} → `REMOVED Revue #2111 · lot bugs`
- end twice: {session already removed} → `ALREADY-GONE <id>` + exit 0
- sweep orphan: {role session whose id no job file records} → removed (job no longer active)
- sweep old: {role session of an active job started 3 hours ago} → removed (older than 2 hours)
- sweep active: {role session of an active job started 10 minutes ago} → kept
- sweep long review: {review timeout 480 min, role session of an active job started 5 hours ago} →
  kept
- sweep just launched: {unrecorded role session started 1 minute ago} → kept
- sweep dry-run: {orphan role session} → `WOULD-REMOVE` + nothing removed
- job cleanup: {job with three recorded role sessions, stop of one fails} → all three are ended,
  the job result is unchanged
- tokens: {two role sessions `lot:bugs` and `arbitre`} → two usage records with roles `lot:bugs`
  and `arbitre`
