const express = require("express");
const QRCode = require("qrcode");
const os = require("os");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const STATIC_DIR = path.join(__dirname, "out");
const users = [];

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "localhost";
}

const localIP = getLocalIP();
const baseURL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : `http://${localIP}:${PORT}`;

app.use(express.json());

// Backend API (kept from the original Express demo for future use)
app.get("/api/users", (_req, res) => {
  res.json(users);
});

app.post("/api/join", (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Name required" });
  }
  const user = { id: users.length + 1, name: name.trim(), joinedAt: Date.now() };
  users.push(user);
  console.log(`+ ${user.name} (${users.length} total)`);
  res.json(user);
});

app.get("/api/qr", async (_req, res) => {
  try {
    const dataUrl = await QRCode.toDataURL(baseURL, { width: 300, margin: 2 });
    res.json({ url: baseURL, dataUrl });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Static Next.js export
app.use(express.static(STATIC_DIR));

// SPA fallback — every non-API path returns index.html so client routing keeps working
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(STATIC_DIR, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\nServer:  ${baseURL}`);
  console.log(`Static:  ${STATIC_DIR}\n`);
});
