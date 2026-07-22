export type DeclaredPrincipleSignals = {
  claudeMd: string | null;
  skillDirectoryNames: string[];
};

export interface ProjectPrinciplesGateway {
  readSignals(localPath: string): DeclaredPrincipleSignals;
}
