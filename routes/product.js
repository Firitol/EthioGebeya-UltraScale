const express = require("express");
const { authenticate, requireRole, pool } = require("../middleware/auth");
const { sanitize } = require("../middleware/validation");
const router = express.Router();

// GET /api/products?search=&category=
router.get("/", async (req, res) => {
  try {
    const { search, category } = req.query;
    let query = "SELECT p.*, u.name as seller FROM products p JOIN users u ON p.seller_id=u.id WHERE 1=1";
    const params = [];
    if (search) { params.push(`%${sanitize(search)}%`); query += ` AND p.name ILIKE $${params.length}`; }
    if (category) { params.push(sanitize(category)); query += ` AND p.category=$${params.length}`; }
    const { rows } = await pool.query(query, params);
    res.json({ items: rows });
  } catch (err) { res.status(500).json({ error: "Failed to load products" }); }
});

// GET /api/products/featured
router.get("/featured", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT p.*, u.name as seller FROM products p JOIN users u ON p.seller_id=u.id ORDER BY created_at DESC LIMIT 12");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Failed to load featured products" }); }
});

// POST /api/products - seller/admin only
router.post("/", authenticate, requireRole("seller", "admin"), async (req, res) => {
  try {
    const { name, description, price, stock, category, city, image } = req.body;
    if (!name || !price || !stock) return res.status(400).json({ error: "Name, price, and stock are required" });
    const { rows } = await pool.query(
      `INSERT INTO products (seller_id,name,description,price,stock,category,city,image)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, sanitize(name), sanitize(description), price, stock, sanitize(category), sanitize(city), sanitize(image)]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: "Failed to create product" }); }
});

module.exports = router;
