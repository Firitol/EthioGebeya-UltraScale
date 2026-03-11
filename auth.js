const user=JSON.parse(localStorage.getItem("user")||"null")

if(user){

document.getElementById("userBadge").textContent=user.name

if(user.role!=="admin")
document.querySelector('[data-view="admin"]').style.display="none"

}
