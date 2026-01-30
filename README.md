# Claude Review Automation

Déclenche automatiquement une review Claude Code quand tu es assigné comme reviewer sur une MR GitLab (ou PR GitHub).

---

## Table des matières

1. [Comment ça marche](#comment-ça-marche)
2. [Lancer l'application](#lancer-lapplication)
3. [Configurer GitLab](#configurer-gitlab)
4. [Tester](#tester)
5. [Configuration avancée](#configuration-avancée)
6. [Dépannage](#dépannage)

---

## Comment ça marche

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   GitLab    │      │ Cloudflare Tunnel│      │  Ton PC local   │
│             │      │                  │      │                 │
│  Tu es      │ ──►  │  URL publique    │ ──►  │  Serveur Node   │
│  assigné    │      │  (gratuit)       │      │  (port 3847)    │
│  reviewer   │      │                  │      │        │        │
└─────────────┘      └──────────────────┘      │        ▼        │
                                               │  Claude Code    │
                                               │  /review-front  │
                                               │        │        │
                                               │        ▼        │
                                               │  Commentaires   │
                                               │  sur la MR      │
                                               └─────────────────┘
```

**En résumé :**
1. GitLab envoie un webhook quand tu es assigné reviewer
2. Cloudflare Tunnel redirige vers ton PC (sans ouvrir de ports)
3. Le serveur local vérifie que c'est bien toi et lance Claude Code
4. Claude poste ses commentaires directement sur la MR

---

## Lancer l'application

### Méthode 1 : Icône sur le bureau (recommandé)

Double-clique sur l'icône **Claude Review** sur ton bureau.

Ça fait tout automatiquement :
- Démarre le serveur si nécessaire
- Démarre le tunnel Cloudflare
- Ouvre le dashboard dans ton navigateur

### Méthode 2 : Ligne de commande

```bash
# Démarrer
~/Documents/Projets/claude-review-automation/scripts/launcher.sh

# Voir le status
~/Documents/Projets/claude-review-automation/scripts/status.sh

# Arrêter
~/Documents/Projets/claude-review-automation/scripts/stop.sh
```

### Méthode 3 : Commandes manuelles

```bash
cd ~/Documents/Projets/claude-review-automation

# Terminal 1 : Serveur
npm run dev

# Terminal 2 : Tunnel
cloudflared tunnel --url http://localhost:3847
```

---

## Configurer GitLab

### Étape 1 : Récupérer l'URL du tunnel

Après avoir lancé l'application, le tunnel affiche une URL du type :
```
https://xxx-xxx-xxx-xxx.trycloudflare.com
```

Tu peux la voir :
- Dans les logs : `cat /tmp/claude-review/tunnel.log | grep trycloudflare`
- Ou avec : `~/Documents/Projets/claude-review-automation/scripts/status.sh`

⚠️ **Important** : Cette URL change à chaque redémarrage du tunnel (Quick Tunnel gratuit).

### Étape 2 : Configurer le webhook sur GitLab

1. Va sur ton projet GitLab : `https://gitlab.com/mentor-goal/main-app-v3`

2. Menu **Settings** → **Webhooks**

3. Clique **Add new webhook**

4. Remplis les champs :

| Champ | Valeur |
|-------|--------|
| **URL** | `https://xxx-xxx-xxx-xxx.trycloudflare.com/webhooks/gitlab` |
| **Secret token** | `YOUR_GITLAB_WEBHOOK_TOKEN_HERE` |

5. Dans **Trigger**, coche uniquement :
   - ☑ **Merge request events**

6. Dans **SSL verification** :
   - ☑ **Enable SSL verification**

7. Clique **Add webhook**

### Étape 3 : Tester le webhook

1. Sur la page des webhooks, trouve ton webhook dans la liste
2. Clique sur **Test** → **Merge request events**
3. Tu devrais voir "Hook executed successfully: HTTP 200"

Si tu vois une erreur, vérifie que :
- Le serveur tourne (`scripts/status.sh`)
- Le tunnel tourne
- L'URL est correcte (avec `/webhooks/gitlab` à la fin)

---

## Tester

### Test complet

1. Crée une MR sur le projet configuré
2. Assigne-toi comme **Reviewer** (pas Assignee, Reviewer !)
3. Ouvre le dashboard : http://localhost:3847/dashboard/
4. Tu devrais voir la review apparaître dans "Reviews actives"

### Vérifier les logs

```bash
# Logs du serveur
tail -f /tmp/claude-review/server.log

# Logs du tunnel
tail -f /tmp/claude-review/tunnel.log
```

---

## Configuration avancée

### Fichier config.json

```json
{
  "server": {
    "port": 3847
  },
  "user": {
    "gitlabUsername": "damien",      // Ton username GitLab
    "githubUsername": "damien"       // Ton username GitHub
  },
  "queue": {
    "maxConcurrent": 2,              // Reviews simultanées max
    "deduplicationWindowMs": 300000  // 5 min anti-spam
  },
  "repositories": [
    {
      "platform": "gitlab",
      "remoteUrl": "https://gitlab.com/mentor-goal/main-app-v3",
      "localPath": "/home/damien/Documents/Gitlab/main-app-v3/frontend",
      "skill": "review-front",       // Skill Claude à utiliser
      "enabled": true
    }
  ]
}
```

### Ajouter un nouveau projet

Ajoute une entrée dans `repositories` :

```json
{
  "platform": "gitlab",
  "remoteUrl": "https://gitlab.com/ton-org/ton-projet",
  "localPath": "/chemin/vers/le/repo/local",
  "skill": "review-front",
  "enabled": true
}
```

Puis configure le webhook sur ce projet GitLab (même procédure).

### Variables d'environnement (.env)

```bash
# Token secret pour vérifier les webhooks GitLab
GITLAB_WEBHOOK_TOKEN=YOUR_GITLAB_WEBHOOK_TOKEN_HERE

# Secret HMAC pour GitHub
GITHUB_WEBHOOK_SECRET=c28ee3fa20341c118118e616dc8ec5d1d26cb987c9612ce02c3f1a4cebaa07a8

# Niveau de log (debug, info, warn, error)
LOG_LEVEL=info
```

---

## Dépannage

### Le dashboard affiche "Hors ligne"

Le serveur ne tourne pas.

```bash
# Vérifier
~/Documents/Projets/claude-review-automation/scripts/status.sh

# Relancer
~/Documents/Projets/claude-review-automation/scripts/launcher.sh
```

### Le webhook GitLab échoue (erreur 401)

Le token est incorrect.

1. Vérifie le token dans `.env` : `GITLAB_WEBHOOK_TOKEN`
2. Vérifie que c'est le même dans GitLab → Webhooks → Secret token

### Le webhook GitLab échoue (connexion refusée)

Le tunnel ne tourne pas ou l'URL a changé.

```bash
# Vérifier l'URL actuelle
~/Documents/Projets/claude-review-automation/scripts/status.sh

# Mettre à jour l'URL dans GitLab si elle a changé
```

### La review ne se lance pas

Vérifie dans les logs :

```bash
tail -20 /tmp/claude-review/server.log
```

Causes possibles :
- Tu n'es pas assigné comme **Reviewer** (différent de Assignee)
- La MR est en draft
- La MR est déjà merged/closed
- Le projet n'est pas dans `config.json`
- Ton username ne correspond pas à `gitlabUsername` dans config.json

### Claude Code échoue

```bash
# Tester manuellement
cd /home/damien/Documents/Gitlab/main-app-v3/frontend
claude --print "/review-front 123"
```

Vérifie que :
- Le chemin `localPath` existe
- La skill `/review-front` est disponible
- Claude Code a les permissions nécessaires

---

## Fichiers importants

| Fichier | Description |
|---------|-------------|
| `config.json` | Configuration des projets et utilisateurs |
| `.env` | Secrets (tokens webhook) |
| `scripts/launcher.sh` | Lance tout (serveur + tunnel + dashboard) |
| `scripts/stop.sh` | Arrête tout |
| `scripts/status.sh` | Affiche l'état des services |

## Logs

| Log | Emplacement |
|-----|-------------|
| Serveur | `/tmp/claude-review/server.log` |
| Tunnel | `/tmp/claude-review/tunnel.log` |

## URLs

| URL | Description |
|-----|-------------|
| http://localhost:3847/dashboard/ | Dashboard local |
| http://localhost:3847/status | API JSON du status |
| http://localhost:3847/health | Health check |
