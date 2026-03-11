const views=document.querySelectorAll("main section")

document.querySelectorAll(".sidebar button")
.forEach(btn=>{

btn.onclick=()=>{

views.forEach(v=>v.style.display="none")

document.getElementById(btn.dataset.view+"View")
.style.display="block"

}

})
