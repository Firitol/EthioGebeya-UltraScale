const fetch=require("node-fetch")

async function initiateCBE(order){

const payload={
amount:order.total,
orderId:order.id
}

const res=await fetch(process.env.CBE_API,{
method:"POST",
headers:{
Authorization:"Bearer "+process.env.CBE_KEY
},
body:JSON.stringify(payload)
})

return res.json()

}

module.exports={initiateCBE}
