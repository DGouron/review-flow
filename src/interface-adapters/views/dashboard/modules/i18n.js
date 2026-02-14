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

    // Notifications
    'notify.reviewStarted': 'Review started for !{{mrNumber}}',
    'notify.followupStarted': 'Follow-up started for !{{mrNumber}}',
    'notify.reviewCompleted': 'Review completed for !{{mrNumber}}',
    'notify.followupCompleted': 'Follow-up completed for !{{mrNumber}}',
    'notify.reviewFailed': 'Review failed for !{{mrNumber}}',
    'notify.followupRequested': 'Follow-up requested for !{{mrNumber}}',
    'notify.desktopTitle': 'Reviewflow alert',

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
    'section.activeReviews': 'Active reviews',
    'section.activeFollowups': 'Active followups',
    'section.pendingFix': 'Pending fix',
    'section.pendingApproval': 'Pending approval',
    'section.queueLanes': 'Priority lanes',
    'section.completedReviews': 'Completed reviews',

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
    'empty.activeReviews': 'No active reviews',
    'empty.activeFollowups': 'No follow-up in progress',
    'empty.pendingFix': 'No MR pending fix',
    'empty.pendingApproval': 'No MR pending approval',
    'empty.reviewFiles': 'No review files',
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

    // Modal
    'modal.cancel.title': 'Cancel the {{type}} of {{label}} !{{number}} ({{type}})?',
    'modal.cancel.message': 'This action is irreversible. The review will be stopped immediately.',
    'modal.back': 'Go back',
    'modal.confirm': 'Confirm',

    // Confirm dialogs
    'confirm.deleteReview': 'Delete {{filename}}?',
    'confirm.removeProject': 'Remove "{{name}}" from the list?',
    'confirm.approveMr': 'Mark this {{label}} as approved?',

    // Success
    'success.reviewCancelled': 'Review cancelled',
    'success.reviewAlreadyCompleted': 'This review is already completed',

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
    'error.selectOrEnterPath': 'Select or enter a path',
    'error.projectNotLoaded': 'Load a project first',
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

    // Notifications
    'notify.reviewStarted': 'Review démarrée pour !{{mrNumber}}',
    'notify.followupStarted': 'Follow-up démarré pour !{{mrNumber}}',
    'notify.reviewCompleted': 'Review terminée pour !{{mrNumber}}',
    'notify.followupCompleted': 'Follow-up terminé pour !{{mrNumber}}',
    'notify.reviewFailed': 'Review en échec pour !{{mrNumber}}',
    'notify.followupRequested': 'Follow-up demandé pour !{{mrNumber}}',
    'notify.desktopTitle': 'Alerte Reviewflow',

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
    'section.activeReviews': 'Reviews actives',
    'section.activeFollowups': 'Followups actifs',
    'section.pendingFix': 'En attente de correctif',
    'section.pendingApproval': "En attente d'approbation",
    'section.queueLanes': 'Priorité',
    'section.completedReviews': 'Reviews terminées',

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
    'empty.activeReviews': 'Aucune review en cours',
    'empty.activeFollowups': 'Aucun follow-up en cours',
    'empty.pendingFix': 'Aucune MR en attente de correctif',
    'empty.pendingApproval': "Aucune MR en attente d'approbation",
    'empty.reviewFiles': 'Aucun fichier de review',
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

    // Modal
    'modal.cancel.title': 'Annuler la {{type}} de la {{label}} !{{number}} ({{type}}) ?',
    'modal.cancel.message': 'Cette action est irréversible. La review sera arrêtée immédiatement.',
    'modal.back': 'Revenir',
    'modal.confirm': 'Confirmer',

    // Confirm dialogs
    'confirm.deleteReview': 'Supprimer {{filename}} ?',
    'confirm.removeProject': 'Retirer "{{name}}" de la liste ?',
    'confirm.approveMr': 'Marquer cette {{label}} comme approuvée ?',

    // Success
    'success.reviewCancelled': 'Review annulée',
    'success.reviewAlreadyCompleted': 'Cette review est déjà terminée',

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
    'error.selectOrEnterPath': 'Sélectionnez ou entrez un chemin',
    'error.projectNotLoaded': "Charger un projet d'abord",
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
