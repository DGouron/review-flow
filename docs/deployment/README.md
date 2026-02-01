# Deployment Guide

Run Claude Review Automation in production on a Linux VPS.

## Overview

This guide covers:
1. Running the server as a systemd service (auto-start on boot)
2. Exposing it to the internet via Cloudflare Tunnel

## Prerequisites

- Linux server with systemd (Ubuntu, Debian, etc.)
- Node.js 20+ installed
- `cloudflared` installed ([download](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/))
- A domain on Cloudflare (for permanent URL)

## Quick Setup

### 1. Build the project

```bash
cd ~/claude-review-automation
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
sudo cp docs/deployment/templates/claude-review.service /etc/systemd/system/

# Edit with your values
sudo nano /etc/systemd/system/claude-review.service
# Replace YOUR_USER and paths

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable --now claude-review

# Check status
sudo systemctl status claude-review
```

### 4. Set up Cloudflare Tunnel

```bash
# Login to Cloudflare
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create claude-review
# Note the tunnel ID

# Configure DNS
cloudflared tunnel route dns claude-review review.your-domain.com

# Create config
mkdir -p ~/.cloudflared
cp docs/deployment/templates/cloudflared-config.yml ~/.cloudflared/config.yml
nano ~/.cloudflared/config.yml
# Replace YOUR_TUNNEL_ID, YOUR_USER, and domain

# Install tunnel service
sudo cp docs/deployment/templates/cloudflared.service /etc/systemd/system/cloudflared-claude-review.service
sudo nano /etc/systemd/system/cloudflared-claude-review.service
# Replace YOUR_USER

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared-claude-review
```

### 5. Verify

```bash
# Check services
sudo systemctl status claude-review
sudo systemctl status cloudflared-claude-review

# Test endpoint
curl https://review.your-domain.com/health

# View logs
journalctl -u claude-review -f
```

## Templates

See the `templates/` directory for:
- `claude-review.service` - systemd unit for the server
- `cloudflared.service` - systemd unit for the tunnel
- `cloudflared-config.yml` - Cloudflare tunnel configuration

## Updating

```bash
# Stop service
sudo systemctl stop claude-review

# Update code
cd ~/claude-review-automation
git pull
yarn install
yarn build

# Restart
sudo systemctl start claude-review
```

## Troubleshooting

### Service won't start

```bash
# Check logs
journalctl -u claude-review -n 50

# Common issues:
# - Wrong path in service file
# - Missing .env file
# - Node.js not found (check /usr/bin/node exists)
```

### Tunnel not connecting

```bash
# Check tunnel status
cloudflared tunnel info claude-review

# Verify config
cloudflared tunnel ingress validate

# Check DNS
dig review.your-domain.com
```

### Webhook returns 401

- Verify token in `.env` matches GitLab/GitHub webhook config
- Check service is running: `systemctl status claude-review`
