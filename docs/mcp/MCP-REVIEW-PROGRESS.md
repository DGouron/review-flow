# MCP Review Progress - Specification

## Problème

Le système actuel parse les markers `[PROGRESS:agent:status]` depuis stdout de Claude, mais:
- stdout est bufferisé et non fiable au runtime
- Les markers sont custom et non standardisés
- Les skills du projet doivent connaître les markers à émettre
- Pas de validation, parsing regex fragile

## Solution

Créer un **MCP Server** local qui expose des tools standardisés pour le tracking de progression.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Server (Fastify + MCP Server)                                  │
│  ┌─────────────────────┐     ┌────────────────────────────────┐ │
│  │ MCP Server (stdio)  │────►│ WebSocket broadcast            │ │
│  │                     │     │ + JSON file update             │ │
│  └──────────┬──────────┘     └────────────────────────────────┘ │
└─────────────┼───────────────────────────────────────────────────┘
              │ MCP Protocol
              │
┌─────────────▼───────────────────────────────────────────────────┐
│  Claude CLI                                                     │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Skill appelle:                                              ││
│  │   mcp__review_progress__get_workflow()  → liste des steps   ││
│  │   mcp__review_progress__start_agent("clean-architecture")   ││
│  │   mcp__review_progress__complete_agent("clean-architecture")││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## MCP Tools

### 1. `get_workflow` (OBLIGATOIRE - appeler en premier)

Retourne le workflow standardisé à suivre.

**Input**: `{ jobId: string }`

**Output**:
```json
{
  "jobId": "gitlab:project:123",
  "workflow": {
    "phases": ["initializing", "agents-running", "synthesizing", "publishing", "completed"],
    "agents": [
      { "name": "clean-architecture", "displayName": "Clean Archi", "order": 1 },
      { "name": "ddd", "displayName": "DDD", "order": 2 },
      { "name": "react-best-practices", "displayName": "React", "order": 3 },
      { "name": "solid", "displayName": "SOLID", "order": 4 },
      { "name": "testing", "displayName": "Testing", "order": 5 },
      { "name": "code-quality", "displayName": "Code Quality", "order": 6 }
    ],
    "instructions": "Call start_agent before each audit, complete_agent after. Call set_phase to update global phase."
  },
  "context": {
    "threads": [...],
    "mergeRequestNumber": 123,
    "projectPath": "mentor-goal/main-app-v3"
  }
}
```

### 2. `set_phase`

Met à jour la phase globale de la review.

**Input**: `{ jobId: string, phase: "initializing" | "agents-running" | "synthesizing" | "publishing" | "completed" }`

**Output**: `{ success: true }`

### 3. `start_agent`

Signale le début d'un agent/audit.

**Input**: `{ jobId: string, agentName: string }`

**Output**: `{ success: true, agentName: string, startedAt: string }`

### 4. `complete_agent`

Signale la fin d'un agent/audit.

**Input**: `{ jobId: string, agentName: string, status?: "success" | "failed", error?: string }`

**Output**: `{ success: true, agentName: string, completedAt: string, overallProgress: number }`

### 5. `add_action`

Ajoute une action à exécuter (résoudre thread, poster commentaire).

**Input**:
```json
{
  "jobId": "string",
  "action": {
    "type": "THREAD_RESOLVE" | "THREAD_REPLY" | "POST_COMMENT",
    "threadId?": "string",
    "message?": "string",
    "body?": "string"
  }
}
```

**Output**: `{ success: true, actionId: string }`

### 6. `get_threads`

Récupère les threads ouverts de la MR.

**Input**: `{ jobId: string }`

**Output**: `{ threads: Thread[] }`

## Intégration avec Claude CLI

### Option A: MCP Config dans le projet (recommandé)

Ajouter dans `.claude/settings.json` du projet analysé:
```json
{
  "mcpServers": {
    "review-progress": {
      "command": "node",
      "args": ["/path/to/claude-review-automation/dist/mcpServer.js"],
      "env": {
        "REVIEW_JOB_ID": "${JOB_ID}",
        "REVIEW_LOCAL_PATH": "${LOCAL_PATH}"
      }
    }
  }
}
```

### Option B: MCP via argument CLI

```bash
claude --print \
  --mcp '{"review-progress":{"command":"node","args":["mcp-server.js"]}}' \
  -p "/review-front 4748"
```

## Workflow type dans un skill

```markdown
## Instructions de Review

1. **OBLIGATOIRE**: Appeler `mcp__review_progress__get_workflow()` pour obtenir:
   - La liste des agents à exécuter dans l'ordre
   - Les threads existants sur la MR
   - Le contexte de la review

2. Appeler `mcp__review_progress__set_phase("agents-running")`

3. Pour chaque agent dans l'ordre:
   - `mcp__review_progress__start_agent("agent-name")`
   - Effectuer l'audit
   - `mcp__review_progress__complete_agent("agent-name")`

4. `mcp__review_progress__set_phase("synthesizing")`
   - Compiler le rapport final

5. `mcp__review_progress__set_phase("publishing")`
   - Poster sur GitLab

6. `mcp__review_progress__set_phase("completed")`
```

## Key Files

1. `src/mcp/server.ts` - MCP Server setup
2. `src/mcp/mcpServerStdio.ts` - Stdio transport
3. `src/mcp/types.ts` - Types and validation
4. `src/mcpServer.ts` - Entry point (builds to `dist/mcpServer.js`)
5. `src/interface-adapters/controllers/mcp/` - Tool handlers
6. `src/usecases/mcp/` - Use cases

## Migration

1. Créer le MCP Server
2. Mettre à jour `claudeInvoker.ts` pour passer les env vars
3. Créer un skill template avec les instructions MCP
4. Déprécier le parsing stdout (garder en fallback)

## Tests

- Unit tests pour chaque tool
- Integration test: spawn MCP server + simuler appels
- E2E test: review complète avec MCP

## Status

- [ ] Spec validée
- [ ] MCP Server implémenté
- [ ] Tools implémentés
- [ ] Intégration claudeInvoker
- [ ] Skill template créé
- [ ] Tests
- [ ] Migration skills existants
