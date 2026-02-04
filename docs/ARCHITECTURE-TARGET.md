# Architecture Cible - Clean Architecture

## Vue d'ensemble des couches

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
│  src/entities/                                                              │
│  ├── reviewAction/                    # Actions on MR                       │
│  │   ├── reviewAction.ts              # Types: ReviewAction union           │
│  │   ├── reviewAction.schema.ts       # Zod schemas                         │
│  │   ├── reviewAction.guard.ts        # Validation                          │
│  │   └── reviewAction.gateway.ts      # Interface (port)                    │
│  │                                                                          │
│  ├── reviewStats/                     # Review statistics                   │
│  │   ├── reviewStats.ts               # Types: ReviewStats, ProjectStats    │
│  │   ├── reviewStats.schema.ts        # Zod schemas                         │
│  │   ├── reviewStats.guard.ts         # Validation                          │
│  │   ├── reviewStats.gateway.ts       # Interface (port)                    │
│  │   └── reviewStats.factory.ts       # Factories                           │
│  │                                                                          │
│  ├── actionExecution/                 # Execution context                   │
│  │   └── executionContext.ts          # ExecutionContext, ExecutionResult   │
│  │                                                                          │
│  ├── reviewContext/                   # Review context (existing)           │
│  ├── reviewRequest/                   # Abstract MR/PR (existing)           │
│  ├── review/                          # Review and scoring (existing)       │
│  └── threadFetch/                     # Fetch threads (existing)            │
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

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Push       │     │  Controller  │     │   Use Case   │
│   Event      │────►│  (webhook)   │────►│  handle      │
└──────────────┘     └──────────────┘     │  Push        │
                                          └──────────────┘
                                                 │
                                          ┌──────┴──────┐
                                          │ Check state │
                                          │ openThreads │
                                          └──────┬──────┘
                                                 │
                                                 ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   GitLab     │     │   Gateway    │     │   Use Case   │     │   Gateway    │
│   API        │◄────│  (CLI)       │◄────│  execute     │◄────│  (context    │
└──────────────┘     │  reviewAction│     │  FollowUp    │     │   file)      │
                     └──────────────┘     │  Review      │     └──────────────┘
                                          └──────────────┘
```

## ReviewAction: Unified Concept

```
                    ReviewAction (entity)
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ THREAD_REPLY  │  │ THREAD_RESOLVE│  │ POST_COMMENT  │
│ threadId      │  │ threadId      │  │ body          │
│ message       │  │               │  │               │
└───────────────┘  └───────────────┘  └───────────────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ ADD_LABEL     │  │ FETCH_THREADS │  │ (extensible)  │
│ label         │  │               │  │               │
└───────────────┘  └───────────────┘  └───────────────┘
```

## ReviewAction Execution Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ReviewActionGateway (interface)                      │
│                                                                             │
│  execute(actions: ReviewAction[], context: ExecutionContext)                │
│    → ExecutionResult { total, succeeded, failed, skipped }                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ReviewActionCliGateway (implementation)                  │
│                                                                             │
│  constructor(                                                               │
│    gitlabAdapter: ReviewActionPlatformAdapter,                              │
│    githubAdapter: ReviewActionPlatformAdapter,                              │
│    commandExecutor: CommandExecutorGateway                                  │
│  )                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              │                                               │
              ▼                                               ▼
┌─────────────────────────────┐             ┌─────────────────────────────┐
│  ReviewActionPlatformAdapter │             │  CommandExecutorGateway     │
│  (interface)                 │             │  (interface)                │
│                              │             │                             │
│  buildCommand(               │             │  execute(                   │
│    action: ReviewAction,     │             │    command: string,         │
│    projectPath: string,      │             │    args: string[],          │
│    mrNumber: number          │             │    cwd: string              │
│  ): CommandSpec | null       │             │  ): void                    │
└─────────────────────────────┘             └─────────────────────────────┘
              │                                               │
      ┌───────┴───────┐                                       │
      │               │                                       │
      ▼               ▼                                       ▼
┌───────────┐   ┌───────────┐                      ┌─────────────────────┐
│  GitLab   │   │  GitHub   │                      │  CLI Implementation │
│  Adapter  │   │  Adapter  │                      │  (execSync)         │
└───────────┘   └───────────┘                      └─────────────────────┘
```

## Structure des dossiers cible

```
src/
├── main/                           # Composition root
│   ├── server.ts                   # Bootstrap Fastify
│   ├── dependencies.ts             # DI container
│   ├── routes.ts                   # Route registry
│   └── websocket.ts                # WebSocket setup
│
├── entities/                       # Enterprise Business Rules
│   ├── reviewAction/
│   ├── reviewStats/
│   ├── actionExecution/
│   ├── reviewContext/
│   ├── reviewRequest/
│   ├── review/
│   └── threadFetch/
│
├── usecases/                       # Application Business Rules
│   ├── triggerReview.usecase.ts
│   ├── executeInitialReview.usecase.ts
│   ├── executeFollowUpReview.usecase.ts
│   ├── addReviewStats.usecase.ts
│   └── handleReviewRequestPush.usecase.ts
│
├── interface-adapters/             # Controllers, Presenters, Gateways
│   ├── controllers/
│   │   ├── webhook/
│   │   └── http/
│   ├── presenters/
│   ├── gateways/
│   │   ├── cli/
│   │   ├── fileSystem/
│   │   └── api/
│   ├── adapters/
│   ├── services/
│   └── views/
│
├── frameworks/                     # Frameworks & Drivers
│   ├── claude/
│   ├── queue/
│   ├── config/
│   ├── logging/
│   └── settings/
│
├── shared/                         # Cross-cutting concerns
│   └── foundation/
│
├── config/                         # Config files (legacy, → frameworks/)
├── security/                       # Security (legacy, → interface-adapters/)
└── server.ts                       # Entry point (legacy, → main/)
```

## Dependency Rule

```
    Frameworks & Drivers
            │
            ▼
    Interface Adapters
            │
            ▼
        Use Cases
            │
            ▼
        Entities

Dependencies ALWAYS point inward (toward Entities).
```

## Backlog de migration

| Ticket | Description | Dependencies |
|--------|-------------|--------------|
| BACKLOG-010 | Create /frameworks/ | - |
| BACKLOG-011a | Unify ReviewAction entity | - |
| BACKLOG-011b | Create ReviewActionGateway | 011a |
| BACKLOG-011c | Split statsService | - |
| BACKLOG-011d | Migrate reviewContextWatcher | - |
| BACKLOG-011e | Delete /services/ | 010, 011a-d, 013 |
| BACKLOG-013 | Split mrTrackingService | 010 |
