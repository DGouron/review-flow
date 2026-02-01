# review-with-agents

An advanced code review skill with multiple sequential agents.

## Overview

This template provides a multi-agent review structure:
- Sequential execution to prevent memory issues
- Each agent focuses on one aspect
- Individual scores per agent
- Real-time progress tracking via dashboard

## Installation

1. Copy this folder to your project:
   ```bash
   cp -r templates/en/review-with-agents .claude/skills/my-review
   ```

2. Rename the skill in `SKILL.md` frontmatter

3. Customize agents in `<!-- CUSTOMIZE: -->` sections

4. Configure agents in `.claude/reviews/config.json`:
   ```json
   {
     "reviewSkill": "my-review",
     "agents": [
       { "name": "architecture", "displayName": "Architecture" },
       { "name": "testing", "displayName": "Testing" },
       { "name": "code-quality", "displayName": "Code Quality" }
     ]
   }
   ```

## Adding/Removing Agents

To add a new agent:

1. Add a new section in `SKILL.md`:
   ```markdown
   #### Agent X: [Name]

   ```
   [PROGRESS:agent-name:started]
   ```

   [Analysis instructions]

   ```
   [PROGRESS:agent-name:completed]
   ```
   ```

2. Update the `agents` array in config.json

3. Update the synthesis section to include the new agent

## Memory Management

The sequential architecture is critical:
- **Never run agents in parallel**
- Each agent must complete before the next starts
- This prevents memory spikes (2GB vs 17GB)

## Markers Used

| Marker | Purpose |
|--------|---------|
| `[PHASE:...]` | Track review phase |
| `[PROGRESS:agent:started/completed]` | Track each agent |
| `[POST_COMMENT:...]` | Post final report |
| `[REVIEW_STATS:...]` | Report statistics |

## See Also

- [review-basic](../review-basic/) - Simpler single-pass template
- [REVIEW-SKILLS-GUIDE.md](../../../docs/REVIEW-SKILLS-GUIDE.md)
