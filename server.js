var colors  = require('colors');
var util    = require('util');
var express = require('express'),
    app     = express(),
    http    = require('http'),
    server  = http.createServer(app),
    io      = require('socket.io').listen(server, {'log level':1}),
    Pixel_Data = require('./Pixel_Data'),
    Client  = require('./Client');


var CanvasData = new Pixel_Data(1000,800);
server.listen(3000,function(){
});

/* Sets up HTTP server
 * All requests are routed to /public folder
 * Empty request '/' routed to /public/index.html
 */
app.use(logger);
app.use(express.bodyParser());
app.use(express.static(__dirname + '/public'));
app.use('/public',function(req,res){
    res.sendfile("index.html");
});

/*
 * Client-server communications code
 */

/* A preset list of RGB colors assigned to clients as they connect
 * Color assignment restarts at the beginning of this list after all have been handed out
 */
ClientColors = [
    [255,0,0],
    [0,255,0],
    [0,0,255],
    [0,200,200],
    [200,100,100]
]

/* Client-tracking data structure
 * Clients are stored as key/value pairs, where keys are client id integers and values are references to client sockets.
 */
clients = {};

/* Used to assign the next client a unique id */
client_id = 0;

/* Initializes the connection between the server and client.
 * Establishes "protocol" of server/client communication
 */
io.sockets.on('connection',function(socket){
    /* Store a unique id to this client-server connection */
    socket.client_id = client_id;
    /* Give client a color */
    var colorArray = new Uint8Array(ClientColors[client_id%(ClientColors.length-1)]);
    /* Store this client data to clients array */
    clients[client_id] = new Client(client_id,socket,socket.handshake.address,colorArray);
    console.log("\n"+client_id+" has joined (ip: "+util.inspect(clients[client_id].ip)+")");
    /* Increment client_id counter*/
    client_id++;
    socket.emit('initializeCanvas',{width:CanvasData.getWidth(),height:CanvasData.getHeight(),color:colorArray});
    socket.emit('updateCanvas',CanvasData.getData());

    /* Tell all clients that a new user has joined
     * Sends the number of currently connected clients
     */
    io.sockets.emit('updateClientList',{numClients:Object.keys(clients).length});


    /* Receives new user data updates as a "stream" (specifically, pixels drawn only after the last update)
     * First queues this information to be stored in server data structure
     * Then broadcasts this new data to all other clients as a "stream"
     */
    socket.on('updateCanvasStream',function(data){
        if(data.stream.length>0){
            CanvasData.queueModifications(data.stream,socket);
            socket.broadcast.emit("updateRemoteStream",{sender:socket.client_id,data:data.stream});
        }}
    );

    /* Receives mouse position data from a client and broadcasts it to other clients */
    socket.on('updateMouseStream',function(data){
        socket.broadcast.emit("updateMouseStream",{sender:socket.client_id,mousePos:data.mousePos,color:clients[socket.client_id].color});
    });

    /* Used to signify end of a series of user inputs (in this case, when the user lifts the mouse button, signaling that a complete curve has been drawn)
     * At this point, all queued user streams are processed and stored into server data structure
     * @TODO The functionality of this function should be changed so that only this particular clients stream is processed into server storage.
     *       As it is, this function will cause server storage to contain "gaps" in user lines.
     */
    socket.on('endCanvasStream',function(){
        CanvasData.processQueue();
        socket.broadcast.emit('endRemoteStream',{sender:socket.client_id});
    })

    /* Upon disconnection, this client is deleted from the client-tracking data structure
     * All other clients are sent an updated copy of the current number of connections
     */
    socket.on('disconnect',function(){
        console.log("\n"+this.client_id+" has left.");
        delete clients[this.client_id];
        io.sockets.emit("updateClientList",{numClients:Object.keys(clients).length});
    })
});

/* Returns a list of all clients and their IP's */
var getClientIps = function(){
    return Object.keys(clients).map(function(client){
        return [client,clients[client].ip];
    });
};

/* Sends a 'clear' request to all clients.
 * Wipes server-stored canvas data.
 */
var clearCanvas = function(){
    io.sockets.emit('clear');
    CanvasData.dataArray = [];
    return "success";
}

/* Emits a 'pause' request along with a string message to a particular client
 * If the string '*' is supplied as the client_id, the request is sent to all clients
 */
var pause = function(client_id,message){
    if(client_id=='*'){
        Object.keys(clients).map(function(client){
            clients[client].socket.emit('pause',message);
        });
        return 'paused all with message '+message;
    }
    clients[client_id].socket.emit('pause',message);
    return  clients[client_id] + " paused with message: "+message;
}

/* Prints server requests to the console
 */
function logger(req,res,next){
    console.log("%s '%s' from %s", req.method, req.url, req.ip);
    next();
}


/* Starts a back-end REPL
 * 'ips()' function - Allows server user to request information about all currently-connected clients
 * 'clear()' function- Clears all stored drawing data from server and sends request to clear all users screens
 * 'pause(client_id,message)' function - sends a universal or individual message to a user along with a pause request
 */
repl = require("repl")
local_repl = repl.start({
    prompt: ">",
    input: process.stdin,
    output: process.stdout,
    useColors: false,
    useGlobal: false
});
local_repl.context.io = io;
local_repl.context.CanvasData = CanvasData;
local_repl.context.clients = clients;
local_repl.context.ips = getClientIps;
local_repl.context.clear = clearCanvas
local_repl.context.pause = pause;
/* End REPL code */
