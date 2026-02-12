# Reviewflow

[![CI](https://github.com/DGouron/review-flow/actions/workflows/ci.yml/badge.svg)](https://github.com/DGouron/review-flow/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Documentation](https://img.shields.io/badge/Docs-VitePress-646cff.svg)](https://dgouron.github.io/review-flow/)

Automated AI code reviews powered by [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Assign a reviewer on your merge request — Claude reviews the code, tracks progress in real time, and follows up when you push fixes.

Works with **GitLab** and **GitHub** out of the box.

---

## How It Works

```
Developer pushes code
       │
       ▼
GitLab/GitHub webhook ──► Review server receives event
                                    │
                                    ▼
                          Queue deduplicates & schedules
                                    │
                                    ▼
                          Claude Code runs review skill
                                    │
                          ┌─────────┼─────────┐
                          ▼         ▼         ▼
                     Agent 1   Agent 2   Agent N
                   (Archi)    (Tests)   (Quality)
                          │         │         │
                          └─────────┼─────────┘
                                    ▼
                          MCP server reports progress
                                    │
                                    ▼
                          Dashboard shows live status
                                    │
                                    ▼
                          Review posted on MR/PR
                                    │
                                    ▼
                          Dev pushes fixes ──► Auto follow-up
```

---

## Key Features

### Multi-Agent Reviews

Each review runs a configurable set of specialized audit agents — Clean Architecture, SOLID, Testing, DDD, Code Quality, and more. Define your own agents per project to match your team's standards.

```json
{
  "agents": [
    { "name": "clean-architecture", "displayName": "Clean Archi" },
    { "name": "security", "displayName": "Security" },
    { "name": "testing", "displayName": "Testing" }
  ]
}
```

### MCP Integration

A built-in [Model Context Protocol](https://modelcontextprotocol.io/) server gives Claude structured tools to report progress, manage review phases, and queue actions on discussion threads — replacing fragile text-marker parsing with typed tool calls.

| MCP Tool | Purpose |
|----------|---------|
| `get_workflow` | Read current review state and agent list |
| `start_agent` / `complete_agent` | Track per-agent progress |
| `set_phase` | Advance review phases |
| `get_threads` | Fetch MR/PR discussion threads |
| `add_action` | Queue thread actions (resolve, reply, comment) |

### Smart Queue

Powered by [p-queue](https://github.com/sindresorhus/p-queue) with:

- **Concurrency control** — limit parallel reviews (default: 2)
- **Deduplication** — prevents duplicate reviews within a configurable time window
- **Graceful cancellation** — abort running reviews via dashboard or API
- **Memory guard** — auto-kills if RSS exceeds 4 GB
- **Retry on failure** — failed jobs clear deduplication so they can be re-triggered immediately

### Real-Time Dashboard

A WebSocket-powered dashboard shows live review progress:

- Phase and agent-level progress bars
- Running / queued / completed review counts
- Review history with duration, scores, and error details
- Log stream for debugging
- Auto-reconnection with exponential backoff

### Follow-Up Reviews

When a developer pushes fixes after a review, Claude automatically:

1. Re-reads the discussion threads
2. Checks if blocking issues are resolved
3. Resolves threads on GitLab/GitHub
4. Posts a follow-up summary with updated score

This creates an iterative review loop, not just a one-shot check.

### Multi-Platform Support

| Feature | GitLab | GitHub |
|---------|--------|--------|
| Webhook trigger | Reviewer assigned | Review requested or `needs-review` label |
| Thread actions | Resolve, reply, comment | Resolve, reply, comment |
| Auto-followup | On MR push | On PR push |
| Authentication | `glab` CLI (OAuth) | `gh` CLI (OAuth) |

No API tokens needed — both platforms use secure CLI-based OAuth.

### Customizable Review Skills

Review behavior is defined by [Claude Code skills](https://docs.anthropic.com/en/docs/claude-code/skills) — Markdown files in your project that tell Claude what to audit and how. Templates included for frontend, backend, and API reviews in English and French.

---

## Quick Start

### 1. Install

```bash
npm install -g reviewflow
```

### 2. Initialize

```bash
reviewflow init
```

The interactive wizard will:
- Configure server port and usernames
- Generate webhook secrets
- Scan your filesystem for git repositories
- Set up MCP server integration with Claude Code

For non-interactive setup: `reviewflow init --yes`

### 3. Start

```bash
reviewflow start
# Dashboard at http://localhost:3847
```

Then [configure a webhook](https://dgouron.github.io/review-flow/guide/quick-start) on your GitLab/GitHub project pointing to your server.

### Validate your setup

```bash
reviewflow validate
```

For detailed setup, see the **[Quick Start Guide](https://dgouron.github.io/review-flow/guide/quick-start)**.

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `reviewflow init` | Interactive setup wizard |
| `reviewflow start` | Start the review server |
| `reviewflow stop` | Stop the running daemon |
| `reviewflow status` | Show server status |
| `reviewflow logs` | Show daemon logs |
| `reviewflow validate` | Validate configuration |

| Init Flag | Description |
|-----------|-------------|
| `-y, --yes` | Accept all defaults (non-interactive) |
| `--skip-mcp` | Skip MCP server configuration |
| `--show-secrets` | Display full webhook secrets |
| `--scan-path <path>` | Custom scan path (repeatable) |

---

## Documentation

| Topic | Link |
|-------|------|
| Quick Start | [guide/quick-start](https://dgouron.github.io/review-flow/guide/quick-start) |
| Configuration Reference | [reference/config](https://dgouron.github.io/review-flow/reference/config) |
| Project Configuration | [guide/project-config](https://dgouron.github.io/review-flow/guide/project-config) |
| Review Skills Guide | [guide/review-skills](https://dgouron.github.io/review-flow/guide/review-skills) |
| MCP Tools Reference | [reference/mcp-tools](https://dgouron.github.io/review-flow/reference/mcp-tools) |
| Architecture | [architecture](https://dgouron.github.io/review-flow/architecture/) |
| Deployment | [deployment](https://dgouron.github.io/review-flow/deployment/) |
| Troubleshooting | [guide/troubleshooting](https://dgouron.github.io/review-flow/guide/troubleshooting) |

---

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/dashboard/` | GET | Web dashboard |
| `/health` | GET | Health check |
| `/status` | GET | Queue status |
| `/webhooks/gitlab` | POST | GitLab webhook receiver |
| `/webhooks/github` | POST | GitHub webhook receiver |
| `/api/reviews` | GET | List reviews |
| `/api/reviews/cancel/:jobId` | POST | Cancel a running review |
| `/ws` | WS | Real-time progress updates |

---

## Development

```bash
npm run dev          # Dev server with hot reload
npm test             # Tests in watch mode
npm run test:ci      # Tests (CI mode)
npm run typecheck    # TypeScript validation
npm run lint         # Biome linting
npm run verify       # All checks (typecheck + lint + test)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

[MIT](LICENSE) — Damien Gouron
