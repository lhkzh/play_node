import * as fs from "fs";
import * as path from "path";
import {Stream} from "stream";
import {createServer, IncomingMessage, Server, ServerResponse} from "http";
import {Server as WsServer} from "ws";
import {api_requireByDir, api_requireByFileList, Facade} from "./api_facade";
import {ApiHttpCtx} from "./api_ctx";
import {HttpAllMethodRouting} from "./api_route";
import {readBodyAutoPromise, setReadFormOptions} from "./body_parser";

export class WebServer {
    private server: Server;
    private wsServer: WsServer;
    private routing: HttpAllMethodRouting;
    private registFn: Function;

    constructor(private config: { port: number, host?: string, dirs?: string[], www?: string, prefixs?: string[], maxHeaderSize?: number, websocket?: { maxPayload: number, perMessageDeflate?: boolean }, body_parser?: { limits?: { fieldNameSize:number, fields:number, files:number, fileSize:number, maxPayLoadSize:number }, processFile?: (file: Stream, info: { fileName: string, contentType: string }) => string, filterFile?: (info: { fileName: string, contentType: string }, req: IncomingMessage) => boolean } }) {
        this.routing = new HttpAllMethodRouting(this.config.prefixs);
        this.server = createServer({maxHeaderSize: (config.maxHeaderSize ? config.maxHeaderSize : 4096)},
            this.serverProcess.bind(this));
        if (this.config.websocket != null) {
            this.wsServer = new WsServer({...this.config.websocket, noServer: true});
            this.server.on('upgrade', (req, sock, head) => {
                let rsp = this.routing._upgrade.match(req.url.split('?')[0]);
                if (!rsp) {
                    sock.write('HTTP/1.1 404 Not Found\r\n\r\n');
                    sock.destroy();
                } else {
                    (<any>rsp[0])(req, sock, head, rsp[2], this.wsServer);
                }
            })
        }
        if (this.config.body_parser) {
            setReadFormOptions(this.config.body_parser);
        }
    }

    public start() {
        return new Promise<boolean>((resolve, reject) => {
            this.server.listen(this.config.port, this.config.host || "0.0.0.0", () => {
                resolve(true);
                console.log("server_start_ok: address= http://127.0.0.1:" + this.config.port);
            }).once("error", e => {
                console.error("server_start_error", e);
                resolve(false);
            });
        });
    }

    public stop() {
        return new Promise<boolean>((resolve, reject) => {
            this.server.close(() => {
                resolve(true);
            }).once("error", e => {
                console.error("server_start_error", e);
                resolve(false);
            });
        });
    }

    /**
     * 根据配置的dirs自动扫描注册API
     */
    public registAuto(whenReloadDelCache=false) {
        this.registFn = () => {
            WebServer.registByAuto(this.routing, this.config.dirs);
            if(whenReloadDelCache){
                this.config.dirs.forEach(tmpDir=>{
                    let p = require("path").resolve(tmpDir);
                    for(var k in require.cache){
                        if(k.startsWith(p)){
                            delete require.cache[k];
                        }
                    }
                });
            }
            console.log("WebServer.regist_routing");
        };
        this.registFn();
        return this;
    }

    /**
     * 根据api文件扫描注册方法注册API
     * @param files
     * @param requireFn
     */
    public registDiy1(files: string[], requireFn?: (id: string) => void) {
        this.registFn = () => {
            WebServer.registByDiy1(this.routing, files, requireFn);
            console.log("WebServer.regist_routing");
        };
        this.registFn();
        return this;
    }
    /**
     * 自定义注册方法注册API
     * @param regFn
     */
     public registDiy2(regFn?: (id: string) => void) {
        this.registFn = () => {
            WebServer.registByDiy2(this.routing, regFn);
            console.log("WebServer.regist_routing");
        };
        this.registFn();
        return this;
    }

    /**
     * 重新regist
     */
    public reload() {
        console.log("WebServer.reload");
        if (this.registFn) {
            this.registFn();
        }
    }

    private serverProcess(req: IncomingMessage, res: ServerResponse) {
        let tmps = req.url.split('?');
        let routeRsp = this.routing.matchByParamPath(req.method, tmps[0]);
        if(routeRsp){
            if(routeRsp[0]["@"]){// REPEATER
                (<Function>routeRsp[0])(req, res);
            }else if (req.method.charAt(0) == 'P') {//POST - PUT
                readBodyAutoPromise(req).then(body => {
                    routeRsp[0]({
                        req: req, res: res, address: tmps[0], query: {...require("querystring").decode(tmps[1] || "")},
                        body: body, pathArg: routeRsp[2]
                    }, routeRsp[1]);
                }).catch(err => {
                    this.sendErrRes(req, res, 500, "Read Error");
                    console.error("parse_body_err", req.url, err);
                });
            } else {//GET
                routeRsp[0]({
                    req: req, res: res, address: tmps[0], query: {...require("querystring").decode(tmps[1] || "")},
                    body: null, pathArg: routeRsp[2] || {}
                }, routeRsp[1]);
            }
        }else{
            if (this.config.www) {
                var filepath = path.join(this.config.www, tmps[0]);
                if (fs.existsSync(filepath)) {
                    var filestat = fs.statSync(filepath);
                    if (filestat.isFile()) {
                        res.writeHead(200, {
                            "Content-Type": this.getContentType(filepath) + "; charset=utf-8",
                            "Content-Length": filestat.size,
                            "Server": "NodeJs(" + process.version + ")"
                        });
                        fs.createReadStream(filepath).pipe(res);
                        return;
                    }
                }
            }
            this.sendErrRes(req, res, 404, "Not Found", 404);
        }
    }

    private sendErrRes(req: IncomingMessage, res: ServerResponse, code: number, msg: string, statusCode?: number) {
        if (statusCode) {
            res.statusCode = statusCode;
        }
        // res.setHeader("Content-Type","application/json; charset=utf8");
        // res.end('{"code":500,"msg":"Read Error"}');
        let rsp = new Facade.defaultRes();
        rsp.msg = msg;
        rsp.code = code;
        rsp.out(new ApiHttpCtx({req: req, res: res, address: "", query: null}));
    }

    private getContentType(filePath: string) {
        try {
            return require("mime").getType(path.extname(filePath))
        } catch (e) {
            return "application/binary; charset=utf8";
        }
    }

    public static registByAuto(routing: HttpAllMethodRouting, dirs: string[]) {
        api_requireByDir(dirs);
        routing.resetAll(Facade._api_routing);
    }

    public static registByDiy1(routing: HttpAllMethodRouting, files: string[], requireFn?: (id: string) => void) {
        api_requireByFileList(<string[]>files, requireFn);
        routing.resetAll(Facade._api_routing);
    }
    public static registByDiy2(routing: HttpAllMethodRouting, diyFn:Function) {
        api_requireByFileList([""], <any>diyFn);
        routing.resetAll(Facade._api_routing);
    }    
}