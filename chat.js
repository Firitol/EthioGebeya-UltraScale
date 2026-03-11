const socket=io()

function startChat(room){

socket.emit("join",room)

}

socket.on("message",(msg)=>{

const chat=document.getElementById("chatView")

chat.innerHTML+=`<p>${msg.text}</p>`

})

function sendMessage(){

const text=document.getElementById("msgInput").value

socket.emit("message",{room:"support",text})

}
