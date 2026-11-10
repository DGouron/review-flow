---
title: Technical Architecture
---

# Technical Architecture

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          Data Flow                              │
└─────────────────────────────────────────────────────────────────┘

    GitLab/GitHub                Cloudflare                   Local
    ─────────────                ──────────                   ─────
         │                           │                          │
         │ 1. MR Event               │                          │
         │ (reviewer assigned)       │                          │
         │                           │                          │
         ├──────────────────────────►│                          │
         │                           │ 2. Tunnel                │
         │                           ├─────────────────────────►│
         │                           │                          │
         │                           │                   ┌──────┴──────┐
         │                           │                   │   Fastify   │
         │                           │                   │   Server    │
         │                           │                   └──────┬──────┘
         │                           │                          │
         │                           │                   3. Verify signature
         │                           │                   4. Filter event
         │                           │                   5. Enqueue job
         │                           │                          │
         │                           │                   ┌──────┴──────┐
         │                           │                   │   p-queue   │
         │                           │                   │  (max 2)    │
         │                           │                   └──────┬──────┘
         │                           │                          │
         │                           │                   6. ensureWorktree
         │                           │                      (~/.reviewflow/worktrees/...)
         │                           │                          │
         │                           │                   7. claude --bg
         │                           │                          │
         │                           │                   ┌──────┴──────┐
         │                           │                   │  Background │
         │                           │                   │  Session    │
         │                           │                   │  /skill MR# │
         │                           │                   └──────┬──────┘
         │                           │                          │
         │◄──────────────────────────┼──────────────────────────┤
         │                           │                   8. Post comments
         │ 9. Inline comments        │                      via glab/gh api
         │    on MR                  │                          │
         │                           │                          │
```

## File Structure

```
src/
├── main/
│   ├── server.ts                                  # Fastify entry point
│   ├── routes.ts                                  # Composition root (DI wiring)
│   └── dependencies.ts                            # Shared dependency construction
├── mcpServer.ts                                   # MCP server entry point
│
├── modules/                                       # Bounded contexts (Clean Architecture per module)
│   ├── claude-invocation/                         # `claude --bg` dispatch + completion + cleanup
│   ├── worktree-management/                       # Pre-built worktree lifecycle (ensure/remove/sweep)
│   ├── supervisor-management/                     # Claude agents supervisor health + respawn
│   ├── review-execution/                          # Review job orchestration, model routing
│   ├── platform-integration/                      # GitLab + GitHub webhook controllers
│   ├── tracking/                                  # MR lifecycle tracking
│   ├── token-accounting/                          # Token usage + budget cap
│   ├── statistics-insights/                       # Stats recalculation + developer insights
│   ├── cli-configuration/                         # init, validate, discover commands
│   ├── setup-wizard/                              # Interactive `reviewflow setup`: deps check, daemon install, file generation, registration
│   ├── data-lifecycle/                            # Periodic cleanup of stale tracking data
│   └── shared-kernel/                             # Cross-module shared types (diff stats, ...)
│
├── frameworks/
│   ├── claude/                                    # Claude CLI orchestration shim
│   ├── queue/                                     # p-queue adapter with MR-scoped concurrency
│   ├── scheduler/                                 # Cleanup + worktree sweep + supervisor schedulers
│   ├── logging/                                   # Pino + log buffer
│   ├── config/                                    # Config loader
│   └── settings/                                  # Runtime settings (model, language)
│
├── mcp/                                           # MCP server infrastructure
│   ├── server.ts                                  # MCP server setup
│   └── mcpServerStdio.ts                          # Stdio transport
│
├── security/                                      # Webhook signature verification
├── shared/                                        # Foundation utilities + cross-cutting services
└── tests/                                         # Vitest tests mirroring src structure
```

Each module follows Clean Architecture internally: `entities/` → `usecases/` → `interface-adapters/`. Dependency direction is always inward.

## Components

### 1. Server (server.ts)

- **Framework**: Fastify 4.x
- **Role**: HTTP entry point, routing, raw body parsing
- **Note**: Custom content parser to store raw body (required for GitHub HMAC)

### 2. Config Loader (config/loader.ts)

- Loads `config.json` and `.env`
- Strict validation at startup
- In-memory cache (singleton)
- Repo search functions by URL or path

### 3. Security Verifier (security/verifier.ts)

- **GitLab**: Token comparison `X-Gitlab-Token` with `timingSafeEqual`
- **GitHub**: HMAC-SHA256 verification of `X-Hub-Signature-256`
- Protection against timing attacks

### 4. Event Filter (webhooks/eventFilter.ts)

Filters events based on these criteria:

| Criterion | GitLab | GitHub |
|-----------|--------|--------|
| Event type | `merge_request` | `pull_request` |
| Action | `update` with reviewers changed | `review_requested` |
| State | `opened` | `open` |
| Draft | No | No |
| Reviewer | Username in list | `requested_reviewer.login` |

### 5. Review Queue (queue/reviewQueue.ts)

- **Library**: p-queue
- **Concurrency**: Configurable (default: 2)
- **Deduplication**: Map with TTL (default: 5 min)
- **Tracking**: Active jobs and history of last 20

### 6. Claude Invocation (`modules/claude-invocation/`)

Reviewflow no longer streams Claude's output via `-p`. Each review runs as a **detached background session** dispatched with `claude --bg`. Completion is detected via three independent signals in first-wins semantics.

```bash
claude --bg \
  --model <sonnet|opus|haiku> \
  --permission-mode auto \
  --append-system-prompt "<job context + MCP directives>" \
  --mcp-config <inline-json> \
  --strict-mcp-config \
  --allowedTools "Read,Glob,Grep,Bash,Edit,Task,Skill,Write,LSP,mcp__review-progress__*" \
  --disallowedTools "EnterPlanMode,AskUserQuestion" \
  -- "/<skill> <MR_NUMBER>"
```

- **CWD**: The pre-built worktree at `~/.reviewflow/worktrees/<platform>-<slug>-<mrNumber>` — see [Worktree Lifecycle](./worktree-lifecycle.md)
- **Completion signals** (first wins):
  1. MCP `set_phase('completed')` published via the in-memory completion bridge
  2. `claude agents --json` poll every 30s reports `completed` / `failed` / `stopped`
  3. Hard 15-minute timeout
- **Report retrieval**: read from `<worktree>/.claude/reviews/report-<mrNumber>.md`
- **Cleanup**: `claude stop <sessionId>` then `claude rm <sessionId>`
- **Rate-limit handling**: stderr or stdout matching `RATE_LIMIT_DETECTION_REGEX` (exported from `claudeSession.cli.gateway.ts`) triggers exponential backoff retry
- **Notifications**: desktop notification at start and end — `terminal-notifier` on macOS when it is on `PATH`, `osascript` otherwise; `notify-send` on Linux (`src/frameworks/claude/desktopNotification.ts`)

Source: `src/modules/claude-invocation/usecases/runClaudeReviewJob.usecase.ts` orchestrates `dispatchClaudeSession` → `awaitSessionCompletion` → `retrieveReviewReport` → `cleanupClaudeSession`.

### 7. Worktree Management (`modules/worktree-management/`)

Each MR runs in its own git worktree to isolate concurrent reviews and give followups a stable cwd. `ensureWorktree` is idempotent (creates on first review, fetch + reset on followup). `removeWorktree` runs on merge/close. A daily sweep reclaims worktrees of MRs closed >24h ago, untracked worktrees, and any directory with `mtime` >7d.

See [Worktree Lifecycle](./worktree-lifecycle.md) for the full state machine, file paths, and operator commands.

### 8. Supervisor Management (`modules/supervisor-management/`)

The Claude agents supervisor (long-running `claude` daemon hosting background sessions) is probed every 60 seconds. If it is `down`, a detached spawn brings it back up under a PID-validated file lock at `~/.reviewflow/supervisor.lock`. The `/health` endpoint surfaces `supervisor: { state, reason, lastCheckedAt }` and reports `status: 'degraded'` when the supervisor is unreachable. Reviewflow shutdown does NOT kill the spawned supervisor (`detached: true` + `unref()`).

## Security

### Webhook Verification

```typescript
// GitLab: simple token comparison
const token = request.headers['x-gitlab-token'];
timingSafeEqual(Buffer.from(token), Buffer.from(expectedToken));

// GitHub: HMAC-SHA256
const hmac = createHmac('sha256', secret);
hmac.update(rawBody);
const expected = `sha256=${hmac.digest('hex')}`;
timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
```

### Why timingSafeEqual?

Character-by-character comparison = timing attack vulnerability.
`timingSafeEqual` always takes the same time regardless of input.

## Deduplication

Problem: GitLab may send multiple webhooks for the same event (rapid updates).

Solution:
```typescript
const recentJobs = new Map<string, number>(); // jobId -> timestamp

function shouldDeduplicate(jobId: string): boolean {
  const lastRun = recentJobs.get(jobId);
  if (!lastRun) return false;
  return Date.now() - lastRun < deduplicationWindowMs;
}
```

The job ID is `platform:projectPath:mrNumber`.

## Extension

### Adding a New Platform

1. Create `webhooks/newplatform.handler.ts`
2. Add signature verification in `security/verifier.ts`
3. Add the type in `eventFilter.ts`
4. Register the route in `server.ts`
5. Add the `platform` type in configs

### Adding Notifications

Modify `claude/invoker.ts`:
```typescript
// Slack
await fetch(slackWebhookUrl, { method: 'POST', body: JSON.stringify({ text }) });

// Email
await transporter.sendMail({ to, subject, text });
```
