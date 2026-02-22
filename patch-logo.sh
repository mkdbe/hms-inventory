#!/bin/bash
# patch-logo.sh — Replace text branding with HIGHLANDMEDIA wordmark logo
# Usage: cd /path/to/inventory && bash patch-logo.sh
# Assumes logo.png is already in the project root

FILE="index.html"
BACKUP="index.html.bak-$(date +%Y%m%d%H%M%S)"

if [ ! -f "$FILE" ]; then
  echo "ERROR: $FILE not found. Run from the project directory."
  exit 1
fi

cp "$FILE" "$BACKUP"
echo "Backup: $BACKUP"

# ── CSS ────────────────────────────────────────────────────────────────────────

# Brand container: baseline -> center
sed -i 's/\.brand{display:flex;align-items:baseline;/.brand{display:flex;align-items:center;/' "$FILE"

# Brand link: add flex center
sed -i 's/\.brand a{text-decoration:none}/.brand a{text-decoration:none;display:flex;align-items:center}/' "$FILE"

# Replace .brand-logo text styles with .brand-img
sed -i "s/\.brand-logo{font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:\.04em;color:var(--white)}/.brand-img{height:28px;width:auto;display:block}/" "$FILE"
sed -i '/\.brand-logo em{font-style:normal}/d' "$FILE"

# Replace .login-logo text styles with .login-logo-img
sed -i "s/\.login-logo{font-family:'Bebas Neue',sans-serif;font-size:36px;letter-spacing:\.04em;color:var(--white);margin-bottom:4px}/.login-logo-img{height:44px;width:auto;display:block;margin-bottom:8px}/" "$FILE"
sed -i '/\.login-logo em{font-style:normal}/d' "$FILE"

# Mobile: replace brand-logo font-size with brand-img height
sed -i 's/\.brand-logo{font-size:22px}/.brand-img{height:22px}/' "$FILE"

# ── HTML ───────────────────────────────────────────────────────────────────────

# Header brand
sed -i 's|<span class="brand-logo">Highland<em>Media</em></span>|<img src="/logo.png" alt="HighlandMedia" class="brand-img">|' "$FILE"

# Login screen brand
sed -i 's|<div class="login-logo">Highland<em>Media</em></div>|<img src="/logo.png" alt="HighlandMedia" class="login-logo-img">|' "$FILE"

# ── Verify ─────────────────────────────────────────────────────────────────────
echo ""
echo "Applied. Verify:"
grep -n 'brand-img\|login-logo-img' "$FILE" | head -10
echo ""
echo "Restart: sudo systemctl restart hms-inventory"
