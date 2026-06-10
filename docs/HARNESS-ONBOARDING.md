# Harness Onboarding — ReviewFlow

Day-1 guide for a developer or agent joining ReviewFlow and using the **Claude harness** (skills, hooks, SDD pipeline).

---

## TL;DR — 5 commands to know

```bash
yarn verify                            # typecheck + lint + test:ci — run before every commit
yarn test:ci                           # Vitest one-shot (CI mode)
systemctl --user restart reviewflow-app  # Restart the local service after config changes
yarn build                             # Compile TypeScript + resolve aliases
yarn docs:dev                          # VitePress dev server for documentation
```

---

## What the harness does for you

When you run Claude Code in ReviewFlow, **7 hooks** + skills + agents are active.

- **You cannot create an `index.ts`** (barrel exports forbidden) — `no-barrel-exports.sh`
- **You cannot commit on `master`** — create a `feat/<issue>-description` branch — `protect-main-branch.sh`
- **You cannot push to `master`** or force-push — `protect-main-push.sh`
- **You cannot commit if `yarn test:ci` fails** — fix first — `pre-commit-gate.sh`
- **You cannot invoke `feature-implementer` without a valid spec** — `require-spec.sh`
- **A stale spec status blocks commit** — `verify-spec-updated.sh`
- **Session start injects feature tracker status** into context — `session-context.sh`

Three additional architecture enforcers are incoming (parallel work):

| Enforcer | What it blocks |
|----------|----------------|
| `enforce-dependency-rule.sh` | Inverted imports — outer layer importing inner |
| `enforce-gateway-port-purity.sh` | Gateway implementation importing a use case |
| `enforce-presenter-class.sh` | Presenter that is not a class |

All hook scripts live in `scripts/hooks/` — tests in `scripts/hooks/tests/run-tests.sh`.

---

## The SDD pipeline — how to ship a feature

5 steps:

1. **`/product-manager`** — challenge scope + INVEST + spec DSL → `docs/specs/<slug>.md`
2. **`/implement-feature docs/specs/XX.md`** — orchestrates planner + TDD implementer agents
3. The `feature-planner` agent → `docs/plans/<slug>.plan.md`
4. The `feature-implementer` agent → TDD (Red-Green-Refactor) + `docs/reports/<slug>.report.md`
5. **`/ship`** — hooks verify spec/tracker → conventional commit + push

Feature tracker: `docs/feature-tracker.md` — statuses: `drafted` → `planned` → `implementing` → `implemented`.

---

## Key skills

### Mandatory (use before writing any code)

| Skill | When |
|-------|------|
| `/tdd` | Always — no production code without a failing test first |
| `/architecture` | Creating new entity, use case, or gateway |
| `/anti-overengineering` | Before adding patterns, abstractions, or "improvements" |

### Workflow

| Skill | When |
|-------|------|
| `/implement-feature` | Autonomous feature implementation |
| `/ship` | Commit + push (runs hooks) |
| `/skill-creator` | Create or modify a skill |

---

## Your 3 first actions (sanity check)

```bash
# 1. Verify quality gates pass
yarn verify

# 2. Run hook test suite
bash scripts/hooks/tests/run-tests.sh

# 3. Confirm feature tracker is loaded
cat docs/feature-tracker.md | head -5
```

---

## Hooks reference

| Hook | Trigger | Purpose |
|------|---------|---------|
| `no-barrel-exports.sh` | Write\|Edit | Blocks `index.ts` barrel creation |
| `protect-main-branch.sh` | git commit | Blocks commit on `master` |
| `protect-main-push.sh` | git push | Blocks push to `master`, force-push |
| `pre-commit-gate.sh` | git commit | Runs `yarn test:ci` before commit |
| `verify-spec-updated.sh` | git commit | Checks spec status is not stale |
| `require-spec.sh` | Agent | Blocks `feature-implementer` without spec |
| `session-context.sh` | SessionStart | Injects tracker status into context |

---

## Context: ReviewFlow vs shiplens differences

| Aspect | ReviewFlow | shiplens |
|--------|-----------|---------|
| Package manager | yarn | pnpm |
| Main branch | `master` | `main`/`master` |
| Framework | Fastify 5 + Node 20 | NestJS 11 |
| Test runner | Vitest (`yarn test:ci`) | Vitest (`pnpm test`) |
| Linter | Oxlint + oxfmt | Biome |
| Tracker path | `docs/feature-tracker.md` | `docs/feature-tracker.md` |
| Specs | `docs/specs/` | `docs/specs/<bc>/` |

---

## Runtime mental model

Reviews no longer spawn `claude -p` in your checkout. Each MR runs in a **dedicated pre-built git worktree** at `~/.reviewflow/worktrees/<platform>-<slug>-<mrNumber>`, dispatched with `claude --bg` (detached background session). Completion is detected via three first-wins signals: MCP `set_phase`, `claude agents --json` polling, 15-min timeout. Worktrees are reused on followup, removed on merge/close, and a daily sweep reclaims stale ones (>24h closed or >7d mtime).

Full state machine: [Worktree Lifecycle](./architecture/worktree-lifecycle.md). When in doubt about operator behaviour, that page documents the ground truth.

---

_Last updated: 2026-05-26_
