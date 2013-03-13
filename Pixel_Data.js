/**
 * User: Austen
 * Date: 3/9/13
 * Time: 8:53 PM
 */
/* Pixel data class
 * Stores each pixel of a canvas to synchronize between users
 */
function Pixel_Data(WIDTH,HEIGHT){
    /* Modifies a list of specific pixels.
     * Pixels should be identified as in a linear, row-major order array.
     * The list should address the pixel first, then the data to be stored at the location.
     * The size of the list should always be even.
     * E.g to change pixels 10,10 and 10,15 of an 800*600 pixel structure [8010,(new data),12010,(new data)]
     */
    this.modifyPixels = function(pixelList){
        this.dataArray.push(pixelList);
        this.recentModifications=pixelList;
    };

    this.processQueue = function(){
        var pixelList, clientResponsible;
        for(var client_id in this.modificationQueue){
            pixelList = this.modificationQueue[client_id];
            this.modifyPixels(pixelList);
            this.modificationQueue[client_id] = [];
        }
    };
    this.queueModifications = function(modList,clientResponsible){
        var client_id = clientResponsible.client_id;
        if(!this.modificationQueue[client_id])
            this.modificationQueue[client_id] = [];
        if(modList instanceof Array){
            for(var i= 0,ii=modList.length;i<ii;i++){
                this.modificationQueue[client_id].push(modList[i]);
            }
        }else{
            this.modificationQueue[client_id].push(modList);
        }
       };
    this.getData = function(){return this.dataArray;};
    this.getRecents = function(){return this.recentModifications;};
    this.getWidth = function(){return this.width;};
    this.getHeight = function(){return this.height;};
    this.lock = function(){this.isLocked=true;};
    this.unlock = function(){this.isLocked=false;};

    this.isLocked = false;
    this.width  = WIDTH;
    this.height = HEIGHT;
    this.dataArray = [];
    /* Create an empty list for storing recently changed pixels */
    this.recentModifications=[];

    this.modificationQueue = {};

}

module.exports = Pixel_Data;