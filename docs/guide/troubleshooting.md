---
title: Troubleshooting
---

# Troubleshooting

Common issues and solutions for claude-review-automation.

## Webhooks

### Webhook returns 401

- Verify your webhook token in `.env` matches the one configured in GitLab/GitHub
- Check server logs: `journalctl -u claude-review -n 50` (production) or `yarn dev` output (development)
- Check the service is running: `systemctl status claude-review`

### Review doesn't start

1. Check the repository is in `config.json` with `enabled: true`
2. Verify your username matches the one in `config.json`
3. Ensure the MR/PR is not a draft
4. Check server logs for webhook reception

## Services

### Service won't start

```bash
journalctl -u claude-review -n 50
```

Common causes:
- Wrong path in systemd service file
- Missing `.env` file
- Node.js not found (check `/usr/bin/node` exists)

### Tunnel not connecting

```bash
# Check tunnel status
cloudflared tunnel info claude-review

# Verify config
cloudflared tunnel ingress validate

# Check DNS
dig review.your-domain.com

# Restart tunnel
sudo systemctl restart cloudflared-claude-review
```

## Claude Code

### Claude Code fails

- Verify the local path exists and is a git repository
- Check Claude Code is authenticated: `claude --version`
- Verify the skill exists in the target project
- Check Claude Code permissions (`settings.local.json`)

## MCP Server

### No MCP logs created

- The MCP server only starts when Claude actually calls a tool
- Ensure `--print` mode and MCP server config are both set
- Check `~/.claude-review/logs/mcp-server.log`

### "Workflow not found" error

- Check `MCP_JOB_ID` env var is set correctly
- Verify the job context file exists: `~/.claude-review/jobs/<jobId>.json`

### Tools listed but not callable

- MCP server doesn't start just from being listed; Claude must invoke a tool
- Verify `.mcp.json` exists in the project directory

## Log Locations

| Log | Location |
|-----|----------|
| Server logs | stdout / `journalctl -u claude-review -f` |
| MCP server | `~/.claude-review/logs/mcp-server.log` |
| Review stats | `.claude/reviews/stats.json` (in project) |
| MR tracking | `.claude/reviews/tracking.json` (in project) |
