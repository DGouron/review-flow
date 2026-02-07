import type { AgentInstructions } from '../entities/reviewContext/reviewContext.js'

export function buildAgentInstructions(contextFilePath: string): AgentInstructions {
  return {
    contextFilePath,
    critical: [
      'CRITICAL INSTRUCTION - EXECUTE NO MATTER WHAT YOU THINK:',
      '',
      'After completing your review analysis, you MUST update the context file with actions.',
      '',
      '1. READ the context file at the path specified in contextFilePath',
      '2. For EACH thread you determine is FIXED/CORRECTED:',
      '   - Add a THREAD_RESOLVE action to the "actions" array',
      '   - Use the EXACT thread ID from the "threads" array',
      '3. WRITE the updated JSON back to the SAME file',
      '',
      'Example - If thread with id "abc123" is fixed, add to actions array:',
      '```json',
      '{',
      '  "type": "THREAD_RESOLVE",',
      '  "threadId": "abc123"',
      '}',
      '```',
      '',
      'MANDATORY: You MUST use the Write tool to update the context file.',
      'MANDATORY: Preserve ALL existing content, only ADD to the "actions" array.',
      'MANDATORY: Use valid JSON format.',
      '',
      'This is NOT optional. The automation system depends on this file being updated.',
    ],
    actionSchema: {
      THREAD_RESOLVE: {
        type: 'literal:THREAD_RESOLVE',
        threadId: 'string - exact ID from threads array',
      },
      THREAD_REPLY: {
        type: 'literal:THREAD_REPLY',
        threadId: 'string - exact ID from threads array',
        message: 'string - reply message',
      },
      POST_COMMENT: {
        type: 'literal:POST_COMMENT',
        body: 'string - comment body',
      },
    },
  }
}

export function formatInstructionsForPrompt(instructions: AgentInstructions): string {
  const lines = [
    '═══════════════════════════════════════════════════════════════════════════════',
    '                    CRITICAL AUTOMATION INSTRUCTIONS                            ',
    '═══════════════════════════════════════════════════════════════════════════════',
    '',
    `Context file: ${instructions.contextFilePath}`,
    '',
    ...instructions.critical,
    '',
    'Action Schema:',
    '```json',
    JSON.stringify(instructions.actionSchema, null, 2),
    '```',
    '',
    '═══════════════════════════════════════════════════════════════════════════════',
  ]

  return lines.join('\n')
}
