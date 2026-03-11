async function loadDeliveries(){

const data=await api("/deliveries")

const view=document.getElementById("deliveryView")

view.innerHTML="<h2>Delivery Tracking</h2>"

data.forEach(d=>{

const div=document.createElement("div")

div.className="card"

div.innerHTML=`
<p>Order ${d.order_id}</p>
<p>Status: ${d.status}</p>
<p>Location: ${d.current_location}</p>
`

view.appendChild(div)

})

}
