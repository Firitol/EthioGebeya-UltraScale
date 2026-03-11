async function loadOrders(){

const data=await api("/orders/my")

const view=document.getElementById("ordersView")

view.innerHTML="<h2>Orders</h2>"

data.orders.forEach(o=>{

const div=document.createElement("div")

div.className="card"

div.innerHTML=`
<h4>Order ${o.id}</h4>
<p>Status: ${o.status}</p>
<p>Total: ETB ${o.total}</p>
`

view.appendChild(div)

})

}
