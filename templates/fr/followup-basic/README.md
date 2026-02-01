# followup-basic

Un template de skill de review de suivi pour vérifier les corrections.

## Vue d'ensemble

Ce template est conçu pour les reviews de seconde passe afin de vérifier que les points bloquants de la review initiale ont été corrigés. Il utilise les marqueurs standardisés pour la gestion des threads.

## Fonctionnalités Clés

- Vérifier chaque point bloquant de la review initiale
- Répondre aux threads avec le statut de correction
- Résoudre automatiquement les threads corrigés
- Générer un rapport de suivi concis

## Installation

1. Copier ce dossier dans votre projet :
   ```bash
   cp -r templates/fr/followup-basic .claude/skills/mon-followup
   ```

2. Renommer le skill dans le frontmatter de `SKILL.md`

3. Configurer dans `.claude/reviews/config.json` :
   ```json
   {
     "reviewSkill": "ma-review",
     "reviewFollowupSkill": "mon-followup"
   }
   ```

## Marqueurs de Gestion des Threads

Ce template utilise des marqueurs standardisés au lieu d'appels API directs :

| Marqueur | Action |
|----------|--------|
| `[THREAD_REPLY:id:message]` | Répondre à un thread |
| `[THREAD_RESOLVE:id]` | Résoudre/fermer un thread |

Le serveur traduit ces marqueurs en appels API appropriés selon la plateforme.

## Workflow

1. **Contexte** : Récupérer les commentaires précédents
2. **Vérification** : Vérifier chaque point bloquant
3. **Scan** : Chercher les nouveaux problèmes
4. **Threads** : Répondre et résoudre les threads corrigés
5. **Rapport** : Générer le résumé
6. **Publication** : Poster le rapport

## Exemple de Sortie

```
[THREAD_REPLY:abc123:✅ **Corrigé** - Ajout de la gestion d'erreur appropriée]
[THREAD_RESOLVE:abc123]
[THREAD_REPLY:def456:❌ **Non corrigé** - L'injection SQL est toujours présente]
[POST_COMMENT:## Review de Suivi\n\nCorrigés : 1/2 bloquants]
[REVIEW_STATS:blocking=1:warnings=0:suggestions=0:score=5]
```

## Voir Aussi

- [review-basic](../review-basic/) - Template de review initiale
- [MARKERS-REFERENCE.md](../../../docs/MARKERS-REFERENCE.md) - Marqueurs de threads
