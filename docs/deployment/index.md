---
title: Deployment Guide
---

# Deployment Guide

Run Reviewflow in production on a Linux VPS.

## Overview

This guide covers:
1. Running the server as a systemd service (auto-start on boot)
2. Exposing it to the internet via Cloudflare Tunnel

## Prerequisites

- Linux server with systemd (Ubuntu, Debian, etc.)
- Node.js 20+ installed
- `claude` CLI ≥ v2.1.139 (the `--bg` background dispatch mode is required)
- `claude auth status` returns OAuth — **never** set `ANTHROPIC_API_KEY` in the systemd environment, Reviewflow auto-pauses dispatch if it detects the API pool is in use
- `cloudflared` installed ([download](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/))
- A domain on Cloudflare (for permanent URL)
- Disk headroom on `$HOME` for `~/.reviewflow/worktrees/` — one full project checkout per active MR (typical: a few hundred MB per worktree, reclaimed automatically by the daily sweep)

## Quick Test (Temporary Tunnel)

For testing without permanent setup. The URL changes on each restart.

```bash
# Terminal 1: Server
cd ~/reviewflow
yarn install && yarn build
yarn start

# Terminal 2: Tunnel (3847 is the default config port)
cloudflared tunnel --url http://localhost:3847
```

Copy the generated URL and use it for your webhook configuration.

## Production Setup

### 1. Build the project

```bash
cd ~/reviewflow
yarn install
yarn build
```

### 2. Configure

```bash
# Environment
cp .env.example .env
nano .env  # Add your webhook tokens

# Application
cp config.example.json config.json
nano config.json  # Add your repos
```

### 3. Install systemd service

```bash
# Copy template
sudo cp docs/deployment/templates/review-flow.service /etc/systemd/system/

# Edit with your values
sudo nano /etc/systemd/system/review-flow.service
# Replace YOUR_USER and paths

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable --now review-flow

# Check status
sudo systemctl status review-flow
```

### 4. Set up Cloudflare Tunnel

```bash
# Login to Cloudflare
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create review-flow
# Note the tunnel ID

# Configure DNS
cloudflared tunnel route dns review-flow review.your-domain.com

# Create config
mkdir -p ~/.cloudflared
cp docs/deployment/templates/cloudflared-config.yml ~/.cloudflared/config.yml
nano ~/.cloudflared/config.yml
# Replace YOUR_TUNNEL_ID, YOUR_USER, and domain

# Install tunnel service
sudo cp docs/deployment/templates/cloudflared.service /etc/systemd/system/cloudflared-review-flow.service
sudo nano /etc/systemd/system/cloudflared-review-flow.service
# Replace YOUR_USER

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared-review-flow
```

### 5. Verify

```bash
# Check services
sudo systemctl status review-flow
sudo systemctl status cloudflared-review-flow

# Test endpoint — expect status: "ok" and supervisor.state: "up"
curl https://review.your-domain.com/health | jq .

# If supervisor.state is "down", the 60s scheduler will respawn it on
# the next tick. Persistent "down" usually means `claude` is not in
# PATH or OAuth is not configured for the systemd user.

# View logs
journalctl -u review-flow -f
```

The `/health` payload includes a `supervisor` block reporting the live state of the Claude agents daemon:

```json
{
  "status": "ok",
  "supervisor": {
    "state": "up",
    "reason": null,
    "lastCheckedAt": "2026-05-26T10:42:00.000Z"
  }
}
```

When `supervisor.state === "down"`, overall `status` becomes `"degraded"` — Reviewflow still accepts webhooks but reviews will fail dispatch until the supervisor is back up. See the [Supervisor troubleshooting section](../guide/troubleshooting.md#supervisor).

## Templates

See the `templates/` directory for:
- `review-flow.service` - systemd unit for the server
- `cloudflared.service` - systemd unit for the tunnel
- `cloudflared-config.yml` - Cloudflare tunnel configuration

## Updating

```bash
# Stop service
sudo systemctl stop review-flow

# Update code
cd ~/reviewflow
git pull
yarn install
yarn build

# Restart
sudo systemctl start review-flow
```

::: tip Updating from the dashboard
The dashboard update button also works under systemd: once the new version is installed, Reviewflow
exits with code `75` and lets systemd start the new version. This requires `Restart=on-failure` (or
`Restart=always`) in the `[Service]` section of the unit.
:::

::: tip Worktrees survive restarts
The worktree state lives at `~/.reviewflow/worktrees/` (independent of the source checkout). A restart does not invalidate active worktrees; in-flight reviews resume on the next webhook with `ensureWorktree` fast-forwarding the existing worktree.
:::

## Operating worktrees

Each active MR has a dedicated worktree at `~/.reviewflow/worktrees/<platform>-<slug>-<mrNumber>`. They are created on first review, fast-forwarded on followup, removed on merge/close, and a sweep every 24h (anchored to server startup, also fires immediately on boot) reclaims anything stale.

```bash
# Disk usage overview
du -sh ~/.reviewflow/worktrees/*

# Manual cleanup (rare — sweep handles this)
rm -rf ~/.reviewflow/worktrees/<platform>-<slug>-<mrNumber>
cd /path/to/source/checkout && git worktree prune
```

Full state machine: [Worktree Lifecycle](../architecture/worktree-lifecycle.md).

## Troubleshooting

See [Troubleshooting](../guide/troubleshooting.md) for common issues (services, tunnels, webhooks).
