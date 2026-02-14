---
title: Quick Start
---

# Quick Start

Get Reviewflow running in 5 minutes.

## Prerequisites

- Node.js 20+
- A GitLab or GitHub account with webhook access
- [Claude Code CLI](https://claude.ai/claude-code) installed and authenticated

## 1. Install

### As a user (recommended)

```bash
npm install -g reviewflow
# or
yarn global add reviewflow
```

You can also run it without installing:

```bash
npx reviewflow start
```

### As a contributor

```bash
git clone https://github.com/DGouron/review-flow.git
cd review-flow
yarn install
yarn build
```

## 2. Initialize

Run the interactive setup wizard:

```bash
reviewflow init
```

The wizard walks you through:
1. Choosing your platform (GitLab, GitHub, or both)
2. Entering your username(s) for @mention filtering
3. Scanning for local repositories to register
4. Generating webhook secrets automatically

Your configuration is saved to `~/.claude-review/config.json` and `~/.claude-review/.env`.

::: tip Non-interactive mode
Use `reviewflow init --yes` to accept all defaults. You can also pass `--scan-path /path/to/projects` to target specific directories.
:::

::: tip Add repositories later
Use `reviewflow discover` to scan for and add new repositories to your existing configuration.
:::

## 3. Configure webhook

### GitLab

1. Go to your project &rarr; **Settings** &rarr; **Webhooks**
2. Add webhook:
   - **URL**: `https://YOUR_TUNNEL_URL/webhooks/gitlab`
   - **Secret token**: (shown during `reviewflow init`, or run `reviewflow init --show-secrets` to view)
   - **Trigger**: &#9745; Merge request events
3. Click **Add webhook**

### GitHub

1. Go to your repo &rarr; **Settings** &rarr; **Webhooks**
2. Add webhook:
   - **Payload URL**: `https://YOUR_TUNNEL_URL/webhooks/github`
   - **Content type**: `application/json`
   - **Secret**: (shown during `reviewflow init`, or run `reviewflow init --show-secrets` to view)
   - **Events**: &#9745; Pull requests
3. Click **Add webhook**

::: info Expose for webhooks
GitLab/GitHub need to reach your server. Use a tunnel:

```bash
# Cloudflare Tunnel (recommended)
cloudflared tunnel --url http://localhost:3847

# Or ngrok
ngrok http 3847
```
:::

## 4. Start & verify

```bash
# Start the server
reviewflow start

# Or as a background daemon
reviewflow start --daemon

# Open the dashboard automatically
reviewflow start --open
```

The server runs at `http://localhost:3847` (or your configured port).

### Verify your setup

```bash
# Check configuration is valid
reviewflow validate

# Check server status
reviewflow status
```

## 5. Test it!

1. Create or open a Merge Request / Pull Request
2. Assign yourself as **Reviewer**
3. Open `http://localhost:3847/dashboard/`
4. Watch the review appear!

## Next steps

- [Project Configuration](./project-config.md) - Configure review skills per project
- [Deployment Guide](../deployment/index.md) - Run in production with systemd
- [Architecture](../architecture/current.md) - Understand the codebase

## Troubleshooting

See [Troubleshooting](./troubleshooting.md) for common issues and CLI diagnostics.
