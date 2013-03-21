/* Global config */
ReqPrefix = {
    CREATE: '/create',
    JOIN: '/join',
    STATIC: '/public'
};

DefaultFiles = {
    CREATE_GROUP: 'createGroup.html',
    CURRENT_GROUPS: 'currentGroups.html',
    INDEX: 'app.html'
}

ServerConfig = {
    HOSTNAME: 'http://169.229.100.33',
    HOSTIP: '169.229.100.33',
    HTTPPORT: 3000
}

var colors  = require('colors');
var util    = require('util');
var fs      = require('fs');
var express = require('express'),
    app     = express(),
    http    = require('http'),
    server  = http.createServer(app),
    io      = require('socket.io').listen(server, {'log level':1}),
    md5     = require('MD5'),
    rDB   = require('redis').createClient(10313,'cod.redistogo.com',{no_ready_check: true});

/*Authenticate redis database*/
rDB.auth('e5615e6ce9a3511acdd15af2804c5934');

    /* Custom modules */
var Pixel_Data = require('./Pixel_Data'),
    Client  = require('./Client');

var CanvasData = new Pixel_Data(1000,800);
server.listen(ServerConfig.HTTPPORT,ServerConfig.HOSTIP,function(){
});

/* Sets up HTTP server */
//app.use(logger);
app.use(express.bodyParser());

app.use(ReqPrefix.JOIN,function(req,res){
    handleGroupJoinRequest(req,res);
});

/* Handle group creation requests */
app.use(ReqPrefix.CREATE,function(req,res){
    handleGroupCreationRequest(req,res);
});

/* All other requests are routed to /public folder */
app.use(express.static(__dirname + ReqPrefix.STATIC));
/* Empty request '/' routed to default page */
app.use(ReqPrefix.STATIC,function(req,res){
    res.sendfile(DefaultFiles.INDEX);
});

/*
 * Special request handlers
 */

/*
 * Create a new client group
 */
function handleGroupCreationRequest(req,res){
    /* Check if group already exists */
    var name = req.body.name;
    var numSlots = req.body.slots;
    if(!(name&&numSlots)){
        res.send("<span class='error'>Name field is blank</span>");
        return;
    }
    /* Create string to hash */
    var hashable = name;

    /* Hash string and insert it into database if it doesn't already exist */
    var groupHash = md5(hashable);
    rDB.HGET(groupHash,'n',function(err,reply){
        if(!reply){
            /* Create group and add the creator to the list of players */
            rDB.HMSET(groupHash,{'name':name,'n':numSlots,'players':''});
            var message = "<label><span class='info'>Send this code to your friends</span>"+createJoinURL(groupHash)+"</label>";
            res.send(message);
        }else{
            res.send("<span class='error'>Already exists yo</span>");
        }
    });
}

/*
 * Add a client to an existing group
 */
function handleGroupJoinRequest(req,res){
    /* Extract groupHash as all the alphanumeric characters appended in the url */
    var keyRegex = new RegExp("[A-z0-9]+");
    var groupHash = keyRegex.exec(req.url);

    /* Get previously stored info about client */
    var userIP = req.ip;

    rDB.HGETALL(groupHash, function(err,obj){
        /* Check if group does not exist */
        if(!obj){
            res.send("Group does not exist");
            return;
        }

        /* If user ip is already logged in this group, allow access */
        var numPlayers = Object.keys(obj).length-1;
        var playerHash = md5(req.ip);
        var clientPlayerNum = obj.players.split(';').indexOf(userIP);

        if(clientPlayerNum!=-1){
            console.log("You are logged as player "+(clientPlayerNum+1));
        }else if(obj.n>0){
         /* If user ip is not logged in this group, add client if group is not full */
            rDB.HSET(groupHash,"players",obj.players + ";" + userIP);
            rDB.HINCRBY(groupHash,"n",-1);
            console.log("You have been added to the group as player number "+(numPlayers));
        }else{
            res.send("There are no more slots left in this group");
        }
        /* Add group to client's log entry */
        logUserInfo(playerHash,'ip',userIP);
        logUserInfo(playerHash,'group',groupHash+","+obj.name,"append");
        res.redirect("/");
    });
}

//Helpers
function createJoinURL(groupHash){
    var url = ServerConfig.HOSTNAME+":3000"+ReqPrefix.JOIN+"/"+groupHash;
    var htmlLink = "<a class=\"response\" href=\""+url+"\">"+url+"</a>";
    return htmlLink;
}

/*
 * End special request handlers
 */

/*
 * User identification and tracking code
 */
function checkUserLog(key,isHashed,callback){
    var hash;
    if(!isHashed){
        hash = md5(key);
    }else{
        hash = key;
    }

    if(!callback){
        callback = function(err,resp){};
    }
    rDB.HGETALL(hash,callback);
}

/* Logs information (a field and value pair) about a client to their entry in the client-tracking hash table */
function logUserInfo(hash,field,value,writeType){
    if(!writeType){
        writeType = "overwrite";
    }
    console.log(hash+","+field+","+value+","+writeType);
    if(writeType=="append"){
        rDB.HGET(hash,field,function(err,resp){
            var valueExists = -1;
            if(resp){
                valueExists = resp.split(';').indexOf(value);
                if(valueExists==-1){
                    value = resp+";"+value;
                }else{
                    return;
                }
            }
            rDB.HSET(hash,field,value);
        });
    }else if(writeType=="overwrite"){
        rDB.HSET(hash,field,value);
    }
}

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
    [200,100,100],
    [200,200,100],
    [150,10,30]
]

/* Currently online clients
 * Each client is stored as a hash
 */
clientsOnline=0;

/* Initializes the connection between the server and client.
 * Establishes "protocol" of server/client communication
 */
io.sockets.on('connection',function(socket){
    var clientIp = socket.handshake.address.address;
    var clientHash = md5(clientIp);
    var clientColor = new Uint8Array(ClientColors[parseInt(Math.random()*(ClientColors.length-1))]);
    var clientRegisteredGroups = {};
    var clientGroup = "default";

    /*
     * If client does not already have an ID in our database, assign them one
     */
    checkUserLog(clientHash,true,function(err,reply){
        var msg= '';
        var clientLog = reply;
        if(!clientLog){
            /* Possibly extraneous check -- check if we've generated a duplicate hash */
            checkUserLog(clientHash,true,function(err,reply){
                if(reply){
                    console.log("ERROR! DUPLICATE HASH GENERATED".red);
                    console.log("Orginal   IP: "+reply.ip);
                    console.log("Duplicate IP: "+clientIp);
                }
            });
            /* End check */

            logUserInfo(clientHash,'ip',clientIp);
            msg = "New client has joined (ip: "+clientIp+")";
        }else{
            /* Since we have previously stored data, check if this client is registered in a group */
            if(clientLog['group']){
                /* Store each group the player is registered in to local memory
                 * Split each group into an object {name: [group name],hash: [group hash]}
                 */
                var groupList = clientLog.group.split(";");
                for(var i=0;i<groupList.length;i++){
                    var groupDetailsList = groupList[i].split(",");
                    var groupHash = groupDetailsList[0];
                    var groupName = groupDetailsList[1];
                    clientRegisteredGroups[groupHash]=groupName;
                }
            }
            msg = "Recognized user has joined (ip: "+clientLog.ip+") (group: "+clientGroup+")";
        }
        console.log(msg);
        initializeClient();
    });

    function initializeClient(){
        /* Record client as being online */
        socket.emit('initializeCanvas',{width:CanvasData.getWidth(),height:CanvasData.getHeight(),color:clientColor,group:clientGroup});
        socket.emit('updateCanvas',CanvasData.getData());
        sendGroupInfo();

        /* Join room (global by default) */
        socket.join(clientGroup);

        /* Tell all clients that a new user has joined
         * Sends the number of currently connected clients
         */
        clientsOnline++;
        io.sockets.in(clientGroup).emit('updateClientList',{numClients:io.sockets.clients(clientGroup).length});
    }


    function sendGroupInfo(){
        fs.readFile(__dirname+ReqPrefix.STATIC+"/"+DefaultFiles.CURRENT_GROUPS,function(err,data){
            if(err){
                console.error(err);
            }else{
                var stringData = data.toString();
                stringData = stringData.replace(/<.*?html>|<.*?head>|<.*?title>|<.*?body>/g,"");
                socket.emit('groupInfo',{content:"<object type=\"text/html\" data=\""+stringData+"\"></object>",data: {groups: clientRegisteredGroups,active: clientGroup}});
            }
        });
    }

    socket.on('selectClientGroup',function(groupHash){
        if(clientRegisteredGroups[groupHash]){
            clientGroup = groupHash;
            sendGroupInfo();
        }
    })


    /* Receives new user data updates as a "stream" (specifically, pixels drawn only after the last update)
     * First queues this information to be stored in server data structure
     * Then broadcasts this new data to all other clients as a "stream"
     */
    socket.on('updateCanvasStream',function(data){
        if(data.stream.length>0){
            CanvasData.queueModifications(data.stream,socket);
            socket.broadcast.to(clientGroup).emit("updateRemoteStream",{sender:clientHash,data:data.stream});
        }}
    );

    /* Receives mouse position data from a client and broadcasts it to other clients */
    socket.on('updateMouseStream',function(data){
        socket.broadcast.to(clientGroup).emit("updateMouseStream",{sender:clientHash,mousePos:data.mousePos,color:clientColor});
    });

    /* Used to signify end of a series of user inputs (in this case, when the user lifts the mouse button, signaling that a complete curve has been drawn)
     * At this point, all queued user streams are processed and stored into server data structure
     * @TODO The functionality of this function should be changed so that only this particular clients stream is processed into server storage.
     *       As it is, this function will cause server storage to contain "gaps" in user lines.
     */
    socket.on('endCanvasStream',function(){
        CanvasData.processQueue();
        socket.broadcast.to(clientGroup).emit('endRemoteStream',{sender:clientHash});
    });

    /* If a create group request was sent via a socket */
    socket.on('createGroupRequest',function(){
        fs.readFile(__dirname+ReqPrefix.STATIC+"/"+DefaultFiles.CREATE_GROUP,function(err,data){
            if(err){
                console.error(err);
            }else{
                var stringData = data.toString();
                stringData = stringData.replace(/<.*?html>|<.*?head>|<.*?title>|<.*?body>/g,"");
                socket.emit('groupCreateForm',"<object type=\"text/html\" data=\""+stringData+"\"></object>");
            }
        });
    })

    /* Upon disconnection, this client is deleted from the client-tracking data structure
     * All other clients are sent an updated copy of the current number of connections
     */
    socket.on('disconnect',function(){
        //rDB.DEL(clientHash,function(err,resp){
            console.log("\n"+clientIp+" has left.");
            clientsOnline--;
            io.sockets.in(clientGroup).emit("updateClientList",{numClients:io.sockets.clients(clientGroup).length-1});
        //});
    });
});

/* Sends a 'clear' request to all clients.
 * Wipes server-stored canvas data.
 */
var clearCanvas = function(){
    io.sockets.emit('clear');
    CanvasData.dataArray = [];
    return "success";
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
local_repl.context.rDB = rDB;
local_repl.context.CanvasData = CanvasData;
local_repl.context.clear = clearCanvas
local_repl.context.printDB = function(){rDB.keys('*',function(err,reply){
    reply.map(function(key){
        rDB.GET(key,function(err,reply){
            if(!reply){
                rDB.hgetall(key,function(err,obj){
                   console.log(key+": "+util.inspect(obj));
                });
            }else{
                console.log(key+": "+reply);
            }
        });
    });
});return "Done";};
/* End REPL code */
