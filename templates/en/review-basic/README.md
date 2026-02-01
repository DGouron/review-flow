# review-basic

A minimal code review skill template for claude-review-automation.

## Overview

This template provides a basic structure for code reviews with:
- Single-pass analysis
- Standard issue categorization (blocking/warning/suggestion)
- Simple report format
- Standardized markers for automation

## Installation

1. Copy this folder to your project:
   ```bash
   cp -r templates/en/review-basic .claude/skills/my-review
   ```

2. Rename the skill in `SKILL.md` frontmatter:
   ```yaml
   ---
   name: my-review
   description: Code review for my project
   ---
   ```

3. Customize the review rules in the `<!-- CUSTOMIZE: -->` sections

4. Add to your project config (`.claude/reviews/config.json`):
   ```json
   {
     "github": true,
     "gitlab": false,
     "reviewSkill": "my-review"
   }
   ```

## Customization

Look for `<!-- CUSTOMIZE: -->` comments in `SKILL.md`:

1. **Reviewer persona**: Define who the reviewer is
2. **Review checklist**: Add project-specific rules
3. **Analysis categories**: Customize what to check for

## Markers Used

| Marker | Purpose |
|--------|---------|
| `[PHASE:...]` | Track review phase |
| `[PROGRESS:...:started/completed]` | Track step progress |
| `[POST_COMMENT:...]` | Post review comment |
| `[REVIEW_STATS:...]` | Report statistics |

## Example Config

```json
{
  "github": false,
  "gitlab": true,
  "defaultModel": "sonnet",
  "reviewSkill": "my-review",
  "agents": [
    { "name": "context", "displayName": "Context" },
    { "name": "analysis", "displayName": "Analysis" },
    { "name": "report", "displayName": "Report" }
  ]
}
```

## See Also

- [REVIEW-SKILLS-GUIDE.md](../../../docs/REVIEW-SKILLS-GUIDE.md) - Full documentation
- [MARKERS-REFERENCE.md](../../../docs/MARKERS-REFERENCE.md) - Markers reference
