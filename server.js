const express = require('express');
const QRCode = require('qrcode');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { build: BUILD_NUMBER } = require('./version.json');

const app = express();
const PORT = process.env.PORT || 3000;

const names = new Map();        // userId -> name
const connections = new Map();  // userId -> Set<userId>
const joinedAt = new Map();     // userId -> timestamp (for /api/users ordering)

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
  const list = [...names.entries()].map(([id, name]) => ({
    id, name, joinedAt: joinedAt.get(id)
  }));
  res.json(list);
});

app.post('/api/join', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name required' });
  }
  const id = crypto.randomUUID();
  const trimmed = name.trim();
  names.set(id, trimmed);
  connections.set(id, new Set());
  joinedAt.set(id, Date.now());
  console.log(`+ join: ${trimmed} (${id})`);
  res.json({ id, name: trimmed, joinedAt: joinedAt.get(id) });
});

app.get('/api/users/:id', (req, res) => {
  const { id } = req.params;
  if (!names.has(id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  const planets = [...(connections.get(id) || [])]
    .filter(pid => names.has(pid))
    .map(pid => ({ id: pid, name: names.get(pid) }));
  res.json({ id, name: names.get(id), planets });
});

app.post('/api/scan', (req, res) => {
  const { scanner, target } = req.body || {};
  if (!scanner || !target) {
    return res.status(400).json({ error: 'scanner and target required' });
  }
  if (scanner === target) {
    return res.status(400).json({ error: 'Cannot scan yourself' });
  }
  if (!names.has(scanner) || !names.has(target)) {
    return res.status(404).json({ error: 'Unknown user' });
  }
  connections.get(target).add(scanner);
  console.log(`* scan: ${names.get(scanner)} -> ${names.get(target)}`);
  res.json({ ok: true, target: { id: target, name: names.get(target) } });
});

app.get('/api/version', (req, res) => {
  res.json({ build: BUILD_NUMBER });
});

app.get('/api/qr', async (req, res) => {
  const url = `${baseURL}/join.html`;
  const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 });
  res.json({ url, dataUrl });
});

app.get('/api/qr/:id', async (req, res) => {
  const { id } = req.params;
  if (!names.has(id)) {
    return res.status(404).json({ error: 'Not found' });
  }
  const url = `${baseURL}/scan.html?target=${id}`;
  const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 });
  res.json({ url, dataUrl });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\nBuild:   v${BUILD_NUMBER}`);
  console.log(`Server:  ${baseURL}`);
  console.log(`Display: ${baseURL}/display.html`);
  console.log(`Join:    ${baseURL}/join.html`);
  console.log(`Orbit:   ${baseURL}/orbit.html\n`);
});
