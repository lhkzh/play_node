/**
 * api路由注册中心
 * @author zhh
 * @copyright u14.com <2019-?>
 */
import * as util from "util";
import * as fs from "fs";
import * as path from "path";
import {
    AbsRes,
    JsonRes,
    ApiRunError,
    ApiHttpCtx,
    WsApiHttpCtx,
    AbsHttpCtx,
    ApiClass,
    ApiRouting,
    ApiParamRule,
    ApiFilterHandler, ApiMethod, CheckBaseParamRule
} from "./api_ctx";
import { type_convert, IntNumber, UploadFileInfo } from "./api_types";
import { HttpMethod, RouteCallBack } from "./api_route";
import { linkFnComment, getCalledFile } from "./docs_comment_helper";
import { readRawProcess } from "./body_parser";
import * as http from "http";
import * as https from "https";
import { Reflection } from "./reflection";
import { DtoConvert, DtoIs } from "./api_dto";


let current_apis: { [index: string]: Function } = {};
let current_docs: any = {};
let old_apis: { [index: string]: Function } = {};
let old_docs: any = {};
let current_routing: Array<[HttpMethod, string, RouteCallBack]>;
let old_routing: Array<[HttpMethod, string, RouteCallBack]>;
let current_codeMap: Map<number, string>;
let old_codeMap: Map<number, string>;

/**
 * api类和方法注册中心
 */
export class Facade {
    //默认输出渲染类
    public static defaultRes: new () => AbsRes = JsonRes;
    //全局检测-用于（referer host等验证，全局权限校验）
    public static globalFilter: ApiFilterHandler = async (ctx: AbsHttpCtx) => true;
    //默认api授权验证-用于（权限校验）
    public static defaultFilter: ApiFilterHandler = async (ctx: AbsHttpCtx) => true;
    //是否启用模糊路径大小写(支持类似api路径节点首字母大小写和全路径大小写 方式)
    public static ignorePathCase: boolean = true;
    //是否忽略api的文档（默认false）
    public static ignoreApiDoc: boolean;

    //加工或解密http.request.body
    public static _decodePayload: (ctx: AbsHttpCtx, data: any) => any;
    //加工或加密输出body
    public static _encodePayload: (ctx: AbsHttpCtx, data: string | Buffer) => string | Buffer;

    //输出接口调用数据
    public static _hootDebug: (...args) => void;
    //错误侦听
    public static _hookErr: (ctx: AbsHttpCtx, err: Error) => void;
    //api统计
    public static _hookTj: (apiPath: string, costMsTime: number) => void;
    //msgpack 编码代理
    public static _msgpack: { encode: (d: any) => any, decode: (b: Buffer | Uint8Array) => any };
    //xml 编码代理
    public static _xml: { encode: (d: any) => any, decode: (b: string) => any };

    public static get _docs() {
        return old_docs;
    }

    //api注册中心
    public static get _apis(): any {
        return old_apis;
    }

    //是否可以通过websocket数据代理请求
    public static run_by_ws_check(args: any): boolean {
        //[request_id,api_path,params_obj,header_obj,pathArg]
        if (!Array.isArray(args) || args.length < 4 || !Number.isFinite(args[0]) || !(typeof (args[1]) == 'string' || Number.isInteger(args[1])) ||
            (args[2] != undefined && typeof (args[2]) != 'object') || (args[3] != undefined && typeof (args[3]) != 'object')
        ) {
            return false;
        }
        return true;
    }

    //通过websocket数据执行请求
    public static async run_by_ws(conn: WebSocket, args: any, opt?: number, overrideResWriter?: any, processCtx?: (ctx: any) => any) {
        //@see Facade.run_by_ws_check
        let path = Number.isFinite(args[1]) && old_codeMap.has(args[1]) ? old_codeMap.get(args[1]) : args[1],
            fn = old_apis[path];
        if (fn) {
            return await fn(conn, args, opt, overrideResWriter, processCtx);
        } else {
            // WsApiHttpCtx.send404(conn, path, args[0]);
            let ctx = new WsApiHttpCtx(conn, args);
            ctx = processCtx ? processCtx(ctx) : ctx;
            ctx.sendJson({ code: 404, msg: path });
            return ctx;
        }
    }

    //是否可以匹配到path的api
    public static hasApiPath(path: string): boolean {
        return old_apis.hasOwnProperty(path);
    }

    public static get _api_routing() {
        return old_routing;
    }

    public static set _api_routing(p: Array<[HttpMethod, string, RouteCallBack]>) {
        current_routing = p;//SCAN_API_ROUTING
        if (old_routing == null) {
            old_routing = p;
        }
    }

    public static ctx(This: any): ApiHttpCtx {
        return current_api_ctx(This);
    }
}


//扫描注入
export function api_requireByDir(dir?, fileFilter?: (f: string) => boolean, requireFn?: (id: string) => any): boolean {
    if (!dir || dir.length < 1) {
        dir = ["out/", "lib/"];
    } else if (typeof dir === 'string') {
        dir = [dir];
    }
    let filelist: string[] = [];
    Array.from(new Set(dir)).forEach(e => {
        deepScanFile(e.toString(), f => {
            if (f.endsWith(".js") && (fileFilter == null || fileFilter(f))) {
                filelist.push(f);
            }
        });
    });
    return api_requireByFileList(filelist, requireFn);
}

//引用所有的api文件
export function api_requireByFileList(allApiFileList: string[], requireFn?: (id: string) => any) {
    var od = old_docs, oa = old_apis, last, rfn = requireFn || require;
    current_docs = {};
    current_apis = {};
    current_codeMap = new Map<number, string>(), current_routing = [];
    try {
        allApiFileList.forEach(f => {
            last = f;
            rfn(f);
        });
        old_docs = current_docs;
        old_apis = current_apis;
        old_codeMap = current_codeMap;
        old_routing = current_routing;
        return true;
    } catch (e) {
        current_docs = od;
        current_apis = oa;
        current_codeMap = old_codeMap;
        current_routing = old_routing;
        console.error("Facade|scan", last, e);
        return false;
    }
}


const VAR_API_CTX = "$_api_ctx";

//获取当前api请求的关联类
export function current_api_ctx(This: any): ApiHttpCtx {
    if (This && This[VAR_API_CTX]) {
        return This[VAR_API_CTX];
    }
    return null;
}

//当前请求的api路径
export function current_api_path(This: any, def: string = "unknow"): string {
    var ctx = current_api_ctx(This)
    return ctx ? ctx.getPath() : def;
}

/**
 * web请求执行代理
 * @param constructor API类构造函数
 * @param res 输出数据格式化工具类
 * @param key 此API路由对应的类的方法名
 * @param filter 此API路由最终的权限检测方法
 * @param apiPath 此API路由的路由路径
 */
function api_run_wrap(constructor, res: any, key: string, filter: ApiFilterHandler, apiPath: string): any {
    return async function (request: any/** Class_HttpRequest */, pathArg: string/** 路由匹配后提取的路径座位参数部分 */, markFlag?: number/**模拟请求类型标记-websocket模拟分类用*/, overrideResWriter?: any/**覆盖Res*/, processCtx?: (ctx: AbsHttpCtx) => AbsHttpCtx) {
        let start_ms = Facade._hookTj != null ? Date.now() : null;//API耗时统计-起始值
        let ctx: AbsHttpCtx;
        try {
            if (request.req && request.res && request.address) {
                ctx = new ApiHttpCtx(request, new res());
                request.req.on("error", error => (ctx as ApiHttpCtx).doAbort(error));
            } else {
                ctx = new WsApiHttpCtx(request, pathArg);
                if (markFlag != 8) {//非系统内对websocket绑定的调用，需要发送数据给客户端（客户端主动请求、服务端定时主动调用模拟请求后发回）
                    ctx.writer = new (overrideResWriter || res)();
                    if (markFlag == 9) {//websocket服务端发送到客户端的通知类型（例如 服务端定时主动调用模拟请求后发回，添加path让客户端区分通知消息具体是哪个）
                        ctx.writer.path = ctx.getPath();//工作机理@see （JsonRes.out MsgpackRes.out）对writer进行序列化了
                    }
                }
                if (processCtx) {
                    ctx = processCtx(ctx);
                }
            }
            var imp: any = new constructor();
            imp[VAR_API_CTX] = ctx;
            try {
                if (await filter(ctx)) {
                    if (imp["$_before"]) {//执行前准备
                        await imp["$_before"](ctx, apiPath, key);
                    }
                    let ret = await imp[key](ctx);
                    if (ctx.writer) {
                        ctx.writer.data = ret;
                        ctx.writer.out(ctx);
                    }
                } else if (ctx.writer) {
                    ctx.writer.stat(403, "reject").out(ctx);
                }
            } catch (e) {//出现错误
                if (ctx.writer) {
                    if (e instanceof ApiRunError) {//明确的业务错误，告知错误信息
                        ctx.writer.stat(e.code, e.message).out(ctx);
                    } else {//不明确的错误，只告知错误不告知详情，避免系统敏感信息泄露
                        ctx.writer.stat(500, "server busy").out(ctx);
                        (!Facade._hookErr) && console.error("Facade|api_run_wrap|%s %j %s", ctx.getPath(), ctx.debugMark, e);
                    }
                }
                no_error_hook(ctx, e);
            } finally {
                try {
                    if (imp["$_after"]) {//执行后收尾
                        await imp["$_after"](ctx, apiPath, key);
                    }
                } catch (e2) {
                    no_error_hook(ctx, e2) && console.error("Facade|api_run_wrap|%s %j %s", ctx.getPath(), ctx.debugMark, e2);
                }
            }
        } finally {
            try {
                ctx.runAfters();
                // ctx.free();
            } catch (e3) {
                no_error_hook(ctx, e3) && console.error("Facade|api_run_afters|%s %j %s", ctx.getPath(), ctx.debugMark, e3);
            }
            if (start_ms) {//API耗时统计
                Facade._hookTj(apiPath, Date.now() - start_ms);
            }
        }
        return ctx;
    }
}

//有hook则调用，否则返回true
function no_error_hook(ctx: AbsHttpCtx, err: Error) {
    if (Facade._hookErr) {
        try {
            Facade._hookErr(ctx, err);
        } catch (ehook) {
            console.error("Facade|api_run_hookErr|%s %s", ctx.getPath(), ehook);
        }
        return false;
    }
    return true;
}

/**
 * websocket执行代理函数，根据http_req请求和websocket类的实现方式，进行过滤校验成功后升级websocket。然后根据情况调用websocket定义的api的open/text/buffer/data/close
 * @param constructor
 * @param opts
 * @param filter
 */
function websocket_run_wrap(constructor, opts, filter: ApiFilterHandler): any {
    return async function (request, socket, head, pathArg, wsServer) {
        const ctx = new WsApiHttpCtx(socket, [0, request.address, require("querystring").decode(request.url.split()[1] || ""), request.headers, pathArg]);
        let suc = true;
        let imp;
        try {
            if (filter) {
                suc = await filter(ctx);
            }
            imp = new constructor();
            imp[VAR_API_CTX] = ctx;
            if (imp.onCheck) {
                suc = await imp.onCheck(request, socket, pathArg);
            }
        } catch (e) {
            suc = false;
        }
        if (suc) {
            wsServer.handleUpgrade(request, socket, head, async (conn) => {
                conn["remoteAddress"] = socket.remoteAddress;
                wsServer.emit("connection", conn, request, true);
                try {
                    if (imp.onOpen) {
                        await imp.onOpen(conn, request, pathArg, wsServer);
                    }
                    if (imp.onMessage) {
                        conn.on("message", (data, isBin) => {
                            imp.onMessage(data, isBin, conn, wsServer);
                        });
                    }
                    if (imp.onClose) {
                        conn.on("close", (code: number, message: string) => {
                            imp.onClose(conn, { code: code, message: message }, wsServer);
                        });
                    }
                    if (imp.onError) {
                        conn.on("error", e => {
                            imp.onError(e, conn, wsServer);
                        });
                    }

                } catch (e) {
                    conn.close();
                    console.error("Facade|Websocket|on_openInit", e);
                }
            });
        } else {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
        }
        return suc;
    }
}

const normal_path_reg = /^[a-zA-Z0-9\/\-\_\.]+$/;

function path_first_lower(p: string) {
    return p.split('/').map(e => e.substr(0, 1).toLowerCase() + e.substr(1)).join('/');
}

function path_first_upper(p: string) {
    return p.split('/').map(e => e.substr(0, 1).toUpperCase() + e.substr(1)).join('/');
}

/**
 * 注册API类，添加所有类内部路由函数和函数文档。
 * @param constructor 类构造函数
 * @param path 类级路由前缀
 * @param res 类级配置的输出工具类, 基础定义writer=AbsRes的子类（TextRes JsonRes等）
 * @param filter 类权限过滤器
 */
function regist(constructor: any, path: string, res: any, filter: ApiFilterHandler, baseRules?: Array<ApiParamRule>) {
    let subs: Array<ApiRouting> = constructor.prototype["$subs"];//提取类属方法的路由定义
    if (!subs || !subs.hasOwnProperty("length")) {//没有注册过子路由函数，跳出。这里不判断array类型，是因为websocket伪造了个假array
        return;
    }
    if (Array.isArray(subs) && subs.length > 0 && subs[0].key == "$_$" && subs[0].path == "") {
        /*
        如果第一个方法是通用参数配置路由，给跳过，这种路由是提取所有方法都需要的参数，少写些；不做啥事情
        @ANY("")
        private $_$(@RULE({src:"HEADER", name:"X-Wx-Skey", min:32,max:256,desc:"授权票据"}) token:string){}
         */
        subs.shift();
    }
    if (baseRules) {
        baseRules.forEach(br => {
            if (!br.name) {
                return;
            }
            if (!br.type) {
                br.type = String;
            }
            br = format_rule_src(br);
            subs.forEach(ar => {
                if (ar.rules.some(ir => {
                    return ir.name == br.name;
                }) == false) {
                    ar.rules.push(br);
                }
            });
        });
    }
    let fnComments = Facade.ignoreApiDoc ? {} : linkFnComment(getCalledFile(__dirname));//获取调用到注册的类的文件,提取文件中的文档注释

    path = path != null ? path : "/" + constructor.name.toLowerCase();//类方法名
    if (path != "" && path.charAt(0) != '/') {
        path = "/" + path;
    }
    let routing = current_routing, apis: { [index: string]: Function } = current_apis, codeMap = current_codeMap;
    let doc_list: { method: string, name: string, path: string, code: number, rules: ApiParamRule[], cms: any }[] = [];
    let tmpMaps = {};
    for (let i = 0; i < subs.length; i++) {
        var node = subs[i];
        var key = node.key;
        let relativePath = path == '/' && node.path.charAt(0) == '/' ? node.path : path + node.path;
        if (node.absolute) {
            relativePath = node.path.charAt(0) != '/' ? '/' + node.path : node.path;
        }
        node.path = relativePath;
        var fn = node["@"] ? node["@"] : api_run_wrap(constructor, node.res || res, key, node.filter || filter, relativePath);
        var ignore_path_case = Facade.ignorePathCase && normal_path_reg.test(relativePath);
        apis[relativePath] = fn;
        if (ignore_path_case) {
            apis[path_first_lower(relativePath)] = fn;
            apis[path_first_upper(relativePath)] = fn;
            apis[relativePath.toLowerCase()] = fn;
        }
        doc_list.push({
            method: node.method,
            name: node.key,
            path: relativePath,
            code: node.code,
            rules: node.rules,
            cms: fnComments[node.key]
        });
        current_docs[constructor.name] = { name: constructor.name, cms: fnComments[constructor.name], list: doc_list };
        if (routing) {
            var fnArr = [];
            if (node.method == "ANY") {
                fnArr.push("post", "get");
                // routing.post(relativePath, fn);
                // routing.get(relativePath, fn);
            } else if (node.method == "GET") {
                fnArr.push("get");
                // routing.get(relativePath, fn);
            } else if (node.method == "POST") {
                fnArr.push("post");
                // routing.post(relativePath, fn);
            } else if (node.method == "put") {
                fnArr.push("put");
                // routing.put(relativePath, fn);
            } else if (node.method == "DELETE") {
                fnArr.push("del");
                // routing.del(relativePath, fn);
            }
            fnArr.forEach(fnName => {
                if (!tmpMaps.hasOwnProperty(fnName)) {
                    tmpMaps[fnName] = {};
                }
                if (ignore_path_case) {
                    tmpMaps[fnName][relativePath.toLowerCase()] = fn;
                    tmpMaps[fnName][path_first_lower(relativePath)] = fn;
                    tmpMaps[fnName][path_first_upper(relativePath)] = fn;
                }
                tmpMaps[fnName][relativePath] = fn;
                if (node.code && codeMap.has(node.code) == false) {
                    tmpMaps[fnName]['/' + node.code] = fn;
                }
            });
            if (node.code && codeMap.has(node.code) == false) {
                codeMap.set(node.code, relativePath);
            }
        }
    }
    if (subs.length < 0 && path) {//websocket
        doc_list.push({ method: "get", name: path, path: path, code: 0, rules: [], cms: fnComments[path] });
        current_docs[constructor.name] = { name: constructor.name, cms: fnComments[constructor.name], list: doc_list };

        var fn = websocket_run_wrap(constructor, constructor.prototype["$opts"], filter);
        apis[path] = fn;

        if (!tmpMaps["upgrade"]) {
            tmpMaps["upgrade"] = {};
        }
        tmpMaps["upgrade"][path] = tmpMaps["upgrade"][path.toLowerCase()] = tmpMaps["upgrade"][path_first_upper(path)] = fn;
    }
    if (routing) {
        for (var fnName in tmpMaps) {
            let fnWraps = tmpMaps[fnName];
            for (let fnPath in fnWraps) {
                // @ts-ignore
                routing.push([fnName, fnPath, fnWraps[fnPath]])
            }
        }
    }
}

/**
 * 替换掉api类的路由方法，执行原始方法前先进行参数提取、参数校验，然后在传参到原始方法执行
 * @param requestMethod API请求的HTTP方法
 * @param srcFn 原始定义的方法
 * @param paramRules 各参数定义的规则
 */
function route_proxy(requestMethod: string, srcFn: Function, paramRules: Array<ApiParamRule>) {//代理方法
    return function (ctx: AbsHttpCtx) {
        /*if(!util.isObject(ctx) || (!(ctx instanceof ApiHttpCtx) && !(ctx instanceof WsApiHttpCtx))){
            return srcFn.apply(this,...arguments);
        }*/
        // //var ctx:ApiHttpCtx=this[VAR_API_CTX];//coroutine.current()["$api_ctx"];
        // if(!(ctx instanceof ApiHttpCtx) && !(ctx instanceof WsApiHttpCtx)){
        //     return srcFn.apply(this,Facade,arguments);
        // }
        // var ctxMethod=ctx.getMethod();
        // if(requestMethod!=ctxMethod && (requestMethod!="ANY" || (ctxMethod!="GET" || !ctx.isHadBody()))){
        //     //请求方法不对
        //     throw new ApiRunError("bad_method", 405);
        // }
        var args = [], failAt = -1;
        M: for (var i = 0; i < paramRules.length; i++) {
            var rule = paramRules[i], type = rule.type;
            var source: any = null;
            if (rule.src == "get") {
                source = ctx.getQuery();
            } else if (rule.src.charAt(0) == "p") {//rule.src=="post"||rule.src=="put" ||rule.src=="patch" path?
                if (rule.src == "path") {
                    if (ctx.pathArg) {
                        source = {};
                        source[rule.name] = ctx.pathArg;
                    }
                } else {
                    source = ctx.getBody();
                }
            } else if (rule.src == "any") {
                if (ctx.hasPart(rule.name)) {
                    source = ctx.getBody();
                } else if (ctx.hasQuery(rule.name)) {
                    source = ctx.getQuery();
                }
                else if (ctx.getHeaders()[rule.name]) {
                    source = ctx.getHeaders();
                }
            } else if (rule.src == "header") {
                source = ctx.getHeaders();
            } else if (rule.src == "socket") {
                if (rule.name == "remoteAddress" && ctx.getHeaders()["x-real-ip"]) {
                    source = ctx.getHeaders();
                }
                else if (ctx.getSocket()[rule.name]) {
                    source = { [rule.name]: ctx.getSocket()[rule.name] };
                }
                else {
                    source = ctx.getSocket();
                }
            }
            else if (rule.src.charAt(0) == "$") {
                if (rule.src == "$ctx") {
                    args[i] = ctx;
                }
                else if (rule.src == "$headers") {
                    args[i] = ctx.getHeaders();
                }
                else if (rule.src == "$query") {
                    if (DtoIs(rule.type)) {
                        let _imp = DtoConvert(rule.type, ctx.getQuery());
                        if (!_imp) {
                            failAt = i;
                            break M;
                        }
                        args[i] = _imp;
                    }
                    else {
                        args[i] = ctx.getQuery();
                    }
                }
                else if (rule.src == "$body") {
                    if (!ctx.isHadBody()) {
                        failAt = i;
                        break;
                    }
                    if (DtoIs(rule.type)) {
                        let _imp = DtoConvert(rule.type, ctx.getBody());
                        if (!_imp) {
                            failAt = i;
                            break M;
                        }
                        args[i] = _imp;
                    }
                    else {
                        args[i] = ctx.getBody();
                    }
                }
                else if (rule.src == "$dto_any") {
                    let _imp: any = DtoConvert(rule.type, ctx.isHadBody() ? ctx.getBody() : ctx.getQuery());
                    if (!_imp) {
                        failAt = i;
                        break M;
                    }
                    args[i] = _imp;
                }
                continue;
            }
            if (!args.hasOwnProperty(i) && (source == null || (!source.hasOwnProperty(rule.name) && !source.hasOwnProperty(rule.name + '[]')))) {
                if (!rule.option) {
                    failAt = i;
                    break;//找不到这个必选参数的值
                }
            } else {
                args[i] = source.hasOwnProperty(rule.name) ? source[rule.name] : source[rule.name + '[]'];
            }
            if (args.hasOwnProperty(i)) {
                var srcArg = args[i];
                // args[i]=type(srcArg);
                if (rule.check_convert != null) {
                    var cvArg = rule.check_convert(srcArg);
                    if (cvArg === null || cvArg === undefined) {
                        failAt = i;
                        break;
                    } else {
                        args[i] = cvArg;
                    }
                } else if (rule.type == Array && !Array.isArray(srcArg)) {
                    if (typeof srcArg === 'string') {
                        args[i] = srcArg.split(rule.separator || (rule.multline ? '\n' : ','));
                    } else if (typeof (srcArg) === 'object') {//JSON.stringify TypeArray默认会变object
                        args[i] = Object.values(srcArg);
                    } else {
                        failAt = i;
                        break;
                    }
                } else {
                    args[i] = type_convert(type, srcArg);
                }
                if (args[i] === null && !rule.option) {
                    failAt = i;
                    break M;
                }
                if (type == UploadFileInfo) {
                    if (args[i] != null) {
                        let size = (<UploadFileInfo>args[i]).fileSize;
                        if ((rule.min != undefined && size < rule.min) || (rule.max != undefined && size > rule.max)) {
                            failAt = i;
                            break; // 参数非法
                        }
                    } else if (!rule.option) {
                        failAt = i;
                        break;
                    }
                } else if (type == IntNumber) {
                    if (isNaN(args[i]) ||
                        (rule.min != undefined && args[i] < rule.min) || (rule.max != undefined && args[i] > rule.max) ||
                        (rule.in && !rule.in.includes(args[i]))
                    ) {
                        failAt = i;
                        break;// 参数非法
                    }
                } else if (!CheckBaseParamRule(type, args[i], rule)) {
                    failAt = i;
                    break;// 参数非法
                }
            } else {
                args[i] = rule.default;
            }
        }
        if (failAt > -1) {
            // 缺少参数 or 参数类型错误
            throw new ApiRunError("bad_arg:" + paramRules[i].name, 400);
        } else {
            return srcFn.apply(this, args);
        }
    }
}

/**
 * 装饰-api具体方法
 */
function route(method: string, pathInfo: string | ApiMethod, target: any, key: string, desc: PropertyDescriptor, pathCode: number) {
    // console.log(p,typeof target[key])
    let pathOpt: ApiMethod = typeof pathInfo != 'string' ? pathInfo as ApiMethod : null;
    let path: string = pathInfo == null ? null : (pathOpt ? pathOpt.path : pathInfo.toString());
    let p: string = (path != null ? path : key);
    if (p != "" && p.charAt(0) != '/') {
        p = '/' + p;
    }
    var srcFn: Function = desc.value;
    var paramTypes: Array<Function> = Reflection.getMetadata("design:paramtypes", target, key);//参数类型
    var paramNames: Array<string> = getFunctionParamterNames(srcFn);//方法的各参数名
    var paramRules: Array<ApiParamRule> = [];//方法的各参数规则
    var args_names: { [index: string]: ApiParamRule } = {};
    for (var i = 0; i < paramNames.length; i++) {
        var tmpRule = srcFn["param$" + i];
        if (path && path.includes(':')) {
            if (tmpRule == null && path.includes(paramNames[i].toLowerCase())) {
                tmpRule = { src: "path", name: paramNames[i] };
            } else if (tmpRule != null && tmpRule.src == "path") {
                tmpRule = { src: "path", name: paramNames[i] };
            }
        }
        if (!tmpRule || typeof (tmpRule) != 'object') {
            tmpRule = { name: paramNames[i], src: "any" };
            if (DtoIs(paramTypes[i])) {
                tmpRule.src = "$dto_any";
            }
        } else if (tmpRule.src == "request") {
            tmpRule.src = "any";
        }
        if (paramTypes[i] == UploadFileInfo && tmpRule.src.charAt(0) != 'p') {
            tmpRule.src = "post";
        }
        if (method == "GET" && ["post", "any"].includes(tmpRule.src) && tmpRule.src.charAt(0) != '$') {
            if (tmpRule.src != "any") {
                console.warn("Facade|route param.src!=routing.method => %s %s %s", p, tmpRule.name, tmpRule.src);
            }
            tmpRule.src = "get";
        }
        if (!tmpRule.type) tmpRule.type = paramTypes[i];
        paramRules.push(tmpRule);
        args_names[tmpRule.name] = tmpRule;
    }
    desc.value = route_proxy(method, srcFn, paramRules);
    if (!target["$subs"]) {
        target["$subs"] = [];
    } else if (target["$subs"][0].key == "$_$" && target["$subs"][0].path == "" && target["$subs"][0].rules.length > 0) {
        //    @ANY("") private $_$(@RULE({src:"HEADER", name:"X-Wx-Skey", min:32,max:256,desc:"授权票据"}) token:string){}
        paramRules = paramRules.concat();
        target["$subs"][0].rules.forEach(r => {
            if (args_names.hasOwnProperty(r.name) == false) {
                paramRules.push(r);
            }
        });
    }
    let routingInfo: ApiRouting = { method: method, path: p, key: key, rules: paramRules, code: pathCode };
    if (pathOpt) {
        if (pathOpt.filter) routingInfo.filter = pathOpt.filter;
        if (pathOpt.res) routingInfo.res = pathOpt.res;
        if (pathOpt.absolute) routingInfo.absolute = pathOpt.absolute;
    }
    target["$subs"].push(routingInfo);
}

function route2(method: string, args: Array<any>): Function {
    // @GET
    if (args.length == 3) {
        return <any>route(method, null, args[0], args[1], args[2], 0);
    }
    // @GET()
    // @GET("xx")
    // @GET({path:"xx",filter:ctx=>true})
    return function (target: any, key: string, desc: PropertyDescriptor) {
        // var pathReg=/^[A-Za-z0-9_\-\$\:\@/\*]*$/;
        // var path=args[0]&&pathReg.test(args[0])?args[0]:null;
        // var doc=args[1]?args[1]:(path==null?args[0]:null);  // @GET("xx", "return some")
        return route(method, args[0], target, key, desc, Number.isFinite(args[1]) ? args[1] : 0);
    }
}

/**
 * 标记类为api类。 提取类内部所有路由方法，添加到 API和DOC
 */
export function API(info?: string | ApiClass) {
    var map: ApiClass = <ApiClass>info;
    if (typeof info === 'string') {
        map = { path: info + "" };
    } else if (info == null) {
        map = {}
    } else if (typeof (info) == "function" && info["prototype"] && info["prototype"]["$subs"]) {
        regist(<any>info, null, Facade.defaultRes, Facade.defaultFilter);
        return;
    }
    return function (t) {
        if (t["prototype"] && t["prototype"]["$subs"]) {
            regist(t, map.path, map.res || Facade.defaultRes, map.filter || Facade.defaultFilter, map.baseRules);
        }
    }
}

/**
 * 标记为-websocket服务侦听器。必须要实现 (onMessage || onBuffer || onText)，可选实现（ onopen, onclose, onerror）
 * @param path websocket的path
 * @param opts websocket的可选项（是否压缩，最大消息长度等）
 */
export function WEBSOCKET(path: string = "websocket", opts: { [index: string]: any } = {
    perMessageDeflate: false,
    maxPayload: 0x1FFFF
}, filter?: ApiFilterHandler) {
    return function (type) {
        var p = type && type.prototype ? type.prototype : null;
        if (p && (p.onMessage || p.onBuffer || p.onText)) {
            p["$subs"] = { length: -1 };
            p["$opts"] = opts;
            regist(type, path, Facade.defaultRes, filter);
        }
    }
}


function format_rule_src(info: ApiParamRule) {
    if (!info.src) {
        info.src = "any"; //request
    }
    info.src = info.src.toLowerCase();
    if (info.src == "*" || info.src.toLowerCase() == "request") {
        info.src = "any"; //request
    }
    else if (info.src == "query") {
        info.src = "get";
    }
    else if (info.src == "body") {
        info.src = "post";
    }
    else if (info.src.charAt(0) != '$' && ["path", "socket", "header", "cookie", "get", "any"].includes(info.src) == false) {
        info.src = "post";
    }
    return info;
}

/**
 * 参数规则函数
 * @param info
 * @constructor
 */
export function RULE(info: ApiParamRule) {
    if (info) {
        //target=类property，key=方法名，idx=第几个参数
        return function (target: any, key: string, idx: number) {
            var argName = getFunctionParamterNames(target[key])[idx]; //获取方法的参数名信息
            if (!info.name) { //如果规则中未定义 参数来源中的属性名，则用参数名设置上去
                info.name = argName;
            }
            info["var"] = argName;
            target[key]["param$" + idx] = format_rule_src(info);
        };
    }
    return function () {
    }
}
/**
 * request ip of socket
 * @constructor
 */
export function Ip() {
    return RULE({ src: "socket", name: "remoteAddress", option: false });
}

/**
 * field of header
 * @param info
 * @constructor
 */
export function Header(info = {}) {
    return RULE({ ...info, src: "header" });
}
/**
 * field of query or body
 * @param info
 * @constructor
 */
export function Param(info = {}) {
    return RULE({ ...info, src: "any" });
}
/**
 * Context for the request.body
 * @constructor
 */
export function CtxBody() {
    return RULE({ src: "$body" });
}
/**
 * Context for the request.query
 * @constructor
 */
export function CtxQuery() {
    return RULE({ src: "$query" });
}
/**
 * Context for the request headers
 * @constructor
 */
export function CtxHeaders() {
    return RULE({ src: "$headers" });
}
/**
 * Context for the request
 * @constructor
 */
export function CtxApi() {
    return RULE({ src: "$ctx" });
}
/**
 * 接口路由：同时支持 get/post
 * @param path
 */
export function ANY(path?: string | ApiMethod, code: number = 0) {
    return route2("ANY", [...arguments]);
}

/**
 * 接口路由：仅支持get
 * @param path
 */
export function GET(path?: string | ApiMethod, code: number = 0) {
    return route2("GET", [...arguments]);
}

/**
 * 接口路由：仅支持post
 * @param path
 */
export function POST(path?: string | ApiMethod, code: number = 0) {
    return route2("POST", [...arguments]);
}

/**
 * 接口路由：仅支持put
 * @param path
 */
export function PUT(path?: string | ApiMethod, code: number = 0) {
    return route2("PUT", [...arguments]);
}

/**
 * 接口路由：仅支持patch
 * @param path
 */
export function PATCH(path?: string | ApiMethod, code: number = 0) {
    return route2("PATCH", [...arguments]);
}

/**
 * 接口路由：仅支持head
 * @param path
 */
export function HEAD(path?: string | ApiMethod, code: number = 0) {
    return route2("HEAD", [...arguments]);
}

/**
 * 接口路由：仅支持delete
 * @param path
 */
export function DELETE(path?: string | ApiMethod, code: number = 0) {
    return route2("DELETE", [...arguments]);
}

export type RepeaterApiClass = { path?: string, absolute?: boolean, filter?: (req: http.IncomingMessage) => Promise<boolean>, toUrl: string | string[], fixPath?: (req: http.IncomingMessage) => string };

/**
 * 接口路由：转发请求
 * @param toUrl
 * @param filter
 * @param processUrl
 * @constructor
 */
export function REPEATER(t: RepeaterApiClass, pathCode: number = 0) {
    let toUrls = Array.isArray(t.toUrl) ? <string[]>t.toUrl : [t.toUrl.toString()],
        fixPath = t.fixPath ? t.fixPath : req => req.url.split('?')[0];
    let toIdx = 0;
    let fn = function (target: any, key: string, desc: PropertyDescriptor) {
        let srcFn = desc.value;
        desc.value = async function (req: http.IncomingMessage, res: http.ServerResponse) {
            return await do_repeater_request(t.filter && await t.filter(req), toUrls[(toIdx++) % toUrls.length] + fixPath(req), req, res, srcFn);
        };
        desc.value["@"] = 1;
        if (!target["$subs"]) {
            target["$subs"] = [];
        }
        let p = t.path || key;
        if (p != "" && p.charAt(0) != '/') {
            p = '/' + p;
        }
        if (p.includes("*") == false && p.includes("+") == false) {
            p = p + '[a-zA-Z0-9\/]+';
        }
        let routingInfo: ApiRouting = { method: 'ANY', path: p, key: key, rules: [], code: pathCode, absolute: t.absolute };
        routingInfo["@"] = desc.value;
        target["$subs"].push(routingInfo);
    };
    fn["@"] = fn;
    return fn;
}

function do_repeater_request(reject: boolean, toUrl: string, req: http.IncomingMessage, res: http.ServerResponse, complete: (url: string, err: Error) => void) {
    return new Promise((fn_ok, fn_fail) => {
        let _cbk: boolean;
        let cbk = (err?: Error) => {
            if (!_cbk) {
                _cbk = true;
                err && fn_fail(err);
                !err && fn_ok(true);
                complete(toUrl, err);
            }
        };
        let hfail = (err: Error) => {
            if (!res.writableEnded) {
                res.writeHead(500, err.toString());
                res.end();
                cbk(err);
            }
        };
        if (reject) {
            hfail(new Error("reject"));
            return;
        }
        let hmod = toUrl.startsWith("https:") ? https : http;
        try {
            let abort = new AbortController();
            let hopts: any = { method: req.method, headers: { ...req.headers, origin: new URL(toUrl).origin }, rejectUnauthorized: false, signal: abort.signal, abort: abort.signal };
            let hreq: http.ClientRequest = hmod.request(toUrl, hopts, hres => {
                res.writeHead(hres.statusCode, hres.statusMessage, hres.headers);
                hres.on('data', function (chunk) {
                    res.write(chunk);
                });
                hres.on('end', () => {
                    if (!res.writableEnded) {
                        res.end();
                        cbk(null);
                    }
                });
            });
            hreq.on('error', hfail);
            req.on('error', err => {
                abort.abort();
                hreq.destroy();
                cbk(err);
            });
            if (req.method.charAt(0) == 'P') {
                readRawProcess(req, (isLast, buf, err) => {
                    if (!err) {
                        if (buf) {
                            hreq.write(buf);
                        }
                        if (isLast) {
                            hreq.end();
                        }
                    }
                })
            } else {
                hreq.end();
            }
        } catch (herr) {
            hfail(herr);
        }
    });
}

//遍历文件夹下面的文件
export function deepScanFile(dir: string, cbk: (filePath: string) => void) {
    if (dir) {
        var stat = fs.statSync(dir);
        if (stat.isFile()) {
            cbk(dir);
        } else if (stat.isDirectory()) {
            fs.readdirSync(dir).forEach(ele => {
                deepScanFile(path.join(dir, ele), cbk);
            });
        }
    } else {
        console.warn("api_facade.deepScan null", dir);
    }
}

//获取方法参数名 基于ES6
let getFunctionParamterNames = (function () {
    const COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
    const DEFAULT_PARAMS = /=[^,)]+/mg;
    const FAT_ARROWS = /=>.*$/mg;
    return (fn: any): Array<string> => {
        if (typeof fn !== 'object' && typeof fn !== 'function') {
            return [];
        }
        let code = fn.prototype ? fn.prototype.constructor.toString() : fn.toString();
        code = code
            .replace(COMMENTS, '')
            .replace(FAT_ARROWS, '')
            .replace(DEFAULT_PARAMS, '');
        let result = code.slice(code.indexOf('(') + 1, code.indexOf(')')).match(/([^\s,]+)/g);
        return result === null ? [] : result;
    }
})();

/**
 * 调用注册的函数
 * @param reqInfo
 * @param callBack
 */
export async function tmp_call_api(reqInfo: { path: string, params?: any, headers?: any, ip?: string, pathArg?: string }, callBack: (contentType: string, headers: { [index: string]: string }, data: any) => {}) {
    let req_path = reqInfo.path;
    let req_ip = reqInfo.ip || "127.0.0.1";
    let req_param = reqInfo.params || {};
    let req_headers = reqInfo.headers || {};
    let req_path_arg = reqInfo["pathArg"] || null;
    //[request_id, api_path,params_obj,header_obj]

    return await Facade.run_by_ws(<any>{
        remoteAddress: req_ip,
        readyState: 1
    }, [0, req_path, req_param, req_headers, req_path_arg], 0, null, (ctx) => {
        ctx.sendStr = (function (s, contentType) {
            callBack(contentType, this["out_headers"], s);
        }).bind(ctx);
        ctx.sendBuf = (function (s, contentType) {
            callBack(contentType, this["out_headers"], s);
        }).bind(ctx);
        ctx.writeHeader = (function (hs) {
            this["out_headers"] = hs;
        }).bind(ctx);
        return ctx;
    });
}
