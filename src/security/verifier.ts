import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { loadEnvSecrets } from '@/config/loader.js';

export interface VerificationResult {
  valid: boolean;
  error?: string;
}

/**
 * Verify GitLab webhook signature
 * GitLab uses a simple secret token sent in the X-Gitlab-Token header
 */
export function verifyGitLabSignature(request: FastifyRequest): VerificationResult {
  const token = request.headers['x-gitlab-token'];

  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Header X-Gitlab-Token manquant' };
  }

  const secrets = loadEnvSecrets();
  const expectedToken = secrets.gitlabWebhookToken;

  // Use timing-safe comparison to prevent timing attacks
  const tokenBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expectedToken);

  if (tokenBuffer.length !== expectedBuffer.length) {
    return { valid: false, error: 'Token invalide' };
  }

  if (!timingSafeEqual(tokenBuffer, expectedBuffer)) {
    return { valid: false, error: 'Token invalide' };
  }

  return { valid: true };
}

/**
 * Verify GitHub webhook signature
 * GitHub uses HMAC-SHA256 signature in the X-Hub-Signature-256 header
 */
export function verifyGitHubSignature(request: FastifyRequest): VerificationResult {
  const signature = request.headers['x-hub-signature-256'];

  if (!signature || typeof signature !== 'string') {
    return { valid: false, error: 'Header X-Hub-Signature-256 manquant' };
  }

  const secrets = loadEnvSecrets();
  const secret = secrets.githubWebhookSecret;

  // Get raw body - Fastify stores it when configured
  const rawBody = (request as FastifyRequest & { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    return { valid: false, error: 'Corps de requête non disponible pour vérification' };
  }

  // Compute expected signature
  const hmac = createHmac('sha256', secret);
  hmac.update(rawBody);
  const expectedSignature = `sha256=${hmac.digest('hex')}`;

  // Use timing-safe comparison
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return { valid: false, error: 'Signature invalide' };
  }

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return { valid: false, error: 'Signature invalide' };
  }

  return { valid: true };
}

/**
 * Extract event type from request headers
 */
export function getGitLabEventType(request: FastifyRequest): string | undefined {
  const eventHeader = request.headers['x-gitlab-event'];
  return typeof eventHeader === 'string' ? eventHeader : undefined;
}

export function getGitHubEventType(request: FastifyRequest): string | undefined {
  const eventHeader = request.headers['x-github-event'];
  return typeof eventHeader === 'string' ? eventHeader : undefined;
}
