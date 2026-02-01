# Configuration Reference

Complete reference for claude-review-automation configuration files.

## Overview

The system uses two configuration files:

| File | Location | Purpose |
|------|----------|---------|
| `config.json` | Server root | Server configuration, repositories |
| `.claude/reviews/config.json` | Each project | Project-specific review settings |

---

## Server Configuration

### Location

`config.json` in the server's root directory (or `config.example.json` as template).

### Schema

```json
{
  "server": {
    "port": 3000
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
| `port` | number | `3000` | HTTP server port |

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

### Example: Multi-Repository Setup

```json
{
  "server": { "port": 3000 },
  "user": {
    "gitlabUsername": "john.doe",
    "githubUsername": "johndoe"
  },
  "queue": {
    "maxConcurrent": 3,
    "deduplicationWindowMs": 600000
  },
  "repositories": [
    {
      "platform": "gitlab",
      "remoteUrl": "https://gitlab.com/company/frontend",
      "localPath": "/home/dev/projects/frontend",
      "skill": "review-react",
      "followupSkill": "review-followup",
      "enabled": true
    },
    {
      "platform": "gitlab",
      "remoteUrl": "https://gitlab.com/company/backend",
      "localPath": "/home/dev/projects/backend",
      "skill": "review-python",
      "enabled": true
    },
    {
      "platform": "github",
      "remoteUrl": "https://github.com/myorg/api",
      "localPath": "/home/dev/projects/api",
      "skill": "review-api",
      "enabled": false
    }
  ]
}
```

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

When `agents` is not specified:

```json
[
  { "name": "clean-architecture", "displayName": "Clean Archi" },
  { "name": "ddd", "displayName": "DDD" },
  { "name": "react-best-practices", "displayName": "React" },
  { "name": "solid", "displayName": "SOLID" },
  { "name": "testing", "displayName": "Testing" },
  { "name": "code-quality", "displayName": "Code Quality" }
]
```

When `followupAgents` is not specified:

```json
[
  { "name": "context", "displayName": "Context" },
  { "name": "verify", "displayName": "Verify" },
  { "name": "scan", "displayName": "Scan" },
  { "name": "threads", "displayName": "Threads" },
  { "name": "report", "displayName": "Report" }
]
```

---

## Examples

### Minimal Project Config

```json
{
  "github": false,
  "gitlab": true,
  "reviewSkill": "review-code"
}
```

### Full-Featured Project Config

```json
{
  "github": true,
  "gitlab": true,
  "defaultModel": "opus",
  "reviewSkill": "review-frontend",
  "reviewFollowupSkill": "review-followup",
  "agents": [
    { "name": "architecture", "displayName": "Architecture" },
    { "name": "react", "displayName": "React Patterns" },
    { "name": "accessibility", "displayName": "A11y" },
    { "name": "performance", "displayName": "Performance" },
    { "name": "security", "displayName": "Security" },
    { "name": "testing", "displayName": "Testing" }
  ],
  "followupAgents": [
    { "name": "diff-analysis", "displayName": "Diff Analysis" },
    { "name": "thread-verification", "displayName": "Thread Check" },
    { "name": "regression-scan", "displayName": "Regressions" }
  ]
}
```

### Backend Python Project

```json
{
  "github": false,
  "gitlab": true,
  "defaultModel": "sonnet",
  "reviewSkill": "review-python",
  "agents": [
    { "name": "pep8", "displayName": "PEP 8" },
    { "name": "type-hints", "displayName": "Type Hints" },
    { "name": "security", "displayName": "Security" },
    { "name": "sql", "displayName": "SQL Safety" },
    { "name": "testing", "displayName": "pytest" }
  ]
}
```

---

## Generated Files

The automation server creates these files in `.claude/reviews/`:

| File | Description |
|------|-------------|
| `stats.json` | Review statistics history |
| `tracking.json` | MR/PR tracking data |

### stats.json Structure

```json
{
  "project/path": {
    "totalReviews": 42,
    "totalDuration": 123456,
    "averageScore": 7.8,
    "averageDuration": 2940,
    "totalBlocking": 15,
    "totalWarnings": 89,
    "reviews": [
      {
        "id": "1706745600000-123",
        "timestamp": "2024-02-01T10:00:00.000Z",
        "mrNumber": 123,
        "duration": 45000,
        "score": 8.5,
        "blocking": 1,
        "warnings": 3,
        "suggestions": 5,
        "assignedBy": "jane.doe"
      }
    ],
    "lastUpdated": "2024-02-01T10:00:45.000Z"
  }
}
```

### tracking.json Structure

```json
{
  "gitlab-project/path-123": {
    "id": "gitlab-project/path-123",
    "mrNumber": 123,
    "title": "feat: Add new feature",
    "url": "https://gitlab.com/project/path/-/merge_requests/123",
    "project": "project/path",
    "platform": "gitlab",
    "sourceBranch": "feature/new-feature",
    "targetBranch": "main",
    "state": "open",
    "openThreads": 3,
    "totalThreads": 5,
    "createdAt": "2024-02-01T09:00:00.000Z",
    "lastReviewAt": "2024-02-01T10:00:00.000Z",
    "reviews": [
      {
        "type": "review",
        "timestamp": "2024-02-01T10:00:00.000Z",
        "durationMs": 45000,
        "score": 8.5,
        "blocking": 1,
        "warnings": 3
      }
    ]
  }
}
```

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

Configuration files are validated at startup. Common errors:

| Error | Cause | Solution |
|-------|-------|----------|
| `Missing required field` | Required field not set | Add the missing field |
| `Invalid model` | Unknown model name | Use `"sonnet"` or `"opus"` |
| `Repository not found` | `localPath` doesn't exist | Create directory or fix path |
| `Skill not found` | Skill not in `.claude/skills/` | Create the skill file |

---

## See Also

- [REVIEW-SKILLS-GUIDE.md](./REVIEW-SKILLS-GUIDE.md) - How to create skills
- [MARKERS-REFERENCE.md](./MARKERS-REFERENCE.md) - Marker syntax reference
