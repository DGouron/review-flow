# Claude Review Automation

Automated code review system using Claude Code. Receives webhooks from GitHub/GitLab and triggers AI-powered code reviews on merge requests and pull requests.

## Features

- Webhook-driven code reviews for GitHub PRs and GitLab MRs
- Real-time progress tracking via WebSocket
- Customizable review skills per project
- Dashboard for monitoring reviews
- Support for multiple projects

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [CLI Setup](#cli-setup)
3. [Webhook Configuration](#webhook-configuration)
4. [Project Configuration](#project-configuration)
5. [Review Skills](#review-skills)
6. [Dashboard](#dashboard)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Build & Run

```bash
npm run build
npm start
```

The dashboard will be available at `http://localhost:3847`

### 3. Configure CLI + Webhook

See [CLI Setup](#cli-setup) and [Webhook Configuration](#webhook-configuration) below.

---

## CLI Setup

The review automation uses the official CLI tools to interact with GitHub/GitLab.

### GitLab (glab)

```bash
# Install glab
sudo apt install glab
# or: brew install glab

# Authenticate (interactive)
glab auth login
```

This will open a browser for OAuth authentication. Follow the prompts.

### GitHub (gh)

```bash
# Install gh
sudo apt install gh
# or: brew install gh

# Authenticate (interactive)
gh auth login
```

This will open a browser for OAuth authentication. Follow the prompts.

> **Note**: No Personal Access Tokens needed! Both CLIs use secure OAuth authentication.

---

## Webhook Configuration

### Using a Tunnel (for local development)

For local development, you need a tunnel to expose your local server:

```bash
# Using Cloudflare Tunnel (recommended, free)
cloudflared tunnel --url http://localhost:3847

# Using ngrok
ngrok http 3847
```

The tunnel will give you a public URL like `https://xxx-xxx.trycloudflare.com`

### GitLab Webhook

1. Go to your GitLab project → **Settings** → **Webhooks**
2. Click **Add new webhook**
3. Configure:

| Field | Value |
|-------|-------|
| **URL** | `https://<your-tunnel-url>/webhooks/gitlab` |
| **Secret token** | (optional) Set in `.env` as `GITLAB_WEBHOOK_TOKEN` |
| **Trigger** | ☑ Merge request events |
| **SSL verification** | ☑ Enable |

4. Click **Add webhook**
5. Test with **Test** → **Merge request events**

### GitHub Webhook

1. Go to your GitHub repository → **Settings** → **Webhooks**
2. Click **Add webhook**
3. Configure:

| Field | Value |
|-------|-------|
| **Payload URL** | `https://<your-tunnel-url>/webhooks/github` |
| **Content type** | `application/json` |
| **Secret** | (optional) Set in `.env` as `GITHUB_WEBHOOK_SECRET` |
| **Events** | ☑ Pull requests |

4. Click **Add webhook**

---

## Project Configuration

Each project needs a configuration file to enable reviews.

### Create Config File

Create `.claude/reviews/config.json` in your project:

```json
{
  "github": false,
  "gitlab": true,
  "defaultModel": "opus",
  "reviewSkill": "review-front",
  "reviewFollowupSkill": "review-followup"
}
```

### Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `github` | boolean | Enable GitHub integration |
| `gitlab` | boolean | Enable GitLab integration |
| `defaultModel` | string | Claude model: `opus` (powerful) or `sonnet` (fast) |
| `reviewSkill` | string | Skill name for initial reviews |
| `reviewFollowupSkill` | string | Skill name for follow-up reviews |

> **Note**: Set either `github: true` OR `gitlab: true`, not both.

### Server Configuration

The main server config is in `config.json`:

```json
{
  "server": {
    "port": 3847
  },
  "user": {
    "gitlabUsername": "your-username",
    "githubUsername": "your-username"
  },
  "queue": {
    "maxConcurrent": 2,
    "deduplicationWindowMs": 300000
  },
  "repositories": [
    {
      "platform": "gitlab",
      "remoteUrl": "https://gitlab.com/your-org/your-repo",
      "localPath": "/path/to/local/clone",
      "skill": "review-front",
      "enabled": true
    }
  ]
}
```

### Environment Variables

Create a `.env` file:

```env
GITLAB_WEBHOOK_TOKEN=your-secret-token
GITHUB_WEBHOOK_SECRET=your-secret-token
LOG_LEVEL=info
```

---

## Review Skills

Review skills are Claude Code skills that define how reviews are performed.

### Skill Location

Skills must be in your project at:
```
.claude/skills/<skill-name>/SKILL.md
```

### Skill Format

```markdown
---
name: review-front
description: Code review skill for frontend projects
---

# Review Instructions

[Your review instructions for Claude...]
```

### Example Skills

See the `examples/` directory:

- `examples/skills/review-example/` - Basic code review skill
- `examples/skills/review-followup-example/` - Follow-up review skill
- `examples/skills/TEMPLATE.md` - Skill template
- `examples/config.example.json` - Example project config

---

## Dashboard

Access the dashboard at `http://localhost:3847`

### Features

- **Project Loader**: Load and switch between project configurations
- **CLI Status**: Verify GitHub/GitLab CLI authentication
- **Queue Monitoring**: View running and queued reviews
- **Review History**: Browse past review reports
- **Real-time Updates**: WebSocket-based live progress

### Loading a Project

1. Enter the project path (e.g., `/home/user/my-project`)
2. Click "Charger"
3. The dashboard validates:
   - Config file exists
   - Required skills exist
   - Shows active platform (GitHub/GitLab)

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Redirect to dashboard |
| `/dashboard/` | GET | Web dashboard |
| `/health` | GET | Health check |
| `/status` | GET | Queue status |
| `/webhooks/gitlab` | POST | GitLab webhook |
| `/webhooks/github` | POST | GitHub webhook |
| `/api/project-config` | GET | Load project config |
| `/api/gitlab/status` | GET | GitLab CLI status |
| `/api/github/status` | GET | GitHub CLI status |
| `/api/reviews` | GET | List reviews |
| `/ws` | WebSocket | Real-time updates |

---

## Troubleshooting

### Dashboard shows "Hors ligne"

Server is not running.

```bash
npm run build
npm start
```

### CLI not authenticated

Run the authentication command:

```bash
# GitLab
glab auth login

# GitHub
gh auth login
```

### Webhook fails (401 Unauthorized)

Token mismatch. Check that:
- `.env` has the correct `GITLAB_WEBHOOK_TOKEN` or `GITHUB_WEBHOOK_SECRET`
- GitLab/GitHub webhook has the same secret configured

### Webhook fails (Connection refused)

Tunnel is not running or URL changed.

```bash
# Restart tunnel
cloudflared tunnel --url http://localhost:3847

# Update webhook URL in GitLab/GitHub
```

### Review doesn't start

Check the logs and verify:
- You are assigned as **Reviewer** (not Assignee)
- MR/PR is not a draft
- MR/PR is not already merged/closed
- Project is in `config.json` repositories
- Your username matches config

### Skills not found

Verify skill paths exist:
```bash
ls -la /path/to/project/.claude/skills/review-front/SKILL.md
ls -la /path/to/project/.claude/skills/review-followup/SKILL.md
```

---

## Development

```bash
# Development with hot reload
npm run dev

# Build
npm run build

# Type check
npm run typecheck
```

---

## License

MIT
