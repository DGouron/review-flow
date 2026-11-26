/**
 * Dashboard module — Monitoring view (SPEC-234).
 *
 * Turns the GET /api/monitoring snapshot into a view model, then renders the server, ReviewFlow
 * process, host and review session blocks.
 */

import { escapeHtml } from './html.js';
import { formatBytes } from './worktreePanel.js';

/** @typedef {(key: string, params?: Record<string, string | number>) => string} Translate */

/**
 * @param {number | null} seconds
 * @param {Translate} t
 * @returns {string}
 */
export function formatDuration(seconds, t) {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return t('monitoring.duration.days', { days, hours });
  if (hours > 0)
    return t('monitoring.duration.hours', { hours, minutes: String(minutes).padStart(2, '0') });
  if (minutes > 0) return t('monitoring.duration.minutes', { minutes });
  return t('monitoring.duration.seconds', { seconds: total });
}

/**
 * @param {number | null} percent
 * @param {Translate} t
 * @returns {string}
 */
export function formatCpuPercent(percent, t) {
  if (percent === null) return t('monitoring.measuring');
  return `${percent.toFixed(1)} %`;
}

function secondsBetween(startIso, endIso) {
  if (!startIso) return null;
  const elapsed = Date.parse(endIso) - Date.parse(startIso);
  return Number.isNaN(elapsed) ? null : elapsed / 1000;
}

function buildSessionRow(session, sampledAt, t) {
  const measured = session.memoryBytes !== null;
  const unavailable = t('monitoring.unavailable');
  return {
    worktree: session.worktree,
    duration: formatDuration(secondsBetween(session.startedAt, sampledAt), t),
    processes: measured ? String(session.processCount) : unavailable,
    memory: measured ? formatBytes(session.memoryBytes) : unavailable,
    cpu: measured ? formatCpuPercent(session.cpuPercent, t) : unavailable,
  };
}

function sessionNotice(sessions, t) {
  if (!sessions.available) return t('monitoring.sessions.unavailable');
  if (!sessions.resourcesAvailable) return t('monitoring.sessions.resourcesUnavailable');
  return null;
}

function buildServer(server, t) {
  return {
    tone: server.status === 'degraded' ? 'error' : 'ok',
    status: t(`monitoring.server.status.${server.status}`),
    uptime: formatDuration(server.uptimeSeconds, t),
    version: server.version,
    supervisor: t(`monitoring.supervisor.${server.supervisor.state}`),
    supervisorReason: server.supervisor.reason,
  };
}

function buildProcess(process, t) {
  return {
    pid: process.pid,
    rss: formatBytes(process.memory.rssBytes),
    heapUsed: formatBytes(process.memory.heapUsedBytes),
    heapTotal: formatBytes(process.memory.heapTotalBytes),
    cpu: formatCpuPercent(process.cpuPercent, t),
  };
}

function buildHost(host) {
  const load = host.loadAverage;
  return {
    loadAverage: [load.oneMinute, load.fiveMinutes, load.fifteenMinutes]
      .map((value) => value.toFixed(2))
      .join(' · '),
    freeMemory: formatBytes(host.freeMemoryBytes),
    totalMemory: formatBytes(host.totalMemoryBytes),
  };
}

/**
 * @param {Record<string, any>} snapshot body of GET /api/monitoring
 * @param {Translate} t
 */
export function buildMonitoringViewModel(snapshot, t) {
  const { sessions } = snapshot;
  return {
    server: buildServer(snapshot.server, t),
    process: buildProcess(snapshot.process, t),
    host: buildHost(snapshot.host),
    sessions: {
      notice: sessionNotice(sessions, t),
      rows: sessions.items.map((session) => buildSessionRow(session, snapshot.sampledAt, t)),
    },
  };
}

function metricCell(label, valueHtml, title = null) {
  const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';
  return `<div class="metric-cell"${titleAttribute}><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value mono">${valueHtml}</div></div>`;
}

function card(title, bodyHtml) {
  return `<section class="card" aria-label="${escapeHtml(title)}"><div class="view-subtitle">${escapeHtml(title)}</div>${bodyHtml}</section>`;
}

function renderServer(server, t) {
  const status = `<span class="meta-item"><span class="dot dot-${server.tone}" aria-hidden="true"></span>${escapeHtml(server.status)}</span>`;
  const supervisor = server.supervisorReason
    ? `${escapeHtml(server.supervisor)} · ${escapeHtml(server.supervisorReason)}`
    : escapeHtml(server.supervisor);
  return card(
    t('monitoring.server.title'),
    `<div class="metric-grid metric-grid-4">${[
      metricCell(t('monitoring.server.status'), status),
      metricCell(t('monitoring.server.uptime'), escapeHtml(server.uptime)),
      metricCell(t('monitoring.server.version'), escapeHtml(server.version)),
      metricCell(t('monitoring.server.supervisor'), supervisor, server.supervisorReason),
    ].join('')}</div>`,
  );
}

function renderProcess(process, t) {
  return card(
    t('monitoring.process.title', { pid: process.pid }),
    `<div class="metric-grid metric-grid-4">${[
      metricCell(t('monitoring.process.rss'), escapeHtml(process.rss)),
      metricCell(t('monitoring.process.heapUsed'), escapeHtml(process.heapUsed)),
      metricCell(t('monitoring.process.heapTotal'), escapeHtml(process.heapTotal)),
      metricCell(t('monitoring.cpu'), escapeHtml(process.cpu)),
    ].join('')}</div>`,
  );
}

function renderHost(host, t) {
  return card(
    t('monitoring.host.title'),
    `<div class="metric-grid metric-grid-4">${[
      metricCell(t('monitoring.host.loadAverage'), escapeHtml(host.loadAverage)),
      metricCell(t('monitoring.host.freeMemory'), escapeHtml(host.freeMemory)),
      metricCell(t('monitoring.host.totalMemory'), escapeHtml(host.totalMemory)),
    ].join('')}</div>`,
  );
}

function renderSessionTable(rows, t) {
  if (rows.length === 0)
    return `<div class="queue-empty">${escapeHtml(t('monitoring.sessions.empty'))}</div>`;
  const headers = ['worktree', 'duration', 'processes', 'memory', 'cpu']
    .map((key) => `<th scope="col">${escapeHtml(t(`monitoring.column.${key}`))}</th>`)
    .join('');
  const body = rows
    .map(
      (row) =>
        `<tr><td class="mono">${escapeHtml(row.worktree)}</td><td>${escapeHtml(row.duration)}</td><td class="mono">${escapeHtml(row.processes)}</td><td class="mono">${escapeHtml(row.memory)}</td><td class="mono">${escapeHtml(row.cpu)}</td></tr>`,
    )
    .join('');
  return `<div class="table-scroll"><table class="data-table"><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function renderSessions(sessions, t) {
  const notice = sessions.notice
    ? `<p class="view-subtitle"><span class="dot dot-warn" aria-hidden="true"></span> ${escapeHtml(sessions.notice)}</p>`
    : '';
  return card(t('monitoring.sessions.title'), `${notice}${renderSessionTable(sessions.rows, t)}`);
}

/**
 * @param {ReturnType<typeof buildMonitoringViewModel>} viewModel
 * @param {Translate} t
 * @returns {string}
 */
export function renderMonitoringViewHtml(viewModel, t) {
  return `<p class="view-subtitle">${escapeHtml(t('monitoring.subtitle'))}</p>
${renderServer(viewModel.server, t)}
${renderProcess(viewModel.process, t)}
${renderHost(viewModel.host, t)}
${renderSessions(viewModel.sessions, t)}`;
}

/**
 * @param {string} message loading or offline message, already translated
 * @returns {string}
 */
export function renderMonitoringStatusHtml(message) {
  return `<div class="queue-empty">${escapeHtml(message)}</div>`;
}
