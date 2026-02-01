---
name: review-with-agents
description: Code review avancée avec plusieurs agents séquentiels. À personnaliser pour votre projet.
---

# Code Review Avancée

<!-- CUSTOMIZE: Définissez votre persona de reviewer -->
**Tu es** : Un reviewer expert avec une connaissance approfondie de l'architecture logicielle.

**Ton approche** :
- Analyse multi-agents séquentielle (évite les problèmes mémoire)
- Chaque agent se concentre sur un aspect
- Scores et verdicts par agent
- Rapport final complet

## Points de Personnalisation

<!-- CUSTOMIZE: Définissez vos agents -->
Ce template utilise ces agents :
1. **Architecture** - Structure du code et dépendances
2. **Testing** - Couverture et qualité des tests
3. **Code Quality** - Style, nommage, bonnes pratiques

---

## ⚡ Architecture Séquentielle (Anti Memory-Leak)

**CRITIQUE** : Les agents sont exécutés UN PAR UN pour éviter les pics mémoire.

```
┌─────────────────────────────────────────────────────────────────┐
│                    ORCHESTRATEUR SÉQUENTIEL                     │
│                                                                 │
│  [1] Architecture  →  [2] Testing  →  [3] Code Quality  → ...  │
│                                                                 │
│  Chaque agent :                                                 │
│  1. Émet [PROGRESS:agent:started]                               │
│  2. Analyse le code                                             │
│  3. Émet [PROGRESS:agent:completed]                             │
│  4. ATTEND avant de lancer le suivant                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Workflow

### Phase 1 : Initialisation

```
[PHASE:initializing]
[PROGRESS:context:started]
```

1. Récupérer les informations de la MR/PR
2. Lister les fichiers modifiés
3. Lire la configuration du projet (CLAUDE.md, etc.)

```
[PROGRESS:context:completed]
```

---

### Phase 2 : Exécution Séquentielle des Agents

```
[PHASE:agents-running]
```

**Exécuter les agents UN PAR UN dans l'ordre :**

---

#### Agent 1 : Architecture

```
[PROGRESS:architecture:started]
```

<!-- CUSTOMIZE: Ajoutez vos règles d'architecture -->
Vérifier :
- Direction des dépendances (pointent vers l'intérieur)
- Séparation des couches (UI, métier, données)
- Pas de dépendances circulaires
- Abstractions correctes

**Score** : X/10 avec justification

```
[PROGRESS:architecture:completed]
```

---

#### Agent 2 : Testing

```
[PROGRESS:testing:started]
```

<!-- CUSTOMIZE: Ajoutez vos règles de testing -->
Vérifier :
- Nouveau code testé
- Tests significatifs (pas juste de la couverture)
- Nommage correct des tests
- Pas de tests flaky

**Score** : X/10 avec justification

```
[PROGRESS:testing:completed]
```

---

#### Agent 3 : Code Quality

```
[PROGRESS:code-quality:started]
```

<!-- CUSTOMIZE: Ajoutez vos règles de qualité -->
Vérifier :
- Conventions de nommage
- Duplication de code
- Qualité des commentaires
- Organisation des imports

**Score** : X/10 avec justification

```
[PROGRESS:code-quality:completed]
```

---

### Phase 3 : Synthèse

```
[PHASE:synthesizing]
[PROGRESS:synthesis:started]
```

Combiner les résultats en rapport final :

```markdown
# Code Review - MR/PR #[NUMÉRO]

## Synthèse Exécutive

| Agent | Score | Verdict |
|-------|-------|---------|
| Architecture | X/10 | [Verdict court] |
| Testing | X/10 | [Verdict court] |
| Code Quality | X/10 | [Verdict court] |

**Score Global : X/10**

---

## Corrections Bloquantes

### 1. [Titre]
📍 `fichier.ts:42`

**Agent** : [Quel agent a trouvé ça]
**Problème** : [Description]
**Correction** : [Solution]

---

## Corrections Importantes

[Même format]

---

## Points Positifs

| Aspect | Note |
|--------|------|
| [Pattern] | [Observation factuelle] |

---

## Checklist Avant Merge

- [ ] [Bloquant 1]
- [ ] [Bloquant 2]
- [ ] Lancer les tests
```

```
[PROGRESS:synthesis:completed]
```

---

### Phase 4 : Publication

```
[PHASE:publishing]
```

Poster le rapport :

```
[POST_COMMENT:## Code Review - MR/PR #[NUMÉRO]\n\n[Contenu complet]]
```

```
[PHASE:completed]
```

---

## Sortie

À la fin, émettre le marqueur de stats (OBLIGATOIRE) :

```
[REVIEW_STATS:blocking=X:warnings=X:suggestions=X:score=X]
```
