// src/whatsapp-service/mock/mock-router.ts
import { Router } from 'express'
import { handleIncomingMessage } from '../handlers/conversation'
import { prisma } from '../../shared/db'

export const mockRouter = Router()

// ── Mock WhatsApp UI ──────────────────────────────────────────────────────────
mockRouter.get('/', async (_req, res) => {
  const jobs = await prisma.job.findMany({
    where: { status: 'active' },
    select: { id: true, title: true, hiringCompany: true, waShortcode: true, agency: { select: { id: true, name: true } } },
    take: 10,
  })

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>HireIQ — WhatsApp Mock</title>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, system-ui, sans-serif; background: #ECE5DD; min-height: 100vh; }
    .header { background: #0A3D2E; color: white; padding: 16px 20px; display: flex; align-items: center; gap: 12px; }
    .header h1 { font-size: 18px; font-weight: 600; }
    .header small { font-size: 12px; opacity: 0.7; }
    .setup { background: white; margin: 16px; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .setup h2 { font-size: 14px; font-weight: 600; color: #111; margin-bottom: 12px; }
    .job-list { display: flex; flex-direction: column; gap: 8px; }
    .job-btn { background: #0A3D2E; color: white; border: none; border-radius: 8px; padding: 10px 14px; font-size: 13px; cursor: pointer; text-align: left; display: flex; justify-content: space-between; align-items: center; }
    .job-btn:hover { background: #0F6E56; }
    .job-btn span { background: #C9A84C; color: #0A3D2E; font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 99px; }
    .chat-container { background: white; margin: 0 16px 16px; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .chat-header { background: #0A3D2E; color: white; padding: 12px 16px; font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .chat-messages { height: 400px; overflow-y: auto; padding: 12px; background: #ECE5DD; display: flex; flex-direction: column; gap: 8px; }
    .msg { max-width: 75%; padding: 8px 12px; border-radius: 8px; font-size: 13px; line-height: 1.5; }
    .msg-out { background: #DCF8C6; align-self: flex-end; border-radius: 8px 8px 0 8px; }
    .msg-in { background: white; align-self: flex-start; border-radius: 8px 8px 8px 0; }
    .msg-time { font-size: 10px; color: #999; margin-top: 2px; text-align: right; }
    .chat-input { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #eee; background: white; }
    .chat-input input { flex: 1; border: 1px solid #ddd; border-radius: 20px; padding: 8px 14px; font-size: 13px; outline: none; }
    .chat-input button { background: #0A3D2E; color: white; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer; font-size: 16px; }
    .phone-input { display: flex; gap: 8px; margin-bottom: 12px; }
    .phone-input input { flex: 1; border: 1px solid #ddd; border-radius: 6px; padding: 7px 10px; font-size: 13px; }
    .badge { background: #C9A84C; color: #0A3D2E; font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 99px; }
  </style>
</head>
<body>
  <div class="header">
    <div style="width:32px;height:32px;background:#C9A84C;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;color:#0A3D2E;font-size:13px">IQ</div>
    <div>
      <h1>HireIQ WhatsApp Simulator</h1>
      <small>Test candidate conversations without a real WhatsApp number</small>
    </div>
    <span class="badge" style="margin-left:auto">MOCK MODE</span>
  </div>

  <div class="setup">
    <h2>1. Select a job to apply for:</h2>
    <div class="job-list">
      ${jobs.map(j => `
        <button class="job-btn" onclick="startConversation('${j.waShortcode}','${j.agency.id}','${j.agency.name}')">
          <span style="flex:1">${j.title} — ${j.hiringCompany}</span>
          <span>${j.waShortcode}</span>
        </button>
      `).join('')}
    </div>
    ${jobs.length === 0 ? '<p style="color:#888;font-size:13px">No active jobs found. Create and activate a job first.</p>' : ''}
  </div>

  <div class="chat-container" id="chatContainer" style="display:none">
    <div class="chat-header">
      <div style="width:28px;height:28px;background:#C9A84C;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;color:#0A3D2E;font-size:11px">IQ</div>
      <div><div id="chatTitle">HireIQ</div><small style="opacity:0.7;font-size:11px">Screening Agent</small></div>
    </div>
    <div class="chat-messages" id="messages"></div>
    <div class="chat-input">
      <input id="msgInput" placeholder="Type a message..." onkeypress="if(event.key==='Enter')sendMsg()" />
      <button onclick="sendMsg()">➤</button>
    </div>
  </div>

  <script>
    let currentJob = null
    let currentPhone = '+9715000' + Math.floor(10000 + Math.random() * 90000)

    function startConversation(shortcode, agencyId, agencyName) {
      currentJob = { shortcode, agencyId, agencyName }
      document.getElementById('chatContainer').style.display = 'block'
      document.getElementById('chatTitle').textContent = agencyName
      document.getElementById('messages').innerHTML = ''
      addMessage('outbound', 'APPLY ' + shortcode)
      sendToServer('APPLY ' + shortcode, true)
    }

    function addMessage(dir, text) {
      const msgs = document.getElementById('messages')
      const div = document.createElement('div')
      div.className = 'msg msg-' + (dir === 'outbound' ? 'out' : 'in')
      div.innerHTML = text.replace(/\\n/g, '<br>').replace(/\\*(.*?)\\*/g, '<strong>$1</strong>') + '<div class="msg-time">' + new Date().toLocaleTimeString() + '</div>'
      msgs.appendChild(div)
      msgs.scrollTop = msgs.scrollHeight
    }

    async function sendMsg() {
      const input = document.getElementById('msgInput')
      const text = input.value.trim()
      if (!text) return
      input.value = ''
      addMessage('outbound', text)
      await sendToServer(text, false)
    }

    async function sendToServer(message, isFirst) {
      try {
        const res = await fetch('/mock/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            waNumber: currentPhone,
            message,
            agencyId: currentJob.agencyId,
            agencyName: currentJob.agencyName,
            jobShortcode: isFirst ? currentJob.shortcode : null
          })
        })
        const data = await res.json()
        if (data.replies) {
          data.replies.forEach(r => {
            setTimeout(() => addMessage('inbound', r), 500)
          })
        }
      } catch(e) {
        addMessage('inbound', '⚠️ Error connecting to server')
      }
    }
  </script>
</body>
</html>`

  res.send(html)
})

// ── Simulate incoming message ─────────────────────────────────────────────────
mockRouter.post('/simulate', async (req, res) => {
  const { waNumber, message, agencyId, agencyName, jobShortcode } = req.body

  // Capture outgoing messages
  const replies: string[] = []
  const origSend = require('../handlers/send').sendMessage

  // Monkey-patch to capture replies for the mock UI
  ;(global as any).__pendingReplies = replies

  await handleIncomingMessage({ waNumber, message, agencyId, agencyName, jobShortcode })

  // Return captured replies
  const captured = (global as any).__mockMessages?.[waNumber] || []
  const newReplies = captured.slice(-5).map((m: any) => m.text)
  ;(global as any).__mockMessages = { ...(global as any).__mockMessages, [waNumber]: [] }

  res.json({ success: true, replies: newReplies })
})
