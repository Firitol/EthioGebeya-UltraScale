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
  products: [
    {
      id: "p-1",
      sellerId: "u-seller-1",
      name: "Sidama Coffee Beans",
      description: "Single-origin roasted coffee from Sidama farms.",
      price: 480,
      stock: 120,
      category: "Grocery",
      city: "Addis Ababa",
      rating: 4.8,
      image: "☕",
      createdAt: new Date().toISOString()
    },
    {
      id: "p-2",
      sellerId: "u-seller-1",
      name: "Habesha Kemis",
      description: "Traditional handmade dress with modern tailoring.",
      price: 3500,
      stock: 35,
      category: "Fashion",
      city: "Bahir Dar",
      rating: 4.6,
      image: "👗",
      createdAt: new Date().toISOString()
    },
    {
      id: "p-3",
      sellerId: "u-seller-1",
      name: "Injera Mitad (Electric)",
      description: "Energy efficient mitad with temperature control.",
      price: 6200,
      stock: 19,
      category: "Appliances",
      city: "Hawassa",
      rating: 4.5,
      image: "🍳",
      createdAt: new Date().toISOString()
    }
  ],
  carts: [],
  orders: [],
  auditLogs: []
};

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
  const recent = entry.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  requestLog.set(ip, recent);
  if (recent.length > RATE_LIMIT_MAX) {
    json(res, 429, { error: "Too many requests, slow down." });
    return false;
  }
  return true;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

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

function sanitizeText(value, max = 160) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[<>]/g, "").slice(0, max);
}

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
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

async function appendAudit(db, actorId, action, metadata = {}) {
  db.auditLogs.push({
    id: crypto.randomUUID(),
    actorId,
    action,
    metadata,
    createdAt: new Date().toISOString()
  });
  if (db.auditLogs.length > 1000) {
    db.auditLogs = db.auditLogs.slice(-1000);
  }
}

function serveStatic(req, res, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(requestedPath).replace(/^\.+/, "");
  const filePath = path.join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    json(res, 403, { error: "Forbidden" });
    return;
  }
  fs.readFile(filePath)
    .then((data) => {
      const ext = path.extname(filePath);
      const mimeTypes = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8"
      };
      res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
      res.end(data);
    })
    .catch(() => json(res, 404, { error: "Not Found" }));
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

async function handleApi(req, res, url) {
  const db = await readDb();
  const method = req.method;
  const pathname = url.pathname;
  const auth = getAuthUser(req);

  if (method === "GET" && pathname === "/api/health") {
    json(res, 200, { status: "ok", uptime: process.uptime() });
    return;
  }

  if (method === "POST" && pathname === "/api/auth/register") {
    const body = await parseBody(req);
    const name = sanitizeText(body.name, 80);
    const email = sanitizeText((body.email || "").toLowerCase(), 120);
    const password = body.password || "";
    const role = body.role === "seller" ? "seller" : "customer";
    if (!name || !email.includes("@") || password.length < 8) {
      json(res, 400, { error: "Invalid name/email/password (min 8 chars)." });
      return;
    }
    if (db.users.some((u) => u.email === email)) {
      json(res, 409, { error: "Email already registered." });
      return;
    }
    const user = {
      id: `u-${crypto.randomUUID()}`,
      name,
      email,
      role,
      passwordHash: hashPassword(password)
    };
    db.users.push(user);
    await appendAudit(db, user.id, "register", { role });
    await writeDb(db);
    json(res, 201, { user: publicUser(user) });
    return;
  }

  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await parseBody(req);
    const email = sanitizeText((body.email || "").toLowerCase(), 120);
    const password = body.password || "";
    const user = db.users.find((u) => u.email === email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      json(res, 401, { error: "Invalid credentials." });
      return;
    }
    const token = signToken({ sub: user.id, role: user.role, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS });
    await appendAudit(db, user.id, "login");
    await writeDb(db);
    json(res, 200, { token, user: publicUser(user) });
    return;
  }

  if (method === "GET" && pathname === "/api/products") {
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 12)));
    const category = sanitizeText(url.searchParams.get("category") || "", 60).toLowerCase();
    const search = sanitizeText(url.searchParams.get("search") || "", 80).toLowerCase();
    const cacheKey = `${page}|${limit}|${category}|${search}`;
    if (productCache.key === cacheKey && Date.now() - productCache.cachedAt < 15000) {
      json(res, 200, productCache.value);
      return;
    }
    let items = [...db.products];
    if (category) items = items.filter((p) => p.category.toLowerCase() === category);
    if (search) items = items.filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(search));
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const start = (page - 1) * limit;
    const payload = {
      page,
      limit,
      total: items.length,
      items: items.slice(start, start + limit)
    };
    productCache = { key: cacheKey, value: payload, cachedAt: Date.now() };
    json(res, 200, payload);
    return;
  }

  if (method === "POST" && pathname === "/api/seller/products") {
    if (!requireRole(auth, "seller", "admin")) {
      json(res, 403, { error: "Seller or admin access required." });
      return;
    }
    const body = await parseBody(req);
    const product = {
      id: `p-${crypto.randomUUID()}`,
      sellerId: auth.sub,
      name: sanitizeText(body.name, 120),
      description: sanitizeText(body.description, 300),
      price: Number(body.price),
      stock: Number(body.stock),
      category: sanitizeText(body.category, 60),
      city: sanitizeText(body.city, 60),
      rating: 0,
      image: sanitizeText(body.image || "📦", 2) || "📦",
      createdAt: new Date().toISOString()
    };
    if (!product.name || product.price <= 0 || product.stock < 0 || !product.category) {
      json(res, 400, { error: "Invalid product payload." });
      return;
    }
    db.products.push(product);
    await appendAudit(db, auth.sub, "product_create", { productId: product.id });
    await writeDb(db);
    productCache.key = null;
    json(res, 201, { product });
    return;
  }

  if (method === "GET" && pathname === "/api/cart") {
    if (!auth) {
      json(res, 401, { error: "Authentication required." });
      return;
    }
    const cart = db.carts.find((c) => c.userId === auth.sub) || { userId: auth.sub, items: [] };
    const hydratedItems = cart.items.map((item) => {
      const product = db.products.find((p) => p.id === item.productId);
      return product ? { ...item, product } : null;
    }).filter(Boolean);
    json(res, 200, { items: hydratedItems });
    return;
  }

  if (method === "POST" && pathname === "/api/cart/items") {
    if (!auth) {
      json(res, 401, { error: "Authentication required." });
      return;
    }
    const body = await parseBody(req);
    const productId = sanitizeText(body.productId, 80);
    const quantity = Math.max(1, Number(body.quantity || 1));
    const product = db.products.find((p) => p.id === productId);
    if (!product) {
      json(res, 404, { error: "Product not found." });
      return;
    }
    let cart = db.carts.find((c) => c.userId === auth.sub);
    if (!cart) {
      cart = { userId: auth.sub, items: [] };
      db.carts.push(cart);
    }
    const existing = cart.items.find((item) => item.productId === productId);
    const nextQty = (existing ? existing.quantity : 0) + quantity;
    if (nextQty > product.stock) {
      json(res, 400, { error: "Requested quantity exceeds stock." });
      return;
    }
    if (existing) existing.quantity = nextQty;
    else cart.items.push({ productId, quantity });
    await appendAudit(db, auth.sub, "cart_add", { productId, quantity });
    await writeDb(db);
    json(res, 200, { items: cart.items });
    return;
  }

  if (method === "DELETE" && pathname.startsWith("/api/cart/items/")) {
    if (!auth) {
      json(res, 401, { error: "Authentication required." });
      return;
    }
    const productId = sanitizeText(pathname.split("/").pop(), 80);
    const cart = db.carts.find((c) => c.userId === auth.sub);
    if (!cart) {
      json(res, 404, { error: "Cart not found." });
      return;
    }
    cart.items = cart.items.filter((i) => i.productId !== productId);
    await appendAudit(db, auth.sub, "cart_remove", { productId });
    await writeDb(db);
    json(res, 200, { items: cart.items });
    return;
  }

  if (method === "POST" && pathname === "/api/orders/checkout") {
    if (!auth) {
      json(res, 401, { error: "Authentication required." });
      return;
    }
    const body = await parseBody(req);
    const paymentMethod = sanitizeText(body.paymentMethod, 40);
    const address = sanitizeText(body.address, 200);
    if (!["Telebirr", "CBE Birr", "Cash on Delivery"].includes(paymentMethod) || !address) {
      json(res, 400, { error: "Invalid payment method or address." });
      return;
    }
    const cart = db.carts.find((c) => c.userId === auth.sub);
    if (!cart || !cart.items.length) {
      json(res, 400, { error: "Cart is empty." });
      return;
    }
    let total = 0;
    const items = [];
    for (const item of cart.items) {
      const product = db.products.find((p) => p.id === item.productId);
      if (!product || product.stock < item.quantity) {
        json(res, 400, { error: `Insufficient stock for product ${item.productId}` });
        return;
      }
      product.stock -= item.quantity;
      const lineTotal = product.price * item.quantity;
      total += lineTotal;
      items.push({ productId: product.id, sellerId: product.sellerId, quantity: item.quantity, lineTotal });
    }
    const order = {
      id: `o-${crypto.randomUUID()}`,
      buyerId: auth.sub,
      items,
      total,
      paymentMethod,
      address,
      status: "confirmed",
      createdAt: new Date().toISOString()
    };
    db.orders.push(order);
    cart.items = [];
    await appendAudit(db, auth.sub, "checkout", { orderId: order.id, total });
    await writeDb(db);
    productCache.key = null;
    json(res, 201, { order });
    return;
  }

  if (method === "GET" && pathname === "/api/orders/my") {
    if (!auth) {
      json(res, 401, { error: "Authentication required." });
      return;
    }
    const orders = db.orders.filter((o) => o.buyerId === auth.sub);
    json(res, 200, { orders });
    return;
  }

  if (method === "GET" && pathname === "/api/seller/orders") {
    if (!requireRole(auth, "seller", "admin")) {
      json(res, 403, { error: "Seller or admin access required." });
      return;
    }
    const orders = db.orders.filter((order) => order.items.some((i) => i.sellerId === auth.sub || auth.role === "admin"));
    json(res, 200, { orders });
    return;
  }

  if (method === "GET" && pathname === "/api/admin/metrics") {
    if (!requireRole(auth, "admin")) {
      json(res, 403, { error: "Admin access required." });
      return;
    }
    const revenue = db.orders.reduce((sum, o) => sum + o.total, 0);
    const payload = {
      users: db.users.length,
      sellers: db.users.filter((u) => u.role === "seller").length,
      products: db.products.length,
      orders: db.orders.length,
      revenue,
      auditEvents: db.auditLogs.length
    };
    json(res, 200, payload);
    return;
  }

  json(res, 404, { error: "API route not found." });
}

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
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (error) {
    const message = error.message === "Payload too large" ? error.message : "Internal server error";
    const status = error.message === "Payload too large" ? 413 : error.message === "Invalid JSON" ? 400 : 500;
    json(res, status, { error: message });
  }
});

ensureDb().then(() => {
  server.listen(PORT, () => {
    console.log(`EthioGebeya UltraScale running at http://localhost:${PORT}`);
  });
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");

const featuredProducts = [
  {
    id: 1,
    name: "Sidama Coffee Beans",
    price: 480,
    category: "Grocery",
    seller: "Alemu Traders",
    city: "Addis Ababa",
    rating: 4.8,
    image: "☕"
  },
  {
    id: 2,
    name: "Habesha Kemis",
    price: 3500,
    category: "Fashion",
    seller: "Tigist Boutique",
    city: "Bahir Dar",
    rating: 4.6,
    image: "👗"
  },
  {
    id: 3,
    name: "Handwoven Mesob",
    price: 1200,
    category: "Home",
    seller: "Gondar Crafts",
    city: "Gondar",
    rating: 4.7,
    image: "🧺"
  },
  {
    id: 4,
    name: "Injera Mitad (Electric)",
    price: 6200,
    category: "Appliances",
    seller: "Sheba Electronics",
    city: "Hawassa",
    rating: 4.5,
    image: "🍳"
  }
];

const mimeTypes = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json"
};

const server = http.createServer((req, res) => {
  if (req.url === "/api/featured-products") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(featuredProducts));
    return;
  }
}
  const requestedPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(requestedPath).replace(/^\.+/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`EthioGebeya running at http://localhost:${PORT}`);
});
