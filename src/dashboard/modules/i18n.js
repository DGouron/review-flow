/** @type {'en' | 'fr'} */
let currentLanguage = 'en';

const translations = {
  en: {
    // Time
    'time.justNow': 'Just now',
    'time.minutesAgo': '{{minutes}} min ago',
    'time.hoursAgo': '{{hours}}h ago',

    // Phases
    'phase.initializing': 'Initializing',
    'phase.agents-running': 'Agents running',
    'phase.synthesizing': 'Synthesizing',
    'phase.publishing': 'Publishing',
    'phase.completed': 'Completed',

    // Header
    'header.checkClaude': 'Check Claude',
    'header.logs': 'Logs',
    'header.hideLogs': 'Hide Logs',

    // Cards
    'card.running': 'Running',
    'card.queued': 'Queued',
    'card.completed': 'Completed',
    'card.claudeCli': 'Claude CLI',
    'card.model': 'Model',
    'card.triggerMode': 'Trigger',
    'card.language': 'Language',
    'card.gitCli': 'Git CLI',
    'card.gitlabCli': 'GitLab CLI',
    'card.githubCli': 'GitHub CLI',

    // Focus strip
    'strip.now': 'To handle now',
    'strip.nowMeta': 'Running reviews + MRs pending fix',
    'strip.next': 'Up next',
    'strip.nextMeta': 'Queued reviews + MRs pending approval',
    'strip.blocked': 'Blocking feedback',
    'strip.blockedMeta': 'MRs with unresolved threads',
    'strip.modeCompact': 'Compact view',
    'strip.modeDetailed': 'Detailed view',

    // Priority lane
    'lane.nowKicker': 'Take action now',
    'lane.nowMeta': '{{count}} open thread(s) to resolve',
    'lane.owner': 'Owner: {{owner}}',

    // Quality score
    'quality.kicker': 'Quality score',
    'quality.target': 'Target {{target}}/10',
    'quality.notAvailable': 'No score yet',
    'quality.perfect': 'Perfect quality',
    'quality.onTarget': 'On target',
    'quality.belowTarget': 'Needs improvements',
    'quality.lovableQuality': 'Lovable quality',
    'quality.progress': 'Progress',
    'quality.trendUp': 'Improving {{delta}}',
    'quality.trendDown': 'Dropping {{delta}}',
    'quality.trendFlat': 'Stable',
    'quality.trendUnknown': 'No trend yet',

    // Notifications — toast labels (in-page)
    'notify.reviewStarted': 'Review started for !{{mrNumber}}',
    'notify.followupStarted': 'Follow-up started for !{{mrNumber}}',
    'notify.reviewCompleted': 'Review completed for !{{mrNumber}}',
    'notify.followupCompleted': 'Follow-up completed for !{{mrNumber}}',
    'notify.reviewFailed': 'Review failed for !{{mrNumber}}',
    'notify.followupRequested': 'Follow-up requested for !{{mrNumber}}',
    'notify.reviewPendingConfirmation': 'Review awaiting your confirmation for !{{mrNumber}}',
    'notify.desktopTitle': 'Reviewflow alert',
    // Notifications — desktop labels (short, used in rich payload)
    'notify.label.reviewStarted': 'Review',
    'notify.label.followupStarted': 'Follow-up',
    'notify.label.reviewCompleted': 'Review done',
    'notify.label.followupCompleted': 'Follow-up done',
    'notify.label.reviewFailed': 'Review failed',
    'notify.label.reviewPendingConfirmation': 'Awaiting confirmation',

    // Loading
    'loading.data': 'Syncing dashboard data...',
    'loading.section': 'Loading...',
    'loading.status': 'Refreshing live status...',
    'loading.reviewFiles': 'Loading review files...',
    'loading.stats': 'Loading project stats...',
    'loading.mrTracking': 'Refreshing MR tracking...',

    // Session metrics
    'metrics.session': 'Session',
    'metrics.firstAction': 'First useful action',
    'metrics.actions': 'actions',
    'metrics.pending': 'pending',
    'metrics.priorityResolution': 'Priority resolution',
    'metrics.breakdown': 'Action breakdown',
    'metrics.action.followup': 'Followup',
    'metrics.action.open': 'Open',
    'metrics.action.approve': 'Approve',
    'metrics.action.cancelReview': 'Cancel',
    'metrics.action.syncThreads': 'Sync',

    // Model options
    'model.opus': 'Opus (powerful)',
    'model.sonnet': 'Sonnet (fast)',

    // Trigger mode options
    'triggerMode.fullAuto': 'Full auto',
    'triggerMode.semiAuto': 'Semi auto (confirm)',

    // Status
    'status.connecting': 'Connecting...',
    'status.checking': 'Checking...',
    'status.loading': 'Loading...',
    'status.loadProject': 'Load a project...',
    'status.operational': 'Operational',
    'status.undefined': 'not set',

    // Connection
    'connection.websocket': 'WebSocket real-time',
    'connection.fallback': 'Fallback polling 5s',
    'connection.online': 'Online',
    'connection.onlinePolling': 'Online (polling)',
    'connection.offline': 'Offline',
    'connection.disconnected': 'Disconnected',
    'connection.polling': 'Polling mode',

    // Project loader
    'project.selectPlaceholder': '-- Select a project --',
    'project.inputPlaceholder': 'Or enter a new path...',
    'project.load': 'Load',
    'project.removeTooltip': 'Remove from list',
    'project.removed': 'Project removed',
    'project.noProjectSelected': 'No project selected',

    // Login / Auth
    'login.claude.title': 'Claude is not authenticated',
    'login.claude.instruction': 'Run this command in a terminal:',
    'login.claude.reload': 'Then reload this page.',
    'login.git.title': 'CLI not authenticated',
    'login.gitlab.title': 'GitLab CLI not authenticated',
    'login.github.title': 'GitHub CLI not authenticated',

    // Setup instructions
    'setup.installAndAuth': '1. Install and authenticate {{cli}}:',
    'setup.configureWebhook': '2. Configure the {{platform}} webhook:',
    'setup.webhookPath': 'Settings → Webhooks → Add webhook',
    'setup.reload': 'Then reload this page.',
    'setup.github.contentType': 'Content type: application/json',
    'setup.github.events': 'Events: Pull requests',
    'setup.gitlab.trigger': 'Trigger: Merge request events',

    // Sections
    'section.logs': 'Recent logs',
    'section.stats': 'Project statistics',
    'section.pendingReviews': 'Pending reviews',
    'section.activeReviews': 'Active reviews',
    'section.activeFollowups': 'Active followups',
    'section.pendingFix': 'Pending fix',
    'section.pendingApproval': 'Pending approval',
    'section.queueLanes': 'Priority lanes',
    'section.completedReviews': 'Completed reviews',
    'section.claudeEconomics': 'Claude economics',
    'economics.tokenUsage': '// TOKEN USAGE',
    'economics.monthlyBudget': '// MONTHLY BUDGET',

    // Queue lanes
    'queueLane.now': 'Handle now',
    'queueLane.needsFix': 'Needs fixes',
    'queueLane.readyToApprove': 'Ready for approval',
    'queueLane.emptyNow': 'No immediate priority',
    'queueLane.emptyNeedsFix': 'No MR waiting for fixes',
    'queueLane.emptyReadyToApprove': 'No MR ready to approve',

    // Empty states
    'empty.logs': 'No logs',
    'empty.stats': 'Load a project to see stats',
    'empty.statsNoData': 'No statistics available',
    'empty.activeFollowups': 'No follow-up in progress',
    'empty.pendingFix': 'No MR pending fix',
    'empty.pendingApproval': 'No MR pending approval',
    'empty.reviewFiles': 'No review files',
    'settings.uiLanguage': 'UI language',
    'settings.claudePromptsLanguage': 'Claude prompts language',
    'settings.defaultModel': 'Default model',
    'settings.reviewSkill': 'Review skill',
    'settings.reviewFollowupSkill': 'Review followup skill',
    'settings.externalLink': 'External link (HTTPS)',
    'settings.externalLinkPlaceholder': 'https://notion.so/team/project',
    'settings.qualityThreshold': 'Quality threshold (0-10)',
    'settings.qualityThresholdPlaceholder': 'e.g. 7',
    'settings.qualityThresholdHint':
      'Approval is reverted when score falls below this threshold. Leave empty to disable.',
    'settings.maxConcurrentReviews': 'Max concurrent reviews (1-10)',
    'settings.maxConcurrentReviewsHint':
      'How many reviews of this project can run at the same time. The header capacity total is the sum across all projects.',
    'settings.maxDiffLines': 'Max diff size (lines)',
    'settings.maxDiffLinesPlaceholder': 'e.g. 2000',
    'settings.maxDiffLinesHint':
      'Merge requests larger than this line budget are blocked before review. Leave empty to use the default.',
    'settings.cancel': 'Cancel',
    'settings.save': 'Save',
    'empty.reviewsNoProject': 'Load a project to see reviews',
    'empty.statsNoProject': 'Load a project to see stats',
    'empty.serverNotAccessible': 'Server not accessible',

    // Stats labels
    'stats.reviews': 'Reviews',
    'stats.averageScore': 'Average score',
    'stats.totalTime': 'Total time',
    'stats.averageTime': 'Average time',
    'stats.blocking': 'Blocking',
    'stats.warnings': 'Important',
    'stats.commits': 'Commits',
    'stats.linesAdded': 'Lines added',
    'stats.linesDeleted': 'Lines deleted',
    'stats.netLines': 'Net lines',
    'stats.volume': 'Volume',
    'stats.period': 'Reviews from {{from}} to {{to}} ({{days}} days)',
    'stats.project': 'Project',
    'stats.backToDashboard': 'Back to dashboard',
    'stats.recalculate': 'Recalculate',
    'stats.backfillProgress': '{{completed}}/{{total}} reviews',
    'stats.backfillComplete': 'Recalculation complete',
    'stats.backfillFailed': '{{failed}} errors',
    'stats.scoreTrend': 'Score Trend',
    'stats.reviewActivity': 'Review Activity',
    'stats.scoreDistribution': 'Score Distribution',
    'stats.noChartData': 'Not enough data',
    'stats.bugsByCategory': 'Bugs Found by Category',
    'stats.noCategoryData': 'No category data available',
    'stats.kpi.prsReviewed': 'PRs Reviewed',
    'stats.kpi.bugsCaught': 'Bugs Caught',
    'stats.kpi.averageReviewTime': 'Average Review Time',
    'stats.reviewsPerMonth': 'Reviews per Month',
    'stats.keyInsights': 'Key Insights',
    'stats.noKeyInsights': 'Aucun insight disponible pour le moment',
    'stats.noReviews': 'Aucune review enregistrée',
    'stats.category.security': 'Security',
    'stats.category.logic': 'Logic',
    'stats.category.performance': 'Performance',
    'stats.category.typeSafety': 'Type Safety',
    'stats.category.style': 'Style',
    'stats.category.dependencies': 'Dependencies',
    'error.recalculateStats': 'Recalculation error',

    // Review types
    'review.type.review': 'Review',
    'review.type.followup': 'Follow-up',
    'review.description': 'Description',
    'review.status.running': 'Review in progress',
    'review.status.queued': 'Waiting in queue',
    'review.status.completed': 'Review completed',
    'review.status.failed': 'Action needed',

    // Buttons
    'button.cancel': 'Cancel',
    'button.open': 'Open',
    'button.followup': 'Run follow-up',
    'button.autoFollowup': 'Auto follow-up',
    'button.delete': 'Delete',
    'button.syncThreads': 'Sync GitLab threads',
    'button.markAsMerged': 'Mark as merged',

    // MR details
    'mr.threads.open': '{{count}} open',
    'mr.threads.resolved': 'Resolved',
    'mr.threads.openAction': '{{count}} open - fix now',
    'mr.threads.warningAction': '{{count}} important - review before approve',
    'mr.threads.resolvedAction': 'All resolved - ready to approve',
    'mr.detail.source': 'Source:',
    'mr.detail.target': 'Target:',
    'mr.detail.created': 'Created:',
    'mr.detail.lastReview': 'Last review:',
    'mr.detail.history': 'History ({{count}}):',
    'mr.review.blocking': '{{count}} blocking',

    // Logs
    'logs.errorCount': '{{count}} errors',
    'logs.clear': 'Clear logs',

    // Modal
    'modal.cancel.title': 'Cancel the {{type}} of {{label}} !{{number}} ({{type}})?',
    'modal.cancel.message': 'This action is irreversible. The review will be stopped immediately.',
    'modal.back': 'Go back',
    'modal.confirm': 'Confirm',
    'modal.markMerged.title': 'Mark {{label}} !{{number}} as merged?',
    'modal.markMerged.message':
      'This manually marks the review as merged and closes its review process.',
    'modal.markMerged.back': 'Go back',
    'modal.markMerged.confirm': 'Mark as merged',
    'badge.merged': 'Merged',
    'section.mergedReviews': 'Merged',

    // Confirm dialogs
    'confirm.deleteReview': 'Delete {{filename}}?',
    'confirm.removeProject': 'Remove "{{name}}" from the list?',
    'confirm.approveMr': 'Mark this {{label}} as approved?',

    // Success
    'success.reviewCancelled': 'Review cancelled',
    'success.reviewAlreadyCompleted': 'This review is already completed',
    'success.markedAsMerged': 'MR marked as merged',

    // Errors
    'error.loading': 'Loading error',
    'error.loadingStats': 'Error loading stats',
    'error.loadingConfig': 'Loading error',
    'error.checkStatus': 'Check error',
    'error.deleteReview': 'Error deleting review',
    'error.triggerFollowup': 'Error triggering followup',
    'error.toggleAutoFollowup': 'Error changing auto follow-up',
    'error.approveMr': 'Error approving',
    'error.syncThreads': 'Error syncing threads',
    'error.cancelReview': 'Error cancelling review',
    'error.markAsMerged': 'Error marking as merged',
    'error.selectOrEnterPath': 'Select or enter a path',
    'error.projectNotLoaded': 'Load a project first',

    // Collapsible lists
    'collapsible.showMore': 'Show {{count}} more...',
    'collapsible.showLess': 'Show less',

    // MR Sheet
    'sheet.scoreTimeline': 'Score Timeline',
    'sheet.issuesBreakdown': 'Issues Breakdown',
    'sheet.reviewHistory': 'Review History',
    'sheet.details': 'Details',
    'sheet.qualityScore': 'Quality Score',
    'sheet.openThreads': 'Open Threads',
    'sheet.reviewDuration': 'Review Duration',
    'sheet.totalIssues': 'Total Issues',
    'sheet.noData': 'No data yet',
    'sheet.type': 'Type',
    'sheet.date': 'Date',
    'sheet.score': 'Score',
    'sheet.blocking': 'Blocking',
    'sheet.outOf10': '/10',
    'sheet.target': 'Target: {{target}}/10',
    'sheet.approve': 'Approve',
    'sheet.commits': 'Commits',
    'sheet.additions': 'Additions',
    'sheet.deletions': 'Deletions',

    // Stats filters
    'stats.allDevs': 'All',
    'stats.filterByDev': 'Filter by developer',

    // Team tab
    'team.title': 'Team',
    'team.insights': 'Team Insights',
    'team.strengths': 'Strengths',
    'team.weaknesses': 'Areas to improve',
    'team.tips': 'Tips',
    'team.noData':
      'No review data yet. Reviews will appear here once the first review is completed.',
    'team.insufficientData': '{{current}}/{{required}} reviews — more data needed',
    'team.notEnoughDevs': 'Not enough developers for team comparison',
    'team.loading': 'Loading team insights...',
    'team.overallLevel': 'Level',
    'team.reviews': '{{count}} reviews',
    'team.healthStrip.developers': 'Number of developers',
    'team.healthStrip.reviews': 'Total reviews analyzed',
    'team.healthStrip.avgLevel': 'Average team level',

    // Categories
    'category.quality': 'Quality',
    'category.responsiveness': 'Responsiveness',
    'category.codeVolume': 'Code Volume',
    'category.iteration': 'Iteration',

    // Titles (RPG)
    'title.architect': 'The Architect',
    'title.firefighter': 'The Firefighter',
    'title.workhorse': 'The Workhorse',
    'title.sentinel': 'The Sentinel',
    'title.polyvalent': 'The Polyvalent',
    'title.risingStar': 'The Rising Star',

    // Trends
    'trend.improving': 'Improving',
    'trend.declining': 'Declining',
    'trend.stable': 'Stable',

    // Developer sheet
    'devSheet.strengths': 'Strengths',
    'devSheet.weaknesses': 'Areas to improve',
    'devSheet.topPriority': 'Top Priority',
    'devSheet.noTopPriority': 'No priority — great job!',
    'devSheet.scoreTrend': 'Score Trend',
    'devSheet.reviewCount': '{{count}} reviews analyzed',
    'devSheet.metrics': 'Key Metrics',
    'devSheet.metrics.averageScore': 'Average score',
    'devSheet.metrics.blockingPerReview': 'Blocking per review',
    'devSheet.metrics.warningsPerReview': 'Warnings per review',
    'devSheet.metrics.averageAdditions': 'Avg additions',
    'devSheet.metrics.averageDeletions': 'Avg deletions',
    'devSheet.metrics.firstPassQuality': 'First-pass quality',

    // Insight descriptions
    'insight.quality.highScore': 'Average score {{score}}/10 — {{percent}}% above team average',
    'insight.quality.lowScore': 'Average score {{score}}/10 — {{percent}}% below team average',
    'insight.quality.lowBlocking': 'Only {{blocking}} blocking issues per review on average',
    'insight.quality.highBlocking':
      '{{blocking}} blocking issues per review — {{percent}}% above team',
    'insight.responsiveness.fast':
      'Reviews completed in {{duration}} avg — {{percent}}% faster than team',
    'insight.responsiveness.slow': 'Reviews take {{duration}} avg — {{percent}}% slower than team',
    'insight.codeVolume.high': 'Handles {{lines}} lines per review on average',
    'insight.codeVolume.low': 'Small changes with {{lines}} lines per review',
    'insight.iteration.good': '{{rate}}% of reviews need no followup — strong first-pass quality',
    'insight.iteration.poor':
      '{{rate}}% of reviews have blocking issues — multiple iterations needed',
    'insight.quality.improving': 'Quality is on an upward trend — keep it up',
    'insight.responsiveness.improving': 'Responsiveness is improving — reviews are getting faster',
    'insight.codeVolume.improving': 'Code volume is increasing — handling larger changes',
    'insight.iteration.improving':
      'Iteration efficiency is improving — fewer blocking issues recently',

    // AI insights
    'ai.generate': 'Generate AI Insights',
    'ai.refresh': 'Refresh AI Insights',
    'ai.generating': 'Generating...',
    'ai.lastGenerated': 'AI insights from {{date}}',
    'ai.newDataAvailable': 'New reviews available',
    'ai.section': 'AI Analysis',
    'ai.noInsights': 'Generate AI insights for detailed analysis',
    'ai.teamAnalysis': 'Team Analysis',
    'ai.strengths': 'Strengths',
    'ai.weaknesses': 'Areas to improve',
    'ai.recommendations': 'Recommendations',
    'ai.dynamics': 'Team Dynamics',
    'ai.summary': 'Profile',
    'ai.error': 'Error generating insights',
    'ai.titleExplanation': 'Why this title',

    // Export PDF
    'export.pdf': 'Export PDF',
    'export.title': 'Team Insights Report',
    'export.generatedAt': 'Generated on {{date}}',
    'export.generatedBy': 'Generated by ReviewFlow',
    'export.teamSection': 'Team Analysis',
    'export.developerSection': 'Developer Profiles',
    'export.metrics': 'Key Metrics',
    'export.avgScore': 'Avg Score',
    'export.avgBlocking': 'Avg Blocking',
    'export.firstPassRate': 'First-Pass Quality',
    'export.avgDuration': 'Avg Duration',
    'export.overallLevel': 'Overall Level',

    // Version update
    'version.updateAvailable': 'Update to v{{version}}',
    'version.checking': 'Checking...',
    'version.updating': 'Updating...',
    'version.upToDate': 'Up to date',
    'version.updateFailed': 'Update failed',
    'version.restarting': 'Restarting server...',
    'version.checkTooltip': 'Check for updates',
    'version.permissionDenied': 'Permission denied. Run this command manually:',
    'version.copyCommand': 'Copy command',
    'version.commandCopied': 'Command copied!',
    'version.sourceCheckoutTooltip':
      'Source-checkout install. Click to see the manual update command.',
    'version.sourceCheckoutNotice':
      'This daemon runs from a source checkout. Run this command manually to update:',

    // Worktree panel (SPEC-173)
    'worktree.section.title': 'Worktree pool',
    'worktree.empty.title': 'Pool empty',
    'worktree.empty.subtitle':
      'No worktree on disk. The next scheduled review will materialize one.',
    'worktree.button.sweepNow': 'Sweep now',
    'worktree.button.sweeping': 'Sweeping…',
    'worktree.status.active': 'Active',
    'worktree.status.idle': 'Idle',
    'worktree.status.stale': 'Stale',
    'worktree.lastSweep.label': 'Last sweep',
    'worktree.lastSweep.never': 'Never',
    'worktree.nextSweep.label': 'Next sweep',
    'worktree.sweep.conflict': 'A sweep is already running.',
    'worktree.sweep.error': 'Sweep failed.',
  },
  fr: {
    // Time
    'time.justNow': "À l'instant",
    'time.minutesAgo': 'Il y a {{minutes}} min',
    'time.hoursAgo': 'Il y a {{hours}}h',

    // Phases
    'phase.initializing': 'Initialisation',
    'phase.agents-running': 'Agents en cours',
    'phase.synthesizing': 'Synthèse',
    'phase.publishing': 'Publication',
    'phase.completed': 'Terminé',

    // Header
    'header.checkClaude': 'Vérifier Claude',
    'header.logs': 'Logs',
    'header.hideLogs': 'Masquer Logs',

    // Cards
    'card.running': 'En cours',
    'card.queued': 'En attente',
    'card.completed': 'Terminées',
    'card.claudeCli': 'Claude CLI',
    'card.model': 'Modèle',
    'card.triggerMode': 'Déclenchement',
    'card.language': 'Langue',
    'card.gitCli': 'Git CLI',
    'card.gitlabCli': 'GitLab CLI',
    'card.githubCli': 'GitHub CLI',

    // Focus strip
    'strip.now': 'À traiter',
    'strip.nowMeta': 'Reviews en cours + MR en attente de correctif',
    'strip.next': 'À venir',
    'strip.nextMeta': 'Reviews en file + MR en attente d’approbation',
    'strip.blocked': 'Retours bloquants',
    'strip.blockedMeta': 'MR avec threads non résolus',
    'strip.modeCompact': 'Vue compacte',
    'strip.modeDetailed': 'Vue détaillée',

    // Priority lane
    'lane.nowKicker': 'Action prioritaire',
    'lane.nowMeta': '{{count}} thread(s) ouverts à résoudre',
    'lane.owner': 'Responsable: {{owner}}',

    // Quality score
    'quality.kicker': 'Score qualité',
    'quality.target': 'Cible {{target}}/10',
    'quality.notAvailable': 'Score indisponible',
    'quality.perfect': 'Qualité parfaite',
    'quality.onTarget': 'Objectif atteint',
    'quality.belowTarget': 'Améliorations requises',
    'quality.lovableQuality': 'Qualité lovable',
    'quality.progress': 'Progression',
    'quality.trendUp': 'En amélioration {{delta}}',
    'quality.trendDown': 'En baisse {{delta}}',
    'quality.trendFlat': 'Stable',
    'quality.trendUnknown': 'Pas de tendance',

    // Notifications — toast labels (in-page)
    'notify.reviewStarted': 'Review démarrée pour !{{mrNumber}}',
    'notify.followupStarted': 'Follow-up démarré pour !{{mrNumber}}',
    'notify.reviewCompleted': 'Review terminée pour !{{mrNumber}}',
    'notify.followupCompleted': 'Follow-up terminé pour !{{mrNumber}}',
    'notify.reviewFailed': 'Review en échec pour !{{mrNumber}}',
    'notify.followupRequested': 'Follow-up demandé pour !{{mrNumber}}',
    'notify.reviewPendingConfirmation':
      'Review en attente de votre confirmation pour !{{mrNumber}}',
    'notify.desktopTitle': 'Alerte Reviewflow',
    // Notifications — desktop labels (short, used in rich payload)
    'notify.label.reviewStarted': 'Review',
    'notify.label.followupStarted': 'Follow-up',
    'notify.label.reviewCompleted': 'Review terminée',
    'notify.label.followupCompleted': 'Follow-up terminé',
    'notify.label.reviewFailed': 'Review échouée',
    'notify.label.reviewPendingConfirmation': 'En attente',

    // Loading
    'loading.data': 'Synchronisation des données du dashboard...',
    'loading.section': 'Chargement...',
    'loading.status': 'Rafraîchissement du statut en direct...',
    'loading.reviewFiles': 'Chargement des fichiers de review...',
    'loading.stats': 'Chargement des statistiques projet...',
    'loading.mrTracking': 'Rafraîchissement du suivi MR...',

    // Session metrics
    'metrics.session': 'Session',
    'metrics.firstAction': '1ère action utile',
    'metrics.actions': 'actions',
    'metrics.pending': 'en attente',
    'metrics.priorityResolution': 'Résolution des priorités',
    'metrics.breakdown': 'Détail des actions',
    'metrics.action.followup': 'Followup',
    'metrics.action.open': 'Ouvrir',
    'metrics.action.approve': 'Approuver',
    'metrics.action.cancelReview': 'Annuler',
    'metrics.action.syncThreads': 'Synchroniser',

    // Model options
    'model.opus': 'Opus (puissant)',
    'model.sonnet': 'Sonnet (rapide)',

    // Trigger mode options
    'triggerMode.fullAuto': 'Auto complet',
    'triggerMode.semiAuto': 'Semi-auto (confirmation)',

    // Status
    'status.connecting': 'Connexion...',
    'status.checking': 'Vérification...',
    'status.loading': 'Chargement...',
    'status.loadProject': 'Charger un projet...',
    'status.operational': 'Opérationnel',
    'status.undefined': 'non défini',

    // Connection
    'connection.websocket': 'WebSocket temps réel',
    'connection.fallback': 'Fallback polling 5s',
    'connection.online': 'En ligne',
    'connection.onlinePolling': 'En ligne (polling)',
    'connection.offline': 'Hors ligne',
    'connection.disconnected': 'Déconnecté',
    'connection.polling': 'Mode polling',

    // Project loader
    'project.selectPlaceholder': '-- Sélectionner un projet --',
    'project.inputPlaceholder': 'Ou entrer un nouveau chemin...',
    'project.load': 'Charger',
    'project.removeTooltip': 'Retirer de la liste',
    'project.removed': 'Projet retiré',
    'project.noProjectSelected': 'Aucun projet sélectionné',

    // Login / Auth
    'login.claude.title': "Claude n'est pas authentifié",
    'login.claude.instruction': 'Exécutez cette commande dans un terminal :',
    'login.claude.reload': 'Puis rechargez cette page.',
    'login.git.title': 'CLI non authentifié',
    'login.gitlab.title': 'GitLab CLI non authentifié',
    'login.github.title': 'GitHub CLI non authentifié',

    // Setup instructions
    'setup.installAndAuth': '1. Installer et authentifier {{cli}} :',
    'setup.configureWebhook': '2. Configurer le webhook {{platform}} :',
    'setup.webhookPath': 'Settings → Webhooks → Add webhook',
    'setup.reload': 'Puis rechargez cette page.',
    'setup.github.contentType': 'Content type: application/json',
    'setup.github.events': 'Events: Pull requests',
    'setup.gitlab.trigger': 'Trigger: Merge request events',

    // Sections
    'section.logs': 'Logs récents',
    'section.stats': 'Statistiques du projet',
    'section.pendingReviews': 'Reviews en attente',
    'section.activeReviews': 'Reviews actives',
    'section.activeFollowups': 'Followups actifs',
    'section.pendingFix': 'En attente de correctif',
    'section.pendingApproval': "En attente d'approbation",
    'section.queueLanes': 'Priorité',
    'section.completedReviews': 'Reviews terminées',
    'section.claudeEconomics': 'Économie Claude',
    'economics.tokenUsage': '// CONSOMMATION TOKENS',
    'economics.monthlyBudget': '// BUDGET MENSUEL',

    // Queue lanes
    'queueLane.now': 'À traiter maintenant',
    'queueLane.needsFix': 'Corrections requises',
    'queueLane.readyToApprove': 'Prêtes pour approbation',
    'queueLane.emptyNow': 'Aucune priorité immédiate',
    'queueLane.emptyNeedsFix': 'Aucune MR en attente de correction',
    'queueLane.emptyReadyToApprove': 'Aucune MR prête à approuver',

    // Empty states
    'empty.logs': 'Aucun log',
    'empty.stats': 'Charger un projet pour voir les stats',
    'empty.statsNoData': 'Aucune statistique disponible',
    'empty.activeFollowups': 'Aucun follow-up en cours',
    'empty.pendingFix': 'Aucune MR en attente de correctif',
    'empty.pendingApproval': "Aucune MR en attente d'approbation",
    'empty.reviewFiles': 'Aucun fichier de review',
    'settings.uiLanguage': "Langue de l'interface",
    'settings.claudePromptsLanguage': 'Langue des prompts Claude',
    'settings.defaultModel': 'Modèle par défaut',
    'settings.reviewSkill': 'Skill de review',
    'settings.reviewFollowupSkill': 'Skill de review followup',
    'settings.externalLink': 'Lien externe (HTTPS)',
    'settings.externalLinkPlaceholder': 'https://notion.so/team/projet',
    'settings.qualityThreshold': 'Seuil de qualité (0-10)',
    'settings.qualityThresholdPlaceholder': 'ex. 7',
    'settings.qualityThresholdHint':
      "L'approbation est annulée si le score passe sous ce seuil. Laisser vide pour désactiver.",
    'settings.maxConcurrentReviews': 'Reviews en parallèle max (1-10)',
    'settings.maxConcurrentReviewsHint':
      'Nombre de reviews de ce projet pouvant tourner simultanément. La capacité totale affichée dans le header est la somme inter-projets.',
    'settings.maxDiffLines': 'Taille de diff max (lignes)',
    'settings.maxDiffLinesPlaceholder': 'ex. 2000',
    'settings.maxDiffLinesHint':
      'Les merge requests dépassant ce budget de lignes sont bloquées avant la revue. Laisser vide pour utiliser la valeur par défaut.',
    'settings.cancel': 'Annuler',
    'settings.save': 'Enregistrer',
    'empty.reviewsNoProject': 'Charger un projet pour voir les reviews',
    'empty.statsNoProject': 'Charger un projet pour voir les stats',
    'empty.serverNotAccessible': 'Serveur non accessible',

    // Stats labels
    'stats.reviews': 'Reviews',
    'stats.averageScore': 'Score moyen',
    'stats.totalTime': 'Temps total',
    'stats.averageTime': 'Durée moyenne',
    'stats.blocking': 'Bloquants',
    'stats.warnings': 'Importants',
    'stats.commits': 'Commits',
    'stats.linesAdded': 'Lignes ajoutées',
    'stats.linesDeleted': 'Lignes supprimées',
    'stats.netLines': 'Lignes nettes',
    'stats.volume': 'Volume',
    'stats.period': 'Reviews du {{from}} au {{to}} ({{days}} jours)',
    'stats.project': 'Projet',
    'stats.backToDashboard': 'Retour au dashboard',
    'stats.recalculate': 'Recalculer',
    'stats.backfillProgress': '{{completed}}/{{total}} reviews',
    'stats.backfillComplete': 'Recalcul terminé',
    'stats.backfillFailed': '{{failed}} erreurs',
    'stats.scoreTrend': 'Tendance du score',
    'stats.reviewActivity': 'Activité des reviews',
    'stats.scoreDistribution': 'Distribution des scores',
    'stats.noChartData': 'Pas assez de données',
    'stats.bugsByCategory': 'Bugs trouvés par catégorie',
    'stats.noCategoryData': 'Aucune donnée de catégorie disponible',
    'stats.kpi.prsReviewed': 'PR examinées',
    'stats.kpi.bugsCaught': 'Bugs détectés',
    'stats.kpi.averageReviewTime': 'Durée moyenne de review',
    'stats.reviewsPerMonth': 'Reviews par mois',
    'stats.keyInsights': 'Insights clés',
    'stats.noKeyInsights': 'Aucun insight disponible pour le moment',
    'stats.noReviews': 'Aucune review enregistrée',
    'stats.category.security': 'Sécurité',
    'stats.category.logic': 'Logique',
    'stats.category.performance': 'Performance',
    'stats.category.typeSafety': 'Typage',
    'stats.category.style': 'Style',
    'stats.category.dependencies': 'Dépendances',
    'error.recalculateStats': 'Erreur de recalcul',

    // Review types
    'review.type.review': 'Review',
    'review.type.followup': 'Follow-up',
    'review.description': 'Description',
    'review.status.running': 'Review en cours',
    'review.status.queued': 'En attente dans la file',
    'review.status.completed': 'Review terminée',
    'review.status.failed': 'Action requise',

    // Buttons
    'button.cancel': 'Annuler',
    'button.open': 'Ouvrir',
    'button.followup': 'Lancer le follow-up',
    'button.autoFollowup': 'Auto follow-up',
    'button.delete': 'Supprimer',
    'button.syncThreads': 'Synchroniser les threads GitLab',
    'button.markAsMerged': 'Marquer comme mergée',

    // MR details
    'mr.threads.open': '{{count}} ouvert(s)',
    'mr.threads.resolved': 'Résolus',
    'mr.threads.openAction': '{{count}} ouvert(s) - corriger maintenant',
    'mr.threads.warningAction': '{{count}} important(s) - vérifier avant approbation',
    'mr.threads.resolvedAction': 'Tout résolu - prêt à approuver',
    'mr.detail.source': 'Source :',
    'mr.detail.target': 'Target :',
    'mr.detail.created': 'Créée :',
    'mr.detail.lastReview': 'Dernière review :',
    'mr.detail.history': 'Historique ({{count}}) :',
    'mr.review.blocking': '{{count}} bloquant(s)',

    // Logs
    'logs.errorCount': '{{count}} erreurs',
    'logs.clear': 'Vider les logs',

    // Modal
    'modal.cancel.title': 'Annuler la {{type}} de la {{label}} !{{number}} ({{type}}) ?',
    'modal.cancel.message': 'Cette action est irréversible. La review sera arrêtée immédiatement.',
    'modal.back': 'Revenir',
    'modal.confirm': 'Confirmer',
    'modal.markMerged.title': 'Marquer la {{label}} !{{number}} comme mergée ?',
    'modal.markMerged.message':
      'Marque manuellement la review comme mergée et clôt son processus de review.',
    'modal.markMerged.back': 'Revenir',
    'modal.markMerged.confirm': 'Marquer comme mergée',
    'badge.merged': 'Mergée',
    'section.mergedReviews': 'Mergées',

    // Confirm dialogs
    'confirm.deleteReview': 'Supprimer {{filename}} ?',
    'confirm.removeProject': 'Retirer "{{name}}" de la liste ?',
    'confirm.approveMr': 'Marquer cette {{label}} comme approuvée ?',

    // Success
    'success.reviewCancelled': 'Review annulée',
    'success.reviewAlreadyCompleted': 'Cette review est déjà terminée',
    'success.markedAsMerged': 'MR marquée comme mergée',

    // Errors
    'error.loading': 'Erreur de chargement',
    'error.loadingStats': 'Erreur de chargement des stats',
    'error.loadingConfig': 'Erreur de chargement',
    'error.checkStatus': 'Erreur de vérification',
    'error.deleteReview': 'Erreur lors de la suppression',
    'error.triggerFollowup': 'Erreur lors du déclenchement du followup',
    'error.toggleAutoFollowup': 'Erreur lors du changement de auto follow-up',
    'error.approveMr': "Erreur lors de l'approbation",
    'error.syncThreads': 'Erreur lors de la synchronisation des threads',
    'error.cancelReview': "Erreur lors de l'annulation",
    'error.markAsMerged': 'Erreur lors du marquage',
    'error.selectOrEnterPath': 'Sélectionnez ou entrez un chemin',
    'error.projectNotLoaded': "Charger un projet d'abord",

    // MR Sheet
    'sheet.scoreTimeline': 'Évolution du score',
    'sheet.issuesBreakdown': 'Répartition des problèmes',
    'sheet.reviewHistory': 'Historique des reviews',
    'sheet.details': 'Détails',
    'sheet.qualityScore': 'Score qualité',
    'sheet.openThreads': 'Threads ouverts',
    'sheet.reviewDuration': 'Durée de review',
    'sheet.totalIssues': 'Total problèmes',
    'sheet.noData': 'Pas encore de données',
    'sheet.type': 'Type',
    'sheet.date': 'Date',
    'sheet.score': 'Score',
    'sheet.blocking': 'Bloquants',
    'sheet.outOf10': '/10',
    'sheet.target': 'Cible : {{target}}/10',
    'sheet.approve': 'Terminer',
    'sheet.commits': 'Commits',
    'sheet.additions': 'Ajouts',
    'sheet.deletions': 'Suppressions',

    // Stats filters
    'stats.allDevs': 'Tous',
    'stats.filterByDev': 'Filtrer par développeur',

    // Collapsible lists
    'collapsible.showMore': 'Afficher {{count}} de plus...',
    'collapsible.showLess': 'Réduire',

    // Team tab
    'team.title': 'Équipe',
    'team.insights': 'Insights équipe',
    'team.strengths': 'Points forts',
    'team.weaknesses': "Axes d'amélioration",
    'team.tips': 'Conseils',
    'team.noData':
      'Pas encore de données de review. Les reviews apparaîtront ici une fois la première review terminée.',
    'team.insufficientData': '{{current}}/{{required}} reviews — plus de données nécessaires',
    'team.notEnoughDevs': "Pas assez de développeurs pour une comparaison d'équipe",
    'team.loading': 'Chargement des insights équipe...',
    'team.overallLevel': 'Niveau',
    'team.reviews': '{{count}} reviews',
    'team.healthStrip.developers': 'Nombre de développeurs',
    'team.healthStrip.reviews': 'Reviews totales analysées',
    'team.healthStrip.avgLevel': "Niveau moyen de l'équipe",

    // Categories
    'category.quality': 'Qualité',
    'category.responsiveness': 'Réactivité',
    'category.codeVolume': 'Volume de code',
    'category.iteration': 'Itération',

    // Titles (RPG)
    'title.architect': "L'Architecte",
    'title.firefighter': 'Le Pompier',
    'title.workhorse': 'Le Bosseur',
    'title.sentinel': 'La Sentinelle',
    'title.polyvalent': 'Le Polyvalent',
    'title.risingStar': "L'Étoile Montante",

    // Trends
    'trend.improving': 'En amélioration',
    'trend.declining': 'En déclin',
    'trend.stable': 'Stable',

    // Developer sheet
    'devSheet.strengths': 'Points forts',
    'devSheet.weaknesses': "Axes d'amélioration",
    'devSheet.topPriority': 'Priorité',
    'devSheet.noTopPriority': 'Aucune priorité — excellent travail !',
    'devSheet.scoreTrend': 'Tendance du score',
    'devSheet.reviewCount': '{{count}} reviews analysées',
    'devSheet.metrics': 'Indicateurs clés',
    'devSheet.metrics.averageScore': 'Score moyen',
    'devSheet.metrics.blockingPerReview': 'Bloquants par review',
    'devSheet.metrics.warningsPerReview': 'Avertissements par review',
    'devSheet.metrics.averageAdditions': 'Ajouts moyens',
    'devSheet.metrics.averageDeletions': 'Suppressions moyennes',
    'devSheet.metrics.firstPassQuality': 'Qualité 1re passe',

    // Insight descriptions
    'insight.quality.highScore':
      'Score moyen {{score}}/10 — {{percent}}% au-dessus de la moyenne équipe',
    'insight.quality.lowScore':
      'Score moyen {{score}}/10 — {{percent}}% en-dessous de la moyenne équipe',
    'insight.quality.lowBlocking':
      'Seulement {{blocking}} problèmes bloquants par review en moyenne',
    'insight.quality.highBlocking':
      "{{blocking}} problèmes bloquants par review — {{percent}}% au-dessus de l'équipe",
    'insight.responsiveness.fast':
      "Reviews complétées en {{duration}} en moyenne — {{percent}}% plus rapide que l'équipe",
    'insight.responsiveness.slow':
      "Les reviews prennent {{duration}} en moyenne — {{percent}}% plus lent que l'équipe",
    'insight.codeVolume.high': 'Gère {{lines}} lignes par review en moyenne',
    'insight.codeVolume.low': 'Petits changements avec {{lines}} lignes par review',
    'insight.iteration.good':
      '{{rate}}% des reviews sans besoin de suivi — excellente qualité de première passe',
    'insight.iteration.poor':
      '{{rate}}% des reviews ont des problèmes bloquants — plusieurs itérations nécessaires',
    'insight.quality.improving': 'La qualité est en hausse — continuez comme ça',
    'insight.responsiveness.improving':
      "La réactivité s'améliore — les reviews sont de plus en plus rapides",
    'insight.codeVolume.improving':
      'Le volume de code augmente — gestion de changements plus importants',
    'insight.iteration.improving':
      "L'efficacité d'itération s'améliore — moins de problèmes bloquants récemment",

    // AI insights
    'ai.generate': 'Générer les insights IA',
    'ai.refresh': 'Actualiser les insights IA',
    'ai.generating': 'Génération en cours...',
    'ai.lastGenerated': 'Insights IA du {{date}}',
    'ai.newDataAvailable': 'Nouvelles reviews disponibles',
    'ai.section': 'Analyse IA',
    'ai.noInsights': 'Générer les insights IA pour une analyse détaillée',
    'ai.teamAnalysis': "Analyse d'équipe",
    'ai.strengths': 'Points forts',
    'ai.weaknesses': "Axes d'amélioration",
    'ai.recommendations': 'Recommandations',
    'ai.dynamics': "Dynamique d'équipe",
    'ai.summary': 'Profil',
    'ai.error': 'Erreur lors de la génération des insights',
    'ai.titleExplanation': 'Pourquoi ce titre',

    // Export PDF
    'export.pdf': 'Exporter PDF',
    'export.title': "Rapport d'insights \u00e9quipe",
    'export.generatedAt': 'G\u00e9n\u00e9r\u00e9 le {{date}}',
    'export.generatedBy': 'G\u00e9n\u00e9r\u00e9 par ReviewFlow',
    'export.teamSection': "Analyse d'\u00e9quipe",
    'export.developerSection': 'Profils d\u00e9veloppeurs',
    'export.metrics': 'M\u00e9triques cl\u00e9s',
    'export.avgScore': 'Score moyen',
    'export.avgBlocking': 'Bloquants moyens',
    'export.firstPassRate': 'Qualit\u00e9 premi\u00e8re passe',
    'export.avgDuration': 'Dur\u00e9e moyenne',
    'export.overallLevel': 'Niveau global',

    // Version update
    'version.updateAvailable': 'Mettre à jour vers v{{version}}',
    'version.checking': 'Vérification...',
    'version.updating': 'Mise à jour...',
    'version.upToDate': 'À jour',
    'version.updateFailed': 'Échec de la mise à jour',
    'version.restarting': 'Redémarrage du serveur...',
    'version.checkTooltip': 'Vérifier les mises à jour',
    'version.permissionDenied': 'Permission refusée. Exécutez cette commande manuellement :',
    'version.copyCommand': 'Copier la commande',
    'version.commandCopied': 'Commande copiée !',
    'version.sourceCheckoutTooltip':
      'Installation depuis le code source. Cliquez pour voir la commande de mise à jour manuelle.',
    'version.sourceCheckoutNotice':
      'Ce daemon tourne depuis un checkout du code source. Exécutez cette commande manuellement pour mettre à jour :',

    // Worktree panel (SPEC-173)
    'worktree.section.title': 'Pool des worktrees',
    'worktree.empty.title': 'Pool vide',
    'worktree.empty.subtitle': 'Aucun worktree sur disque. La prochaine review en créera un.',
    'worktree.button.sweepNow': 'Nettoyer maintenant',
    'worktree.button.sweeping': 'Nettoyage…',
    'worktree.status.active': 'Actif',
    'worktree.status.idle': 'Inactif',
    'worktree.status.stale': 'Périmé',
    'worktree.lastSweep.label': 'Dernier nettoyage',
    'worktree.lastSweep.never': 'Jamais',
    'worktree.nextSweep.label': 'Prochain nettoyage',
    'worktree.sweep.conflict': 'Un nettoyage est déjà en cours.',
    'worktree.sweep.error': 'Le nettoyage a échoué.',
  },
};

/** @returns {'en' | 'fr'} */
export function getLanguage() {
  return currentLanguage;
}

/** @param {'en' | 'fr'} language */
export function setLanguage(language) {
  currentLanguage = language;
}

/**
 * @param {string} key
 * @param {Record<string, string | number>} [params]
 * @returns {string}
 */
export function t(key, params) {
  let value = translations[currentLanguage]?.[key] ?? key;
  if (params) {
    for (const [param, replacement] of Object.entries(params)) {
      value = value.replaceAll(`{{${param}}}`, String(replacement));
    }
  }
  return value;
}
