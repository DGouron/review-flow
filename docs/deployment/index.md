---
title: Deployment Guide
---

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

## Quick Test (Temporary Tunnel)

For testing without permanent setup. The URL changes on each restart.

```bash
# Terminal 1: Server
cd ~/review-flow
yarn install && yarn build
yarn start

# Terminal 2: Tunnel
cloudflared tunnel --url http://localhost:3000
```

Copy the generated URL and use it for your webhook configuration.

## Production Setup

### 1. Build the project

```bash
cd ~/review-flow
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

# Test endpoint
curl https://review.your-domain.com/health

# View logs
journalctl -u review-flow -f
```

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
cd ~/review-flow
git pull
yarn install
yarn build

# Restart
sudo systemctl start review-flow
```

## Troubleshooting

See [Troubleshooting](../guide/troubleshooting.md) for common issues (services, tunnels, webhooks).
