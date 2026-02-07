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

Both review types produce `ReviewAction[]` as output. The difference is in the **intention**, not the action types:

| Aspect | InitialReview | FollowUpReview |
|--------|---------------|----------------|
| **Input** | stdout from Claude skill | ReviewContext file |
| **Parser** | `reviewAction.presenter.ts` | Reads context directly |
| **Focus** | Find all issues | Verify fixes were applied |
| **Typical actions** | POST_COMMENT, ADD_LABEL | THREAD_RESOLVE, POST_COMMENT |

**Key insight**: The distinction lives in the **Use Case layer**, not in the entity types. Both use the same `ReviewAction` entity and the same `ReviewActionGateway` for execution.

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

### ReviewRequestState
Encapsulates the state machine for ReviewRequest tracking. Validates transitions and provides helper methods.

```typescript
const state = ReviewRequestState.pendingReview();
if (state.canTransitionTo('pending-fix')) {
  const newState = state.transitionTo('pending-fix');
}
```

### ReviewScore
Encapsulates review metrics with computed severity.

```typescript
const score = ReviewScore.create({ blocking: 1, warnings: 2, suggestions: 3 });
score.severity; // 'critical'
score.toString(); // '1B/2W/3S'
```

### Duration
Encapsulates time durations with formatting.

```typescript
const duration = Duration.fromMilliseconds(125000);
duration.formatted; // '2m 5s'
```

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

### Webhook Events (External)
- `merge_request` (GitLab) / `pull_request` (GitHub): ReviewRequest changes
- `push` (GitLab) / `push` (GitHub): New commits on branch

### Domain Events (Internal)
- `ReviewRequested`: Initial review triggered
- `FollowupRequested`: Followup review triggered
- `ReviewCompleted`: Review finished successfully
- `ReviewFailed`: Review encountered an error
- `ThreadsUpdated`: Thread counts changed

## Abbreviations (Usage Rules)

| Abbreviation | Full Term | When to Use |
|--------------|-----------|-------------|
| MR | MergeRequest | Only in GitLab-specific contexts (logs, API calls) |
| PR | PullRequest | Only in GitHub-specific contexts (logs, API calls) |
| VO | Value Object | Technical documentation only |
| ACL | Anti-Corruption Layer | Technical documentation only |

**Rule**: In domain code, always use full terms (`ReviewRequest`, not `MR` or `PR`).

## Architecture Patterns

### Gateway Pattern
Interfaces that abstract external dependencies (filesystem, APIs).

| Gateway | Responsibility | Location |
|---------|----------------|----------|
| ReviewRequestTrackingGateway | MR/PR tracking persistence | `entities/` (interface) → `interface-adapters/gateways/fileSystem/` (impl) |
| ReviewStatsGateway | Project statistics persistence | `entities/reviewStats/` (interface) → `interface-adapters/gateways/fileSystem/` (impl) |
| ReviewFileGateway | Review files CRUD operations | `entities/` (interface) → `interface-adapters/gateways/fileSystem/` (impl) |
| ReviewActionGateway | Execute actions on MR via CLI | `entities/reviewAction/` (interface) → `interface-adapters/gateways/cli/` (impl) |
| CommandExecutorGateway | Low-level CLI command execution | `entities/command/` (interface) → `interface-adapters/gateways/cli/` (impl) |

### Platform Adapters (ACL)
Adapters that build platform-specific commands from domain actions.

| Adapter | Translation |
|---------|-------------|
| ReviewActionGitLabAdapter | ReviewAction → glab API command |
| ReviewActionGitHubAdapter | ReviewAction → gh API command |

### Anti-Corruption Layer (ACL)
Adapters that translate external platform concepts to domain concepts.

| Adapter | Translation |
|---------|-------------|
| GitLabMergeRequestAdapter | GitLab MR → ReviewRequest |
| GitHubPullRequestAdapter | GitHub PR → ReviewRequest |
| PlatformAdapter | Unified translation with validation |

### Use Cases
Business logic orchestration functions.

| UseCase | Purpose |
|---------|---------|
| triggerReview | Enqueue a new review job |
| handleReviewRequestPush | Trigger followup if conditions met |
| cancelReview | Cancel a running/queued review |
