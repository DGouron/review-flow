# review-advanced

Un skill de code review rigoureux à audits séquentiels, avec bloc sécurité dédié et leçons pédagogiques sourcées obligatoires.

## Vue d'ensemble

Ce template fournit :
- 8 audits séquentiels se terminant par un audit Naming **jamais compté** dans le score global
- Un audit Sécurité dédié, scoré **et bloquant**
- Chaque point soulevé doit citer un auteur réel et reconnu (citation + explication + application pratique) — aucune opinion non sourcée
- Exécution séquentielle pour éviter les problèmes mémoire, même protocole que `review-with-agents`

## Installation

1. Copier ce dossier dans votre projet :
   ```bash
   cp -r templates/fr/review-advanced .claude/skills/ma-review
   ```

2. Renommer le skill dans le frontmatter de `SKILL.md`

3. Remplir l'audit **Bonnes Pratiques Stack** (Audit 3) avec les règles idiomatiques de votre propre framework/langage — il est livré volontairement vide

4. Remplir l'audit **Prévention Pareto des Bugs** (Audit 7) avec les catégories de défauts qui reviennent réellement dans votre codebase

5. Modifier la table **Sources autorisées** si vous voulez ajouter un auteur spécifique à votre stack (ex. l'équipe doc officielle de votre framework)

6. Configurer les agents dans `.claude/reviews/config.json` :
   ```json
   {
     "reviewSkill": "ma-review",
     "agents": [
       { "name": "clean-architecture", "displayName": "Clean Architecture" },
       { "name": "ddd", "displayName": "DDD" },
       { "name": "stack-best-practices", "displayName": "Bonnes Pratiques Stack" },
       { "name": "solid", "displayName": "SOLID" },
       { "name": "testing", "displayName": "Testing" },
       { "name": "code-quality", "displayName": "Code Quality" },
       { "name": "pareto-bug-prevention", "displayName": "Prévention Pareto" },
       { "name": "naming-audit", "displayName": "Naming" },
       { "name": "security", "displayName": "Sécurité" }
     ]
   }
   ```

## Pourquoi le Naming est exclu du score

Le feedback de nommage est jugé utile mais subjectif et non-bloquant. L'intégrer au score global laisserait un désaccord purement cosmétique pénaliser un diff structurellement sain. Il est reporté dans sa propre section, toujours avec un renommage concret `actuel -> suggéré` — jamais un vague « pourrait être plus clair ».

## Pourquoi la Sécurité est bloquante

Contrairement aux autres audits, une trouvaille Sécurité non résolue bloque le merge quel que soit le score global. Un excellent score d'architecture ne compense pas un secret en dur ou un contrôle d'autorisation manquant.

## L'exigence de citation

Chaque correction bloquante, avertissement ou suggestion doit inclure une **Leçon Pédagogique** : une citation réelle d'un auteur reconnu, une explication de son application, et une correction pratique. Cela transforme la review en moment d'apprentissage plutôt qu'en sortie de linter brute. Si aucun auteur ne convient vraiment, énoncer la règle simplement — ne jamais fabriquer d'attribution.

## Voir Aussi

- [review-with-agents](../review-with-agents/) — Template multi-agents plus léger, sans format de citation ni bloc sécurité dédié
- [followup-advanced](../followup-advanced/) — Template de suivi correspondant, qui ne fait jamais confiance à un message de commit
- [Review Skills Guide](../../../docs/guide/review-skills.md)
