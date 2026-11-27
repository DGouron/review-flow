import {
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

export function roleSessionNameOf(subject: RoleSessionSubject, role: ReviewRole): string {
  const subjectInWords = `${SUBJECT_IN_WORDS[subject.jobType]} #${subject.mergeRequestNumber}`;
  return `${subjectInWords}${ROLE_SESSION_NAME_SEPARATOR}${roleInWords(role)}`;
}
