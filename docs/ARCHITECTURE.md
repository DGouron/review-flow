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
         │                           │                   6. spawn claude
         │                           │                          │
         │                           │                   ┌──────┴──────┐
         │                           │                   │ Claude CLI  │
         │                           │                   │ /skill MR#  │
         │                           │                   └──────┬──────┘
         │                           │                          │
         │◄──────────────────────────┼──────────────────────────┤
         │                           │                   7. Post comments
         │ 8. Inline comments        │                      via glab api
         │    on MR                  │                          │
         │                           │                          │
```

## File Structure

```
src/
├── server.ts                                      # Fastify entry point
├── mcpServer.ts                                   # MCP server entry point
│
├── config/                                        # Config loading and validation
├── security/                                      # Webhook signature verification
├── entities/                                      # Domain entities and types
├── usecases/                                      # Business logic (incl. mcp/)
│
├── interface-adapters/
│   ├── controllers/
│   │   ├── webhook/
│   │   │   ├── gitlab.controller.ts               # GitLab webhook handler
│   │   │   ├── github.controller.ts               # GitHub webhook handler
│   │   │   └── eventFilter.ts                     # Filtering logic
│   │   └── mcp/                                   # MCP tool handlers
│   └── gateways/                                  # Gateway implementations
│
├── frameworks/
│   └── claude/                                    # Claude CLI integration
│
├── mcp/                                           # MCP server infrastructure
│   ├── server.ts                                  # MCP server setup
│   └── mcpServerStdio.ts                          # Stdio transport
│
├── queue/                                         # Review queue management
└── shared/                                        # Shared services and utilities
```

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

### 6. Claude Invoker (claude/invoker.ts)

```bash
claude --print --permission-mode dontAsk --model sonnet -p "/<skill> <MR_NUMBER>"
```

- **Spawn**: `child_process.spawn` (not exec, to handle large outputs)
- **CWD**: Configured local repo path
- **Timeout**: 30 minutes max
- **Notifications**: `notify-send` at start and end

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
