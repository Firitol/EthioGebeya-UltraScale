const express=require("express")
const {authenticate,pool}=require("../middleware/auth")

const router=express.Router()

router.get("/:productId",async(req,res)=>{

const {rows}=await pool.query(`
SELECT r.*,u.name
FROM reviews r
JOIN users u ON r.user_id=u.id
WHERE product_id=$1
`,[req.params.productId])

res.json({reviews:rows})

})

router.post("/:productId",authenticate,async(req,res)=>{

const {rating,comment}=req.body

const {rows}=await pool.query(`
INSERT INTO reviews(product_id,user_id,rating,comment)
VALUES($1,$2,$3,$4)
RETURNING *
`,[
req.params.productId,
req.user.id,
rating,
comment
])

res.json(rows[0])

})

module.exports=router
