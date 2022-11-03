import {WEBSOCKET} from "pn_api";
import {IncomingMessage} from "http";

@WEBSOCKET("/ws/:token([a-zA-Z0-9]+)")
class WebsocketHandler {
    public onOpen(conn:WebSocket, req:IncomingMessage, pathArg?:{[index:string]:string}){
        console.log("...open")
    }
    public onText(data, conn:WebSocket){
        console.log("...text", data)
        conn.send(data);
    }
    public onClose(conn:WebSocket, reason:{code:number,message:string}){
        console.log("...close", reason)
    }
}