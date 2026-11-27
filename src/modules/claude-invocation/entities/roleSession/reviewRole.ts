import { z } from 'zod';

export const REVIEW_ROLES = [
  'greffe',
  'lot:bugs',
  'lot:securite',
  'lot:architecture',
  'lot:lisibilite',
  'contradiction',
  'arbitre',
] as const;

export const reviewRoleSchema = z.enum(REVIEW_ROLES);

export type ReviewRole = z.infer<typeof reviewRoleSchema>;

const ROLE_IN_WORDS: Record<ReviewRole, string> = {
  greffe: 'greffe',
  'lot:bugs': 'lot bugs',
  'lot:securite': 'lot sécurité',
  'lot:architecture': 'lot architecture',
  'lot:lisibilite': 'lot lisibilité',
  contradiction: 'contradiction',
  arbitre: 'arbitre',
};

export function isReviewRole(value: unknown): value is ReviewRole {
  return reviewRoleSchema.safeParse(value).success;
}

export function roleInWords(role: ReviewRole): string {
  return ROLE_IN_WORDS[role];
}
