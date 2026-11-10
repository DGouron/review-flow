---
title: Troubleshooting
---

# Troubleshooting

Common issues and solutions for Reviewflow.

## CLI Diagnostics

Before diving into specific issues, use these built-in commands:

| Command | What it checks |
|---------|---------------|
| `reviewflow validate` | Config and `.env` correctness |
| `reviewflow status` | Server running state, PID, port |
| `reviewflow logs -f` | Live server logs (follow mode) |
| `reviewflow logs -n 50` | Last 50 log lines |

```bash
# Quick health check
reviewflow validate && reviewflow status
```

## Webhooks

### Webhook returns 401

- Verify your webhook token in `.env` matches the one configured in GitLab/GitHub
- Check server logs: `journalctl -u review-flow -n 50` (production) or `yarn dev` output (development)
- Check the service is running: `systemctl status review-flow`

### Review doesn't start

1. Check the repository is in `config.json` with `enabled: true`
2. Verify your username matches the one in `config.json`
3. Ensure the MR/PR is not a draft
4. Check server logs for webhook reception

## Services

### Service won't start

```bash
journalctl -u review-flow -n 50
```

Common causes:
- Wrong path in systemd service file
- Missing `.env` file
- Node.js not found (check `/usr/bin/node` exists)

### Tunnel not connecting

```bash
# Check tunnel status
cloudflared tunnel info review-flow

# Verify config
cloudflared tunnel ingress validate

# Check DNS
dig review.your-domain.com

# Restart tunnel
sudo systemctl restart cloudflared-review-flow
```

## Claude Code

### Claude Code fails

- Verify the local path exists and is a git repository
- Check Claude Code is authenticated: `claude --version`
- Verify the skill exists in the target project
- Check Claude Code permissions (`settings.local.json`)

### Session dispatch fails immediately

Reviewflow dispatches with `claude --bg`. Check:

- `claude` binary version: must support `--bg` (≥ v2.1.139)
- `claude auth status` returns OAuth (no `ANTHROPIC_API_KEY` should be set — Reviewflow auto-pauses if it detects the API pool is in use)
- Server logs for `dispatchClaudeSession` errors

### Review hangs and never completes

Three completion signals are wired (MCP `set_phase`, `claude agents --json` poll, 15-min timeout). If all three miss, the session is killed on timeout and the report is missing. Inspect:

```bash
claude agents --json                # is the session still listed?
claude logs <sessionId>             # what is it doing?
```

If the session is healthy but unresponsive, `claude stop <sessionId>` clears it.

## Worktree

### "branch-not-found" error in review job logs

The source branch was deleted upstream between webhook reception and worktree fetch. The review is aborted — re-push the branch or close the MR.

### "worktree-add-failed" error

Common causes:

- A stale worktree pointer survived (`git worktree prune` from the source checkout fixes this — `ensureWorktree` already runs prune, but a corrupted `.git/worktrees/` may need manual cleanup)
- Disk full on `~/.reviewflow/worktrees/` — check `du -sh ~/.reviewflow/worktrees/*`

### Worktree directory missing on merge

`removeWorktree` is idempotent — a missing path is logged as a warning and the merge completes normally. No action needed.

### Manual cleanup

```bash
# Inspect
ls -la ~/.reviewflow/worktrees/
du -sh ~/.reviewflow/worktrees/*

# Force-remove a specific worktree
rm -rf ~/.reviewflow/worktrees/<platform>-<slug>-<mrNumber>
# then prune from the source checkout
cd /path/to/source/checkout && git worktree prune
```

The sweep (every 24h since server startup) normally reclaims stale worktrees automatically (closed >24h or `mtime` >7d).

## Supervisor

### `/health` returns `status: degraded`

The Claude agents supervisor is unreachable. The 60-second scheduler will attempt to respawn it on the next tick. Check:

```bash
curl http://localhost:3847/health | jq .supervisor
# { state: "down", reason: "...", lastCheckedAt: "..." }
```

Possible reasons:

- `claude` binary not in `PATH`
- `claude auth status` not authenticated
- Lock file held by a dead PID at `~/.reviewflow/supervisor.lock` — the scheduler takes over automatically on the next tick

### Supervisor keeps respawning

Look for `spawn-unstable` in `/health` reason — the supervisor dies immediately after spawn. Usually means OAuth credentials are missing or `claude` is broken. Run `claude agents` manually to see the error.

## MCP Server

### No MCP logs created

- The MCP server only starts when Claude actually calls a tool
- Check `~/.review-flow/logs/mcp-server.log`

### "Workflow not found" error

- Check `MCP_JOB_ID` env var is set correctly
- Verify the job context file exists: `~/.review-flow/jobs/<jobId>.json`

### Tools listed but not callable

- MCP server doesn't start just from being listed; Claude must invoke a tool
- Verify `.mcp.json` exists in the project directory

## Desktop Notifications

The server sends an OS notification when a review starts, ends, fails, or is cancelled.

| Platform | Command used |
|----------|--------------|
| macOS, `terminal-notifier` on the server's `PATH` | `terminal-notifier` |
| macOS, without `terminal-notifier` | `osascript` (ships with macOS) |
| Linux and others | `notify-send` |

### No notification on macOS

Without `terminal-notifier`, notifications go through `osascript` and are posted on behalf of **Script Editor**: they only show up if Script Editor is allowed in *System Settings → Notifications*. Installing `terminal-notifier` gives ReviewFlow notifications their own entry instead:

```bash
brew install terminal-notifier
```

Then:

- Restart ReviewFlow — the binary is looked up once per server process.
- Make sure the server's `PATH` includes the Homebrew prefix (`/opt/homebrew/bin` on Apple Silicon, `/usr/local/bin` on Intel). A server started from a service manager may not inherit your shell's `PATH`; in that case ReviewFlow silently keeps using `osascript`.
- On the first notification, allow `terminal-notifier` in *System Settings → Notifications*.

If a notification command fails to start, the server logs the warning `Notification desktop non disponible`.

## Log Locations

| Log | Location |
|-----|----------|
| Server logs | stdout / `journalctl -u review-flow -f` |
| MCP server | `~/.review-flow/logs/mcp-server.log` |
| Review stats | `.claude/reviews/stats.json` (in project) |
| MR tracking | `.claude/reviews/tracking.json` (in project) |
| Claude session transcripts | `~/.claude/projects/<cwd-slug>/<sessionId>.jsonl` |
| Worktrees | `~/.reviewflow/worktrees/<platform>-<slug>-<mrNumber>/` |
| Supervisor lock | `~/.reviewflow/supervisor.lock` |
