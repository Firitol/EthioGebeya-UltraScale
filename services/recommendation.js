async function recommendProducts(userId){

const {rows}=await pool.query(`
SELECT category
FROM orders
JOIN products ON products.id = ANY(orders.items)
WHERE buyer_id=$1
LIMIT 1
`,[userId])

if(!rows.length) return []

const category=rows[0].category

const rec=await pool.query(
"SELECT * FROM products WHERE category=$1 LIMIT 10",
[category]
)

return rec.rows

}

module.exports={recommendProducts}
