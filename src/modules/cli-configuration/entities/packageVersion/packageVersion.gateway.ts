export interface PackageVersionGateway {
  fetchLatestVersion(): Promise<string | null>;
}
