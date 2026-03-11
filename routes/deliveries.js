const express=require("express")
const {authenticate,requireRole,pool}=require("../middleware/auth")

const router=express.Router()

router.get("/:orderId",authenticate,async(req,res)=>{

const {rows}=await pool.query(
"SELECT * FROM deliveries WHERE order_id=$1",
[req.params.orderId]
)

res.json(rows[0])

})

router.put("/:orderId",
authenticate,
requireRole("admin"),
async(req,res)=>{

const {status,current_location}=req.body

await pool.query(`
UPDATE deliveries
SET status=$1,current_location=$2,updated_at=NOW()
WHERE order_id=$3
`,
[status,current_location,req.params.orderId])

res.json({success:true})

})

module.exports=router
