import type {
  DeclaredPrincipleSignals,
  ProjectPrinciplesGateway,
} from '@/modules/review-execution/entities/progress/projectPrinciples.gateway.js';

export class StubProjectPrinciplesGateway implements ProjectPrinciplesGateway {
  private store = new Map<string, DeclaredPrincipleSignals>();

  setSignals(localPath: string, signals: DeclaredPrincipleSignals): void {
    this.store.set(localPath, signals);
  }

  readSignals(localPath: string): DeclaredPrincipleSignals {
    return this.store.get(localPath) ?? { claudeMd: null, skillDirectoryNames: [] };
  }
}
