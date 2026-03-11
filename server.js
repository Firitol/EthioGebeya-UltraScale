const http = require("http");
const fs = require("fs/promises");
const fssync = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "db.json");
const SECRET = process.env.APP_SECRET || "ethiogebeya-ultrascale-secret-change-me";
const TOKEN_TTL_SECONDS = 60 * 60 * 8;
const MAX_BODY_BYTES = 1_000_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;

const requestLog = new Map();
let productCache = { key: null, value: null, cachedAt: 0 };

// --- UTILITY FUNCTIONS ---
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

// --- SEED DATA ---
const seedData = {
  users: [
    {
      id: "u-admin",
      name: "Ethio Admin",
      email: "admin@ethiogebeya.com",
      role: "admin",
      passwordHash: hashPassword("Admin@123")
    },
    {
      id: "u-seller-1",
      name: "Alemu Traders",
      email: "seller@ethiogebeya.com",
      role: "seller",
      passwordHash: hashPassword("Seller@123")
    },
    {
      id: "u-customer-1",
      name: "Mimi Buyer",
      email: "customer@ethiogebeya.com",
      role: "customer",
      passwordHash: hashPassword("Customer@123")
    }
  ],
  products: [],
  carts: [],
  orders: [],
  auditLogs: []
};

// --- DATABASE ---
async function ensureDb() {
  await fs.mkdir(dataDir, { recursive: true });
  if (!fssync.existsSync(dbPath)) {
    await writeDb(seedData);
  }
}

async function readDb() {
  await ensureDb();
  const raw = await fs.readFile(dbPath, "utf8");
  return JSON.parse(raw);
}

async function writeDb(data) {
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2));
}

// --- SERVER HELPERS ---
function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:;");
}

function rateLimit(req, res) {
  const ip = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const entry = requestLog.get(ip) || [];
  const recent = entry.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  requestLog.set(ip, recent);
  if (recent.length > RATE_LIMIT_MAX) {
    json(res, 429, { error: "Too many requests, slow down." });
    return false;
  }
  return true;
}

// --- AUTH HELPERS ---
function verifyPassword(password, stored) {
  const [salt] = stored.split(":");
  return hashPassword(password, salt) === stored;
}

function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  const [h, b, s] = token.split(".");
  if (!h || !b || !s) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(`${h}.${b}`).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(b, "base64url").toString("utf8"));
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function getAuthUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  return verifyToken(token);
}

function requireRole(user, ...roles) {
  return user && roles.includes(user.role);
}

// --- STATIC FILE SERVING ---
async function serveStatic(req, res, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(requestedPath).replace(/^\.+/, "");
  const filePath = path.join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    json(res, 403, { error: "Forbidden" });
    return;
  }
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const mimeTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8"
    };
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    json(res, 404, { error: "Not Found" });
  }
}

// --- FEATURED PRODUCTS (optional API) ---
const featuredProducts = [
  { id: 1, name: "Sidama Coffee Beans", price: 480, category: "Grocery", seller: "Alemu Traders", city: "Addis Ababa", rating: 4.8, image: "☕" },
  { id: 2, name: "Habesha Kemis", price: 3500, category: "Fashion", seller: "Tigist Boutique", city: "Bahir Dar", rating: 4.6, image: "👗" },
  { id: 3, name: "Handwoven Mesob", price: 1200, category: "Home", seller: "Gondar Crafts", city: "Gondar", rating: 4.7, image: "🧺" },
  { id: 4, name: "Injera Mitad (Electric)", price: 6200, category: "Appliances", seller: "Sheba Electronics", city: "Hawassa", rating: 4.5, image: "🍳" }
];

// --- MAIN SERVER ---
const server = http.createServer(async (req, res) => {
  setSecurityHeaders(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (!rateLimit(req, res)) return;

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // Featured products endpoint
    if (url.pathname === "/api/featured-products") {
      json(res, 200, featuredProducts);
      return;
    }

    // Handle other APIs
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    // Serve static files
    await serveStatic(req, res, url.pathname);

  } catch (error) {
    const message = error.message === "Payload too large" ? error.message : "Internal server error";
    const status = error.message === "Payload too large" ? 413 : error.message === "Invalid JSON" ? 400 : 500;
    json(res, status, { error: message });
  }
});

// --- START SERVER ---
ensureDb().then(() => {
  server.listen(PORT, () => {
    console.log(`EthioGebeya UltraScale running at http://localhost:${PORT}`);
  });
});
