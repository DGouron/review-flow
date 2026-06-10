import type {
  ClaudeAuthGateway,
  ClaudeLoginResult,
} from '@/modules/setup-wizard/entities/claudeAuth/claudeAuth.gateway.js';

interface StubOptions {
  loggedIn?: boolean;
  loginResult?: ClaudeLoginResult;
}

export class StubClaudeAuthGateway implements ClaudeAuthGateway {
  private loggedIn: boolean;
  private readonly loginResult: ClaudeLoginResult;
  public triggerLoginCallCount = 0;

  constructor(options: StubOptions = {}) {
    this.loggedIn = options.loggedIn ?? true;
    this.loginResult = options.loginResult ?? { success: true, error: null };
  }

  async isLoggedIn(): Promise<boolean> {
    return this.loggedIn;
  }

  async triggerLogin(): Promise<ClaudeLoginResult> {
    this.triggerLoginCallCount++;
    if (this.loginResult.success) {
      this.loggedIn = true;
    }
    return this.loginResult;
  }
}
