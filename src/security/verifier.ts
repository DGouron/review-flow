import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type { FastifyRequest } from 'fastify';

import { loadEnvSecrets } from '@/config/loader.js';
import { currentGitlabWebhookToken } from '@/security/gitlabWebhookTokenSource.js';

export interface VerificationResult {
  valid: boolean;
  error?: string;
}

// Per-process random key used only to fold both candidate and expected tokens
// into fixed-length digests before comparison. It never leaves the process and
// is not a secret in the trust model; its sole purpose is to make timingSafeEqual
// operate on equal-length inputs so no length-based oracle precedes the compare.
const comparisonKey = randomBytes(32);

function constantTimeStringEqual(candidate: string, expected: string): boolean {
  const candidateDigest = createHmac('sha256', comparisonKey).update(candidate).digest();
  const expectedDigest = createHmac('sha256', comparisonKey).update(expected).digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

/**
 * Verify GitLab webhook signature.
 * GitLab uses a simple secret token sent in the X-Gitlab-Token header.
 * The expected token is read from the current configuration on every call so it
 * can be rotated without restarting the process (see gitlabWebhookTokenSource).
 */
export function verifyGitLabSignature(request: FastifyRequest): VerificationResult {
  const token = request.headers['x-gitlab-token'];

  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Header X-Gitlab-Token manquant' };
  }

  const expectedToken = currentGitlabWebhookToken();
  if (expectedToken === null) {
    return { valid: false, error: 'Token invalide' };
  }

  if (!constantTimeStringEqual(token, expectedToken)) {
    return { valid: false, error: 'Token invalide' };
  }

  return { valid: true };
}

function extractRawBody(request: FastifyRequest): Buffer | null {
  if ('rawBody' in request && Buffer.isBuffer(request.rawBody)) {
    return request.rawBody;
  }
  return null;
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
  const rawBody = extractRawBody(request);
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

/**
 * Extract the per-event delivery identifier from request headers.
 * Symmetric to getGitLabEventType; reads X-Gitlab-Event-UUID.
 */
export function getGitLabEventUuid(request: FastifyRequest): string | undefined {
  const uuidHeader = request.headers['x-gitlab-event-uuid'];
  return typeof uuidHeader === 'string' ? uuidHeader : undefined;
}

export function getGitHubEventType(request: FastifyRequest): string | undefined {
  const eventHeader = request.headers['x-github-event'];
  return typeof eventHeader === 'string' ? eventHeader : undefined;
}
