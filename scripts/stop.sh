#!/bin/bash
#
# Claude Review Automation - Stop
# Arrête le serveur et le tunnel
#

echo "=== Arrêt de Claude Review ==="

# Arrêter le serveur
if pkill -f "tsx watch.*server"; then
    echo "✓ Serveur arrêté"
else
    echo "- Serveur non actif"
fi

# Arrêter le tunnel
if pkill -f "cloudflared tunnel"; then
    echo "✓ Tunnel arrêté"
else
    echo "- Tunnel non actif"
fi

notify-send --app-name="Claude Review" "Claude Review" "Services arrêtés" 2>/dev/null

echo "=== Terminé ==="
