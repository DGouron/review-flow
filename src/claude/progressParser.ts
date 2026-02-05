// Strangler Fig: Re-export from new location
// This file will be removed once all imports are updated
export {
  ProgressParser,
  parseProgressMarkers,
} from '../frameworks/claude/progressParser.js';

export type {
  ParseResult,
  ProgressCallback,
} from '../frameworks/claude/progressParser.js';
