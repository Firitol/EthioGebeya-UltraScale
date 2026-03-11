const express=require("express")
const {authenticate,requireRole,pool}=require("../middleware/auth")
const {sanitize}=require("../middleware/validation")

const router=express.Router()

router.get("/",async(req,res)=>{
const {rows}=await pool.query("SELECT * FROM stores")
res.json({stores:rows})
})

router.get("/:id",async(req,res)=>{
const {rows}=await pool.query(
"SELECT * FROM stores WHERE id=$1",[req.params.id])
res.json(rows[0])
})

router.post("/",authenticate,requireRole("seller","admin"),async(req,res)=>{

const {store_name,description,logo}=req.body

const {rows}=await pool.query(`
INSERT INTO stores(owner_id,store_name,description,logo)
VALUES($1,$2,$3,$4)
RETURNING *`,
[
req.user.id,
sanitize(store_name),
sanitize(description),
sanitize(logo)
])

res.json(rows[0])

})

module.exports=router
