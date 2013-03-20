/**
 * User: Austen
 * Date: 3/16/13
 * Time: 7:00 PM
 */
/* Globals */
CONNECT_ADDR = "169.229.100.33:3000"
var canvas, context;
var WIDTH, HEIGHT;
localUpdateStream = [];
queuedLocalUpdateStream = [];
remoteUpdateStreams = {}, remoteMouseStreams = {};
canvasData = [];
numClients = 0;
myColor = 0;
isClick = false;
isTouch = false;
clickType=-1;
var group;

/* Mouse enums */
MouseButton = {
    NONE: -1,
    LEFT: 0,
    RIGHT: 2
    };


socket = io.connect(CONNECT_ADDR);
socket.on('initializeCanvas', function (data) {
    /* Initialize globals */
    WIDTH = data.width//window.innerWidth;
    HEIGHT = data.height//window.innerHeight;
    myColor = data.color;
    group = data.group;

    localUpdateStream = [];
    queuedLocalUpdateStream = [];
    remoteUpdateStreams = {};
    canvasData = [];

    /* Initialize and set up canvas based on parameters passed from the server */
    canvas = document.getElementById('canvas');
    context = canvas.getContext('2d');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    //$("#canvas").css("position", "absolute");
    $("#canvas").css("left",($(document).width() - WIDTH)/2 + "px");
    $("#canvas").css("top",($(document).height() - HEIGHT)/2 + "px");
    $("#canvas").css("margin", "0 auto");
    $("#canvas").css("border", "thin black solid");

    /* Set up console window */
    $("#console").dialog({width: 'auto', height:'auto',autoResize:true, autoOpen: false});
    $("#console").css("font-size","10px");
    $(".ui-dialog-title").css("font-size","12px");

    /* Set up ext-block positions */
    /* currentGroups block goes at the top right corner */
    $("#currentGroups_block").offset({left:$(document).outerWidth()-$("#currentGroups_block").outerWidth(),top:$("currentGroups_block").padding});
    /* createGroup block starts hidden at the top left corner */
    $("#createGroup_block").offset({left:-$("#createGroup_block").outerWidth(),top:$("createGroup_block").padding});
    $(document).ready(main);
});
var lockTabPosition = function(){$("#createGroup_tab").offset({top:this.offsetTop,left:this.offsetLeft})};

socket.on('updateRemoteStream',function(data){
    console.log('updateRemoteStream: '+[data.sender]);

    if(!remoteUpdateStreams[data.sender]){
    remoteUpdateStreams[data.sender] = [];
    }
for(var i=0,ii=data.data.length;i<ii;i++){
    remoteUpdateStreams[data.sender].push(data.data[i]);
    }
});

socket.on('updateMouseStream',function(data){
    console.log('updateMouseStream: '+[data.sender]);
    remoteMouseStreams[data.sender] = [data.mousePos,data.color];
});

socket.on('endRemoteStream',function(data){
    console.log('endRemoteStream: '+[data.sender]);

    canvasData.push(remoteUpdateStreams[data.sender]);
    remoteUpdateStreams[data.sender]=[];
})

socket.on('updateClientList',function(data){
    numClients = data.numClients;
});

socket.on('updateCanvas',function(data){
    canvasData = data;
})

socket.on('clear',function(){
    localUpdateStream = [];
    queuedLocalUpdateStream = [];
    remoteUpdateStreams = {};
    canvasData = [];
});

socket.on('groupCreateForm',function(data){
    /* setConsoleTitle($("#title",data).text());
     logToConsole(data.toString());*/
    //$("#createGroup_block").toggle("slide");
    var groupBlock = $("#createGroup_block");
    var groupTab = $("#createGroup_tab");
    groupBlock.animate({"left":0},{duration:500,easing:"linear",queue:true});
    groupTab.animate({"left":"-"+groupTab.outerWidth()},{duration:500,easing:"linear"});
    addHtmlToTag("#createGroup_block",data);
});

socket.on('groupInfo',function(data){
    if(data.data){
        $("#currentGroups_block").empty();
        $("#currentGroups_block").append(data.content);
        $("#currentGroups").trigger("groups",data.data);
    }
});

/**
 * Provides requestAnimationFrame in a cross browser way.
 */
window.requestAnimFrame = (function() {
    return  window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.oRequestAnimationFrame ||
        window.msRequestAnimationFrame ||
        function(/* function FrameRequestCallback */ callback, /* DOMElement Element */ element) {
            return  window.setTimeout(callback, 1000/60);
        };
})();

/**
 * Provides cancelAnimationFrame in a cross browser way.
 */
window.cancelAnimFrame = (function() {
    return  window.cancelAnimationFrame ||
        window.webkitCancelAnimationFrame ||
        window.mozCancelAnimationFrame ||
        window.oCancelAnimationFrame ||
        window.msCancelAnimationFrame ||
        window.clearTimeout;
})();

function add_CanvasEvent_Listeners(canvas){
    var onMove = function(event){
        if((event.pageX > canvas.offset().left && event.pageX < canvas.offset().left+WIDTH) && (event.pageY > canvas.offset().top && event.pageY < canvas.offset().top+HEIGHT)){
            var mouseX = event.pageX - canvas.offset().left;
            var mouseY = event.pageY - canvas.offset().top;
            var index = mouseX+mouseY*WIDTH;
            socket.emit('updateMouseStream',{mousePos:[mouseX,mouseY]});
            /* Normal draw on MouseButton.LEFT
             * Eraser on MouseButton.RIGHT
             */
            if(clickType==MouseButton.LEFT){
                localUpdateStream.push({pos:index,color:myColor});
                queuedLocalUpdateStream.push({pos:index,color:myColor});
            }else if(clickType==MouseButton.RIGHT){
            }
        }
    }

    var onTouchMove = function(event){
        var mouseX = event.targetTouches[0].pageX - canvas.offsetLeft;
        var mouseY = event.targetTouches[0].pageY - canvas.offsetTop;
        event.preventDefault();
        var index = mouseX+mouseY*WIDTH;
        localUpdateStream.push({pos:index,color:myColor});
        queuedLocalUpdateStream.push({pos:index,color:myColor});
    }

    canvas.on('touchmove',onTouchMove);
    canvas.on('touchstart',function(e){
        isClick=true;
        onTouchMove(event);
    });
    canvas.on('touchend',function(e){
        isClick=false;
    });
    /* General controls */
    canvas.on("mousedown",function(event){
        /* Disable text drag icon */
        event.preventDefault();
        isClick = true;
        clickType = event.button;
        onMove(event);
    });
    canvas.on("mouseup",function(event){
        isClick = false;
        clickType = MouseButton.NONE;
    });
    canvas.on("mouseleave",function(event){
        socket.emit('updateMouseStream',{mousePos:[]});
    });
    canvas.on("mousemove",onMove);
    /* Disable context menu */
    canvas.on('contextmenu',function(e){return false});
}

function add_CreateGroupBlock_Listeners(createGroupBlock,createGroupTab){

    createGroupBlock.on("close",function(){
        createGroupBlock.animate({"left":"-"+createGroupBlock.outerWidth()},{duration:500,easing:"linear",queue:false,done:function(){removeHtmlFromTag("#createGroup_block")}});
        createGroupTab.animate({"left":0},{duration:500,easing:"linear",queue:false});
    });

    createGroupTab.on("click",function(event){
        if(event.button==MouseButton.LEFT){
            socket.emit('createGroupRequest');
        }
    });
}

function main(){
    add_CanvasEvent_Listeners($("canvas"));
    add_CreateGroupBlock_Listeners($("#createGroup_block"),$("#createGroup_tab"));
    window.requestAnimFrame(drawLoop);
}

function drawLoop(){
    /* Emit new updates to server and add new updates to local data struct */
    handleCanvasUpdates();

    /* Clear canvas */
    context.fillStyle="#FFFFFF";
    context.fillRect(0,0,WIDTH,HEIGHT);
    context.fillStyle="#000000";
    context.fillText("Currently drawing: "+numClients,10,10);

    drawUserInputs(canvasData);
    drawUserInputs(localUpdateStream);
    for(var stream in remoteUpdateStreams){drawUserInputs(remoteUpdateStreams[stream]);}
    for(var stream in remoteMouseStreams){drawUserCursor(remoteMouseStreams[stream]);}
    window.requestAnimFrame(drawLoop);
}

function handleCanvasUpdates(){
    if(isClick){
        socket.emit("updateCanvasStream",{stream:queuedLocalUpdateStream});
    }else if(localUpdateStream.length>0){
        socket.emit("endCanvasStream");
        updateCanvasFromLocal(localUpdateStream);
        localUpdateStream = [];
    }
    queuedLocalUpdateStream = [];
}

function updateCanvasFromLocal(data){
    canvasData.push(data);
}

/* Draw functions
 * Draws lines contained in an array
 * Expects objects in array to have properties "pos" and "color"
 */
function drawUserInputs(inputData){
    /* Update drawing */
    context.lineWidth=1;
    var currPixel,currColor,prevPos = [];
    for(var i=0;i<inputData.length;i++){
        if($.isArray(inputData[i])){
            drawUserInputs(inputData[i]);
            prevPos=[];
        }else if(inputData[i].pos){
            currPixel = inputData[i].pos;
            currColor = inputData[i].color;
            var yPos = parseInt(currPixel/WIDTH);
            var xPos = currPixel - (yPos*WIDTH);

            /* Set the color (required) */
            context.strokeStyle = colorToStyleString(currColor);
            /* Set line width (optional) */
            if(inputData[i].thickness){
                context.lineWidth = inputData[i].thickness;
            }else{
                context.lineWidth = 1;
            }

            /* Draw the line */
            if(prevPos){
                drawLine(prevPos[0],prevPos[1],xPos,yPos);
            }

            prevPos = [xPos,yPos];
        }
    }
}

function drawUserCursor(mouseInfo){
    if(mouseInfo){
        var mousePos = mouseInfo[0];
        var mouseColor = mouseInfo[1];
        context.fillStyle = colorToStyleString(mouseColor);
        context.fillRect(mousePos[0]-5,mousePos[1]-5,10,10);
    }
}

function drawLine(x1, y1, x2, y2){
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.closePath();
    context.stroke();
}

/* DOM control methods */

function giveDataToObject(selector,dataStr,callback){
    $(selector).prop("data",dataStr);
    if(callback){
        callback();
    }
}

function addHtmlToTag(selector,message){
    var currentHtml = $(selector).html();
    if(currentHtml){
        message = currentHtml + message;
    }
    $(selector).html(message);
}

function removeHtmlFromTag(selector){
    $(selector).html("");
}

function logToConsole(message){
    if(!$("#console").dialog("isOpen")){
        $("#console").dialog("open");
    }
    console.log(message);
    $("#console").html(message);
}

function setConsoleTitle(title){
    $("#console").dialog("option","title",title);
}

/* Given an array, returns the array if it contains data.
 * Else, returns a false boolean
 */
function notEmpty(someArray){
    if(someArray.length>0){
        return someArray;
    }else{
        return false;
    }
}

function colorToStyleString(color){
    if(color.length==4){
        return "rgba("+color[0]+","+color[1]+","+color[2]+","+color[3]+")";
    }else if(color.length==3){
        return "rgb("+color[0]+","+color[1]+","+color[2]+")";
    }else{
        throw new TypeError(color+"must be of length 3 or 4 and contain color information");
    }
}
