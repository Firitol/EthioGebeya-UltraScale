const express = require("express");
const { authenticate, pool } = require("../middleware/auth");
const router = express.Router();

// GET /api/cart
router.get("/", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.product_id, c.quantity, p.name, p.price, p.stock, p.category, p.city, p.image
      FROM carts c
      JOIN products p ON c.product_id=p.id
      WHERE c.user_id=$1
    `, [req.user.id]);
    res.json({ items: rows });
  } catch (err) { res.status(500).json({ error: "Failed to load cart" }); }
});

// POST /api/cart/items
router.post("/items", authenticate, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    if (!productId || quantity < 1) return res.status(400).json({ error: "Invalid input" });

    const existing = await pool.query("SELECT quantity FROM carts WHERE user_id=$1 AND product_id=$2", [req.user.id, productId]);
    if (existing.rows.length) {
      await pool.query("UPDATE carts SET quantity = quantity + $1 WHERE user_id=$2 AND product_id=$3", [quantity, req.user.id, productId]);
    } else {
      await pool.query("INSERT INTO carts (user_id, product_id, quantity) VALUES ($1,$2,$3)", [req.user.id, productId, quantity]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to add item to cart" }); }
});

// DELETE /api/cart/items/:id
router.delete("/items/:id", authenticate, async (req, res) => {
  try {
    await pool.query("DELETE FROM carts WHERE user_id=$1 AND product_id=$2", [req.user.id, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to remove item" }); }
});

module.exports = router;
