const API="/api"

async function api(path,options={}){

const token=localStorage.getItem("token")

const res=await fetch(API+path,{
headers:{
"Content-Type":"application/json",
Authorization: token?`Bearer ${token}`:""
},
...options
})

if(!res.ok) throw new Error("API error")

return res.json()

}
