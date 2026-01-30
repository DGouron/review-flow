# Quick Start - 5 minutes

## 1. Lancer l'application

Double-clique sur l'icône **Claude Review** sur le bureau.

Ou en terminal :
```bash
~/Documents/Projets/claude-review-automation/scripts/launcher.sh
```

## 2. Récupérer l'URL du tunnel

```bash
~/Documents/Projets/claude-review-automation/scripts/status.sh
```

Note l'URL affichée (ex: `https://xxx-xxx.trycloudflare.com`)

## 3. Configurer GitLab

1. **GitLab** → **Settings** → **Webhooks** → **Add webhook**

2. Remplis :
   - **URL** : `https://xxx-xxx.trycloudflare.com/webhooks/gitlab`
   - **Secret token** : `YOUR_GITLAB_WEBHOOK_TOKEN_HERE`
   - **Trigger** : ☑ Merge request events

3. Clique **Add webhook**

## 4. Tester

1. Crée ou ouvre une MR
2. Assigne-toi comme **Reviewer**
3. Ouvre http://localhost:3847/dashboard/
4. La review apparaît !

## Commandes utiles

```bash
# Status
~/Documents/Projets/claude-review-automation/scripts/status.sh

# Arrêter
~/Documents/Projets/claude-review-automation/scripts/stop.sh

# Logs
tail -f /tmp/claude-review/server.log
```
