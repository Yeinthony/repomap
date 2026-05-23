#!/bin/bash
# repomap-hook.sh
# Run this once to install a git hook that auto-updates your docs on every push
# Usage: bash repomap-hook.sh [--config path/to/repomap.config.yml]

CONFIG=${2:-"repomap.config.yml"}
HOOK_PATH=".git/hooks/post-merge"

cat > "$HOOK_PATH" << EOF
#!/bin/bash
echo "📚 repomap: Updating documentation..."
repomap generate --config $CONFIG
echo "✅ Docs updated at \$(date)"
EOF

chmod +x "$HOOK_PATH"
echo "✅ Git hook installed at $HOOK_PATH"
echo "   Docs will auto-update after every git pull/merge."
