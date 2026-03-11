const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const authenticate = async (req, res, next) => {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.APP_SECRET);
    const { rows } = await pool.query("SELECT id, name, email, role FROM users WHERE id=$1", [payload.sub]);
    if (!rows[0]) return res.status(401).json({ error: "Invalid token" });
    req.user = rows[0];
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: "Forbidden" });
  next();
};

module.exports = { authenticate, requireRole, pool };
