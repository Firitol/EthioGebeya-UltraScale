async function loadAnalytics(){

const data=await api("/admin/sales-report")

const view=document.getElementById("analyticsView")

view.innerHTML="<h2>Sales Analytics</h2>"

data.forEach(d=>{

const div=document.createElement("div")

div.className="card"

div.innerHTML=`
<p>${d.date}</p>
<p>ETB ${d.sum}</p>
`

view.appendChild(div)

})

}
