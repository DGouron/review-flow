import { appendFileSync, mkdirSync, existsSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const LOG_DIR = join(homedir(), ".claude-review", "logs");
const LOG_FILE = join(LOG_DIR, "mcp-server.log");
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB

function ensureLogDir(): void {
	if (!existsSync(LOG_DIR)) {
		mkdirSync(LOG_DIR, { recursive: true });
	}
}

function formatTimestamp(): string {
	return new Date().toISOString();
}

function truncateLogIfNeeded(): void {
	try {
		if (existsSync(LOG_FILE)) {
			const stats = statSync(LOG_FILE);
			if (stats.size > MAX_LOG_SIZE) {
				writeFileSync(LOG_FILE, `[${formatTimestamp()}] [INFO] Log file truncated (was ${stats.size} bytes)\n`);
			}
		}
	} catch {
		// Ignore errors during truncation check
	}
}

function writeLog(level: string, message: string, data?: Record<string, unknown>): void {
	try {
		ensureLogDir();
		truncateLogIfNeeded();

		const timestamp = formatTimestamp();
		const dataStr = data ? ` ${JSON.stringify(data)}` : "";
		const line = `[${timestamp}] [${level}] ${message}${dataStr}\n`;

		appendFileSync(LOG_FILE, line);
	} catch {
		// Silently fail - we can't break MCP protocol with console output
	}
}

export const mcpLogger = {
	info: (message: string, data?: Record<string, unknown>) => writeLog("INFO", message, data),
	warn: (message: string, data?: Record<string, unknown>) => writeLog("WARN", message, data),
	error: (message: string, data?: Record<string, unknown>) => writeLog("ERROR", message, data),
	debug: (message: string, data?: Record<string, unknown>) => writeLog("DEBUG", message, data),

	/** Log file location for reference */
	getLogPath: () => LOG_FILE,
};
