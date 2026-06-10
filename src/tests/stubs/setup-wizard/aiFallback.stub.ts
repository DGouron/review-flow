import type {
  AiFallbackGateway,
  AiFallbackAvailability,
  AiInterpretation,
} from '@/modules/setup-wizard/entities/aiFallback/aiFallback.gateway.js';

interface StubOptions {
  available?: boolean;
  interpretation?: AiInterpretation;
}

export class StubAiFallbackGateway implements AiFallbackGateway {
  private readonly available: boolean;
  private readonly interpretation: AiInterpretation;

  constructor(options: StubOptions = {}) {
    this.available = options.available ?? false;
    this.interpretation = options.interpretation ?? { resolution: null, confidence: 0 };
  }

  isAvailable(): AiFallbackAvailability {
    return {
      available: this.available,
      reason: this.available ? null : 'SPEC-185 not yet implemented',
    };
  }

  async interpret(_input: string, _context: Record<string, unknown>): Promise<AiInterpretation> {
    return this.interpretation;
  }
}
