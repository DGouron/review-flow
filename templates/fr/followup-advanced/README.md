# followup-advanced

Un skill de review de suivi qui ne fait jamais confiance à un message de commit — il relit toujours le code réel avant de résoudre un thread. Contrepartie de `review-advanced`.

## Vue d'ensemble

Ce template fournit :
- Le même protocole de fichier de contexte que `followup-basic`
- Une règle dure : un message de commit est une affirmation, jamais une preuve — chaque thread est vérifié contre le code actuel à son file:line
- Les nouveaux problèmes trouvés pendant le suivi citent une source réelle, même format que `review-advanced`

## Installation

1. Copier ce dossier dans votre projet :
   ```bash
   cp -r templates/fr/followup-advanced .claude/skills/mon-suivi
   ```

2. Renommer le skill dans le frontmatter de `SKILL.md`

3. Configurer comme skill de suivi dans `.claude/reviews/config.json` :
   ```json
   {
     "reviewSkill": "ma-review",
     "reviewFollowupSkill": "mon-suivi"
   }
   ```

## Pourquoi il ne fait jamais confiance au message de commit

Un message de commit (« fix: null check ajouté ») est une affirmation de l'auteur, pas une preuve que le code a changé comme décrit. Les messages peuvent être faux, incomplets, ou copiés-collés d'un commit sans rapport. Ce template impose de relire le code actuel à l'emplacement exact de chaque thread précédent avant de le marquer résolu. Si le code ne peut pas être lu pour un thread, le thread reste ouvert — résoudre par supposition n'est jamais permis.

## Complément de review-advanced

Utilisez ce template avec [review-advanced](../review-advanced/) si vous voulez que la review initiale et son suivi partagent la même exigence de citation pour tout nouveau problème soulevé.

## Voir Aussi

- [review-advanced](../review-advanced/) — Template de review initiale correspondant, même format de citation
- [followup-basic](../followup-basic/) — Template de suivi plus léger, sans la règle de vérification du code
- [Review Skills Guide](../../../docs/guide/review-skills.md)
