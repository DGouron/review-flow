# review-with-agents

Un skill de code review avancé avec plusieurs agents séquentiels.

## Vue d'ensemble

Ce template fournit une structure de review multi-agents :
- Exécution séquentielle pour éviter les problèmes mémoire
- Chaque agent se concentre sur un aspect
- Scores individuels par agent
- Suivi de progression en temps réel via le dashboard

## Installation

1. Copier ce dossier dans votre projet :
   ```bash
   cp -r templates/fr/review-with-agents .claude/skills/ma-review
   ```

2. Renommer le skill dans le frontmatter de `SKILL.md`

3. Personnaliser les agents dans les sections `<!-- CUSTOMIZE: -->`

4. Configurer les agents dans `.claude/reviews/config.json` :
   ```json
   {
     "reviewSkill": "ma-review",
     "agents": [
       { "name": "architecture", "displayName": "Architecture" },
       { "name": "testing", "displayName": "Testing" },
       { "name": "code-quality", "displayName": "Code Quality" }
     ]
   }
   ```

## Ajouter/Supprimer des Agents

Pour ajouter un nouvel agent :

1. Ajouter une nouvelle section dans `SKILL.md`
2. Mettre à jour le tableau `agents` dans config.json
3. Mettre à jour la section synthèse pour inclure le nouvel agent

## Gestion Mémoire

L'architecture séquentielle est critique :
- **Ne jamais exécuter les agents en parallèle**
- Chaque agent doit terminer avant que le suivant ne commence
- Cela évite les pics mémoire (2GB au lieu de 17GB)

## Voir Aussi

- [review-basic](../review-basic/) - Template simple en une passe
- [REVIEW-SKILLS-GUIDE.md](../../../docs/REVIEW-SKILLS-GUIDE.md)
