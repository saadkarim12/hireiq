python3 << 'EOF'
import os
path = os.path.expanduser('~/hireiq/start.sh')
with open(path, 'r') as f:
    content = f.read()

if 'git pull' not in content:
    content = content.replace(
        'echo "🚀 Starting HireIQ..."',
        'echo "🚀 Starting HireIQ..."\necho "📥 Pulling latest from GitHub..."\ncd ~/hireiq && git pull 2>/dev/null || echo "Already up to date"'
    )
    with open(path, 'w') as f:
        f.write(content)
    print('Added git pull to start.sh')
else:
    print('git pull already in start.sh')
EOF

#!/bin/bash
export PATH="$PATH:/Applications/Docker.app/Contents/Resources/bin"
echo "🚀 Starting HireIQ..."
docker start hireiq-postgres 2>/dev/null && echo "✅ PostgreSQL" || echo "✅ PostgreSQL already running"
sleep 2
echo "🔑 Refreshing token..."
python3 -c "
import subprocess,json,os,re
r=subprocess.run(['curl','-s','-X','POST','http://localhost:3001/api/v1/auth/dev-login','-H','Content-Type: application/json','-d','{\"email\":\"admin@saltrecruitment.ae\"}'],capture_output=True,text=True)
try:
    token=json.loads(r.stdout)['data']['accessToken']
    path=os.path.expanduser('~/hireiq/frontend/src/api/client.ts')
    content=open(path).read()
    content=re.sub(r\"const DEV_TOKEN = '.*'\",f\"const DEV_TOKEN = '{token}'\",content)
    open(path,'w').write(content)
    print('✅ Token refreshed')
except: print('⚠️  Token refresh after backend starts')
"
echo ""
echo "🔧 Starting backend services..."
echo "   API :3001  |  AI :3002  |  WA :3003  |  Sched :3004"
echo "📱  WhatsApp simulator → http://localhost:3003/mock"
echo "🖥️   Frontend (new tab) → cd ~/hireiq/frontend && npm run dev"
echo ""
cd ~/hireiq/backend && npx concurrently \
  --names "API,AI,WA,SCHED" \
  --prefix-colors "cyan,magenta,green,yellow" \
  "npx ts-node src/core-api/index.ts" \
  "npx ts-node src/ai-engine/index.ts" \
  "npx ts-node src/whatsapp-service/index.ts" \
  "npx ts-node src/scheduler/index.ts"
