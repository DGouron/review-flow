export interface SelfUpdateCommandPort {
  runGlobalUpdate(): Promise<{ success: boolean; error: string | null; permissionDenied: boolean }>;
  restartDaemon(serverPort?: number): Promise<void>;
}
