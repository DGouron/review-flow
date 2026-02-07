---
title: Quick Start
scope: guide
related:
  - docs/deployment/README.md
  - docs/CONFIG-REFERENCE.md
last-updated: 2026-02-07
---

# Quick Start

Get Claude Review Automation running in 5 minutes.

## Prerequisites

- Node.js 20+
- A GitLab or GitHub account with webhook access
- [Claude Code CLI](https://claude.ai/claude-code) installed and authenticated

## 1. Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/claude-review-automation.git
cd claude-review-automation

# Install dependencies
yarn install

# Build
yarn build
```

## 2. Configuration

### Environment variables

```bash
# Copy the example
cp .env.example .env

# Edit with your webhook secrets
# Generate tokens with: openssl rand -hex 32
nano .env
```

```bash
# .env
GITLAB_WEBHOOK_TOKEN=your_generated_token_here
GITHUB_WEBHOOK_SECRET=your_generated_token_here
```

### Application config

```bash
# Copy the example
cp config.example.json config.json

# Edit with your settings
nano config.json
```

```json
{
  "server": { "port": 3000 },
  "user": {
    "gitlabUsername": "YOUR_GITLAB_USERNAME",
    "githubUsername": "YOUR_GITHUB_USERNAME"
  },
  "repositories": [
    {
      "platform": "gitlab",
      "remoteUrl": "https://gitlab.com/your-org/your-project",
      "localPath": "/path/to/your/local/clone",
      "skill": "review-code",
      "enabled": true
    }
  ]
}
```

## 3. Start the server

```bash
# Development mode (with hot reload)
yarn dev

# Or production mode
yarn start
```

The server runs at `http://localhost:3000` (or your configured port).

## 4. Expose for webhooks

GitLab/GitHub need to reach your server. Options:

### Option A: Cloudflare Tunnel (recommended)

```bash
cloudflared tunnel --url http://localhost:3000
```

Copy the generated URL (e.g., `https://xxx-xxx.trycloudflare.com`).

### Option B: ngrok

```bash
ngrok http 3000
```

## 5. Configure webhook

### GitLab

1. Go to your project → **Settings** → **Webhooks**
2. Add webhook:
   - **URL**: `https://YOUR_TUNNEL_URL/webhooks/gitlab`
   - **Secret token**: (same as `GITLAB_WEBHOOK_TOKEN` in your `.env`)
   - **Trigger**: ☑ Merge request events
3. Click **Add webhook**

### GitHub

1. Go to your repo → **Settings** → **Webhooks**
2. Add webhook:
   - **Payload URL**: `https://YOUR_TUNNEL_URL/webhooks/github`
   - **Content type**: `application/json`
   - **Secret**: (same as `GITHUB_WEBHOOK_SECRET` in your `.env`)
   - **Events**: ☑ Pull requests
3. Click **Add webhook**

## 6. Test it!

1. Create or open a Merge Request / Pull Request
2. Assign yourself as **Reviewer**
3. Open `http://localhost:3000/dashboard/`
4. Watch the review appear! 🎉

## Next steps

- [Project Configuration](./PROJECT_CONFIG.md) - Configure review skills per project
- [Deployment Guide](./deployment/README.md) - Run in production with systemd
- [Architecture](./ARCHITECTURE.md) - Understand the codebase

## Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues (webhooks, reviews, Claude Code).
