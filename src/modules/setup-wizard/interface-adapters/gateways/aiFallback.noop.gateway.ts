import type {
  AiFallbackGateway,
  AiFallbackAvailability,
  AiInterpretation,
} from '@/modules/setup-wizard/entities/aiFallback/aiFallback.gateway.js';

export class AiFallbackNoopGateway implements AiFallbackGateway {
  isAvailable(): AiFallbackAvailability {
    return { available: false, reason: 'SPEC-185 not yet implemented' };
  }

  async interpret(_input: string, _context: Record<string, unknown>): Promise<AiInterpretation> {
    return { resolution: null, confidence: 0 };
  }
}
