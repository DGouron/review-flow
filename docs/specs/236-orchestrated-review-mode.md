# Run a review as a clerk who launches four audit lots and collects their findings

## Status: implemented

## Context

Spec 235 gave ReviewFlow role sessions (launch, end, sweep, per-role tokens) but nothing used them.
This spec wires the orchestrated mode in. When a project sets `review.mode: orchestrated`, the
review session becomes the clerk ("greffe", Dave): it launches four read-only audit lots, each in a
fresh `claude --bg` session, and the lots report their findings to it with `SendMessage`. The
review skill (`practicio-review-code orchestre` / `lot <id>`) lives in the reviewed repository; this
spec covers what ReviewFlow gives it. A follow-up stays a single session.

## Rules

### Lots

- the roles are `greffe`, `lot:bugs`, `lot:architecture`, `lot:lisibilite`, `lot:tests`,
  `contradiction`, `arbitre`; `lot:securite` is retired (the bugs lot audits security)
- default models: `greffe` sonnet, `lot:bugs` opus, `lot:architecture` opus, `lot:lisibilite`
  sonnet, `lot:tests` sonnet, `contradiction` opus, `arbitre` opus
- a project config that still names `review.roles["lot:securite"]` stays valid; that entry is
  ignored
- a token usage record or a job file written with role `lot:securite` is read as `lot:bugs`
- a role session reads files and sends messages: its only tools are Read, Glob, Grep and
  SendMessage

### The orchestrated review

- a review job of a project whose config says `review.mode: orchestrated` is orchestrated; a
  follow-up, or a project in `single` mode (the default), is not, and runs as before
- the orchestrated review session is named `Revue #<n> · greffe`, so the lots can address it
- its prompt is `/<review skill> <n> orchestre`
- its model is the clerk's (`review.roles.greffe.model`, sonnet by default), unless the job names
  one explicitly
- its system prompt gives the clerk, verbatim: the job id, its own session name, the launch command
  (`'<node>' '<absolute path of the running CLI>' session launch --job <jobId>`, to which the clerk
  adds `--role lot:<id> --brief <absolute path>`) and the await command (same CLI,
  `session await --job <jobId> --max-wait 540`); it never relies on `reviewflow` being on the PATH
- it times out after `review.orchestratedTimeoutMinutes` (45 by default, 5 to 480); a single
  review keeps the runtime review timeout (15 minutes by default)
- the review queue holds an orchestrated review for its own timeout plus the usual 5-minute grace,
  so a follow-up of the same pull request still waits behind it
- the sweep never takes the clerk for a role session by its name: the review job ends it

### Waiting for the lots

- `reviewflow session await --job <jobId> [--max-wait <seconds>]` polls the role sessions the job
  file records until each is finished or timed out, or until the maximum wait has passed
- a role session is `DONE` when Claude reports it `done` (its turn ended), `FAILED` when Claude
  reports it `failed`, `stopped` before its timeout, or no longer lists it, and `TIMEOUT` when it
  still runs `review.roleTimeoutMinutes` (15 by default, 1 to 480) after its `launchedAt`
- a timed-out role session is stopped, not removed: the job measures its tokens when it ends
- it prints one line per finished role session, `DONE|FAILED|TIMEOUT <role> <session id>`, in the
  order the job recorded them, nothing for one still running, and exits 0
- it refuses with `ERROR <reason>` and exit 1: missing `--job`, a `--max-wait` that is not a whole
  number of seconds, an unknown job, Claude sessions that cannot be listed

## Scenarios

- lots: {config without `review`} → `lot:architecture` opus + `lot:tests` sonnet
- retired lot in config: {`review.roles["lot:securite"].model` = "sonnet"} → config valid, no
  `lot:securite` role
- retired lot recorded: {token usage line with role `lot:securite`} → read with role `lot:bugs`
- orchestrated dispatch: {project `review.mode: orchestrated`, review job #2111, skill
  `practicio-review-code`} → `claude --bg --name "Revue #2111 · greffe"` + prompt
  `/practicio-review-code 2111 orchestre` + timeout 45 minutes
- follow-up: {same project, follow-up job #2111} → no `--name`, prompt without `orchestre`
- single: {project without `review`} → unchanged dispatch
- lot tools: {`session launch --role lot:tests`} → `--tools Read,Glob,Grep,SendMessage`
- await: {lots done, failed, still working 16 minutes after launch} → `DONE lot:bugs <id>`,
  `FAILED lot:tests <id>`, `TIMEOUT lot:architecture <id>` + the third one stopped, not removed
- await bounded: {one lot working 5 minutes after launch, `--max-wait 25`} → returns after 25
  seconds with no line for it
- sweep: {unrecorded session "Revue #2111 · greffe" in a review worktree, 30 minutes old} → kept
