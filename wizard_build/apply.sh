#!/bin/bash
echo "🔨 Applying 4-step job creation wizard..."

# Apply frontend wizard
python3 "$(dirname "$0")/build_wizard.py"

# Apply backend generate-jd route
cp "$(dirname "$0")/generate_jd_route.ts" ~/hireiq/backend/src/ai-engine/routes/generate-jd.ts

# Register the new route in AI engine index
python3 << 'PYEOF'
import os, re

path = os.path.expanduser('~/hireiq/backend/src/ai-engine/index.ts')
with open(path, 'r') as f:
    content = f.read()

if 'generate-jd' not in content:
    content = content.replace(
        "import { evaluateAnswerRoute }",
        "import { generateJdRoute }      from './routes/generate-jd'\nimport { evaluateAnswerRoute }"
    )
    content = content.replace(
        "app.use('/api/v1/ai', evaluateAnswerRoute)",
        "app.use('/api/v1/ai', generateJdRoute)\napp.use('/api/v1/ai', evaluateAnswerRoute)"
    )
    with open(path, 'w') as f:
        f.write(content)
    print('  ✅ generate-jd route registered in AI engine')
else:
    print('  ✅ generate-jd already registered')
PYEOF

# Clear Next.js cache
rm -rf ~/hireiq/frontend/.next
echo ""
echo "✅ Done! Now:"
echo "  1. Stop all services (Ctrl+C)"
echo "  2. Run: ~/hireiq/start.sh"
echo "  3. New tab: cd ~/hireiq/frontend && npm run dev"
echo "  4. Go to: http://localhost:3000/jobs/new"
