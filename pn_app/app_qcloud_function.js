// qcloud-function
const pf = require("pn_api");
const imp = new (pf.api_route.HttpAllMethodRouting)();
pf.WebServer.registByAuto(imp, [require("path").join(__dirname,"/dist")]);

exports.main_handler = async (event, context) => {
    try{
        let req_path = event.path.substr(event.requestContext.path.length);
        let req_ip = event.sourceIp;
        if(event.isBase64Encoded){
            event.body = Buffer.from(evt_data,"base64");
        }
        if(event.body && typeof event.body=="string"){
            if(event.headers["content-type"].indexOf("form-urlencoded")>0){
                event.body = require("querystring").parse(event.body);
            }
        }
        let req_param = event.body ? {...event.queryString,...event.body}:event.queryString;
        let req_headers = event.headers;
        //[request_id,params_obj,header_obj,pathArg]
        let ctx = await pf.Facade.run_by_ws({remoteAddress:req_ip,readyState:1}, [0,req_param,req_headers,req_path], 0, null, (ctx)=>{
            ctx.sendStr = (function(s,contentType){
                this["out_response"] = formateResponse(s, 200, this["out_headers"], false);
            }).bind(ctx);
            ctx.sendBuf = (function(s,contentType){
                this["out_response"] = formateResponse(s.toString("base64"), 200, this["out_headers"], true);
            }).bind(ctx);
            ctx.writeHeader = (function (hs) {
                this["out_headers"] = hs;
            }).bind(ctx);
            return ctx;
        });
        return ctx["out_response"];
    }catch (e) {
        return formateResponse(JSON.stringify({code:500, msg:err && err.message || 'Internal Error'}), 500);
    }
}

function formateResponse(body, statusCode, headers={"Content-Type": "text", "Access-Control-Allow-Origin": "*"}, isBase64Encoded=false) {
    return {
        isBase64Encoded,
        statusCode,
        headers,
        body
    }
}