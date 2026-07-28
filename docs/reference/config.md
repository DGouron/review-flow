---
title: Configuration Reference
---

# Configuration Reference

Complete reference for Reviewflow configuration files.

## Overview

The system uses two configuration files:

| File | Location | Purpose |
|------|----------|---------|
| `config.json` | `~/.config/reviewflow/` (created by `reviewflow init` or `reviewflow setup`) | Server configuration, repositories |
| `.claude/reviews/config.json` | Each project | Project-specific review settings |

---

## Server Configuration

### Location

`~/.config/reviewflow/config.json` on Linux (macOS: `~/Library/Application Support/reviewflow/`, Windows: `%APPDATA%\reviewflow\`; override with `XDG_CONFIG_HOME`), created automatically by `reviewflow init` or `reviewflow setup`.

### Schema

```json
{
  "triggerMode": "full-auto",
  "server": {
    "port": 3847
  },
  "user": {
    "gitlabUsername": "your-gitlab-username",
    "githubUsername": "your-github-username"
  },
  "queue": {
    "maxConcurrent": 2,
    "deduplicationWindowMs": 300000
  },
  "repositories": [
    {
      "platform": "gitlab",
      "remoteUrl": "https://gitlab.com/your-org/your-project",
      "localPath": "/path/to/local/clone",
      "skill": "review-code",
      "followupSkill": "review-followup",
      "enabled": true
    }
  ]
}
```

### Fields

#### `triggerMode`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `triggerMode` | `"full-auto"` \| `"semi-auto"` | `"full-auto"` | When a review/follow-up is triggered. `full-auto` enqueues it immediately; `semi-auto` parks it as **pending** and waits for manual confirmation (dashboard or `POST /api/pending-reviews/:id/confirm`). |

The value in `config.json` is the **boot default**. It can be changed at runtime from the dashboard (the `Trigger` chip); the dashboard choice is persisted to `~/.claude-review/settings.json` and takes effect immediately without a restart, overriding `config.json` from then on. A non-trusted actor is always parked regardless of mode (SPEC-197).

#### `server`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `port` | number | `3847` | HTTP server port |

#### `user`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `gitlabUsername` | string | If using GitLab | Your GitLab username (for @mentions filtering) |
| `githubUsername` | string | If using GitHub | Your GitHub username (for @mentions filtering) |

#### `queue`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxConcurrent` | number | `2` | Max concurrent review jobs |
| `deduplicationWindowMs` | number | `300000` | Ignore duplicate webhooks within this window (5 min) |

#### `repositories[]`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `platform` | `"gitlab"` \| `"github"` | Yes | Platform type |
| `remoteUrl` | string | Yes | Repository URL (for matching webhooks) |
| `localPath` | string | Yes | Absolute path to local clone |
| `skill` | string | Yes | Skill name for initial reviews |
| `followupSkill` | string | No | Skill name for follow-up reviews |
| `enabled` | boolean | No | Enable/disable this repository (default: `true`) |

Multiple repositories: add additional entries to the `repositories[]` array. Mix platforms (gitlab/github) freely.

---

## Runtime Settings

### Location

`~/.claude-review/settings.json`, written by the daemon itself. These are the values changed from the dashboard header chips; each change is persisted immediately and reloaded at boot.

### Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `language` | `"en"` \| `"fr"` | `"en"` | Language used for Claude prompts and reports |
| `model` | `"haiku"` \| `"sonnet"` \| `"opus"` | `"opus"` | Default Claude model when no project or routing override applies |
| `triggerMode` | `"full-auto"` \| `"semi-auto"` \| `null` | `null` | Runtime override of the `config.json` trigger mode |
| `worktreeStaleThresholdHours` | number (1–720) | `24` | Age after which a review worktree is considered stale |
| `reviewTimeoutMinutes` | number (5–480) | `15` | Wall-clock budget for a single Claude review session |

#### `reviewTimeoutMinutes`

A review that produces no completion signal within this budget is failed with reason `timeout`. Change it from the dashboard `Timeout (min)` chip or with:

```bash
curl -X POST http://localhost:3847/api/settings/reviewTimeout \
  -H 'Content-Type: application/json' \
  -d '{"reviewTimeoutMinutes": 60}'
```

The change takes effect immediately, without a daemon restart: it is applied to the shared invocation dependencies and to the PQueue per-job timeout, which is kept 5 minutes above the session timeout so the queue never aborts a review before the session budget expires.

---

## Project Configuration

### Location

`.claude/reviews/config.json` inside each project repository.

### Schema

```json
{
  "github": true,
  "gitlab": false,
  "defaultModel": "sonnet",
  "reviewSkill": "my-review-skill",
  "reviewFollowupSkill": "my-followup-skill",
  "agents": [
    { "name": "architecture", "displayName": "Architecture" },
    { "name": "security", "displayName": "Security" }
  ],
  "followupAgents": [
    { "name": "verify", "displayName": "Verify Fixes" },
    { "name": "scan", "displayName": "New Issues Scan" }
  ]
}
```

### Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `github` | boolean | Yes | - | Enable GitHub integration |
| `gitlab` | boolean | Yes | - | Enable GitLab integration |
| `defaultModel` | `"sonnet"` \| `"opus"` | No | `"sonnet"` | Claude model for reviews |
| `reviewSkill` | string | Yes | - | Skill name for initial reviews |
| `reviewFollowupSkill` | string | No | - | Skill name for follow-up reviews |
| `agents` | `AgentDefinition[]` | No | See below | Custom agents for progress tracking |
| `followupAgents` | `AgentDefinition[]` | No | See below | Custom agents for follow-up reviews |

### AgentDefinition

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Agent identifier (kebab-case, e.g., `clean-architecture`) |
| `displayName` | string | Human-readable name for dashboard (e.g., `Clean Architecture`) |

### Default Agents

When `agents` is omitted: `clean-architecture`, `ddd`, `react-best-practices`, `solid`, `testing`, `code-quality`.

When `followupAgents` is omitted: `context`, `verify`, `scan`, `threads`, `report`.

---

Minimal project config: `{ "gitlab": true, "reviewSkill": "review-code" }`.

---

## Generated Files

The automation server creates these files in `.claude/reviews/`:

| File | Description | Key Fields |
|------|-------------|------------|
| `stats.json` | Review statistics history per project | `totalReviews`, `averageScore`, `reviews[]` (last 100), cumulative counters (`totalScoreSum`, `scoredReviewCount`, `diffStatsReviewCount`) |
| `tracking.json` | MR/PR lifecycle tracking | `state`, `openThreads`, `reviews[]` (with type, score, duration) |
| `insights.json` | Computed developer & team insights | `developerMetrics`, `teamInsight`, `aiInsights` (AI-generated narrative), `processedReviewIds` |

**Note on `stats.json`**: The `reviews[]` array is capped at 100 entries for storage. Aggregate fields (`totalReviews`, `totalBlocking`, `averageScore`, etc.) reflect the full history thanks to cumulative counters that persist independently of the array.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Override server port | From config.json |
| `NODE_ENV` | Environment mode | `development` |
| `GITLAB_TOKEN` | GitLab API token | Required for `glab` CLI |
| `GITHUB_TOKEN` | GitHub API token | Required for `gh` CLI |

---

## Validation

Configuration files are validated at startup. Run `reviewflow validate` to check your configuration without starting the server. Common errors: missing required fields, invalid model name (use `"sonnet"` or `"opus"`), nonexistent `localPath`, or missing skill file in `.claude/skills/`.

---

## See Also

- [Review Skills Guide](../guide/review-skills.md) - How to create skills
- [Markers Reference](./markers.md) - Marker syntax reference
