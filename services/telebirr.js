const fetch=require("node-fetch")

async function initiateTelebirr(order){

const payload={
amount:order.total,
orderId:order.id,
callbackUrl:"https://ethiogebeya.com/api/payments/telebirr/callback"
}

const res=await fetch(process.env.TELEBIRR_URL,{
method:"POST",
headers:{
Authorization:"Bearer "+process.env.TELEBIRR_KEY,
"Content-Type":"application/json"
},
body:JSON.stringify(payload)
})

return res.json()

}

module.exports={initiateTelebirr}
