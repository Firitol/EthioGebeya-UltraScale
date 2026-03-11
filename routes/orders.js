const express = require("express");
const { authenticate, pool } = require("../middleware/auth");
const { sanitize } = require("../middleware/validation");
const router = express.Router();

// POST /api/orders/checkout
router.post("/checkout", authenticate, async (req, res) => {
  try {
    const { paymentMethod, address } = req.body;
    if (!paymentMethod || !address) return res.status(400).json({ error: "Payment method and address required" });

    const { rows: cartItems } = await pool.query(`
      SELECT c.product_id, c.quantity, p.name, p.price
      FROM carts c
      JOIN products p ON c.product_id=p.id
      WHERE c.user_id=$1
    `, [req.user.id]);

    if (!cartItems.length) return res.status(400).json({ error: "Cart is empty" });

    const total = cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const order = await pool.query(`
      INSERT INTO orders (buyer_id, items, total, payment_method, address)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [req.user.id, JSON.stringify(cartItems), total, sanitize(paymentMethod), sanitize(address)]);

    await pool.query("DELETE FROM carts WHERE user_id=$1", [req.user.id]);

    res.json({ order: order.rows[0] });
  } catch (err) { res.status(500).json({ error: "Failed to checkout" }); }
});

// GET /api/orders/my
router.get("/my", authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM orders WHERE buyer_id=$1 ORDER BY created_at DESC", [req.user.id]);
    res.json({ orders: rows });
  } catch (err) { res.status(500).json({ error: "Failed to fetch orders" }); }
});

module.exports = router;
