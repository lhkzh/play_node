const pf = require("pn_api");
const WebServer = pf.WebServer;
const HttpAllMethodRouting = pf.api_route.HttpAllMethodRouting;
let imp = new HttpAllMethodRouting();
WebServer.registByAuto(imp, [require("path").join(__dirname,"/dist")]);
// WebServer.registByDiy(imp, ()=>{
//     require("./dist/api/Public");
//     require("./dist/api/WebsocketHandler");
// });

let req_path = "/say";
let req_ip = "127.0.0.1";
let req_param = {name:"No8",a:[2,3,188]};
let req_headers = {};
//[request_id,params_obj,header_obj,pathArg]
pf.Facade.run_by_ws({remoteAddress:req_ip,readyState:1}, [0,req_param,req_headers,req_path], 0, null, (ctx)=>{
    ctx.sendStr = (function(s,contentType){
        send_response(contentType, this["out_headers"], s);
    }).bind(ctx);
    ctx.sendBuf = (function(s,contentType){
        send_response(contentType, this["out_headers"], s);
    }).bind(ctx);
    ctx.writeHeader = (function (hs) {
        this["out_headers"] = hs;
    }).bind(ctx);
    return ctx;
});
function send_response(contentType,headers,data) {
    console.log(data,"?>??",contentType,headers)
}