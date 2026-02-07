---
title: Target Architecture
scope: architecture
related:
  - docs/ARCHITECTURE.md
  - src/entities/
  - src/usecases/
  - src/interface-adapters/
last-updated: 2026-02-07
---

# Target Architecture - Clean Architecture

## Layer Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRAMEWORKS & DRIVERS                           │
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Fastify   │  │   p-queue   │  │  Claude CLI │  │  glab / gh  │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                             │
│  src/frameworks/                                                            │
│  ├── claude/         # Claude CLI wrapper                                   │
│  ├── queue/          # p-queue adapter                                      │
│  ├── config/         # Config loader                                        │
│  ├── logging/        # Log buffer                                           │
│  └── settings/       # Runtime settings                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            INTERFACE ADAPTERS                               │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                          CONTROLLERS                                 │   │
│  │  webhook/           http/              websocket/                    │   │
│  │  ├── gitlab         ├── health         └── progress                  │   │
│  │  └── github         ├── reviews                                      │   │
│  │                     ├── stats                                        │   │
│  │                     └── mrTracking                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                           PRESENTERS                                 │   │
│  │  reviewAction.presenter.ts      # stdout → ReviewAction[]            │   │
│  │  reviewOutput.presenter.ts      # stdout → ReviewStats               │   │
│  │  statsSummary.presenter.ts      # ProjectStats → ViewModel           │   │
│  │  jobStatus.presenter.ts         # Job → ViewModel                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                            GATEWAYS                                  │   │
│  │                                                                      │   │
│  │  cli/                          fileSystem/                           │   │
│  │  ├── command.cli.gateway       ├── reviewStats.fileSystem            │   │
│  │  └── reviewAction.cli.gateway  ├── reviewFile.fileSystem             │   │
│  │                                └── reviewRequestTracking.fileSystem  │   │
│  │                                                                      │   │
│  │  api/                                                                │   │
│  │  ├── threadFetch.gitlab.gateway                                      │   │
│  │  └── threadFetch.github.gateway                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                            ADAPTERS (ACL)                            │   │
│  │  reviewAction.gitlab.adapter   # ReviewAction → glab command         │   │
│  │  reviewAction.github.adapter   # ReviewAction → gh command           │   │
│  │  gitlabMergeRequest.adapter    # GitLab MR → ReviewRequest           │   │
│  │  githubPullRequest.adapter     # GitHub PR → ReviewRequest           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                            SERVICES                                  │   │
│  │  reviewContextWatcher.service.ts  # Polling service                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USE CASES                                      │
│                                                                             │
│  src/usecases/                                                              │
│  ├── triggerReview.usecase.ts           # Trigger a review                  │
│  ├── executeInitialReview.usecase.ts    # Execute initial review            │
│  ├── executeFollowUpReview.usecase.ts   # Execute follow-up review          │
│  ├── addReviewStats.usecase.ts          # Add stats after review            │
│  ├── cancelReview.usecase.ts            # Cancel a review                   │
│  └── handleReviewRequestPush.usecase.ts # Handle push on MR                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                               ENTITIES                                      │
│                                                                             │
│  src/entities/    Each: types + schema + guard + gateway (port)              │
│  ├── reviewAction/       # Actions on MR (ReviewAction union)               │
│  ├── reviewStats/        # Statistics (ReviewStats, ProjectStats)            │
│  ├── actionExecution/    # ExecutionContext, ExecutionResult                 │
│  ├── reviewContext/      # Review context                                   │
│  ├── reviewRequest/      # Abstract MR/PR                                   │
│  ├── review/             # Review and scoring                               │
│  └── threadFetch/        # Fetch threads                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow: Initial Review

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   GitLab     │     │  Controller  │     │   Use Case   │     │   Gateway    │
│   Webhook    │────►│  (gitlab)    │────►│  trigger     │────►│  (queue)     │
└──────────────┘     └──────────────┘     │  Review      │     └──────────────┘
                                          └──────────────┘
                                                 │
                                                 ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   GitLab     │     │   Gateway    │     │   Use Case   │     │  Framework   │
│   API        │◄────│  (CLI)       │◄────│  execute     │◄────│  (Claude)    │
└──────────────┘     │  reviewAction│     │  Initial     │     └──────────────┘
                     └──────────────┘     │  Review      │
                                          └──────────────┘
                                                 │
                                                 ▼
                                          ┌──────────────┐     ┌──────────────┐
                                          │   Use Case   │     │   Gateway    │
                                          │   addReview  │────►│  (fileSystem)│
                                          │   Stats      │     └──────────────┘
                                          └──────────────┘
```

## Data Flow: Follow-Up Review

Same pattern as Initial Review, triggered by Push Event. Controller checks `state == pending-fix && openThreads > 0` before dispatching to `executeFollowUpReview` use case. Context is loaded from context file instead of being freshly created.

## ReviewAction: Unified Concept

`ReviewAction` is a discriminated union: `THREAD_REPLY` (threadId, message), `THREAD_RESOLVE` (threadId), `POST_COMMENT` (body), `ADD_LABEL` (label), `FETCH_THREADS`. Extensible by adding new types.

## ReviewAction Execution Pattern

```
ReviewActionGateway (interface)
  execute(actions: ReviewAction[], context: ExecutionContext) → ExecutionResult
        │
        ▼
ReviewActionCliGateway (implementation)
        │
   ┌────┴────┐
   ▼         ▼
PlatformAdapter (interface)    CommandExecutorGateway (interface)
  buildCommand(action,           execute(command, args, cwd)
    projectPath, mrNumber)
   │         │                            │
   ▼         ▼                            ▼
GitLab    GitHub                   CLI (execSync)
Adapter   Adapter
```

## Target Folder Structure

```
src/
├── main/                  # Composition root (server, DI, routes, websocket)
├── entities/              # Enterprise Business Rules (reviewAction, reviewStats, etc.)
├── usecases/              # Application Business Rules (trigger, execute, stats)
├── interface-adapters/    # Controllers, Presenters, Gateways, Adapters (ACL)
├── frameworks/            # Frameworks & Drivers (claude, queue, config, logging)
├── shared/                # Cross-cutting concerns (foundation)
├── config/                # (legacy, → frameworks/)
├── security/              # (legacy, → interface-adapters/)
└── server.ts              # (legacy, → main/)
```

**Dependency Rule**: Dependencies ALWAYS point inward (Frameworks → Interface Adapters → Use Cases → Entities).

## Migration Backlog

| Ticket | Description | Dependencies |
|--------|-------------|--------------|
| BACKLOG-010 | Create /frameworks/ | - |
| BACKLOG-011a | Unify ReviewAction entity | - |
| BACKLOG-011b | Create ReviewActionGateway | 011a |
| BACKLOG-011c | Split statsService | - |
| BACKLOG-011d | Migrate reviewContextWatcher | - |
| BACKLOG-011e | Delete /services/ | 010, 011a-d, 013 |
| BACKLOG-013 | Split mrTrackingService | 010 |
