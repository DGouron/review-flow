// Strangler Fig: Re-export from new location
// This file will be removed once all imports are updated
export {
  addLog,
  getLogs,
  getLogsByLevel,
  getErrorLogs,
  onLog,
  clearLogs,
  logInfo,
  logWarn,
  logError,
  logDebug,
} from '../frameworks/logging/logBuffer.js';

export type { LogEntry } from '../frameworks/logging/logBuffer.js';
