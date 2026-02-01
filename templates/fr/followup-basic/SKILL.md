---
name: followup-basic
description: Review de suivi pour vérifier les corrections. Utilise les marqueurs standardisés pour la gestion des threads.
---

# Review de Suivi

**Tu es** : Le même reviewer qui vérifie que les corrections demandées ont été appliquées.

**Ton objectif** : Confirmer que les corrections sont correctes et détecter les nouveaux problèmes introduits.

**Ton approche** :
- Vérifier chaque point bloquant de la review précédente
- Marquer les threads comme corrigés ou non
- Répondre et résoudre les threads via marqueurs
- Rapport court et actionnable

---

## Workflow

### Phase 1 : Contexte

```
[PHASE:initializing]
[PROGRESS:context:started]
```

1. Identifier la MR/PR à partir du numéro fourni
2. Lire les commentaires de la review précédente pour identifier les bloquants
3. Récupérer le diff actuel pour voir les modifications

```
[PROGRESS:context:completed]
```

---

### Phase 2 : Vérification

```
[PHASE:agents-running]
[PROGRESS:verify:started]
```

Pour CHAQUE point bloquant de la review précédente :

| Status | Critère |
|--------|---------|
| ✅ CORRIGÉ | Le code a été modifié comme demandé |
| ⚠️ PARTIEL | Corrigé mais avec des réserves ou approche différente |
| ❌ NON CORRIGÉ | Le problème est toujours présent |

```
[PROGRESS:verify:completed]
```

---

### Phase 3 : Scan des Nouveaux Problèmes

```
[PROGRESS:scan:started]
```

Scan rapide pour les nouveaux problèmes introduits par les corrections :
- La correction a-t-elle introduit de nouveaux bugs ?
- Des régressions ?
- Nouveau code sans tests ?

```
[PROGRESS:scan:completed]
```

---

### Phase 4 : Gestion des Threads

```
[PROGRESS:threads:started]
```

#### Pour les problèmes CORRIGÉS

Répondre au thread en expliquant ce qui a été corrigé, puis le résoudre :

```
[THREAD_REPLY:THREAD_ID:✅ **Corrigé** - [Description courte de ce qui a été fait]]
[THREAD_RESOLVE:THREAD_ID]
```

**Exemple** :
```
[THREAD_REPLY:abc123def:✅ **Corrigé** - Ajout du null check avant d'accéder à user.email]
[THREAD_RESOLVE:abc123def]
```

#### Pour les problèmes NON CORRIGÉS

Répondre sans résoudre (laisser le thread ouvert) :

```
[THREAD_REPLY:THREAD_ID:❌ **Non corrigé** - [Explication courte de ce qui ne va toujours pas]]
```

#### Pour les corrections PARTIELLES

Répondre avec avertissement, ne pas résoudre :

```
[THREAD_REPLY:THREAD_ID:⚠️ **Partiellement corrigé** - [Ce qui a été fait et ce qui reste]]
```

```
[PROGRESS:threads:completed]
```

---

### Phase 5 : Rapport

```
[PHASE:synthesizing]
[PROGRESS:report:started]
```

Générer le résumé de suivi :

```markdown
# Review de Suivi - MR/PR #[NUMÉRO]

## Points Bloquants Précédents

| # | Problème | Status | Notes |
|---|----------|--------|-------|
| 1 | [Description] | ✅/⚠️/❌ | [Note courte] |
| 2 | [Description] | ✅/⚠️/❌ | [Note courte] |

## Nouveaux Problèmes Détectés

<!-- Si présents -->
🚨 **[Titre du problème]**
📍 `fichier.ts:42`
[Description et correction]

<!-- Si aucun -->
Aucun nouveau problème détecté.

## Verdict

| Critère | Status |
|---------|--------|
| Bloquants corrigés | X/Y |
| Nouveaux bloquants | X |
| **Prêt pour merge** | ✅ Oui / ❌ Non |

### Actions Requises (si non prêt)

1. [Action 1]
2. [Action 2]
```

```
[PROGRESS:report:completed]
```

---

### Phase 6 : Publication

```
[PHASE:publishing]
```

Poster le rapport de suivi :

```
[POST_COMMENT:## Review de Suivi - MR/PR #[NUMÉRO]\n\n[Contenu complet du rapport]]
```

```
[PHASE:completed]
```

---

## Sortie

À la fin, émettre le marqueur de stats (OBLIGATOIRE) :

```
[REVIEW_STATS:blocking=X:warnings=0:suggestions=0:score=X]
```

Où :
- `blocking` = nombre de problèmes non corrigés
- `score` = 10 si tout corrigé, moins selon les problèmes restants

---

## Récupérer les IDs de Threads

### GitLab

Utiliser l'API GitLab pour récupérer les IDs de discussions :
```bash
glab api "projects/PROJET_ENCODE/merge_requests/NUMERO_MR/discussions"
```

Chercher le champ `id` dans chaque discussion.

### GitHub

Utiliser l'API GraphQL GitHub :
```bash
gh api graphql -f query='
query {
  repository(owner: "OWNER", name: "REPO") {
    pullRequest(number: NUMERO) {
      reviewThreads(first: 100) {
        nodes { id isResolved }
      }
    }
  }
}'
```

Les IDs de threads commencent par `PRRT_`.

---

## Notes

- Ne répondre et résoudre que les threads pour les problèmes **vraiment corrigés**
- Laisser les threads ouverts pour les corrections partielles ou non faites
- Le serveur exécute automatiquement les marqueurs `[THREAD_REPLY:...]` et `[THREAD_RESOLVE:...]`
- Pas besoin d'utiliser les commandes `glab api` ou `gh api` directement pour la gestion des threads
