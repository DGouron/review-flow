# Production Deployment

## Prerequisites

- Node.js 20+
- cloudflared installed
- A domain configured on Cloudflare (optional, for permanent URL)

## Option 1: Quick Tunnel (testing)

Temporary URL that changes on each restart.

```bash
# Terminal 1: Server
cd ~/claude-review-automation
npm run build
npm start

# Terminal 2: Tunnel
cloudflared tunnel --url http://localhost:3847
```

## Option 2: Permanent Tunnel (production)

### 1. Create the tunnel

```bash
# Authenticate
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create claude-review

# Note the tunnel ID (e.g., a1b2c3d4-...)
```

### 2. Configure DNS

```bash
# Create DNS entry
cloudflared tunnel route dns claude-review review.your-domain.com
```

### 3. Cloudflared configuration

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /home/YOUR_USER/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: review.your-domain.com
    service: http://localhost:3000
  - service: http_status:404
```

### 4. Systemd services

```bash
# Copy service files
sudo cp setup/claude-review-server.service /etc/systemd/system/
sudo cp setup/cloudflared-tunnel.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable and start
sudo systemctl enable --now claude-review-server
sudo systemctl enable --now cloudflared-tunnel
```

### 5. Verification

```bash
# Service status
sudo systemctl status claude-review-server
sudo systemctl status cloudflared-tunnel

# Logs
journalctl -u claude-review-server -f
journalctl -u cloudflared-tunnel -f

# Test endpoint
curl https://review.your-domain.com/health
```

## Updating

```bash
# Stop the service
sudo systemctl stop claude-review-server

# Update
cd ~/claude-review-automation
git pull
npm install
npm run build

# Restart
sudo systemctl start claude-review-server
```

## Troubleshooting

### Webhook returns 401

- Verify that `GITLAB_WEBHOOK_TOKEN` in `.env` matches the token in GitLab
- Check logs: `journalctl -u claude-review-server -n 50`

### Review doesn't start

1. Verify the repo is configured in `config.json`
2. Verify your username matches the one in `config.json`
3. Verify the MR is open (not draft, not merged)

### Tunnel not responding

```bash
# Check status
cloudflared tunnel info claude-review

# Restart
sudo systemctl restart cloudflared-tunnel
```

### Claude Code fails

- Verify the local path exists
- Verify the skill exists (`claude --help` in the repo)
- Check Claude Code permissions (`settings.local.json`)
