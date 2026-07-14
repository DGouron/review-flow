# Add a review-advanced template with sequential audits, a scored security block, and cited pedagogical lessons

## Context

`templates/{en,fr}/review-basic` and `review-with-agents` are stack-agnostic skeletons with empty rule sections — good starting points, but they don't encode the stricter format already proven in this repo's own dogfooding skills (`.claude/skills/review-fullstack`, `review-front`): a fixed sequence of audits, a dedicated scored Security block, and a mandatory citation for every point raised (real author quote + explanation + practical application). Consumers who want that rigor from day one have nothing to copy today.

## Rules

- template ships as `templates/{en,fr}/review-advanced/{SKILL.md,README.md}`
- audit sequence, in order: Clean Architecture, DDD, Stack Best Practices, SOLID, Testing, Code Quality, Pareto Bug Prevention, Naming Audit
- the Naming Audit result is excluded from the overall score and reported in its own section
- Security is a 9th audit, scored, and blocking if unresolved
- the "Stack Best Practices" section is an explicit placeholder for the consumer's own stack — no framework name hardcoded
- every point raised cites a real author: quote + explanation + practical application
- an authorized-sources table ships with defaults (Robert C. Martin, Eric Evans, Vaughn Vernon, Kent Beck, Martin Fowler) and the README states it is editable
- template uses the stdout-marker protocol (`[PHASE:...]`, `[PROGRESS:...]`, `[REVIEW_STATS:...]`) to match the current `review-basic` / `review-with-agents` family, not MCP tool calls
- EN and FR variants have the identical audit sequence and section structure

## Scenarios

- audit sequence present: {file: "templates/en/review-advanced/SKILL.md"} → contains audits "Clean Architecture,DDD,Stack Best Practices,SOLID,Testing,Code Quality,Pareto Bug Prevention,Naming Audit" in order
- naming excluded from score: {file} → score computation excludes "Naming Audit" + naming reported as its own section
- security dedicated and blocking: {file} → security audit is scored and marked blocking-if-unresolved
- citation format enforced: {file} → pedagogical lesson block contains quote + author + explanation + practical application placeholders
- sources table editable: {file} → authorized-sources table present + README states it is customizable
- no stack hardcoded: {file} → "Stack Best Practices" section contains no literal framework name ("React", "Vue", "Angular")
- fr matches en: {file: "templates/fr/review-advanced/SKILL.md"} → same audit count and same marker protocol as EN, headers in French

## Out of Scope

- the follow-up variant (separate spec, see 217-followup-advanced-template)
- framework-specific rule content (left as a placeholder for the consumer)
- a CLI command that scaffolds or copies the template automatically
- changes to the existing `review-basic` / `review-with-agents` templates
- MCP tool call variant (existing MCP templates from spec 56 are superseded; out of scope here)

## Glossary

| Term | Definition |
|------|------------|
| Naming Audit | The 8th sequential audit checking identifier/file naming; excluded from the overall score as subjective/non-blocking |
| Pareto Bug Prevention | Audit focused on the defect categories that historically cause most production bugs |
| Pedagogical Lesson | Mandatory citation block (quote + explanation + practical application) attached to each review point |
| Authorized sources | The editable table of real authors/books a lesson may cite |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Pure template content, no dependency on 217 or on runtime code |
| Negotiable | OK | Exact wording of audit prompts and default sources table left to the implementer |
| Valuable | OK | Gives consumers a copy-paste-ready rigorous review skill instead of an empty skeleton |
| Estimable | OK | Content is a generalization of existing internal skills already in this repo |
| Small | OK | 4 files: SKILL.md + README.md, EN + FR |
| Testable | OK | Each rule maps to a scenario checkable by reading file content |

## RICE Score

| Criteria | Score | Justification |
|----------|-------|---------------|
| Reach | 3 | Static template content only, no code layer touched |
| Impact | 1 | Medium — improves review quality for any adopting project |
| Confidence | 80% | Content generalized from proven internal skills already in this repo |
| Effort | 3 pts | 4 files, mostly adaptation of existing internal skill content |
| **Score** | **0.80** | |

Priority: Moderate

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md` for the full checklist.
