---
title: Ubiquitous Language
scope: reference
related:
  - src/entities/
  - docs/ARCHITECTURE-TARGET.md
last-updated: 2026-02-07
---

# Ubiquitous Language - Code Review Automation

## Core Domain Concepts

### ReviewRequest
**Definition**: A request to review code changes before merging into a target branch.
**Platforms**: GitLab calls this "MergeRequest", GitHub calls this "PullRequest".
**Internal usage**: Always use `ReviewRequest` in domain code.

### ReviewAction
**Definition**: An atomic action to execute on a ReviewRequest via platform CLI (glab/gh).
**Types**: `THREAD_REPLY`, `THREAD_RESOLVE`, `POST_COMMENT`, `ADD_LABEL`, `FETCH_THREADS`
**Important**: This is a **unified concept**. Both Initial Review and Follow-Up Review produce `ReviewAction[]`.
**Location**: `entities/reviewAction/`

### ExecutionContext
**Definition**: The context needed to execute ReviewActions on a specific platform.
**Contains**: `platform`, `projectPath`, `mrNumber`, `localPath`
**Location**: `entities/actionExecution/`

### ExecutionResult
**Definition**: The result of executing a batch of ReviewActions.
**Contains**: `total`, `succeeded`, `failed`, `skipped`
**Location**: `entities/actionExecution/`

### ReviewJob
**Definition**: A scheduled unit of work representing one code review execution.
**States**: `queued` → `running` → `completed` | `failed` | `cancelled`
**Identity**: Unique `jobId` generated at creation.

### ReviewRequestTracking
**Definition**: The lifecycle tracking of a ReviewRequest across multiple reviews.
**States**: `pending-review` → `pending-fix` → `pending-approval` → `approved` → `merged` | `closed`

### Thread
**Definition**: A code comment discussion that requires resolution.
**Synonyms**: GitLab "discussion", GitHub "review comment".
**Metric**: `openThreads` = unresolved discussions count.

### FollowupReview
**Definition**: A subsequent review triggered after the author pushes new commits to address previous feedback.
**Trigger condition**: Push on ReviewRequest with `openThreads > 0` and state `pending-fix`.
**Difference from initial review**: Uses "review-followup" skill, focuses on addressed issues.

## Platform Mapping

| Domain Term | GitLab Term | GitHub Term |
|-------------|-------------|-------------|
| ReviewRequest | MergeRequest (MR) | PullRequest (PR) |
| reviewRequestNumber | iid | number |
| Thread | Discussion | Review Comment |
| Author | Author | User |
| Reviewer | Reviewer | Requested Reviewer |
| Assignee | Assignee | Assignee |

## State Machines

### ReviewJob States
```
queued ──→ running ──→ completed
              │
              ├──→ failed
              │
              └──→ cancelled
```

### ReviewRequestTracking States
```
pending-review ──→ pending-fix ──→ pending-approval ──→ approved ──→ merged
      │                │                  │               │
      └────────────────┴──────────────────┴───────────────┴──→ closed
```

### Valid State Transitions

| From | Can transition to |
|------|-------------------|
| pending-review | pending-fix, pending-approval, closed |
| pending-fix | pending-review, pending-approval, closed |
| pending-approval | approved, pending-fix, closed |
| approved | merged, closed |
| merged | (terminal) |
| closed | (terminal) |

## Review Types

| Type | Trigger | Skill | Purpose |
|------|---------|-------|---------|
| Initial Review | ReviewRequest assigned to Claude | `review` | Full code review |
| Followup Review | Push on ReviewRequest with open threads | `review-followup` | Review of fixes |

### InitialReview vs FollowUpReview

Both produce `ReviewAction[]`. The distinction lives in the **Use Case layer**: initial reviews find all issues, followup reviews verify fixes. Both use the same `ReviewAction` entity and `ReviewActionGateway` for execution.

## Scoring

### ReviewScore Components
- **blocking**: Issues that must be fixed before merge (errors, security issues)
- **warnings**: Issues that should be addressed (code smells, minor issues)
- **suggestions**: Optional improvements (style, performance)

### Severity Levels
- **critical**: `blocking > 0`
- **warning**: `blocking = 0 && warnings > 0`
- **info**: `blocking = 0 && warnings = 0 && suggestions > 0`
- **clean**: No issues found

## Value Objects

| Value Object | Purpose | Location |
|-------------|---------|----------|
| `ReviewRequestState` | State machine for ReviewRequest tracking, validates transitions | `entities/reviewRequest/` |
| `ReviewScore` | Review metrics with computed severity (`critical`/`warning`/`info`/`clean`) | `entities/review/` |
| `Duration` | Time duration with formatting (`2m 5s`) | `entities/` |

## Agents

Claude review uses specialized agents for different aspects:

| Agent | Focus |
|-------|-------|
| clean-architecture | Architecture layer violations |
| ddd | Domain-driven design patterns |
| solid | SOLID principles adherence |
| testing | Test coverage and quality |
| code-quality | General code quality |
| react-best-practices | React/frontend specific |

## Events

**Webhook (External)**: `merge_request`/`pull_request` (ReviewRequest changes), `push` (new commits).

**Domain (Internal)**: `ReviewRequested`, `FollowupRequested`, `ReviewCompleted`, `ReviewFailed`, `ThreadsUpdated`.

## Abbreviations

MR (MergeRequest), PR (PullRequest), VO (Value Object), ACL (Anti-Corruption Layer) — only in platform-specific or technical documentation contexts. In domain code, always use full terms.

## Architecture Patterns

For the full architecture with gateways, adapters, ACLs, and use cases, see [ARCHITECTURE-TARGET.md](./ARCHITECTURE-TARGET.md).
