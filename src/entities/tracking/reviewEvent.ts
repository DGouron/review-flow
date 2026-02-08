export interface ReviewEvent {
  type: 'review' | 'followup';
  timestamp: string;
  durationMs: number;
  score: number | null;
  blocking: number;
  warnings: number;
  suggestions: number;
  threadsClosed: number;
  threadsOpened: number;
}
