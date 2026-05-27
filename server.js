const express = require('express');
const QRCode = require('qrcode');
const os = require('os');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const users = [];

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const localIP = getLocalIP();
const baseURL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : `http://${localIP}:${PORT}`;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/users', (req, res) => {
  res.json(users);
});

app.post('/api/join', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name required' });
  }
  const user = { id: users.length + 1, name: name.trim(), joinedAt: Date.now() };
  users.push(user);
  console.log(`+ ${user.name} (${users.length} total)`);
  res.json(user);
});

app.get('/api/qr', async (req, res) => {
  const url = `${baseURL}/join.html`;
  const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 });
  res.json({ url, dataUrl });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nServer:  ${baseURL}`);
  console.log(`Display: ${baseURL}/display.html`);
  console.log(`Join:    ${baseURL}/join.html\n`);
});
