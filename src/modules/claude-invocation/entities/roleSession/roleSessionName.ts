import {
  REVIEW_ROLES,
  roleInWords,
  type ReviewRole,
} from '@/modules/claude-invocation/entities/roleSession/reviewRole.js';

export type RoleSessionSubject = {
  jobType: 'review' | 'followup';
  mergeRequestNumber: number;
};

const SUBJECT_IN_WORDS: Record<RoleSessionSubject['jobType'], string> = {
  review: 'Revue',
  followup: 'Suivi',
};

export const ROLE_SESSION_NAME_SEPARATOR = ' · ';

const ROLE_SESSION_NAME_PATTERN = /^(?:Revue|Suivi) #\d+ · (.+)$/;
const ROLES_IN_WORDS = new Set(REVIEW_ROLES.map(roleInWords));

export function isRoleSessionName(name: string | null): boolean {
  const roleInName = name?.match(ROLE_SESSION_NAME_PATTERN)?.[1];
  return roleInName !== undefined && ROLES_IN_WORDS.has(roleInName);
}

export function roleSessionNameOf(subject: RoleSessionSubject, role: ReviewRole): string {
  const subjectInWords = `${SUBJECT_IN_WORDS[subject.jobType]} #${subject.mergeRequestNumber}`;
  return `${subjectInWords}${ROLE_SESSION_NAME_SEPARATOR}${roleInWords(role)}`;
}
