#!/bin/bash
# Threadlab CRM — startup script
# Double-click this file in Finder to start the server

cd "$(dirname "$0")"

echo "========================================"
echo "  Threadlab CRM — Starting server..."
echo "========================================"
echo ""
echo "Open your browser at: http://localhost:3000"
echo "(Press Ctrl+C to stop)"
echo ""

python3 -m http.server 3000 --directory public
