# Configuration d'un Projet pour les Reviews Automatiques

## Structure Requise

Dans votre projet, créez la structure suivante :

```
.claude/
├── reviews/
│   └── config.json          # Configuration des reviews
└── skills/
    └── review-{{type}}/     # Skill de review
        └── SKILL.md
```

## 1. Configuration (`config.json`)

Copiez `config.json.template` vers `.claude/reviews/config.json` :

```json
{
  "github": false,
  "gitlab": true,
  "defaultModel": "opus",
  "reviewSkill": "review-front",
  "reviewFollowupSkill": "review-followup",
  "agents": [
    { "name": "clean-architecture", "displayName": "Clean Archi" },
    { "name": "ddd", "displayName": "DDD" },
    { "name": "testing", "displayName": "Testing" },
    { "name": "code-quality", "displayName": "Code Quality" }
  ]
}
```

### Options

| Champ | Type | Description |
|-------|------|-------------|
| `github` | boolean | Activer les webhooks GitHub |
| `gitlab` | boolean | Activer les webhooks GitLab |
| `defaultModel` | string | Modèle Claude (`opus`, `sonnet`, `haiku`) |
| `reviewSkill` | string | Nom du skill de review principal |
| `reviewFollowupSkill` | string | Nom du skill de followup |
| `agents` | array | Liste des agents pour le dashboard |

### Agents

Les agents définissent ce qui s'affiche dans le dashboard :

```json
{
  "name": "clean-architecture",   // ID unique (kebab-case)
  "displayName": "Clean Archi"    // Nom affiché
}
```

**Important** : Les noms d'agents doivent correspondre aux marqueurs `[PROGRESS:name:status]` dans le skill.

---

## 2. Skill de Review (`SKILL.md`)

Copiez `SKILL.md.template` vers `.claude/skills/review-{{type}}/SKILL.md`.

### Personnalisation

1. Remplacez les variables `{{...}}`
2. Définissez vos agents d'audit
3. Adaptez les règles à votre projet

### Marqueurs Obligatoires

Pour le tracking temps réel, le skill doit émettre :

```
[PHASE:initializing]           # Démarrage
[PHASE:agents-running]         # Agents en cours
[PROGRESS:agent-name:started]  # Début d'un agent
[PROGRESS:agent-name:completed]# Fin d'un agent
[PHASE:synthesizing]           # Synthèse
[PHASE:publishing]             # Publication
[PHASE:completed]              # Terminé

[REVIEW_STATS:blocking=X:warnings=X:suggestions=X:score=X]
```

---

## 3. Configuration Serveur

Dans `~/.config/claude-review-automation/config.json` :

```json
{
  "port": 3847,
  "webhookSecretGitlab": "votre-secret-gitlab",
  "webhookSecretGithub": "votre-secret-github",
  "gitlabUser": "votre-username-gitlab",
  "githubUser": "votre-username-github",
  "repositories": [
    {
      "projectPath": "group/project-name",
      "localPath": "/chemin/vers/projet",
      "skill": "review-front"
    }
  ]
}
```

---

## 4. Webhooks

### GitLab

1. Aller dans **Settings > Webhooks**
2. URL : `http://votre-serveur:3847/webhooks/gitlab`
3. Secret Token : votre `webhookSecretGitlab`
4. Trigger : `Merge request events`

### GitHub

1. Aller dans **Settings > Webhooks**
2. URL : `http://votre-serveur:3847/webhooks/github`
3. Secret : votre `webhookSecretGithub`
4. Events : `Pull requests`

---

## 5. Vérification

1. Assignez-vous comme reviewer sur une MR/PR
2. Vérifiez le dashboard : http://localhost:3847
3. La review devrait se déclencher automatiquement

---

## Exemples de Skills Spécialisés

### Frontend (React/Vue/Angular)

```json
{
  "agents": [
    { "name": "clean-architecture", "displayName": "Clean Archi" },
    { "name": "react-best-practices", "displayName": "React" },
    { "name": "solid", "displayName": "SOLID" },
    { "name": "testing", "displayName": "Testing" },
    { "name": "accessibility", "displayName": "A11y" },
    { "name": "code-quality", "displayName": "Quality" }
  ]
}
```

### Backend (Node/Python/Go)

```json
{
  "agents": [
    { "name": "clean-architecture", "displayName": "Clean Archi" },
    { "name": "ddd", "displayName": "DDD" },
    { "name": "solid", "displayName": "SOLID" },
    { "name": "api-design", "displayName": "API Design" },
    { "name": "security", "displayName": "Security" },
    { "name": "testing", "displayName": "Testing" }
  ]
}
```

### API (REST/GraphQL)

```json
{
  "agents": [
    { "name": "api-design", "displayName": "API Design" },
    { "name": "security", "displayName": "Security" },
    { "name": "performance", "displayName": "Performance" },
    { "name": "documentation", "displayName": "Documentation" },
    { "name": "testing", "displayName": "Testing" }
  ]
}
```
