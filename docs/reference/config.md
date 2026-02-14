---
title: Configuration Reference
---

# Configuration Reference

Complete reference for Reviewflow configuration files.

## Overview

The system uses two configuration files:

| File | Location | Purpose |
|------|----------|---------|
| `config.json` | `~/.claude-review/` (created by `reviewflow init`) | Server configuration, repositories |
| `.claude/reviews/config.json` | Each project | Project-specific review settings |

---

## Server Configuration

### Location

`~/.claude-review/config.json`, created automatically by `reviewflow init`.

### Schema

```json
{
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
| `stats.json` | Review statistics history per project | `totalReviews`, `averageScore`, `reviews[]` (with score, blocking, warnings) |
| `tracking.json` | MR/PR lifecycle tracking | `state`, `openThreads`, `reviews[]` (with type, score, duration) |

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
