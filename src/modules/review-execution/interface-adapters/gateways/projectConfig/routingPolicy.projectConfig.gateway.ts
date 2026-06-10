import { loadProjectConfig } from '@/config/projectConfig.js';
import type { RoutingPolicyGateway } from '@/modules/review-execution/entities/modelRouting/modelRouting.gateway.js';
import type { RoutingPolicy } from '@/modules/review-execution/entities/modelRouting/modelRouting.schema.js';

export class ProjectConfigRoutingPolicyGateway implements RoutingPolicyGateway {
  async load(localPath: string): Promise<RoutingPolicy | null> {
    const config = loadProjectConfig(localPath);
    return config?.routingPolicy ?? null;
  }
}
