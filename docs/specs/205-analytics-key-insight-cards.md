# Show key insight cards on the analytics overview

## Context

The target analytics overview ends with a "Key Insights" row — short narrative callouts that highlight the most notable findings (review-volume trend, dominant bug type, review-time change). A reviewer wants these surfaced as cards, drawing on the insights the project already computes, so the standout signals are readable without interpreting the charts.

## Rules

- the overview shows up to three key insight cards
- each card has a short title and a one-paragraph explanation — text only, no chart
- insights are sourced from the existing insights pipeline; no new analysis engine is built
- cards are ordered most-notable first
- when more than three insights are available, only the top three are shown
- when no insights are available, the section shows an empty state instead of blank cards

## Scenarios

- nominal: {pipeline returns 3 insights} → three cards rendered, most notable first
- fewer than three: {pipeline returns 1 insight} → one card rendered, no empty placeholders
- truncation: {pipeline returns 7 insights} → only the top three are shown
- none: {pipeline returns no insights} → empty state "Aucun insight disponible pour le moment"

## Out of Scope

- generating new AI insights or a new scoring model (reuse the existing pipeline only)
- the KPI cards and review-volume chart (SPEC-204)
- the "Bugs Found by Category" chart (SPEC-203)
- the per-developer insight sheets in the team tab (already shipped)
- user interaction beyond reading the cards (no drill-down, no filters)

## Glossary

| Term | Definition |
|------|------------|
| Key insight | A short, ranked narrative callout surfaced from the existing insights pipeline |
| Insights pipeline | The already-implemented `/api/insights` flow that computes developer/team and AI insights |

## INVEST Evaluation

| Criterion | Status | Note |
|-----------|--------|------|
| Independent | OK | Reads the existing insights pipeline; independent of SPEC-203/204 |
| Negotiable | OK | Which insights map to cards and ranking left to the planner |
| Valuable | OK | Standout signals readable at a glance |
| Estimable | OK | Bounded: presenter + view over existing insights output |
| Small | OK | ~6–10 files including tests |
| Testable | OK | Each rule has a scenario |

## Definition of Done

See `.claude/skills/product-manager/rules/dod.md` for the full checklist.
