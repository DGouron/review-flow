#!/bin/bash
#
# Claude Review Automation - Status
# Affiche l'état des services
#

PORT=3847
LOG_DIR="/tmp/claude-review"

echo "=== Claude Review Status ==="
echo ""

# Serveur
if lsof -i :$PORT >/dev/null 2>&1; then
    echo "🟢 Serveur: EN COURS (port $PORT)"

    # Vérifier le health
    HEALTH=$(curl -s http://localhost:$PORT/health 2>/dev/null)
    if [ $? -eq 0 ]; then
        echo "   Health: OK"
        echo "   $HEALTH" | grep -o '"pending":[0-9]*' | sed 's/"pending":/   Pending: /'
        echo "   $HEALTH" | grep -o '"size":[0-9]*' | sed 's/"size":/   Queue size: /'
    fi
else
    echo "🔴 Serveur: ARRÊTÉ"
fi

echo ""

# Tunnel
if pgrep -f "cloudflared tunnel" >/dev/null 2>&1; then
    echo "🟢 Tunnel: EN COURS"
    if [ -f "$LOG_DIR/tunnel.log" ]; then
        TUNNEL_URL=$(grep -o 'https://[^|]*trycloudflare.com' "$LOG_DIR/tunnel.log" 2>/dev/null | tail -1)
        if [ -n "$TUNNEL_URL" ]; then
            echo "   URL: $TUNNEL_URL"
        fi
    fi
else
    echo "🔴 Tunnel: ARRÊTÉ"
fi

echo ""

# Logs
echo "📋 Logs:"
echo "   Serveur: $LOG_DIR/server.log"
echo "   Tunnel:  $LOG_DIR/tunnel.log"

echo ""
echo "=== Commandes ==="
echo "   Démarrer: ~/Documents/Projets/claude-review-automation/scripts/launcher.sh"
echo "   Arrêter:  ~/Documents/Projets/claude-review-automation/scripts/stop.sh"
echo "   Dashboard: http://localhost:$PORT/dashboard/"
