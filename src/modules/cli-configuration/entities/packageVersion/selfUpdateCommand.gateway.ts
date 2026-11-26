export type GlobalInstallOutcome =
  | { kind: 'installed' }
  | { kind: 'permission-denied' }
  | { kind: 'version-not-on-registry' }
  | { kind: 'failed'; error: string };

export interface SelfUpdateCommandPort {
  installGlobalVersion(version: string): Promise<GlobalInstallOutcome>;
  readInstalledVersion(): Promise<string | null>;
  restartDaemon(serverPort?: number): Promise<void>;
}
