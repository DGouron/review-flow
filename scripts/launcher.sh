#!/bin/bash
#
# Claude Review Automation - Launcher
# Lance le serveur et le tunnel si nécessaire, puis ouvre le dashboard
#

PROJECT_DIR="/home/damien/Documents/Projets/claude-review-automation"
LOG_DIR="/tmp/claude-review"
SERVER_LOG="$LOG_DIR/server.log"
TUNNEL_LOG="$LOG_DIR/tunnel.log"
PORT=3847

# Créer le dossier de logs
mkdir -p "$LOG_DIR"

# Fonction pour afficher des notifications
notify() {
    notify-send --app-name="Claude Review" --icon="$PROJECT_DIR/assets/icon.svg" "$1" "$2" 2>/dev/null
}

# Vérifier si le serveur tourne
is_server_running() {
    lsof -i :$PORT >/dev/null 2>&1
}

# Vérifier si le tunnel tourne
is_tunnel_running() {
    pgrep -f "cloudflared tunnel" >/dev/null 2>&1
}

# Démarrer le serveur
start_server() {
    echo "Démarrage du serveur..."
    cd "$PROJECT_DIR"
    nohup npm run dev > "$SERVER_LOG" 2>&1 &

    # Attendre que le serveur soit prêt
    for i in {1..10}; do
        sleep 1
        if is_server_running; then
            echo "Serveur démarré sur le port $PORT"
            return 0
        fi
    done

    echo "Erreur: Le serveur n'a pas démarré"
    notify "Erreur" "Le serveur n'a pas pu démarrer"
    return 1
}

# Démarrer le tunnel
start_tunnel() {
    echo "Démarrage du tunnel Cloudflare..."
    nohup cloudflared tunnel --url http://localhost:$PORT > "$TUNNEL_LOG" 2>&1 &

    # Attendre que le tunnel soit prêt
    for i in {1..15}; do
        sleep 1
        if grep -q "trycloudflare.com" "$TUNNEL_LOG" 2>/dev/null; then
            TUNNEL_URL=$(grep -o 'https://[^|]*trycloudflare.com' "$TUNNEL_LOG" | head -1)
            echo "Tunnel actif: $TUNNEL_URL"
            return 0
        fi
    done

    echo "Attention: Le tunnel n'est peut-être pas prêt"
    return 1
}

# Main
echo "=== Claude Review Launcher ==="

# Serveur
if is_server_running; then
    echo "✓ Serveur déjà en cours d'exécution"
else
    start_server || exit 1
fi

# Tunnel (optionnel)
if is_tunnel_running; then
    echo "✓ Tunnel déjà en cours d'exécution"
else
    start_tunnel
fi

# Ouvrir le dashboard
echo "Ouverture du dashboard..."
sleep 1
xdg-open "http://localhost:$PORT/dashboard/"

# Notification
notify "Claude Review" "Dashboard ouvert"

echo "=== Terminé ==="
