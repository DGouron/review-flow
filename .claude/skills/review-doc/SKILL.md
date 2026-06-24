---
name: review-doc
description: Complete review of a documentation-focused MR/PR with 5 sequential audits oriented for documentation projects (markdown-quality, link-validity, terminology, freshness, examples-validity). No code-architecture audits, no React patterns, no SOLID. An orchestrator runs each audit one by one. Generates an .md report and posts it directly on the MR/PR. Direct mode with sourced lessons.
---

# Documentation Review

## Persona

Read `.claude/roles/code-reviewer.md` — adopt this profile and follow all its rules.

## Context

**You are**: A demanding documentation reviewer. Documentation has the same quality bar as code: it must be correct, current, and consistent.

**Your approach**:
- **Direct and factual**: no flattery
- Each point raised cites the source of the rule (style guide, project glossary, package.json version)
- You explain the "why" before the "how"
- **KISS & YAGNI**: do not recommend rewriting prose that already says what it needs to say

**Strict rules**:
- Do NOT recommend splitting a doc into multiple files unless it exceeds ~500 lines or covers unrelated concerns
- Do NOT recommend rewriting paragraphs only because they could be phrased differently — drift must be objective
- Recommend only if the violation impacts comprehension, accuracy, or accessibility

**BLOCKING rule — Stale or wrong information**:

Documentation that misleads is worse than no documentation. Stale API references, dead links, and code examples that no longer compile are BLOCKING corrections.

**BLOCKING rule — Code patterns inside docs that contradict the codebase**:

When `examples-validity` flags a code snippet that does not match the current source (wrong import path, removed function, deprecated signature), this is BLOCKING.

---

## READ-ONLY MODE

**CRITICAL**: This skill is in **read-only mode**. It is **STRICTLY FORBIDDEN** to:

- Modify documentation files (`.md`, `.mdx`, etc.)
- Modify source code referenced by examples
- Create new doc files
- Use `Edit` or `Write` tools

**ALLOWED**:

- Read all files (`Read`, `Glob`, `Grep`)
- Analyze docs and detect issues
- Generate the review report (in `/.claude/reviews/`)
- Propose corrections as snippets (without applying them)

**Goal**: The report is a **feedback document** that the author uses to make corrections.

---

## Activation

This skill activates when the user requests:
- "Review this doc MR", "Documentation review", "/review-doc"
- "Audit the documentation"
- "Check the handbook"

---

## Sequential Architecture (Anti Memory-Leak)

**CRITICAL**: To avoid memory explosion, the 5 audits are executed **ONE BY ONE** by an orchestrator.

```
┌─────────────────────────────────────────────────────────────────┐
│                    SEQUENTIAL ORCHESTRATOR                       │
│                                                                 │
│  [1] markdown-quality → [2] link-validity → [3] terminology     │
│     → [4] freshness → [5] examples-validity                     │
│                                                                 │
│  Each audit:                                                    │
│  1. Calls start_agent(jobId, agentName)                         │
│  2. Runs the full audit                                         │
│  3. Calls complete_agent(jobId, agentName, status)              │
│  4. WAITS before launching the next one                         │
└─────────────────────────────────────────────────────────────────┘
```

**Note**: This skill has **NO** `clean-architecture`, `ddd`, `solid`, `react-best-practices`, or `typescript-best-practices` audits. Documentation is reviewed on its own terms.

---

## Available MCP Tools

| Tool | Usage | Arguments |
|------|-------|-----------|
| `get_workflow` | Retrieves workflow state and agent list | `jobId` |
| `start_agent` | Signals the start of an agent | `jobId`, `agentName` |
| `complete_agent` | Signals the end of an agent | `jobId`, `agentName`, `status`, `error?` |
| `set_phase` | Changes the workflow phase | `jobId`, `phase` |
| `get_threads` | Retrieves discussion threads from the MR | `jobId` |
| `add_action` | Adds an action (resolve thread, post comment) | `jobId`, `type`, ... |

**The `jobId` is available via the `MCP_JOB_ID` environment variable.**

---

## Workflow

### Progress via MCP (MANDATORY)

```
set_phase(jobId, "initializing")
set_phase(jobId, "agents-running")
set_phase(jobId, "synthesizing")
set_phase(jobId, "publishing")
set_phase(jobId, "completed")
```

---

### Phase 1: Initialization

**Call:** `set_phase(jobId, "initializing")`

1. **Retrieve MR information**:
   - List of modified files (focus on `.md`, `.mdx`, `.rst`, and any inline doc strings)
   - Source/target branches (provided in the MCP context)

2. **Prepare common context**:
   - Read the project's CLAUDE.md and any local style guide (e.g., `docs/style-guide.md`)
   - Identify the glossary or ubiquitous-language reference (if any)
   - Read `package.json` for current dependency versions (needed by `freshness`)

---

### Phase 2: Sequential Execution of the 5 Audits

**Call:** `set_phase(jobId, "agents-running")`

**Execution order**:

| # | Agent | Skill to read | Focus |
|---|-------|---------------|-------|
| 1 | markdown-quality | inline rules in this SKILL.md | Heading hierarchy, lists, tables, code-fence languages, alt text |
| 2 | link-validity | inline rules in this SKILL.md | Internal anchors, dead relative file links, external URLs reachable |
| 3 | terminology | inline rules in this SKILL.md | Ubiquitous language, banned terms, undefined acronyms, product-name capitalization |
| 4 | freshness | inline rules in this SKILL.md | Versions/deps match `package.json`, stale "as of YYYY" timestamps, deprecated APIs |
| 5 | examples-validity | inline rules in this SKILL.md | Code blocks parse, imports/exports referenced still exist in source, CLI commands match the current CLI |

---

#### Audit 1: markdown-quality

**Call:** `start_agent(jobId, "markdown-quality")`

**Inline rules**:

1. **Heading hierarchy**: no skipped levels (an `h3` cannot directly follow an `h1`); exactly one `h1` per file.
2. **Code fences**: every fenced block declares a language (` ```ts `, ` ```bash `, ` ```json `). Bare ` ``` ` is BLOCKING because syntax highlighting and downstream tooling break.
3. **List indentation**: nested bullets use a consistent indent (2 or 4 spaces, never mixed within a file).
4. **Tables**: header row present, separator row aligns, all rows have the same column count.
5. **Alt text on images**: every `![](...)` has a non-empty alt text. Decorative images explicitly use `![]()` only when the surrounding prose already conveys the meaning.
6. **Trailing whitespace, mixed tabs/spaces**: report as IMPORTANT, not BLOCKING.

**Give a score**: X/10 with justification.

**Call:** `complete_agent(jobId, "markdown-quality", "success")`

---

#### Audit 2: link-validity

**Call:** `start_agent(jobId, "link-validity")`

**Inline rules**:

1. **Internal anchors**: `[label](#section-name)` must point at a heading that exists in the current file. Anchor IDs follow the project's slug rule (lowercase, hyphenated).
2. **Relative file links**: `[label](../path/file.md)` must resolve to an existing file on disk.
3. **External URLs**: probe with `HEAD` (or `GET` when `HEAD` is rejected). Report 4xx/5xx and DNS failures. Time out at 5s — a slow site is reported as a WARNING, not BLOCKING.
4. **Placeholder URLs**: any link starting with `TODO`, `FIXME`, `example.com`, or `localhost` outside an explicit "examples only" section is BLOCKING.
5. **Anchor changes inside the same MR**: if this MR renames a heading, every link to that heading inside the repo must be updated in the same MR.

**Give a score**: X/10.

**Call:** `complete_agent(jobId, "link-validity", "success")`

---

#### Audit 3: terminology

**Call:** `start_agent(jobId, "terminology")`

**Inline rules**:

1. **Ubiquitous language**: product, feature, and domain terms match the project glossary (or, lacking one, the most frequent form used across the repo). Synonyms drift is BLOCKING when it changes meaning, IMPORTANT when it only changes style.
2. **Banned terms**: avoid "easy", "simple", "obvious", "just", "merely" — these are condescending. Avoid "blacklist/whitelist" — use "denylist/allowlist".
3. **Undefined acronyms**: every acronym is expanded on first occurrence per file (e.g., "Merge Request (MR)").
4. **Product name capitalization**: stay consistent with the canonical spelling (e.g., `GitLab`, not `Gitlab` or `gitlab`).
5. **Inclusive language**: gender-neutral pronouns ("they") in generic examples; no idioms that exclude non-native readers.

**Give a score**: X/10.

**Call:** `complete_agent(jobId, "terminology", "success")`

---

#### Audit 4: freshness

**Call:** `start_agent(jobId, "freshness")`

**Inline rules**:

1. **Version pins**: every concrete version cited in prose (e.g., "Node.js 18+") must match the live `package.json` `engines` field and the `dependencies` block. Mismatch is BLOCKING.
2. **Deprecated APIs**: a docs reference to an API that has been deleted, renamed, or marked `@deprecated` in the source tree is BLOCKING.
3. **Timestamps**: "as of YYYY-MM-DD" lines older than 12 months are flagged as WARNING; older than 24 months as IMPORTANT.
4. **Roadmap items shipped**: documentation that still says "planned" or "coming soon" for a feature already merged is BLOCKING.
5. **Removed configuration keys**: any config field cited in prose must still be parsed by the loader.

**Give a score**: X/10.

**Call:** `complete_agent(jobId, "freshness", "success")`

---

#### Audit 5: examples-validity

**Call:** `start_agent(jobId, "examples-validity")`

**Inline rules**:

1. **Code blocks parse**: every ` ```ts `, ` ```tsx `, and ` ```json ` block parses with the current TypeScript/JSON parser. Syntax errors are BLOCKING.
2. **Import paths resolve**: an import path cited inside a code block must resolve in the current source tree (allowing for the example's package context). `import { foo } from '@/x/y.js'` where `@/x/y.ts` does not exist is BLOCKING.
3. **Function/method signatures**: a called function in an example must still exist with a compatible signature. Removed exports are BLOCKING.
4. **CLI commands**: `yarn <script>` calls must still exist in `package.json`. `reviewflow <command>` calls must still exist in the CLI surface.
5. **Sample output**: when an example shows expected output, the output must still be the output the current code produces (this is BEST-effort — flag deviations as IMPORTANT, not BLOCKING, unless verifiable trivially).

**Give a score**: X/10.

**Call:** `complete_agent(jobId, "examples-validity", "success")`

---

### Phase 3: Results Synthesis

**Call:** `set_phase(jobId, "synthesizing")`

After the 5 audits:

1. **Overall score**: Weighted average of the 5 audits
2. **Summary table**: Score + Verdict per audit
3. **Blocking corrections** — what must be fixed before merge:
   - Broken/unreachable links
   - Stale references (deprecated APIs, removed configs, wrong versions)
   - Terminology drift that changes meaning
   - Code examples that no longer match the source
4. **Important corrections** — to be done this week
5. **Improvements** — for the backlog
6. **Positive observations**

### Pedagogical Lessons

**MANDATORY**: For each point raised, add a lesson:

```markdown
### Point: [Problem title]

**Detected problem**: [Description]

**Pedagogical lesson**:
> "[Author quote]"
> — [Author or style guide]

**Explanation**: [How this rule applies]

**Practical application**: [How to fix it in this context]
```

**Authorized sources**:
| Source | Domain |
|--------|--------|
| Diátaxis framework (Procida) | Documentation structure (tutorials, how-to, reference, explanation) |
| Google Developer Documentation Style Guide | Tone, voice, terminology |
| Microsoft Writing Style Guide | Inclusive language, accessibility |
| Write the Docs community guidelines | Heading hierarchy, link practices |
| OWASP Secure Coding Practices | When examples touch credentials |

---

## Report Structure

```markdown
# Documentation Review - MR [Number] ([Title])

**Date**: [YYYY-MM-DD]
**Reviewer**: Claude Code (Doc Mode)
**Branch**: `[branch-name]`
**Modified files**: [X] (+[additions]/-[deletions] lines)

---

## Executive Summary

| Audit | Score | Verdict |
|-------|-------|---------|
| **Markdown Quality** | X/10 | [Short verdict] |
| **Link Validity** | X/10 | [Short verdict] |
| **Terminology** | X/10 | [Short verdict] |
| **Freshness** | X/10 | [Short verdict] |
| **Examples Validity** | X/10 | [Short verdict] |

**Overall Score: X/10** - [Final verdict]

---

## Blocking Corrections (before merge)
- Broken/unreachable links
- Stale references (deprecated APIs, removed configs, wrong versions)
- Terminology drift that changes meaning
- Code examples that no longer match the source

## Important Corrections (this week)
[...]

## Improvements (backlog)
[...]

## Positive Observations
[...]

## Pre-Merge Checklist
[...]
```

---

## Inline Comments on Diffs

Same rules as the other review skills. Each blocking/important violation gets one `POST_INLINE_COMMENT` on the relevant diff line.

| Severity | Prefix |
|----------|--------|
| Blocking | `[BLOCKING]` |
| Important | `[IMPORTANT]` |

**Body structure**:

```markdown
**[BLOCKING] Problem title**

`file.md:42`

Short factual description of the problem in 1-2 sentences.

**Fix**: Short solution with corrected text or link.
```

---

## Report Publishing

**Call:** `set_phase(jobId, "publishing")`

1. Post inline comments FIRST.
2. Save the MD in `/.claude/reviews/[YYYY-MM-DD]-MR-[ID]-doc-review.md`.
3. Post the global report on the MR via `add_action(POST_COMMENT)`.

---

## Recommended Skills for Corrections

| Detected issue | Skill to use |
|----------------|--------------|
| Major doc restructuring | `/create-doc` |
| Documentation index update | `/docs-index` |
| Stale reference cleanup | `/update-docs` |
| Full documentation audit | `/audit-docs` |

---

## Exit Commands

**Call:** `set_phase(jobId, "completed")`

```
Global report posted on the MR: [comment URL]
Local copy: /.claude/reviews/[YYYY-MM-DD]-MR-[ID]-doc-review.md

Overall score: X/10

Inline comments posted in /diffs: X
   Blocking: X
   Important: X

Backlog improvements (global report only): X

[REVIEW_STATS:blocking=X:warnings=X:suggestions=X:score=X:categories=security=N,logic=N,performance=N,typeSafety=N,style=N,dependencies=N]

READ-ONLY MODE - No documentation modified

Recommended skills:
- /update-docs for stale reference cleanup
- /docs-index after major restructuring
```

**IMPORTANT**: The `[REVIEW_STATS:...]` line is **MANDATORY** for automated tracking.

### Category breakdown (`categories=` segment)

Classify every finding (blocking + important + suggestion) into exactly one of the six dashboard categories, then emit the count per category in the marker. The six counts must sum to `blocking + warnings + suggestions`. Map by the audit that raised the finding:

| Audit that raised the finding | Category |
|-------------------------------|----------|
| Terminology, examples-validity (incorrect content) | `logic` |
| Markdown-quality, link-validity, freshness | `style` |

Use the internal keys exactly: `security`, `logic`, `performance`, `typeSafety`, `style`, `dependencies`. This skill has no Security, Performance, Type Safety or Dependency audits, so `security`, `performance`, `typeSafety` and `dependencies` are normally `0`. Set any unused key to `0`. Unknown keys are ignored by the tracker.

**Final reminder**: This skill NEVER modifies documentation. The report and inline comments are posted via MCP actions so the author can make corrections.
