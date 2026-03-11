const express = require("express");
const { authenticate, requireRole, pool } = require("../middleware/auth");
const router = express.Router();

// GET /api/admin/metrics
router.get("/metrics", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const totalUsers = await pool.query("SELECT COUNT(*) FROM users");
    const totalProducts = await pool.query("SELECT COUNT(*) FROM products");
    const totalOrders = await pool.query("SELECT COUNT(*) FROM orders");
    const totalRevenue = await pool.query("SELECT COALESCE(SUM(total),0) AS revenue FROM orders");

    res.json({
      users: parseInt(totalUsers.rows[0].count),
      products: parseInt(totalProducts.rows[0].count),
      orders: parseInt(totalOrders.rows[0].count),
      revenue: parseFloat(totalRevenue.rows[0].revenue)
    });
  } catch (err) { res.status(500).json({ error: "Failed to fetch metrics" }); }
});

module.exports = router;
