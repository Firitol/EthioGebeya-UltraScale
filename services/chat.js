module.exports=(io)=>{

io.on("connection",(socket)=>{

socket.on("join",(room)=>{
socket.join(room)
})

socket.on("message",(msg)=>{
io.to(msg.room).emit("message",msg)
})

})

}
