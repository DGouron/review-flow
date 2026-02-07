---
title: "SPEC-003: Skill Templates"
scope: spec
related:
  - templates/SKILL.md.template
  - docs/REVIEW-SKILLS-GUIDE.md
last-updated: 2026-02-07
---

# SPEC-003: Skill Templates (EN/FR)

## User Story

As a developer wanting to create my own review skills,
I want ready-to-use skill templates in English and French,
so I can start quickly without building from scratch.

## Context

Current skills (review-front, review-followup) are specific to the MentorGoal project and contain:
- Hardcoded references (mentor-goal/main-app-v3)
- Project-specific business rules (Clean Architecture, DDD, etc.)
- A mix of technical commands and review logic

Templates must:
1. Be generic and adaptable
2. Use the new standardized markers (SPEC-001)
3. Clearly separate customizable sections

## Business Rules

- Templates available in `/templates/en/` and `/templates/fr/`
- Each template is a complete folder (SKILL.md + example config)
- Customizable sections are clearly marked with `<!-- CUSTOMIZE: ... -->`
- Templates use ONLY standardized markers (no direct `glab`/`gh` calls)

## Deliverables

### Template Structure

```
templates/
├── en/
│   ├── review-basic/
│   │   ├── SKILL.md
│   │   └── README.md
│   ├── review-with-agents/
│   │   ├── SKILL.md
│   │   └── README.md
│   └── followup-basic/
│       ├── SKILL.md
│       └── README.md
└── fr/
    ├── review-basic/
    │   ├── SKILL.md
    │   └── README.md
    ├── review-with-agents/
    │   ├── SKILL.md
    │   └── README.md
    └── followup-basic/
        ├── SKILL.md
        └── README.md
```

### Template: review-basic

Minimal review skill with:
- Diff analysis
- Basic issue detection
- Simple report
- Progress markers

### Template: review-with-agents

Advanced review skill with:
- Multiple agents (architecture, testing, code quality)
- Sequential execution (anti memory-leak)
- Scoring
- Inline comments

### Template: followup-basic

Follow-up skill with:
- Fix verification
- Thread replies (via markers)
- Thread resolution (via markers)
- Follow-up report

## Acceptance Criteria

### Scenario: Template works immediately

```gherkin
Given a developer copying templates/en/review-basic/ to their project
When they replace the <!-- CUSTOMIZE --> placeholders with their values
And they run a review
Then the review executes without errors
And progress markers are emitted correctly
```

### Scenario: No direct platform commands

```gherkin
Given a skill template
When searching for "glab" or "gh api" in the file
Then no occurrences are found
And only [THREAD_...] and [POST_COMMENT:...] markers are used
```

### Scenario: Customizable sections identified

```gherkin
Given the review-with-agents template
When reading the SKILL.md
Then each customizable section is marked <!-- CUSTOMIZE: description -->
And a list of possible customizations is at the beginning of the file
```

### Scenario: Explanatory README

```gherkin
Given a template
When reading its README.md
Then the template purpose is understood
And installation steps are visible
And a corresponding config.json example is shown
```

## Template Content

### review-basic (EN)

```markdown
---
name: review-basic
description: Basic code review skill template
---

# Basic Code Review

<!-- CUSTOMIZE: Describe your review persona and approach -->
You are a code reviewer focused on quality and maintainability.

## Activation

This skill activates when:
- User asks for "review", "code review"
- Triggered via webhook on MR/PR assignment

## Workflow

### Phase 1: Context

[PHASE:initializing]
[PROGRESS:context:started]

1. Identify the MR/PR from the provided number
2. Fetch the diff to analyze

[PROGRESS:context:completed]

### Phase 2: Analysis

[PHASE:agents-running]
[PROGRESS:analysis:started]

<!-- CUSTOMIZE: Add your review rules here -->
Check for:
- Code style issues
- Potential bugs
- Missing tests

[PROGRESS:analysis:completed]

### Phase 3: Report

[PHASE:synthesizing]
[PROGRESS:report:started]

Generate a summary with:
- Issues found (blocking/warnings/suggestions)
- Score out of 10

[PROGRESS:report:completed]

### Phase 4: Publish

[PHASE:publishing]

Post the report:
[POST_COMMENT:## Review Report\n\n<!-- Report content here -->]

[PHASE:completed]

[REVIEW_STATS:blocking=X:warnings=X:suggestions=X:score=X]
```

### followup-basic (EN)

```markdown
---
name: followup-basic
description: Basic follow-up review skill template
---

# Follow-up Review

## Workflow

### Phase 1: Context

[PHASE:initializing]
[PROGRESS:context:started]

Fetch previous review comments to identify blocking issues.

[PROGRESS:context:completed]

### Phase 2: Verification

[PHASE:agents-running]
[PROGRESS:verify:started]

For each blocking issue from the previous review:
- Check if the code was modified as requested
- Mark as FIXED or NOT FIXED

[PROGRESS:verify:completed]

### Phase 3: Thread Management

[PROGRESS:threads:started]

For each FIXED issue, reply and resolve the thread:

[THREAD_REPLY:THREAD_ID:✅ **Fixed** - Brief description of what was done.]
[THREAD_RESOLVE:THREAD_ID]

For NOT FIXED issues, reply without resolving:

[THREAD_REPLY:THREAD_ID:❌ **Not fixed** - The issue still persists.]

[PROGRESS:threads:completed]

### Phase 4: Report

[PHASE:synthesizing]
[PROGRESS:report:started]

Generate follow-up summary.

[PROGRESS:report:completed]

### Phase 5: Publish

[PHASE:publishing]

[POST_COMMENT:## Follow-up Review\n\nFixed: X/Y blocking issues]

[PHASE:completed]

[REVIEW_STATS:blocking=X:warnings=0:suggestions=0:score=X]
```

## Out of Scope

- Templates for specific frameworks (React, Vue, etc.)
- Templates with predefined business logic (DDD, Clean Architecture)
- Automatic template translation

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | ✅ | Depends on SPEC-001 for markers |
| Negotiable | ✅ | Template content is flexible |
| Valuable | ✅ | Accelerates adoption |
| Estimable | ✅ | ~1 day |
| Small | ✅ | 3 templates x 2 languages |
| Testable | ✅ | Templates must execute without errors |
