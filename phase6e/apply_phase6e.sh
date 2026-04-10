#!/bin/bash
echo "🔨 Applying Phase 6e — Bulk CV Upload + Talent Pool"
echo ""

# ── 1. Backend routes ─────────────────────────────────────────────────────────
cp "$(dirname "$0")/backend/bulk-upload.ts" ~/hireiq/backend/src/core-api/routes/bulk-upload.ts
echo "  ✅ bulk-upload.ts → core-api/routes/"

# ── 2. Register routes in core-api/index.ts ───────────────────────────────────
python3 << 'PYEOF'
import os, re

path = os.path.expanduser('~/hireiq/backend/src/core-api/index.ts')
with open(path, 'r') as f:
    content = f.read()

if 'bulk-upload' not in content:
    # Add import
    content = re.sub(
        r"(import \{ candidatesRouter \})",
        "import { bulkUploadRouter }    from './routes/bulk-upload'\n\\1",
        content
    )
    # Add route registration — find last app.use line
    content = re.sub(
        r"(app\.use\('/api/v1', candidatesRouter\))",
        "app.use('/api/v1', bulkUploadRouter)\n\\1",
        content
    )
    with open(path, 'w') as f:
        f.write(content)
    print("  ✅ bulk-upload routes registered in core-api/index.ts")
else:
    print("  ✅ bulk-upload already registered")
PYEOF

# ── 3. Install multer if not present ──────────────────────────────────────────
cd ~/hireiq/backend
if ! grep -q '"multer"' package.json; then
  echo "  📦 Installing multer..."
  npm install multer @types/multer --save 2>&1 | tail -2
else
  echo "  ✅ multer already installed"
fi

# ── 4. Frontend — Talent Pool page ───────────────────────────────────────────
mkdir -p ~/hireiq/frontend/src/app/\(dashboard\)/talent-pool
cp "$(dirname "$0")/frontend/talent-pool-page.tsx" ~/hireiq/frontend/src/app/\(dashboard\)/talent-pool/page.tsx
echo "  ✅ Talent Pool page → /talent-pool"

# ── 5. Add Talent Pool to sidebar navigation ──────────────────────────────────
python3 << 'PYEOF'
import os, re

path = os.path.expanduser('~/hireiq/frontend/src/components/layout/Sidebar.tsx')
if not os.path.exists(path):
    print("  ⚠️  Sidebar.tsx not found — check path")
    exit()

with open(path, 'r') as f:
    content = f.read()

if 'talent-pool' not in content:
    # Add talent pool link after jobs link
    content = re.sub(
        r"(\{.*?href.*?/jobs.*?\}.*?Jobs.*?\})",
        r"\1, { href: '/talent-pool', label: 'Talent Pool', icon: '👥' }",
        content, flags=re.DOTALL, count=1
    )
    # Try simpler pattern if above fails
    if 'talent-pool' not in content:
        content = content.replace(
            "href: '/jobs'",
            "href: '/jobs'"
        ).replace(
            "{ href: '/analytics'",
            "{ href: '/talent-pool', label: 'Talent Pool', icon: '👥' },\n    { href: '/analytics'"
        )
    with open(path, 'w') as f:
        f.write(content)
    print("  ✅ Talent Pool added to sidebar")
else:
    print("  ✅ Talent Pool already in sidebar")
PYEOF

# ── 6. Clear frontend cache ───────────────────────────────────────────────────
rm -rf ~/hireiq/frontend/.next
echo "  ✅ Next.js cache cleared"

echo ""
echo "✅ Phase 6e applied!"
echo ""
echo "Next steps:"
echo "  1. Restart Core API:   lsof -ti:3001 | xargs kill -9; cd ~/hireiq/backend && npx ts-node src/core-api/index.ts &"
echo "  2. Restart frontend:   cd ~/hireiq/frontend && npm run dev"
echo "  3. Open:               http://localhost:3000/talent-pool"
