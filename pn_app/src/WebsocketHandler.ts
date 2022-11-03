import {WEBSOCKET} from "pn_api";
import {WebSocket} from "ws";
import {IncomingMessage} from "http";

@WEBSOCKET("/ws/:token([a-zA-Z0-9]+)")
class WebsocketHandler {
    public onOpen(conn:WebSocket, req:IncomingMessage, pathArg?:{[index:string]:string}){
        console.log("...open")
    }
    public onMessage(data:Buffer, isBinary:boolean, conn:WebSocket){
        console.log("...message：%s", data)
        conn.send(data, {binary:isBinary});
    }
    public onClose(conn:WebSocket, reason:{code:number,message:string}){
        console.log("...close", reason)
    }
}