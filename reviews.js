async function loadReviews(){

const data=await api("/reviews")

const view=document.getElementById("reviewsView")

view.innerHTML="<h2>Product Reviews</h2>"

data.reviews.forEach(r=>{

const div=document.createElement("div")

div.className="card"

div.innerHTML=`
<p>⭐ ${r.rating}</p>
<p>${r.comment}</p>
`

view.appendChild(div)

})

}
