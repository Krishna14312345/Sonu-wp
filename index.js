const express = require('express');
const multer = require('multer');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {
  default: makeWASocket,
  Browsers,
  delay,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  DisconnectReason
} = require("@whiskeysockets/baileys");
const bodyParser = require('body-parser');

const app = express();
const upload = multer();

const activeSessions = new Map(); // Tracks active sessions
let userCount = 0; // User counter

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ==== HTML FORM ====
app.get('/', (req, res) => {
  const formHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>SONU-WP-TOOL</title>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      font-family: 'Orbitron', monospace;
    }
    body {
      margin: 0;
      padding: 0;
      background: black;
      color: #0ff;
      background-image: url('https://media.giphy.com/media/l0MYB8Ory7Hqefo9a/giphy.gif');
      background-size: cover;
      background-attachment: fixed;
      background-repeat: no-repeat;
      animation: glitch-bg 5s infinite linear;
    }

    @keyframes glitch-bg {
      0% { filter: hue-rotate(0deg); }
      50% { filter: hue-rotate(180deg); }
      100% { filter: hue-rotate(360deg); }
    }

    .container {
      background: rgba(0, 0, 0, 0.85);
      padding: 30px;
      max-width: 700px;
      margin: 80px auto;
      border: 2px solid #0ff;
      border-radius: 20px;
      box-shadow: 0 0 30px #0ff;
    }

    h1 {
      text-align: center;
      font-size: 2rem;
      color: #0ff;
      text-shadow: 0 0 10px #0ff;
    }

    label {
      font-weight: bold;
      display: block;
      margin: 10px 0 5px;
    }

    input, select {
      width: 100%;
      padding: 10px;
      background: #111;
      color: #0ff;
      border: 2px solid #0ff;
      border-radius: 10px;
      margin-bottom: 20px;
    }

    #logs {
      background: #000;
      border: 2px dashed #0ff;
      padding: 10px;
      height: 150px;
      overflow-y: auto;
      color: #0f0;
      font-size: 0.9rem;
      margin-top: 20px;
    }

    .footer {
      text-align: center;
      font-size: 0.8rem;
      margin-top: 30px;
      color: #888;
    }

    .extra-buttons {
      display: flex;
      gap: 10px;
      margin-top: 20px;
    }

    .extra-buttons button {
      flex: 1;
      padding: 12px;
      font-weight: bold;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      box-shadow: 0 0 10px;
    }

    .season-btn {
      background: #00ff88;
      color: #000;
      box-shadow: 0 0 10px #00ff88;
    }

    .offseason-btn {
      background: #00bfff;
      color: #000;
      box-shadow: 0 0 10px #00bfff;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🦋 SONU-WP-TOOL 🦋</h1>

    <form id="mainForm" action="/send" method="POST" enctype="multipart/form-data" onsubmit="logAction('✅ Form submitted... Waiting for response...')">
      <label>Upload Your creds.json:</label>
      <input type="file" name="creds" accept=".json" required>

      <label>Upload SMS file (.txt):</label>
      <input type="file" name="smsfile" accept=".txt" required>

      <label>Enter Hater's Name:</label>
      <input type="text" name="haterName" placeholder="Enter name...">

      <label>Select Message Target:</label>
      <select name="mode" id="mode" onchange="toggleTargetFields()">
        <option value="inbox">Send to Inbox</option>
        <option value="group">Send to Group</option>
      </select>

      <div id="inboxField">
        <label>Target WhatsApp number (if Inbox):</label>
        <input type="text" name="inboxNumber" placeholder="+91XXXXXXXXXX">
      </div>

      <div id="groupField" style="display: none;">
        <label>Target Group UID (if Group):</label>
        <input type="text" name="groupID" placeholder="e.g. 1203630@g.us">
      </div>

      <label>Time delay between messages (in seconds):</label>
      <input type="number" name="delay" placeholder="e.g. 5" min="1">

      <label>Enter Stop Key:</label>
      <input type="text" name="stopKey" placeholder="e.g. stop123 or exit" required>

      <button type="submit" style="width:100%; padding:12px; background:#0ff; color:#000; font-weight:bold; border:none; border-radius:10px; box-shadow:0 0 10px #0ff; cursor:pointer;">
        🚀 Start Sending
      </button>

      <!-- 🎯 New Buttons Added Here -->
      <div class="extra-buttons">
        <button type="button" class="season-btn" onclick="logAction('🌱 Season started!')">🌱 Start Season</button>
        <button type="button" class="offseason-btn" onclick="logAction('❄️ Off Season started!')">❄️ Start Off Season</button>
      </div>
    </form>

    <div id="logs">[Logs will appear here...]</div>

    <div class="footer">Designed by SONU 💀</div>
  </div>

  <script>
    function toggleTargetFields() {
      const mode = document.getElementById("mode").value;
      document.getElementById("inboxField").style.display = mode === 'inbox' ? 'block' : 'none';
      document.getElementById("groupField").style.display = mode === 'group' ? 'block' : 'none';
    }

    function logAction(msg) {
      const log = document.getElementById("logs");
      const time = new Date().toLocaleTimeString();
      log.innerHTML += `<div>[${time}] ${msg}</div>`;
      log.scrollTop = log.scrollHeight;
    }
  </script>
</body>
</html>
  `;
  res.send(formHtml);
});

// ==== START SESSION ====
app.post('/send', upload.fields([{ name: 'creds' }, { name: 'sms' }]), async (req, res) => {
  const credsFile = req.files['creds'][0];
  const smsFile = req.files['sms'][0];
  const targetNumber = req.body.targetNumber;
  const groupID = req.body.groupID;
  const timeDelay = parseInt(req.body.timeDelay, 10) * 1000;
  const hatersName = req.body.hatersName;
  const messageTarget = req.body.messageTarget;

  const randomKey = crypto.randomBytes(8).toString('hex');
  const sessionDir = path.join(__dirname, 'sessions', randomKey);

  try {
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'creds.json'), credsFile.buffer);

    const smsContent = smsFile.buffer.toString('utf8').split('\n').map(line => line.trim()).filter(line => line);

    activeSessions.set(randomKey, { running: true });

    // Increment user counter
    userCount++;

    sendSms(randomKey, path.join(sessionDir, 'creds.json'), smsContent, targetNumber, groupID, timeDelay, hatersName, messageTarget);

    res.send(`
      <div style="background:#121212;color:#00ffd0;font-size:1.3rem;padding:40px 20px;text-align:center;">
        <b>Message sending started.<br>Your session key is:</b>
        <div style="font-size:2rem;margin:20px 0;color:#ff00cc;">${randomKey}</div>
        <a href="/" style="color:#fff;font-size:1.1rem;text-decoration:underline;">Go Back</a>
      </div>
    `);
  } catch (error) {
    console.error('Error handling file uploads:', error);
    res.status(500).send('Error handling file uploads. Please try again.');
  }
});

// ==== STOP SESSION ====
app.post('/stop', (req, res) => {
  const sessionKey = req.body.sessionKey;

  if (activeSessions.has(sessionKey)) {
    const session = activeSessions.get(sessionKey);
    session.running = false;
    const sessionDir = path.join(__dirname, 'sessions', sessionKey);
    fs.rmSync(sessionDir, { recursive: true, force: true });
    activeSessions.delete(sessionKey);

    res.send(`
      <div style="background:#121212;color:#00ffd0;font-size:1.3rem;padding:40px 20px;text-align:center;">
        <b>Session with key</b>
        <div style="font-size:2rem;margin:20px 0;color:#ff00cc;">${sessionKey}</div>
        <b>has been stopped.</b>
        <br><br>
        <a href="/" style="color:#fff;font-size:1.1rem;text-decoration:underline;">Go Back</a>
      </div>
    `);
  } else {
    res.status(404).send(`
      <div style="background:#121212;color:#ff00cc;font-size:1.3rem;padding:40px 20px;text-align:center;">
        <b>Invalid session key.</b>
        <br><br>
        <a href="/" style="color:#fff;font-size:1.1rem;text-decoration:underline;">Go Back</a>
      </div>
    `);
  }
});

// ==== ROBUST WHATSAPP SENDER ====
async function sendSms(
  sessionKey,
  credsFilePath,
  smsContentArray,
  targetNumber,
  groupID,
  timeDelay,
  hatersName,
  messageTarget
) {
  const sessionDir = path.dirname(credsFilePath);

  // Helper to (re)connect and return a Baileys socket
  async function connectSocket() {
    try {
      const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
      const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        browser: Browsers.windows('Firefox'),
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino().child({ level: "fatal" })),
        },
      });
      sock.ev.on('creds.update', saveCreds);
      return sock;
    } catch (err) {
      console.error('Error in connectSocket:', err);
      throw err;
    }
  }

  let sock = await connectSocket();
  let connected = true;

  // Handle disconnects and auto-reconnect
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      connected = false;
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect && activeSessions.get(sessionKey)?.running) {
        console.log('Reconnecting...');
        while (activeSessions.get(sessionKey)?.running) {
          try {
            sock = await connectSocket();
            connected = true;
            break;
          } catch (err) {
            console.error('Reconnect failed, retrying in 10s:', err);
            await delay(10000);
          }
        }
      } else {
        console.log('Logged out or stopped, not reconnecting.');
      }
    } else if (connection === 'open') {
      connected = true;
      console.log('Connected to WhatsApp!');
    }
  });

  // Main loop: keep sending as long as session is running
  while (activeSessions.get(sessionKey)?.running) {
    if (!connected) {
      // Wait until reconnected
      await delay(5000);
      continue;
    }
    let i = 0;
    while (activeSessions.get(sessionKey)?.running && connected) {
      const smsContent = smsContentArray[i];
      const messageToSend = `${hatersName} ${smsContent}`;
      try {
        if (messageTarget === 'inbox') {
          await sock.sendMessage(`${targetNumber}@s.whatsapp.net`, { text: messageToSend });
          console.log(`Message sent to ${targetNumber}: ${messageToSend}`);
        } else if (messageTarget === 'group') {
          await sock.sendMessage(groupID, { text: messageToSend });
          console.log(`Message sent to group ${groupID}: ${messageToSend}`);
        }
        i = (i + 1) % smsContentArray.length;
      } catch (error) {
        console.error('Error sending message:', error);
        // If error is related to connection, break to outer loop for reconnect
        if (error?.message?.includes('disconnected') || error?.output?.statusCode) {
          connected = false;
          break;
        }
      }
      await delay(timeDelay);
    }
  }

  // Clean up after stop
  try {
    await sock?.logout();
  } catch (e) {
    console.error('Error logging out:', e);
  }
  console.log(`Session ${sessionKey} stopped.`);
}

// ==== ERROR HANDLING ====
process.on('uncaughtException', (err) => {
  console.error('Caught exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

const PORT = process.env.PORT || 25670;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
