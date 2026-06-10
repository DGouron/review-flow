export interface LogFileInfo {
  filename: string;
  path: string;
  mtime: string;
  size: number;
}

export interface ReviewLogFileGateway {
  listLogFiles(projectPath: string): Promise<LogFileInfo[]>;
  deleteLogFile(projectPath: string, filename: string): Promise<boolean>;
  getLogsDirectory(projectPath: string): string;
}
