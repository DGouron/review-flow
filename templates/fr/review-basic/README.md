# review-basic

Un template de skill de code review minimal pour claude-review-automation.

## Vue d'ensemble

Ce template fournit une structure basique pour les code reviews avec :
- Analyse en une passe
- Catégorisation standard des issues (bloquant/important/suggestion)
- Format de rapport simple
- Marqueurs standardisés pour l'automatisation

## Installation

1. Copier ce dossier dans votre projet :
   ```bash
   cp -r templates/fr/review-basic .claude/skills/ma-review
   ```

2. Renommer le skill dans le frontmatter de `SKILL.md` :
   ```yaml
   ---
   name: ma-review
   description: Code review pour mon projet
   ---
   ```

3. Personnaliser les règles de review dans les sections `<!-- CUSTOMIZE: -->`

4. Ajouter dans la config du projet (`.claude/reviews/config.json`) :
   ```json
   {
     "github": false,
     "gitlab": true,
     "reviewSkill": "ma-review"
   }
   ```

## Personnalisation

Chercher les commentaires `<!-- CUSTOMIZE: -->` dans `SKILL.md` :

1. **Persona du reviewer** : Définir qui est le reviewer
2. **Checklist de review** : Ajouter les règles spécifiques au projet
3. **Catégories d'analyse** : Personnaliser ce qu'il faut vérifier

## Marqueurs Utilisés

| Marqueur | Usage |
|----------|-------|
| `[PHASE:...]` | Suivre la phase de review |
| `[PROGRESS:...:started/completed]` | Suivre la progression |
| `[POST_COMMENT:...]` | Poster le commentaire de review |
| `[REVIEW_STATS:...]` | Rapporter les statistiques |

## Voir Aussi

- [REVIEW-SKILLS-GUIDE.md](../../../docs/REVIEW-SKILLS-GUIDE.md) - Documentation complète
- [MARKERS-REFERENCE.md](../../../docs/MARKERS-REFERENCE.md) - Référence des marqueurs
