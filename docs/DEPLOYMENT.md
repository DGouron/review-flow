# Déploiement en production

## Prérequis

- Node.js 20+
- cloudflared installé
- Un domaine configuré sur Cloudflare (optionnel, pour URL permanente)

## Option 1 : Quick Tunnel (test)

URL temporaire qui change à chaque redémarrage.

```bash
# Terminal 1 : Serveur
cd ~/claude-review-automation
npm run build
npm start

# Terminal 2 : Tunnel
cloudflared tunnel --url http://localhost:3847
```

## Option 2 : Tunnel permanent (production)

### 1. Créer le tunnel

```bash
# S'authentifier
cloudflared tunnel login

# Créer le tunnel
cloudflared tunnel create claude-review

# Noter l'ID du tunnel (ex: a1b2c3d4-...)
```

### 2. Configurer le DNS

```bash
# Créer l'entrée DNS
cloudflared tunnel route dns claude-review review.your-domain.com
```

### 3. Configuration cloudflared

Créer `~/.cloudflared/config.yml` :

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /home/YOUR_USER/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: review.your-domain.com
    service: http://localhost:3000
  - service: http_status:404
```

### 4. Services systemd

```bash
# Copier les fichiers de service
sudo cp setup/claude-review-server.service /etc/systemd/system/
sudo cp setup/cloudflared-tunnel.service /etc/systemd/system/

# Recharger systemd
sudo systemctl daemon-reload

# Activer et démarrer
sudo systemctl enable --now claude-review-server
sudo systemctl enable --now cloudflared-tunnel
```

### 5. Vérification

```bash
# Status des services
sudo systemctl status claude-review-server
sudo systemctl status cloudflared-tunnel

# Logs
journalctl -u claude-review-server -f
journalctl -u cloudflared-tunnel -f

# Test endpoint
curl https://review.your-domain.com/health
```

## Mise à jour

```bash
# Arrêter le service
sudo systemctl stop claude-review-server

# Mettre à jour
cd ~/claude-review-automation
git pull
npm install
npm run build

# Redémarrer
sudo systemctl start claude-review-server
```

## Troubleshooting

### Le webhook retourne 401

- Vérifier que `GITLAB_WEBHOOK_TOKEN` dans `.env` correspond au token dans GitLab
- Vérifier les logs : `journalctl -u claude-review-server -n 50`

### La review ne se lance pas

1. Vérifier que le repo est configuré dans `config.json`
2. Vérifier que ton username correspond à celui dans `config.json`
3. Vérifier que la MR est ouverte (pas draft, pas merged)

### Le tunnel ne répond pas

```bash
# Vérifier le status
cloudflared tunnel info claude-review

# Redémarrer
sudo systemctl restart cloudflared-tunnel
```

### Claude Code échoue

- Vérifier que le chemin local existe
- Vérifier que la skill existe (`claude --help` dans le repo)
- Vérifier les permissions Claude Code (`settings.local.json`)
