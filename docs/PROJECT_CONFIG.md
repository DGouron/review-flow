---
title: Project Configuration
scope: guide
related:
  - templates/SETUP.md
  - docs/CONFIG-REFERENCE.md
last-updated: 2026-02-07
---

# Project Configuration

Claude Review Automation uses a configuration file in each project to customize review behavior.

## Prerequisites

Before configuring a project, ensure:

### 1. CLI Authentication

#### For GitLab projects:
```bash
# Install glab
sudo apt install glab

# Authenticate
glab auth login
```

#### For GitHub projects:
```bash
# Install gh
sudo apt install gh

# Authenticate
gh auth login
```

### 2. Webhook Setup

#### GitLab Webhook:
1. Go to **Settings** → **Webhooks** in your GitLab project
2. Add webhook:
   - **URL**: `http://<your-server>:3847/webhooks/gitlab`
   - **Trigger**: Merge request events
3. Click **Add webhook**

#### GitHub Webhook:
1. Go to **Settings** → **Webhooks** in your GitHub repository
2. Add webhook:
   - **Payload URL**: `http://<your-server>:3847/webhooks/github`
   - **Content type**: `application/json`
   - **Events**: Pull requests
3. Click **Add webhook**

---

## Configuration File

Create a config file at `.claude/reviews/config.json` in your project:

```json
{
  "github": false,
  "gitlab": true,
  "defaultModel": "opus",
  "reviewSkill": "review-front",
  "reviewFollowupSkill": "review-followup"
}
```

## Configuration Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `github` | boolean | Yes | Enable GitHub integration |
| `gitlab` | boolean | Yes | Enable GitLab integration |
| `defaultModel` | string | Yes | Default Claude model (`opus` or `sonnet`) |
| `reviewSkill` | string | Yes | Name of the skill to use for initial code reviews |
| `reviewFollowupSkill` | string | Yes | Name of the skill to use for follow-up reviews |

**Note**: Set either `github: true` or `gitlab: true`, not both.

---

## Skills Setup

Skills must be located in `.claude/skills/<skill-name>/SKILL.md` in your project.

### Directory Structure

```
your-project/
├── .claude/
│   ├── reviews/
│   │   └── config.json          # Review configuration
│   └── skills/
│       ├── review-front/        # Your review skill
│       │   └── SKILL.md
│       └── review-followup/     # Your follow-up skill
│           └── SKILL.md
```

### Skill File Format

Each skill must have a `SKILL.md` file with YAML frontmatter:

```markdown
---
name: review-front
description: Code review skill for frontend projects
---

# Your Skill Content

[Instructions for Claude...]
```

---

## Validation

When loading a project config, the dashboard validates:

1. Config file exists at `.claude/reviews/config.json`
2. Required fields are present (`github`, `gitlab`, `defaultModel`, `reviewSkill`, `reviewFollowupSkill`)
3. `reviewSkill` directory exists with `SKILL.md`
4. `reviewFollowupSkill` directory exists with `SKILL.md`

If validation fails, an error message is displayed with details.

---

## Examples

See the `/examples` directory for:

- `config.example.json` - Example configuration file
- `skills/review-example/` - Example review skill
- `skills/review-followup-example/` - Example follow-up skill
- `skills/TEMPLATE.md` - Skill template

---

## Loading in Dashboard

1. Open the Claude Review Dashboard at `http://localhost:3847`
2. Enter your project path (e.g., `/home/user/my-project`)
3. Click "Load" to load the configuration
4. The dashboard will:
   - Validate the config and skills
   - Display the active platform (GitHub CLI or GitLab CLI)
   - Show CLI authentication status
   - Apply the default model setting

The project path is saved in your browser's localStorage, so you don't need to re-enter it on page reload.
