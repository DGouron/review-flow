#!/bin/bash
set -e

echo "=== Claude Review Automation - Installation ==="

PROJECT_DIR="/home/damien/Documents/Projets/claude-review-automation"

# Build the project
echo "Building TypeScript..."
cd "$PROJECT_DIR"
npm run build

# Install systemd services
echo "Installing systemd services..."
sudo cp "$PROJECT_DIR/setup/claude-review-server.service" /etc/systemd/system/
sudo cp "$PROJECT_DIR/setup/cloudflared-tunnel.service" /etc/systemd/system/
sudo systemctl daemon-reload

echo ""
echo "=== Installation complete ==="
echo ""
echo "Next steps:"
echo "1. Configure Cloudflare Tunnel:"
echo "   cloudflared tunnel login"
echo "   cloudflared tunnel create claude-review"
echo "   cloudflared tunnel route dns claude-review <subdomain>.<domain>"
echo "   # Edit ~/.cloudflared/config.yml with your tunnel ID"
echo ""
echo "2. Start services:"
echo "   sudo systemctl enable --now claude-review-server"
echo "   sudo systemctl enable --now cloudflared-tunnel"
echo ""
echo "3. Configure GitLab webhook:"
echo "   URL: https://<subdomain>.<domain>/webhooks/gitlab"
echo "   Secret Token: (from .env GITLAB_WEBHOOK_TOKEN)"
echo "   Trigger: Merge request events"
echo ""
echo "4. Test:"
echo "   curl http://localhost:3847/health"
