/**
 * User: Austen
 * Date: 3/10/13
 * Time: 10:43 PM
 */

function Client(client_id,address,colorSelection){
    this.client_id = client_id;
    this.ip = address.address;
    this.port = address.port;
    /* Create date string */
    var date = new Date();
    this.creation_date = (date.getMonth()+1)+"/"+date.getDate()+"/"+date.getYear()+" "+date.getHours()+":"+date.getMinutes()+":"+date.getSeconds();
    this.color = new Uint8Array(colorSelection[parseInt(Math.random()*(colorSelection.length-1))]);
}

module.exports = Client;