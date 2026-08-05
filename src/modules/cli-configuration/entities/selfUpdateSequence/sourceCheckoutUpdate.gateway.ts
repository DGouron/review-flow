export interface SourceCheckoutUpdateGateway {
  getCurrentBranch(): Promise<string>;
  hasUncommittedChanges(): Promise<boolean>;
  resolveToolPath(tool: 'git' | 'yarn'): Promise<string | null>;
  fetchLatest(): Promise<{ success: boolean; error: string | null }>;
  rebuild(): Promise<{ success: boolean; error: string | null }>;
}
