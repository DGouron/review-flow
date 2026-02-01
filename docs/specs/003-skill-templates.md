# SPEC-003 : Skill Templates (EN/FR)

## User Story

En tant que développeur souhaitant créer mes propres skills de review,
je veux des templates de skills prêts à l'emploi en anglais et français,
afin de démarrer rapidement sans partir de zéro.

## Contexte

Les skills actuels (review-front, review-followup) sont spécifiques au projet MentorGoal et contiennent :
- Des références hardcodées (mentor-goal/main-app-v3)
- Des règles métier spécifiques (Clean Architecture, DDD, etc.)
- Un mix de commandes techniques et de logique de review

Les templates doivent :
1. Être génériques et adaptables
2. Utiliser les nouveaux marqueurs standardisés (SPEC-001)
3. Séparer clairement les parties à personnaliser

## Règles métier

- Templates disponibles en `/templates/en/` et `/templates/fr/`
- Chaque template est un dossier complet (SKILL.md + config exemple)
- Les parties à personnaliser sont clairement marquées avec `<!-- CUSTOMIZE: ... -->`
- Les templates utilisent UNIQUEMENT les marqueurs standardisés (pas de `glab`/`gh` direct)

## Livrables

### Structure des templates

```
templates/
├── en/
│   ├── review-basic/
│   │   ├── SKILL.md
│   │   └── README.md
│   ├── review-with-agents/
│   │   ├── SKILL.md
│   │   └── README.md
│   └── followup-basic/
│       ├── SKILL.md
│       └── README.md
└── fr/
    ├── review-basic/
    │   ├── SKILL.md
    │   └── README.md
    ├── review-with-agents/
    │   ├── SKILL.md
    │   └── README.md
    └── followup-basic/
        ├── SKILL.md
        └── README.md
```

### Template : review-basic

Skill de review minimal avec :
- Analyse du diff
- Détection des problèmes basiques
- Rapport simple
- Marqueurs de progression

### Template : review-with-agents

Skill de review avancé avec :
- Plusieurs agents (architecture, testing, code quality)
- Exécution séquentielle (anti memory-leak)
- Scoring
- Commentaires inline

### Template : followup-basic

Skill de suivi avec :
- Vérification des corrections
- Réponse aux threads (via marqueurs)
- Résolution des threads (via marqueurs)
- Rapport de suivi

## Critères d'acceptation

### Scénario : Template fonctionnel immédiatement

```gherkin
Given un développeur copiant templates/en/review-basic/ dans son projet
When il remplace les placeholders <!-- CUSTOMIZE --> par ses valeurs
And il lance une review
Then la review s'exécute sans erreur
And les marqueurs de progression sont émis correctement
```

### Scénario : Pas de commandes plateforme directes

```gherkin
Given un template de skill
When on recherche "glab" ou "gh api" dans le fichier
Then aucune occurrence n'est trouvée
And seuls les marqueurs [THREAD_...] et [POST_COMMENT:...] sont utilisés
```

### Scénario : Sections personnalisables identifiées

```gherkin
Given le template review-with-agents
When on lit le SKILL.md
Then chaque section à personnaliser est marquée <!-- CUSTOMIZE: description -->
And une liste des personnalisations possibles est en début de fichier
```

### Scénario : README explicatif

```gherkin
Given un template
When on lit son README.md
Then on comprend le but du template
And on voit les étapes d'installation
And on voit un exemple de config.json correspondant
```

## Contenu des templates

### review-basic (EN)

```markdown
---
name: review-basic
description: Basic code review skill template
---

# Basic Code Review

<!-- CUSTOMIZE: Describe your review persona and approach -->
You are a code reviewer focused on quality and maintainability.

## Activation

This skill activates when:
- User asks for "review", "code review"
- Triggered via webhook on MR/PR assignment

## Workflow

### Phase 1: Context

[PHASE:initializing]
[PROGRESS:context:started]

1. Identify the MR/PR from the provided number
2. Fetch the diff to analyze

[PROGRESS:context:completed]

### Phase 2: Analysis

[PHASE:agents-running]
[PROGRESS:analysis:started]

<!-- CUSTOMIZE: Add your review rules here -->
Check for:
- Code style issues
- Potential bugs
- Missing tests

[PROGRESS:analysis:completed]

### Phase 3: Report

[PHASE:synthesizing]
[PROGRESS:report:started]

Generate a summary with:
- Issues found (blocking/warnings/suggestions)
- Score out of 10

[PROGRESS:report:completed]

### Phase 4: Publish

[PHASE:publishing]

Post the report:
[POST_COMMENT:## Review Report\n\n<!-- Report content here -->]

[PHASE:completed]

[REVIEW_STATS:blocking=X:warnings=X:suggestions=X:score=X]
```

### followup-basic (EN)

```markdown
---
name: followup-basic
description: Basic follow-up review skill template
---

# Follow-up Review

## Workflow

### Phase 1: Context

[PHASE:initializing]
[PROGRESS:context:started]

Fetch previous review comments to identify blocking issues.

[PROGRESS:context:completed]

### Phase 2: Verification

[PHASE:agents-running]
[PROGRESS:verify:started]

For each blocking issue from the previous review:
- Check if the code was modified as requested
- Mark as FIXED or NOT FIXED

[PROGRESS:verify:completed]

### Phase 3: Thread Management

[PROGRESS:threads:started]

For each FIXED issue, reply and resolve the thread:

[THREAD_REPLY:THREAD_ID:✅ **Fixed** - Brief description of what was done.]
[THREAD_RESOLVE:THREAD_ID]

For NOT FIXED issues, reply without resolving:

[THREAD_REPLY:THREAD_ID:❌ **Not fixed** - The issue still persists.]

[PROGRESS:threads:completed]

### Phase 4: Report

[PHASE:synthesizing]
[PROGRESS:report:started]

Generate follow-up summary.

[PROGRESS:report:completed]

### Phase 5: Publish

[PHASE:publishing]

[POST_COMMENT:## Follow-up Review\n\nFixed: X/Y blocking issues]

[PHASE:completed]

[REVIEW_STATS:blocking=X:warnings=0:suggestions=0:score=X]
```

## Hors scope

- Templates pour des frameworks spécifiques (React, Vue, etc.)
- Templates avec logique métier prédéfinie (DDD, Clean Architecture)
- Traduction automatique des templates

## Évaluation INVEST

| Critère | Statut | Note |
|---------|--------|------|
| Independent | ✅ | Dépend de SPEC-001 pour les marqueurs |
| Negotiable | ✅ | Contenu des templates flexible |
| Valuable | ✅ | Accélère l'adoption |
| Estimable | ✅ | ~1 jour |
| Small | ✅ | 3 templates x 2 langues |
| Testable | ✅ | Templates doivent s'exécuter sans erreur |
