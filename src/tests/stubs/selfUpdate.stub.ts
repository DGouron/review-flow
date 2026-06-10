import type { SelfUpdateCommandPort } from '@/modules/cli-configuration/entities/packageVersion/selfUpdateCommand.gateway.js';

export class StubSelfUpdateCommand implements SelfUpdateCommandPort {
  private readonly shouldSucceed: boolean;
  private readonly errorMessage: string | null;
  private readonly permissionDenied: boolean;

  constructor(shouldSucceed = true, errorMessage: string | null = null, permissionDenied = false) {
    this.shouldSucceed = shouldSucceed;
    this.errorMessage = errorMessage;
    this.permissionDenied = permissionDenied;
  }

  async runGlobalUpdate(): Promise<{
    success: boolean;
    error: string | null;
    permissionDenied: boolean;
  }> {
    if (this.shouldSucceed) {
      return { success: true, error: null, permissionDenied: false };
    }
    return { success: false, error: this.errorMessage, permissionDenied: this.permissionDenied };
  }

  async restartDaemon(_serverPort?: number): Promise<void> {
    return;
  }
}
