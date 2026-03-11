async function loadProducts(){

const data=await api("/products")

const view=document.getElementById("productsView")

view.innerHTML="<h2>Products</h2>"

data.items.forEach(p=>{

const div=document.createElement("div")

div.className="card"

div.innerHTML=`
<h3>${p.name}</h3>
<p>ETB ${p.price}</p>
<p>${p.category}</p>
<button onclick="deleteProduct('${p.id}')">Delete</button>
`

view.appendChild(div)

})

}

async function deleteProduct(id){

await api("/seller/products/"+id,{method:"DELETE"})

loadProducts()

}
