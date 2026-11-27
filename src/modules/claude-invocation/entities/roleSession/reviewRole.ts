import { z } from 'zod';

export const REVIEW_ROLES = [
  'greffe',
  'lot:bugs',
  'lot:architecture',
  'lot:lisibilite',
  'lot:tests',
  'contradiction',
  'arbitre',
] as const;

export const reviewRoleSchema = z.enum(REVIEW_ROLES);

export type ReviewRole = z.infer<typeof reviewRoleSchema>;

/** Roles a released version recorded, read back as the role that took over their audits. */
export const RETIRED_ROLE_SUCCESSORS: Readonly<Record<string, ReviewRole>> = {
  'lot:securite': 'lot:bugs',
};

function successorOfRetiredRole(value: unknown): unknown {
  return typeof value === 'string' ? (RETIRED_ROLE_SUCCESSORS[value] ?? value) : value;
}

/** For the records already written: a retired role is read as its successor. */
export const recordedReviewRoleSchema = z.preprocess(successorOfRetiredRole, reviewRoleSchema);

const ROLE_IN_WORDS: Record<ReviewRole, string> = {
  greffe: 'greffe',
  'lot:bugs': 'lot bugs',
  'lot:architecture': 'lot architecture',
  'lot:lisibilite': 'lot lisibilité',
  'lot:tests': 'lot tests',
  contradiction: 'contradiction',
  arbitre: 'arbitre',
};

export function isReviewRole(value: unknown): value is ReviewRole {
  return reviewRoleSchema.safeParse(value).success;
}

export function roleInWords(role: ReviewRole): string {
  return ROLE_IN_WORDS[role];
}
