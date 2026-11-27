import type { DispatchResult } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.gateway.js';
import { parseSessionId } from '@/modules/claude-invocation/entities/claudeSession/claudeSession.schema.js';
import type {
  BackgroundSession,
  BackgroundSessionListing,
  RoleSessionGateway,
  RoleSessionLaunch,
} from '@/modules/claude-invocation/entities/roleSession/roleSession.gateway.js';

export class StubRoleSessionGateway implements RoleSessionGateway {
  launches: RoleSessionLaunch[] = [];
  private nextDispatch: DispatchResult = {
    status: 'dispatched',
    sessionId: parseSessionId('5e551011'),
  };
  private listing: BackgroundSessionListing = { status: 'listed', sessions: [] };

  willLaunch(sessionId: string): void {
    this.nextDispatch = { status: 'dispatched', sessionId: parseSessionId(sessionId) };
  }

  willFailToLaunch(result: DispatchResult): void {
    this.nextDispatch = result;
  }

  listSessions(sessionIds: string[]): void {
    this.listBackground(
      sessionIds.map((sessionId) => ({
        sessionId: parseSessionId(sessionId),
        name: null,
        cwd: null,
        startedAt: null,
      })),
    );
  }

  listBackground(sessions: BackgroundSession[]): void {
    this.listing = { status: 'listed', sessions };
  }

  failListing(reason: string): void {
    this.listing = { status: 'failed', reason };
  }

  async launch(launch: RoleSessionLaunch): Promise<DispatchResult> {
    this.launches.push(launch);
    const result = this.nextDispatch;
    if (result.status === 'dispatched') {
      const alreadyListed = this.listing.status === 'listed' ? this.listing.sessions : [];
      this.listing = {
        status: 'listed',
        sessions: [
          ...alreadyListed,
          { sessionId: result.sessionId, name: launch.name, cwd: launch.cwd, startedAt: null },
        ],
      };
    }
    return result;
  }

  async listBackgroundSessions(): Promise<BackgroundSessionListing> {
    return this.listing;
  }
}
