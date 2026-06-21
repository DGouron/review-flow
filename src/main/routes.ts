import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

import { findRepositoryByProjectPath } from '@/config/loader.js';
import { loadProjectConfig } from '@/config/projectConfig.js';
import { defaultProcessRunner, buildMcpConfigJson } from '@/frameworks/claude/claudeInvoker.js';
import {
  createDefaultClaudeInvokerDependencies,
  type ClaudeInvokerDependencies,
} from '@/frameworks/claude/claudeInvoker.js';
import {
  enrichSingleRepository,
  resolveActiveConfigPath,
} from '@/frameworks/config/configLoader.js';
import {
  cancelJob,
  createJobId,
  getJobStatus,
  enqueueReview,
  getJobsStatus,
  setProjectConcurrencyCap,
  setGlobalConcurrency,
  getRunningCount,
  getTotalCapacity,
} from '@/frameworks/queue/pQueueAdapter.js';
import {
  getDefaultLanguage,
  getModel,
  getTriggerMode,
  getWorktreeStaleThresholdHours,
  setTriggerMode,
} from '@/frameworks/settings/runtimeSettings.js';
import type { Dependencies } from '@/main/dependencies.js';
import { buildExecuteReview, buildGitHubInventoryGateway } from '@/main/executeReviewWiring.js';
import { registerWebSocketRoutes } from '@/main/websocket.js';
import {
  broadcastBudgetExceeded,
  broadcastBudgetStatus,
  broadcastPendingChanged,
} from '@/main/websocket.js';
import { broadcastBackfillProgress } from '@/main/websocket.js';
import { ClaudeSessionCliGateway } from '@/modules/claude-invocation/interface-adapters/gateways/claudeSession.cli.gateway.js';
import { ProcessEnvironmentGateway } from '@/modules/claude-invocation/interface-adapters/gateways/environment.process.gateway.js';
import { cliStatusRoutes } from '@/modules/cli-configuration/interface-adapters/controllers/http/cliStatus.routes.js';
import { healthRoutes } from '@/modules/cli-configuration/interface-adapters/controllers/http/health.routes.js';
import { logsRoutes } from '@/modules/cli-configuration/interface-adapters/controllers/http/logs.routes.js';
import { projectConfigRoutes } from '@/modules/cli-configuration/interface-adapters/controllers/http/projectConfig.routes.js';
import { repositoriesRoutes } from '@/modules/cli-configuration/interface-adapters/controllers/http/repositories.routes.js';
import { settingsRoutes } from '@/modules/cli-configuration/interface-adapters/controllers/http/settings.routes.js';
import { versionRoutes } from '@/modules/cli-configuration/interface-adapters/controllers/http/version.routes.js';
import { InstallTypeDetectorFsGateway } from '@/modules/cli-configuration/interface-adapters/gateways/installTypeDetector.fs.gateway.js';
import { NpmPackageVersionGateway } from '@/modules/cli-configuration/interface-adapters/gateways/packageVersion.npm.gateway.js';
import { ProjectConfigFileSystemGateway } from '@/modules/cli-configuration/interface-adapters/gateways/projectConfig.fileSystem.gateway.js';
import { RepositoriesListRuntimeConfigGateway } from '@/modules/cli-configuration/interface-adapters/gateways/repositoriesList.runtimeConfig.gateway.js';
import { SelfUpdateCliGateway } from '@/modules/cli-configuration/interface-adapters/gateways/selfUpdate.cli.gateway.js';
import { VersionCacheMemoryGateway } from '@/modules/cli-configuration/interface-adapters/gateways/versionCache.memory.gateway.js';
import { AddRepositoriesToConfigUseCase } from '@/modules/cli-configuration/usecases/cli/addRepositoriesToConfig.usecase.js';
import { RemoveRepositoryFromConfigUseCase } from '@/modules/cli-configuration/usecases/cli/removeRepositoryFromConfig.usecase.js';
import { ToggleRepositoryEnabledUseCase } from '@/modules/cli-configuration/usecases/cli/toggleRepositoryEnabled.usecase.js';
import { AddRepositoryFromDashboardUseCase } from '@/modules/cli-configuration/usecases/dashboardRepositories/addRepositoryFromDashboard.usecase.js';
import { RemoveRepositoryFromDashboardUseCase } from '@/modules/cli-configuration/usecases/dashboardRepositories/removeRepositoryFromDashboard.usecase.js';
import { UpdateRepositoryEnabledFromDashboardUseCase } from '@/modules/cli-configuration/usecases/dashboardRepositories/updateRepositoryEnabledFromDashboard.usecase.js';
import { RecomputeGlobalConcurrencyUseCase } from '@/modules/cli-configuration/usecases/projectConfig/recomputeGlobalConcurrency.usecase.js';
import { UpdateProjectConfigUseCase } from '@/modules/cli-configuration/usecases/projectConfig/updateProjectConfig.usecase.js';
import { checkVersion } from '@/modules/cli-configuration/usecases/version/checkVersion.usecase.js';
import { triggerSelfUpdate } from '@/modules/cli-configuration/usecases/version/triggerSelfUpdate.usecase.js';
import { cleanupRoutes } from '@/modules/data-lifecycle/interface-adapters/controllers/http/cleanup.routes.js';
import { emberChatRoutes } from '@/modules/ember-chat/interface-adapters/controllers/http/emberChat.routes.js';
import { EmberAnswerTransportClaudeGateway } from '@/modules/ember-chat/interface-adapters/gateways/emberAnswerTransport.claude.gateway.js';
import { EmberMemoryFileSystemGateway } from '@/modules/ember-chat/interface-adapters/gateways/emberMemory.fileSystem.gateway.js';
import { EmberReadDataCompositeGateway } from '@/modules/ember-chat/interface-adapters/gateways/emberReadData.composite.gateway.js';
import { defaultEgressScanConfig } from '@/modules/platform-integration/entities/egressScan/egressScan.defaults.js';
import { createEgressScanner } from '@/modules/platform-integration/entities/egressScan/egressScan.scanner.js';
import {
  handleGitHubWebhook,
  buildGitHubReviewProcessor,
} from '@/modules/platform-integration/interface-adapters/controllers/webhook/github.controller.js';
import {
  handleGitLabWebhook,
  buildGitLabReviewProcessor,
} from '@/modules/platform-integration/interface-adapters/controllers/webhook/gitlab.controller.js';
import { transportGuardMiddleware } from '@/modules/platform-integration/interface-adapters/controllers/webhook/transportGuard.middleware.js';
import { GitHubApprovalRevocationCliGateway } from '@/modules/platform-integration/interface-adapters/gateways/cli/approvalRevocation.github.cli.gateway.js';
import { GitLabApprovalRevocationCliGateway } from '@/modules/platform-integration/interface-adapters/gateways/cli/approvalRevocation.gitlab.cli.gateway.js';
import { GitHubNoteCommentPostCliGateway } from '@/modules/platform-integration/interface-adapters/gateways/cli/noteCommentPost.github.cli.gateway.js';
import { GitLabNoteCommentPostCliGateway } from '@/modules/platform-integration/interface-adapters/gateways/cli/noteCommentPost.gitlab.cli.gateway.js';
import { GitHubDiffMetadataFetchGateway } from '@/modules/platform-integration/interface-adapters/gateways/diffMetadataFetch.github.gateway.js';
import { GitLabDiffMetadataFetchGateway } from '@/modules/platform-integration/interface-adapters/gateways/diffMetadataFetch.gitlab.gateway.js';
import { EgressScannedNoteCommentPostGateway } from '@/modules/platform-integration/interface-adapters/gateways/egressScanned.noteCommentPost.gateway.js';
import { InMemoryIdempotencyStore } from '@/modules/platform-integration/interface-adapters/gateways/inMemoryIdempotencyStore.gateway.js';
import { LoggerEgressTraceGateway } from '@/modules/platform-integration/interface-adapters/gateways/loggerEgressTrace.gateway.js';
import { GitLabMemberAccessCliGateway } from '@/modules/platform-integration/interface-adapters/gateways/memberAccess.gitlab.cli.gateway.js';
import {
  GitHubThreadFetchGateway,
  defaultGitHubExecutor,
} from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.github.gateway.js';
import {
  GitLabThreadFetchGateway,
  defaultGitLabExecutor,
} from '@/modules/platform-integration/interface-adapters/gateways/threadFetch.gitlab.gateway.js';
import { ForwardedForClientIpResolver } from '@/modules/platform-integration/interface-adapters/gateways/transport/clientIpResolver.forwardedFor.gateway.js';
import { IsTrustedActorUseCase } from '@/modules/platform-integration/usecases/isTrustedActor.usecase.js';
import { processWebhook } from '@/modules/platform-integration/usecases/processWebhook.usecase.js';
import { pendingReviewsRoutes } from '@/modules/review-execution/interface-adapters/controllers/http/pendingReviews.routes.js';
import { reviewRoutes } from '@/modules/review-execution/interface-adapters/controllers/http/reviews.routes.js';
import { PendingReviewRequestFileSystemGateway } from '@/modules/review-execution/interface-adapters/gateways/pendingReviewRequest.fileSystem.gateway.js';
import { ReviewContextFileSystemGateway } from '@/modules/review-execution/interface-adapters/gateways/reviewContext.fileSystem.gateway.js';
import { GitLabThreadInventoryGateway } from '@/modules/review-execution/interface-adapters/gateways/threadInventory.gitlab.gateway.js';
import { PendingReviewPresenter } from '@/modules/review-execution/interface-adapters/presenters/pendingReview.presenter.js';
import { ProcessorRegistry } from '@/modules/review-execution/services/processorRegistry.js';
import { ConfirmPendingReviewUseCase } from '@/modules/review-execution/usecases/confirmPendingReview.usecase.js';
import { DismissPendingReviewUseCase } from '@/modules/review-execution/usecases/dismissPendingReview.usecase.js';
import { GateClaudeInvocationUseCase } from '@/modules/review-execution/usecases/gateClaudeInvocation.usecase.js';
import {
  handleClose,
  type HandleClose,
} from '@/modules/review-execution/usecases/handleClose.usecase.js';
import { ListPendingReviewsUseCase } from '@/modules/review-execution/usecases/listPendingReviews.usecase.js';
import { setupWizardRoutes } from '@/modules/setup-wizard/interface-adapters/controllers/http/setupWizard.routes.js';
import { GitRemoteCliGateway } from '@/modules/setup-wizard/interface-adapters/gateways/gitRemote.cli.gateway.js';
import { SetupProcessChildProcessGateway } from '@/modules/setup-wizard/interface-adapters/gateways/setupProcess.childProcess.gateway.js';
import { SetupStateFileSystemGateway } from '@/modules/setup-wizard/interface-adapters/gateways/setupState.fileSystem.gateway.js';
import { SetupRunRegistry } from '@/modules/setup-wizard/usecases/streamSetupRun.usecase.js';
import { insightsRoutes } from '@/modules/statistics-insights/interface-adapters/controllers/http/insights.routes.js';
import { overviewRoutes } from '@/modules/statistics-insights/interface-adapters/controllers/http/overview.routes.js';
import { statsRoutes } from '@/modules/statistics-insights/interface-adapters/controllers/http/stats.routes.js';
import { AiInsightsSessionClaudeGateway } from '@/modules/statistics-insights/interface-adapters/gateways/aiInsightsSession.claude.gateway.js';
import { GitHubDiffStatsFetchGateway } from '@/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.github.gateway.js';
import { GitLabDiffStatsFetchGateway } from '@/modules/statistics-insights/interface-adapters/gateways/diffStatsFetch.gitlab.gateway.js';
import { BUDGET_DEFAULT_USD } from '@/modules/token-accounting/entities/budget/budgetConfig.schema.js';
import { budgetRoutes } from '@/modules/token-accounting/interface-adapters/controllers/http/budget.routes.js';
import { tokenUsageRoutes } from '@/modules/token-accounting/interface-adapters/controllers/http/tokenUsage.routes.js';
import { FilesystemBudgetGateway } from '@/modules/token-accounting/interface-adapters/gateways/budget/budget.filesystem.gateway.js';
import { FilesystemTokenUsageGateway } from '@/modules/token-accounting/interface-adapters/gateways/tokenUsage/tokenUsage.filesystem.gateway.js';
import { BudgetStatusPresenter } from '@/modules/token-accounting/interface-adapters/presenters/budgetStatus.presenter.js';
import { TokenUsageSummaryPresenter } from '@/modules/token-accounting/interface-adapters/presenters/tokenUsageSummary.presenter.js';
import { EnforceBudgetUseCase } from '@/modules/token-accounting/usecases/enforceBudget/enforceBudget.usecase.js';
import { GetBudgetStatusUseCase } from '@/modules/token-accounting/usecases/getBudgetStatus/getBudgetStatus.usecase.js';
import { SummarizeTokenUsageUseCase } from '@/modules/token-accounting/usecases/summarizeTokenUsage/summarizeTokenUsage.usecase.js';
import { UpdateBudgetUseCase } from '@/modules/token-accounting/usecases/updateBudget/updateBudget.usecase.js';
import { mrTrackingRoutes } from '@/modules/tracking/interface-adapters/controllers/http/mrTracking.routes.js';
import { mrTrackingAdvancedRoutes } from '@/modules/tracking/interface-adapters/controllers/http/mrTrackingAdvanced.routes.js';
import { CheckFollowupNeededUseCase } from '@/modules/tracking/usecases/tracking/checkFollowupNeeded.usecase.js';
import { HandlePlatformApprovalUseCase } from '@/modules/tracking/usecases/tracking/handlePlatformApproval.usecase.js';
import { RecordBypassUseCase } from '@/modules/tracking/usecases/tracking/recordBypass.usecase.js';
import { RecordPushUseCase } from '@/modules/tracking/usecases/tracking/recordPush.usecase.js';
import { RecordReviewCompletionUseCase } from '@/modules/tracking/usecases/tracking/recordReviewCompletion.usecase.js';
import { SyncThreadsUseCase } from '@/modules/tracking/usecases/tracking/syncThreads.usecase.js';
import { TrackAssignmentUseCase } from '@/modules/tracking/usecases/tracking/trackAssignment.usecase.js';
import { TransitionStateUseCase } from '@/modules/tracking/usecases/tracking/transitionState.usecase.js';
import type {
  RemoveResult,
  WorktreeIdentity,
} from '@/modules/worktree-management/entities/worktree/worktree.schema.js';
import { worktreeOverviewRoutes } from '@/modules/worktree-management/interface-adapters/controllers/http/worktreeOverview.routes.js';
import { detectDegradedWorktrees } from '@/modules/worktree-management/usecases/detectDegradedWorktrees.usecase.js';
import { resolveTransportGuardConfig } from '@/security/transportGuardConfig.js';
import { getConfigDir } from '@/shared/services/configDir.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readVersion(): string {
  const packageJsonPath = join(__dirname, '..', '..', 'package.json');
  const raw = readFileSync(packageJsonPath, 'utf-8');
  return JSON.parse(raw).version;
}

const currentVersion = readVersion();
const packageVersionGateway = new NpmPackageVersionGateway();
const versionCache = new VersionCacheMemoryGateway();
const selfUpdateCommand = new SelfUpdateCliGateway();
const installTypeDetector = new InstallTypeDetectorFsGateway();

export async function registerRoutes(app: FastifyInstance, deps: Dependencies): Promise<void> {
  await app.register(fastifyStatic, {
    root: join(__dirname, '..', 'dashboard'),
    prefix: '/dashboard/',
  });

  await app.register(healthRoutes, {
    getConfig: () => ({ version: currentVersion }),
    versionCache,
    supervisorStatusStore: deps.supervisorStatusStore,
  });

  await app.register(settingsRoutes);

  await app.register(reviewRoutes, {
    reviewFileGateway: deps.reviewFileGateway,
    reviewRequestTrackingGateway: deps.reviewRequestTrackingGateway,
    getRepositories: () => deps.config.repositories,
    queuePort: { getJobStatus, cancelJob },
    logger: deps.logger,
  });

  await app.register(statsRoutes, {
    statsGateway: deps.statsGateway,
    getRepositories: () => deps.config.repositories,
    gitRemoteGateway: new GitRemoteCliGateway(),
    diffStatsFetchGateways: {
      gitlab: new GitLabDiffStatsFetchGateway(defaultGitLabExecutor),
      github: new GitHubDiffStatsFetchGateway(defaultGitHubExecutor),
    },
    broadcastBackfillProgress,
    logger: deps.logger,
  });

  const projectConfigGateway = new ProjectConfigFileSystemGateway();
  const updateProjectConfig = new UpdateProjectConfigUseCase(projectConfigGateway);

  const recomputeGlobalConcurrency = new RecomputeGlobalConcurrencyUseCase({
    repositoriesListGateway: new RepositoriesListRuntimeConfigGateway(
      () => deps.config.repositories,
    ),
    projectConfigGateway,
    queueCapacityPort: {
      setGlobalConcurrency,
      setProjectConcurrencyCap,
    },
  });
  recomputeGlobalConcurrency.execute({});

  await app.register(overviewRoutes, {
    getRepositories: () => deps.config.repositories,
    getActiveJobs: () =>
      getJobsStatus().active.map((job) => ({
        id: job.id,
        mrNumber: job.mrNumber,
        project: job.project,
        mrUrl: job.mrUrl,
        status: job.status,
        startedAt: job.startedAt ?? null,
        title: job.title,
        jobType: job.jobType,
      })),
    statsGateway: deps.statsGateway,
    reviewFileGateway: deps.reviewFileGateway,
    projectConfigGateway,
    getCapacity: () => ({ running: getRunningCount(), max: getTotalCapacity() }),
  });

  await app.register(mrTrackingRoutes, {
    reviewRequestTrackingGateway: deps.reviewRequestTrackingGateway,
    getQualityThreshold: (projectPath: string) =>
      loadProjectConfig(projectPath)?.qualityThreshold ?? null,
  });

  const tokenUsageGateway = new FilesystemTokenUsageGateway();
  await app.register(tokenUsageRoutes, {
    summarizeTokenUsage: new SummarizeTokenUsageUseCase(tokenUsageGateway),
    presenter: new TokenUsageSummaryPresenter(),
  });

  await app.register(worktreeOverviewRoutes, {
    worktreeGateway: deps.worktreeGateway,
    presenter: deps.worktreePanelPresenter,
    schedulerControls: deps.sweepSchedulerControls,
    logger: deps.logger,
    detectDegradedWorktrees: (entries) =>
      detectDegradedWorktrees(
        {
          entries,
          staleThresholdMs: getWorktreeStaleThresholdHours() * 60 * 60 * 1000,
          now: () => new Date(),
        },
        { healthProbe: deps.worktreeHealthProbeGateway },
      ),
    forceCleanupLock: deps.forceCleanupLock,
    removeWorktreeForCleanup: (identity) => {
      const firstEnabled = deps.config.repositories.find((repository) => repository.enabled);
      const sourceCheckoutPath = firstEnabled?.localPath ?? '';
      return deps.worktreeGateway.remove({ identity, sourceCheckoutPath, force: true });
    },
  });

  const budgetGateway = new FilesystemBudgetGateway();
  const existingBudget = await budgetGateway.load();
  if (existingBudget === null) {
    await budgetGateway.save({ limitUsd: BUDGET_DEFAULT_USD });
  }
  const getBudgetStatus = new GetBudgetStatusUseCase({ budgetGateway, tokenUsageGateway });
  const updateBudget = new UpdateBudgetUseCase({ budgetGateway });
  const enforceBudget = new EnforceBudgetUseCase({ getBudgetStatus });
  const budgetStatusPresenter = new BudgetStatusPresenter();
  await app.register(budgetRoutes, {
    getBudgetStatus,
    updateBudget,
    budgetGateway,
    presenter: budgetStatusPresenter,
    getRepositories: () => deps.config.repositories,
  });

  const pendingReviewRequestGateway = new PendingReviewRequestFileSystemGateway();
  const listPendingReviews = new ListPendingReviewsUseCase({ pendingReviewRequestGateway });
  const dismissPendingReview = new DismissPendingReviewUseCase({
    pendingReviewRequestGateway,
    queuePort: {
      hasActiveJob: (jobId: string) => {
        const status = getJobStatus(jobId);
        return status === 'queued' || status === 'running';
      },
    },
    logger: deps.logger,
  });
  // Seed the runtime-mutable trigger mode from config.json on first boot. From
  // then on the dashboard setting is authoritative; config.json is the default.
  if (getTriggerMode() === null) {
    await setTriggerMode(deps.config.triggerMode);
  }
  const gateClaudeInvocation = new GateClaudeInvocationUseCase({
    getTriggerMode: () => getTriggerMode() ?? deps.config.triggerMode,
    pendingReviewRequestGateway,
    enqueue: enqueueReview,
    broadcastPendingChanged: () => broadcastPendingChanged(),
    logger: deps.logger,
  });

  // SPEC-197: trigger-actor provenance gate. Membership is resolved through the
  // scoped GitLab executor, cached per username, fail-closed.
  const gitLabMemberAccessGateway = new GitLabMemberAccessCliGateway(defaultGitLabExecutor);
  const isTrustedActor = new IsTrustedActorUseCase(gitLabMemberAccessGateway);

  const claudeInvokerDeps: ClaudeInvokerDependencies = {
    ...createDefaultClaudeInvokerDependencies(),
    getBudgetStatus,
    budgetStatusPresenter,
    broadcastBudgetStatus,
    getEnabledLocalPaths: () =>
      deps.config.repositories
        .filter((repository) => repository.enabled)
        .map((repository) => repository.localPath),
    // Reuse the shared invocation deps so timers (server.ts) and review jobs
    // see the same BillingState / SupervisorHealth / completion bridge.
    invocation: deps.claudeInvocationDeps,
  };

  const threadFetchGatewayFactory = (platform: 'gitlab' | 'github') =>
    platform === 'github'
      ? new GitHubThreadFetchGateway(defaultGitHubExecutor)
      : new GitLabThreadFetchGateway(defaultGitLabExecutor);
  await app.register(mrTrackingAdvancedRoutes, {
    getRepositories: () => deps.config.repositories,
    reviewRequestTrackingGateway: deps.reviewRequestTrackingGateway,
    reviewContextGateway: new ReviewContextFileSystemGateway(),
    threadFetchGatewayFactory,
    diffMetadataFetchGatewayFactory: (platform) =>
      platform === 'github'
        ? new GitHubDiffMetadataFetchGateway(defaultGitHubExecutor)
        : new GitLabDiffMetadataFetchGateway(defaultGitLabExecutor),
    diffStatsFetchGatewayFactory: (platform) =>
      platform === 'github'
        ? new GitHubDiffStatsFetchGateway(defaultGitHubExecutor)
        : new GitLabDiffStatsFetchGateway(defaultGitLabExecutor),
    createSyncThreadsUseCase: (platform) =>
      new SyncThreadsUseCase(
        deps.reviewRequestTrackingGateway,
        threadFetchGatewayFactory(platform),
      ),
    recordReviewCompletion: new RecordReviewCompletionUseCase(deps.reviewRequestTrackingGateway),
    enforceBudget,
    broadcastBudgetExceeded,
    claudeInvokerDeps,
    gateClaudeInvocation,
    logger: deps.logger,
  });

  await app.register(cleanupRoutes, {
    reviewFileGateway: deps.reviewFileGateway,
    reviewLogFileGateway: deps.reviewLogFileGateway,
    getRepositories: () => deps.config.repositories,
    logger: deps.logger,
  });

  await app.register(versionRoutes, {
    checkVersion,
    triggerSelfUpdate,
    currentVersion,
    packageVersionGateway,
    versionCache,
    selfUpdateCommand,
    installTypeDetector,
    serverPort: deps.config.server.port,
  });

  await app.register(insightsRoutes, {
    statsGateway: deps.statsGateway,
    insightsGateway: deps.insightsGateway,
    reviewFileGateway: deps.reviewFileGateway,
    reviewRequestTrackingGateway: deps.reviewRequestTrackingGateway,
    logger: deps.logger,
    session: new AiInsightsSessionClaudeGateway(
      new ClaudeSessionCliGateway(defaultProcessRunner()),
      { homeDir: homedir(), model: getModel() },
    ),
    environment: new ProcessEnvironmentGateway(),
    language: getDefaultLanguage(),
  });

  await app.register(logsRoutes);
  await app.register(cliStatusRoutes);
  await app.register(projectConfigRoutes, {
    updateProjectConfig,
    onSaved: () => {
      recomputeGlobalConcurrency.execute({});
    },
  });

  await registerWebSocketRoutes(app, deps);

  const trackingGw = deps.reviewRequestTrackingGateway;
  const threadFetchGw = new GitLabThreadFetchGateway(defaultGitLabExecutor);

  const egressScanner = createEgressScanner(defaultEgressScanConfig);
  const egressTraceGateway = new LoggerEgressTraceGateway(deps.logger);

  // Confirming a parked review rebuilds the real review processor from a code-side
  // registry: the builders close over framework gateways re-created at boot, so a
  // confirmation survives a server restart and is driven only by the persisted
  // ReviewJob snapshot. One builder per platform, registered across every trigger
  // source and job type (the registry keys on platform × triggerSource × jobType).
  const processorRegistry = new ProcessorRegistry();

  const gitLabThreadFetchGatewayForReview = new GitLabThreadFetchGateway(defaultGitLabExecutor);
  const gitHubThreadFetchGatewayForReview = new GitHubThreadFetchGateway(defaultGitHubExecutor);
  const gitLabNoteCommentPostGateway = new EgressScannedNoteCommentPostGateway(
    new GitLabNoteCommentPostCliGateway(defaultGitLabExecutor),
    egressScanner,
    egressTraceGateway,
  );
  const gitHubNoteCommentPostGateway = new EgressScannedNoteCommentPostGateway(
    new GitHubNoteCommentPostCliGateway(defaultGitHubExecutor),
    egressScanner,
    egressTraceGateway,
  );

  const gitLabExecuteReview = buildExecuteReview({
    platform: 'gitlab',
    logger: deps.logger,
    reviewContextGateway: deps.reviewContextGateway,
    threadFetchGateway: gitLabThreadFetchGatewayForReview,
    diffMetadataFetchGateway: new GitLabDiffMetadataFetchGateway(defaultGitLabExecutor),
    diffStatsFetchGateway: new GitLabDiffStatsFetchGateway(defaultGitLabExecutor),
    noteCommentPostGateway: gitLabNoteCommentPostGateway,
    inventoryGateway: new GitLabThreadInventoryGateway(defaultGitLabExecutor),
    recordCompletion: new RecordReviewCompletionUseCase(trackingGw),
    syncThreads: new SyncThreadsUseCase(trackingGw, gitLabThreadFetchGatewayForReview),
    claudeInvokerDeps,
  });
  const gitHubExecuteReview = buildExecuteReview({
    platform: 'github',
    logger: deps.logger,
    reviewContextGateway: deps.reviewContextGateway,
    threadFetchGateway: gitHubThreadFetchGatewayForReview,
    diffMetadataFetchGateway: new GitHubDiffMetadataFetchGateway(defaultGitHubExecutor),
    diffStatsFetchGateway: new GitHubDiffStatsFetchGateway(defaultGitHubExecutor),
    noteCommentPostGateway: gitHubNoteCommentPostGateway,
    inventoryGateway: buildGitHubInventoryGateway(gitHubThreadFetchGatewayForReview),
    recordCompletion: new RecordReviewCompletionUseCase(trackingGw),
    syncThreads: new SyncThreadsUseCase(trackingGw, gitHubThreadFetchGatewayForReview),
    claudeInvokerDeps,
  });

  const gitLabReviewProcessorDeps = {
    reviewContextGateway: deps.reviewContextGateway,
    diffStatsFetchGateway: new GitLabDiffStatsFetchGateway(defaultGitLabExecutor),
    recordCompletion: new RecordReviewCompletionUseCase(trackingGw),
    noteCommentPostGateway: gitLabNoteCommentPostGateway,
    executeReview: gitLabExecuteReview,
  };
  const gitHubReviewProcessorDeps = {
    reviewContextGateway: deps.reviewContextGateway,
    diffStatsFetchGateway: new GitHubDiffStatsFetchGateway(defaultGitHubExecutor),
    recordCompletion: new RecordReviewCompletionUseCase(trackingGw),
    noteCommentPostGateway: gitHubNoteCommentPostGateway,
    executeReview: gitHubExecuteReview,
  };
  const gitLabReviewProcessorBuilder = buildGitLabReviewProcessor(
    gitLabReviewProcessorDeps,
    deps.logger,
  );
  const gitHubReviewProcessorBuilder = buildGitHubReviewProcessor(
    gitHubReviewProcessorDeps,
    deps.logger,
  );
  for (const triggerSource of [
    'webhook-initial',
    'webhook-followup',
    'dashboard-manual',
  ] as const) {
    for (const jobType of ['review', 'followup'] as const) {
      processorRegistry.register(
        { triggerSource, platform: 'gitlab', jobType },
        gitLabReviewProcessorBuilder,
      );
      processorRegistry.register(
        { triggerSource, platform: 'github', jobType },
        gitHubReviewProcessorBuilder,
      );
    }
  }

  const confirmPendingReview = new ConfirmPendingReviewUseCase({
    pendingReviewRequestGateway,
    queuePort: {
      hasActiveJob: (jobId: string) => {
        const status = getJobStatus(jobId);
        return status === 'queued' || status === 'running';
      },
      getJobStatus,
    },
    enqueue: enqueueReview,
    resolveProcessor: (pending) => processorRegistry.resolve(pending),
    isProjectRunnable: (pending) =>
      findRepositoryByProjectPath(pending.job.projectPath) !== undefined,
    logger: deps.logger,
  });

  await app.register(pendingReviewsRoutes, {
    listPendingReviews,
    confirmPendingReview,
    dismissPendingReview,
    presenter: new PendingReviewPresenter(),
  });

  // TTL must be >= the platform's maximum webhook retry window so a
  // legitimately re-delivered event past that window is reprocessed, while any
  // redelivery/replay inside it is acted upon at most once. 24h is a safe upper
  // bound for GitLab's redelivery window.
  const WEBHOOK_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
  const idempotencyStore = new InMemoryIdempotencyStore({ ttlMs: WEBHOOK_IDEMPOTENCY_TTL_MS });

  const removeWorktreeAction = (input: {
    identity: WorktreeIdentity;
    sourceCheckoutPath: string;
  }): Promise<RemoveResult> =>
    deps.worktreeGateway.remove({
      identity: input.identity,
      sourceCheckoutPath: input.sourceCheckoutPath,
    });

  const transportGuardConfig = resolveTransportGuardConfig();
  const clientIpResolver = new ForwardedForClientIpResolver();

  app.post('/webhooks/gitlab', async (request, reply) => {
    let proceed = false;
    transportGuardMiddleware(
      {
        request: {
          socket: { remoteAddress: request.socket.remoteAddress },
          headers: request.headers,
        },
        reply: { code: (status) => reply.code(status), send: () => reply.send() },
        next: () => {
          proceed = true;
        },
        resolver: clientIpResolver,
      },
      transportGuardConfig,
    );
    if (!proceed) {
      return;
    }
    const gitLabHandleClose: HandleClose = (input) =>
      handleClose(input, {
        trackingGateway: trackingGw,
        reviewContextGateway: deps.reviewContextGateway,
        cancelJob,
        buildJobId: createJobId,
        removeWorktree: removeWorktreeAction,
        logger: deps.logger,
      });
    await handleGitLabWebhook(request, reply, deps.logger, {
      reviewContextGateway: deps.reviewContextGateway,
      threadFetchGateway: threadFetchGw,
      diffMetadataFetchGateway: new GitLabDiffMetadataFetchGateway(defaultGitLabExecutor),
      diffStatsFetchGateway: new GitLabDiffStatsFetchGateway(defaultGitLabExecutor),
      trackAssignment: new TrackAssignmentUseCase(trackingGw),
      recordCompletion: new RecordReviewCompletionUseCase(trackingGw),
      recordPush: new RecordPushUseCase(trackingGw),
      transitionState: new TransitionStateUseCase(trackingGw),
      checkFollowupNeeded: new CheckFollowupNeededUseCase(trackingGw),
      syncThreads: new SyncThreadsUseCase(trackingGw, threadFetchGw),
      executeReview: gitLabExecuteReview,
      handleClose: gitLabHandleClose,
      processWebhook: (event) =>
        processWebhook(event, {
          handleClose: gitLabHandleClose,
          transitionState: new TransitionStateUseCase(trackingGw),
          recordPush: new RecordPushUseCase(trackingGw),
          checkFollowupNeeded: new CheckFollowupNeededUseCase(trackingGw),
          removeWorktree: removeWorktreeAction,
          handlePlatformApproval: new HandlePlatformApprovalUseCase(trackingGw),
          getQualityThreshold: (projectPath: string) =>
            loadProjectConfig(projectPath)?.qualityThreshold ?? null,
          logger: deps.logger,
        }),
      enforceBudget,
      broadcastBudgetExceeded,
      getRepositories: () => deps.config.repositories,
      claudeInvokerDeps,
      gateClaudeInvocation,
      isTrustedActor,
      removeWorktree: removeWorktreeAction,
      recordBypass: new RecordBypassUseCase(trackingGw),
      noteCommentPostGateway: new EgressScannedNoteCommentPostGateway(
        new GitLabNoteCommentPostCliGateway(defaultGitLabExecutor),
        egressScanner,
        egressTraceGateway,
      ),
      handlePlatformApproval: new HandlePlatformApprovalUseCase(trackingGw),
      approvalRevocationGateway: new GitLabApprovalRevocationCliGateway(defaultGitLabExecutor),
      idempotencyStore,
      getQualityThreshold: (projectPath: string) =>
        loadProjectConfig(projectPath)?.qualityThreshold ?? null,
      now: () => new Date().toISOString(),
    });
  });

  const gitHubThreadFetchGw = new GitHubThreadFetchGateway(defaultGitHubExecutor);

  app.post('/webhooks/github', async (request, reply) => {
    let proceedGitHub = false;
    transportGuardMiddleware(
      {
        request: {
          socket: { remoteAddress: request.socket.remoteAddress },
          headers: request.headers,
        },
        reply: { code: (status) => reply.code(status), send: () => reply.send() },
        next: () => {
          proceedGitHub = true;
        },
        resolver: clientIpResolver,
      },
      transportGuardConfig,
    );
    if (!proceedGitHub) {
      return;
    }
    const gitHubHandleClose: HandleClose = (input) =>
      handleClose(input, {
        trackingGateway: trackingGw,
        reviewContextGateway: deps.reviewContextGateway,
        cancelJob,
        buildJobId: createJobId,
        removeWorktree: removeWorktreeAction,
        logger: deps.logger,
      });
    await handleGitHubWebhook(request, reply, deps.logger, {
      reviewContextGateway: deps.reviewContextGateway,
      threadFetchGateway: gitHubThreadFetchGw,
      diffMetadataFetchGateway: new GitHubDiffMetadataFetchGateway(defaultGitHubExecutor),
      diffStatsFetchGateway: new GitHubDiffStatsFetchGateway(defaultGitHubExecutor),
      trackAssignment: new TrackAssignmentUseCase(trackingGw),
      recordCompletion: new RecordReviewCompletionUseCase(trackingGw),
      recordPush: new RecordPushUseCase(trackingGw),
      transitionState: new TransitionStateUseCase(trackingGw),
      checkFollowupNeeded: new CheckFollowupNeededUseCase(trackingGw),
      syncThreads: new SyncThreadsUseCase(trackingGw, gitHubThreadFetchGw),
      executeReview: gitHubExecuteReview,
      handleClose: gitHubHandleClose,
      processWebhook: (event) =>
        processWebhook(event, {
          handleClose: gitHubHandleClose,
          transitionState: new TransitionStateUseCase(trackingGw),
          recordPush: new RecordPushUseCase(trackingGw),
          checkFollowupNeeded: new CheckFollowupNeededUseCase(trackingGw),
          removeWorktree: removeWorktreeAction,
          handlePlatformApproval: new HandlePlatformApprovalUseCase(trackingGw),
          getQualityThreshold: (projectPath: string) =>
            loadProjectConfig(projectPath)?.qualityThreshold ?? null,
          logger: deps.logger,
        }),
      enforceBudget,
      broadcastBudgetExceeded,
      getRepositories: () => deps.config.repositories,
      claudeInvokerDeps,
      gateClaudeInvocation,
      removeWorktree: removeWorktreeAction,
      recordBypass: new RecordBypassUseCase(trackingGw),
      noteCommentPostGateway: new EgressScannedNoteCommentPostGateway(
        new GitHubNoteCommentPostCliGateway(defaultGitHubExecutor),
        egressScanner,
        egressTraceGateway,
      ),
      handlePlatformApproval: new HandlePlatformApprovalUseCase(trackingGw),
      approvalRevocationGateway: new GitHubApprovalRevocationCliGateway(defaultGitHubExecutor),
      getQualityThreshold: (projectPath: string) =>
        loadProjectConfig(projectPath)?.qualityThreshold ?? null,
      now: () => new Date().toISOString(),
    });
  });

  app.get('/', async (_request, reply) => {
    reply.redirect('/dashboard/');
  });

  await app.register(setupWizardRoutes, {
    registry: new SetupRunRegistry(
      new SetupProcessChildProcessGateway({ cliPath: join(__dirname, 'cli.js') }),
    ),
    setupStateGateway: new SetupStateFileSystemGateway({
      filePath: join(getConfigDir(), 'setup-state.json'),
    }),
    logger: deps.logger,
  });

  app.get('/setup', async (_request, reply) => {
    reply.redirect('/dashboard/setup.html');
  });

  const emberGroundingProjectPath =
    deps.config.repositories.find((repository) => repository.enabled)?.localPath ?? '';
  const emberReadData = new EmberReadDataCompositeGateway({
    statsGateway: deps.statsGateway,
    insightsGateway: deps.insightsGateway,
    trackingGateway: deps.reviewRequestTrackingGateway,
    worktreeGateway: deps.worktreeGateway,
  });
  const emberAnswerTransport = new EmberAnswerTransportClaudeGateway(
    new ClaudeSessionCliGateway(defaultProcessRunner()),
    { homeDir: homedir(), buildMcpConfig: buildMcpConfigJson },
  );
  const emberMemory = new EmberMemoryFileSystemGateway({ homeDir: homedir() });

  await app.register(emberChatRoutes, {
    transport: emberAnswerTransport,
    environment: new ProcessEnvironmentGateway(),
    readData: emberReadData,
    memory: emberMemory,
    projectPath: emberGroundingProjectPath,
    logger: deps.logger,
  });

  const repositoryConfigDeps = { readFileSync, writeFileSync, existsSync };
  const addRepositoriesToConfig = new AddRepositoriesToConfigUseCase(repositoryConfigDeps);
  const removeRepositoryFromConfig = new RemoveRepositoryFromConfigUseCase(repositoryConfigDeps);
  const toggleRepositoryEnabled = new ToggleRepositoryEnabledUseCase(repositoryConfigDeps);
  const repositoriesConfigPath = resolveActiveConfigPath();

  function isExistingDirectory(path: string): boolean {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  }

  const addRepositoryFromDashboard = new AddRepositoryFromDashboardUseCase({
    isDirectory: isExistingDirectory,
    addRepositoriesToConfig,
    enrichSingleRepository,
    repositories: deps.config.repositories,
    configPath: repositoriesConfigPath,
  });
  const removeRepositoryFromDashboard = new RemoveRepositoryFromDashboardUseCase({
    removeRepositoryFromConfig,
    repositories: deps.config.repositories,
    configPath: repositoriesConfigPath,
  });
  const updateRepositoryEnabledFromDashboard = new UpdateRepositoryEnabledFromDashboardUseCase({
    toggleRepositoryEnabled,
    repositories: deps.config.repositories,
    configPath: repositoriesConfigPath,
  });

  await app.register(repositoriesRoutes, {
    getRepositories: () => deps.config.repositories,
    addRepository: (input) => addRepositoryFromDashboard.execute(input),
    removeRepository: (input) => removeRepositoryFromDashboard.execute(input),
    patchRepository: (input) => updateRepositoryEnabledFromDashboard.execute(input),
  });

  app.get('/api', async () => {
    return {
      name: 'reviewflow',
      version: currentVersion,
      endpoints: {
        dashboard: '/dashboard/',
        health: '/health',
        status: '/api/status',
        gitlab: '/webhooks/gitlab',
        github: '/webhooks/github',
      },
    };
  });

  void (async () => {
    try {
      await checkVersion(
        { currentVersion, forceRefresh: false },
        { packageVersionGateway, cache: versionCache, installTypeDetector },
      );
    } catch {
      return;
    }
  })();
}
