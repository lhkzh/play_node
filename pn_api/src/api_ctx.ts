/**
 * 基础定义
 * api返回数据输出writer
 * api请求上下文关联
 * @author zhh
 * @copyright u14.com <2019-?>
 */
import util = require("util");
import { IncomingMessage, ServerResponse } from "http";

const ContentType_html = "text/html; charset=utf8";
const ContentType_xml = "text/xml; charset=utf8";
const ContentType_json = "application/json; charset=utf8";
const ContentType_msgpack = "application/msgpack; charset=utf8";

//基础定义writer
export class AbsRes {
    public code: number = 0;//主要相应吗（如果错误则为不为0和200)
    public msg: string;//响应描述
    public data: any;//返回数据

    //响应类型
    public contentType(): string {
        return ContentType_html;
    }

    //设置响应状态 code(!=0||!=200）则为错误， msg为状态码
    public stat(code: number, msg?: string) {
        this.code = code;
        this.msg = msg;
        return this;
    }

    //放置响应数据
    public put(data: any) {
        this.data = data;
        return this;
    }

    //编码
    public encode(): any {
        if (Buffer.isBuffer(this.data)) {
            return this.data;
        }
        return String(this.data);
    }

    //输出到http请求中
    public out(ctx: AbsHttpCtx) {
        ctx.sendStr(this.encode(), this.contentType());
    }

    //删除自身属性
    public free() {
        Object.keys(this).forEach(k => delete this[k]);
        return this;
    }

    //使用datas到自身所有属性
    public edit(datas: { [index: string]: any }, free: boolean = true) {
        this.free();
        for (var k in datas) {
            this[k] = datas[k];
        }
        return this;
    }
}

//text编码writer
export class TextRes extends AbsRes {
}

//xml编码writer
export class XmlRes extends AbsRes {
    public contentType(): string {
        return ContentType_xml;
    }

    public out(ctx: AbsHttpCtx) {
        ctx.sendXml(this.data, this.contentType());
    }
}

//json编码writer
export class JsonRes extends AbsRes {
    public contentType(): string {
        return ContentType_json;
    }

    public encode(): any {
        return JSON.stringify(this);
    }

    public out(ctx: AbsHttpCtx) {
        ctx.sendJson(this, this.contentType());
    }
}

//msgpack编码writer
export class MsgpackRes extends AbsRes {
    public contentType(): string {
        return ContentType_msgpack;
    }

    private toObj() {
        return { ...this };
    }

    public encode(): any {
        return _msgpack_encode(this.toObj());
    }

    public out(ctx: AbsHttpCtx) {
        ctx.sendMsgpack(this.toObj(), this.contentType());
    }
}

export interface AbsHttpCtx {
    pathArg: { [index: string]: string };
    writer: AbsRes & { path?: string };
    debugMark: any;//调试-输出标记的用户信息
    hasFile(k: string): boolean

    getFileInfo(k: string): { fileName: string, contentType: string, body: Buffer }

    //请求path
    getPath(): string

    isHadBody(): boolean

    hasParam(k: string): boolean

    hasQuery(k: string): boolean

    hasPart(k: string): boolean

    getBody(): any

    getQuery(): any

    getHeaders(): any

    getSocket(): any

    findParam(k: string)

    //写响应头
    writeHeader(headers: any)

    //发送一个json编码对象
    sendJson(obj: any, contentType?: string/*="text/html; charset=utf8"*/)

    //发送一个msgpack编码对象
    sendMsgpack(obj: any, contentType?: string/*="text/html; charset=utf8"*/)

    //发送一个xml编码对象
    sendXml(xml: any, contentType?: string/*="text/html; charset=utf8"*/)

    //发送一个html文档
    sendStr(html: string | Buffer, contentType?: string/*="text/html; charset=utf8"*/)

    //发送一个二进制
    sendBuf(buf: Buffer, contentType?: string)

    //是否真的web请求
    isReal(): boolean;

    //释放内存
    free(): void;

    //api处理完后处理
    after(fn: Function, args?: any[], uniqueFnId?: string);

    //执行api后续完结函数
    runAfters();
}

function _msgpack_encode(obj: any): Buffer {
    return Facade._msgpack.encode(obj);
}

//http-请求上下文关联
export class ApiHttpCtx implements AbsHttpCtx {
    public static DEBUG_PICK_HEADERS = ["host", "referer", "user-agent"];
    public req: IncomingMessage;
    public res: ServerResponse;
    private b: any;
    private q: any;
    public pathArg: { [index: string]: string };
    private address: string;
    public writer: AbsRes & { path?: string };
    public debugMark: any = "";//调试-输出标记的用户信息
    constructor(private info: { req: IncomingMessage, res: ServerResponse, address: string, query: any, body?: any, pathArg?: any }, writer?: AbsRes) {
        this.req = info.req;
        this.res = info.res;
        this.q = info.query;
        this.pathArg = info.pathArg;
        this.address = info.address;
        this.writer = writer;
        this.res.cork();
    }

    //请求是否包含post/put数据
    public isHadBody() {
        return this.req.method.charAt(0) == 'P';
    }

    //解析或者获取上传的body对象：需要post/put
    public getBody(): any {
        if (this.isHadBody()) {
            this.b = Facade._decodePayload ? Facade._decodePayload(this, this.info.body) : this.info.body;
        }
        return this.b;
    }

    //request=post/put/get
    public hasParam(k: string): boolean {
        return this.hasPart(k) || this.hasQuery(k) || (this.pathArg && this.pathArg.hasOwnProperty(k));
    }

    //是否有 -url的query参数
    public hasQuery(k: string): boolean {
        return this.q.hasOwnProperty(k);
    }

    //是否有-post/put字段
    public hasPart(k: string): boolean {
        if (!this.isHadBody()) {
            return false;
        }
        var b = this.getBody();
        return b && b.hasOwnProperty(k);
    }

    //判断是有上传指定key的文件
    public hasFile(k: string): boolean {
        if (this.isHadBody()) {
            return false;
        }
        return false;
    }

    //请求METHOD
    public getMethod(): string {
        return this.req.method;
    }

    //请求path
    public getPath(): string {
        return this.address;
    }

    //先从get中招木有在从post中找
    public findParam(k: string) {
        if (this.q.hasOwnProperty(k)) {
            return this.q[k];
        }
        if (this.hasPart(k)) {
            return this.getBody()[k];
        }
        if (this.pathArg && this.pathArg.hasOwnProperty(k)) {
            return this.pathArg[k];
        }
        return undefined;
    }

    //获取get请求参数
    public getQuery() {
        return this.q;
    }

    //获取请求的header
    public getHeaders() {
        return this.req.headers;
    }

    //获取form表单中的文件对象
    public getFileInfo(k: string): { fileName: string, contentType: string, body: Buffer } {
        return null;
    }

    //请求的socket属性
    public getSocket() {
        return this.req.socket;
    }

    //写响应状态【默认200不用】
    public writeStatus(statusCode: number, statusMessage?: string, headers?: any) {
        this.res.statusCode = statusCode;
        if (statusMessage) this.res.statusMessage = statusMessage;
        this.writeHeader(headers);
    }

    //写响应头
    public writeHeader(headers: any) {
        if (headers) {
            headers["Access-Control-Expose-Headers"] = Object.keys(headers).join(",");
            for (var k in headers) {
                this.res.setHeader(k, headers[k]);
            }
        }
        if (this.res.statusCode >= 500) {
            this.res.setHeader("Connection", "close");
        }
    }

    //发送一个json编码对象
    public sendJson(obj: any, contentType?: string) {
        this.send_res(obj, JSON.stringify(obj), contentType);
    }

    //发送一个msgpack编码对象
    public sendMsgpack(obj: any, contentType?: string) {
        this.send_res(obj, _msgpack_encode(obj), contentType);
    }

    //发送一个xml编码对象
    public sendXml(xml: any, contentType?: string) {
        var src = xml;
        if (typeof (xml) != 'string' || xml.charAt(0) != '<') {
            xml = require("fast-xml-parser").convertToJsonString(xml);
        }
        this.send_res(src, xml, contentType);
    }

    //发送一个html文档
    public sendStr(html: string | Buffer, contentType?: string) {
        this.send_res(html, html, contentType);
    }

    public sendBuf(buf: Buffer, contentType?: string) {
        this.send_res(buf, buf, contentType);
    }

    private send_res(src: any, data: string | Buffer, contentType?: string) {
        this.debug(src);
        if (contentType) {
            this.res.setHeader("Content-Type", contentType);
        }
        if (Facade._encodePayload) {
            data = Facade._encodePayload(this, data);
        }
        this.res.end(data);
    }

    private debug(obj) {
        if (Facade._hootDebug) {
            let a = this.getHeaders(), h = ApiHttpCtx.DEBUG_PICK_HEADERS.reduce((p, k) => {
                if (a[k]) p[k] = a[k];
                return p;
            }, {});
            Facade._hootDebug("ApiHttpCtx|%s => mark:%j, out:%j, req:%j", this.getPath(), this.debugMark, obj, [this.getBody(), this.getQuery(), h]);
        }
    }

    //处理cors跨域请求
    public sendCors(orgin: any = "*", alowHeaders: string = "*", exposeHeaders: string = "*"): boolean {
        if (this.req.method != "OPTIONS") {
            return false;
        }
        if (orgin == null || orgin == undefined) {
            this.res.writeHead(403, "reject", {});
        } else {
            if (orgin != "*") {
                if (typeof orgin === 'function') {
                    orgin = orgin(this.req.headers["Origin"], this.getPath()) || "";
                } else if (util.types.isRegExp(orgin)) {
                    if (orgin.test(this.req.headers["Origin"].toString())) {
                        orgin = this.req.headers["Origin"].toString();
                    } else {
                        orgin = "";
                    }
                }
            }
            this.writeHeader({
                "Access-Control-Allow-Origin": orgin,
                "Access-Control-Allow-Headers": alowHeaders,
                "Access-Control-Credentials": "true",
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Expose-Headers": exposeHeaders,
                "Access-Control-Max-Age": "3600",
            });
        }
        this.res.end();
        return true;
    }

    public isReal() {
        return true;
    }

    /**
     * 跳转到url
     * @param url
     */
    public redirect(url: string) {
        this.writer = null;
        this.res.writeHead(302, { 'Location': url })
        this.res.end();
    }

    /**
     * 释放内部引用
     */
    public free() {
        for (var k in this) {
            delete this[k];
        }
    }

    private afters: Map<string | Symbol, [Function, any[]]>
    private afterI: number;

    public after(fn: Function, args?: any[], uniqueFnId?: string) {
        if (this.afterI == null) {
            this.afters = new Map();
            this.afterI = 1;
        }
        if (!uniqueFnId) {
            this.afters.set(Symbol(this.afterI++), [fn, args]);
        } else {
            this.afters.set(uniqueFnId, [fn, args]);
        }
    }

    public runAfters() {
        if (this.afters) {
            let a = this.afters;
            this.afters = null;
            for (let v of a.values()) {
                v[0](...v[1]);
            }
        }
    }
}

//websocket-请求上下文关联
export class WsApiHttpCtx implements AbsHttpCtx {
    private static EMPTY = Object.freeze({});
    private src: any;//[request_id,params_obj,header_obj,pathArg]
    // @ts-ignore
    private con: WebSocket;//net.Socket
    public pathArg: any;
    public writer: AbsRes & { path?: string };
    private address: string;
    private paramArg: any;//post+get
    private headerArg: any;//headers
    public debugMark: any = "";//调试-输出标记的用户信息
    //链接socket, 事件消息
    constructor(con, msg: any) {
        this.con = con;
        this.src = msg;
        this.address = msg[1];
        this.paramArg = msg[2];
        this.headerArg = msg[3];
        this.pathArg = msg[4];
    }

    public hasFile(k: string): boolean {
        return false;
    }

    public getFileInfo(k: string) {
        return null;
    }

    //请求path
    public getPath(): string {
        return this.address;
    }

    public isHadBody(): boolean {
        return this.paramArg != null;
    }

    public hasParam(k: string): boolean {
        return this.getParams().hasOwnProperty(k);
    }

    public hasQuery(k: string): boolean {
        return this.getQuery().hasOwnProperty(k);
    }

    public hasPart(k: string) {
        return this.getBody().hasOwnProperty(k);
    }

    private getParams(): any {
        return this.paramArg || WsApiHttpCtx.EMPTY;
    }

    public getBody(): any {
        return this.getParams();
    }

    public getQuery(): any {
        return this.getParams();
    }

    public getHeaders() {
        return this.headerArg || WsApiHttpCtx.EMPTY;
    }

    public getSocket() {
        return this.con;
    }

    public findParam(k: string) {
        return this.getParams()[k];
    }

    //写响应头
    public writeHeader(headers: any) {
    }

    //发送一个json编码对象
    public sendJson(obj: any, contentType?: string) {
        this.sendStr(JSON.stringify(obj), contentType);
    }

    //发送一个msgpack编码对象
    public sendMsgpack(obj: any, contentType?: string) {
        this.debug(obj);
        this.sendBuf(_msgpack_encode(obj), contentType);
    }

    //发送一个xml编码对象
    public sendXml(xml: any, contentType?: string) {
        this.debug(xml);
        if (typeof (xml) != 'string' || xml.charAt(0) != '<') {
            xml = require("fast-xml-parser").convertToJsonString(xml);
        }
        this.sendStr(xml, contentType);
    }

    //发送一个str
    public sendStr(str: string | Buffer, contentType?: string) {
        this.debug(str);
        this.sendTo(Buffer.isBuffer(str) ? <Buffer>str : Buffer.from(<string>str), false, contentType);
    }

    public sendBuf(buf: Buffer, contentType?: string) {
        this.debug(buf);
        this.sendTo(buf, true, contentType);
    }

    private sendTo(buf: Buffer, isBlob: boolean, contentType?: string) {
        if (this.con.readyState == 1) {
            let t = Buffer.alloc(buf.length + 9);
            t.writeInt8(isBlob ? 0x01 : 0x02, 0);
            t.writeBigInt64BE(this.src[0], 1);
            buf.copy(t, 9);
            this.con.send(t);
        } else if (global["@sys"] && global["@sys"].debug) {
            console.log("ApiWsCtx|%s !=>(sendToClosed) %s", this.getPath(), JSON.stringify(this.debugMark));
        }
    }

    private debug(obj) {
        if (Facade._hootDebug) {
            Facade._hootDebug("ApiWsCtx|%s => mark:%j, out:%j, req:%j", this.getPath(), this.debugMark, obj, [this.getBody(), this.getQuery(), this.getHeaders(), this.pathArg]);
        }
    }

    // @ts-ignore
    // public static send404(conn:WebSocket, path:string, reqId:number){
    //     new WsApiHttpCtx(conn, [reqId, path]).sendJson({code:404,msg:path});
    // }
    public isReal() {
        return false;
    }

    /**
     * 释放内部引用
     */
    public free() {
        for (let k in this) {
            delete this[k];
        }
    }

    private afters: Map<string | Symbol, [Function, any[]]>
    private afterI: number;

    public after(fn: Function, args?: any[], uniqueFnId?: string) {
        if (this.afterI == null) {
            this.afters = new Map();
            this.afterI = 1;
        }
        if (!uniqueFnId) {
            this.afters.set(Symbol(this.afterI++), [fn, args]);
        } else {
            this.afters.set(uniqueFnId, [fn, args]);
        }
    }

    public runAfters() {
        if (!this.afters) return;
        var a = this.afters;
        this.afters = null;
        for (var v of a.values()) {
            v[0](...v[1]);
        }
    }
}

export class ApiRunError extends Error {
    public code: number;

    constructor(message, code: number = 500) {
        super(message);
        // this.name="ApiRunError";
        this.code = code;
    }
}


export interface BaseParamRule {
    option?: boolean, //是否可选
    default?: any, //默认值
    min?: number | bigint,  //最小值
    max?: number | bigint,  //最大值
    in?: Array<any>, //范围内的可选项
    regexp?: RegExp  //正则判断
    each?: boolean,//如果是数组，针对每项进行检测=默认是false
}

//api参数规则
export interface ApiParamRule extends BaseParamRule {
    //参数来源= get/post/header/cookie/path/socket/any/*
    src?: string,
    //参数名字=从数据源中获取的名字，代替变量默认名字
    name?: string,
    //自定义判断转换函数，返回null则表示转换失败
    check_convert?: (d: any) => any,
    //如果是数组类型type，传入参数是字符串，则可以定义separator切分成数组。（例如开发工具中使用）
    separator?: string,
    //转换类型--自动抓取定义
    type?: Function,
    //专用描述
    desc?: string,
    //开发工具生成需要-多行输入（支持换行）
    multline?: boolean,
}
/**
 * 检测参数是否符合规则
 * @param type 参数的类型定义
 * @param val  测试的实际值
 * @param rule 设置的测试规则
 * @constructor
 */
export function CheckBaseParamRule(type: any, val: any, rule: BaseParamRule): boolean {
    if (type == Number) {
        if (isNaN(val) ||
            (rule.min != undefined && val < rule.min) || (rule.max != undefined && val > rule.max) ||
            (rule.in && !rule.in.includes(val))
        ) {
            return false;
        }
    } else if (type == global["BigInt"]) {
        var tmp = val;
        if (
            (rule.min != undefined && tmp < rule.min) || (rule.max != undefined && tmp > rule.max) ||
            (rule.in && !rule.in.includes(tmp))
        ) {
            return false;
        }
    } else if (type == String) {
        var size = val.length;
        if (
            (rule.min != undefined && size < rule.min) || (rule.max != undefined && size > rule.max) ||
            (rule.in && !rule.in.includes(val)) ||
            (rule.regexp && !rule.regexp.test(val))
        ) {
            return false;
        }
    } else if (type == Date) {
        var time = (<Date>val).getTime();
        if (
            (rule.min != undefined && time < rule.min) || (rule.max != undefined && time > rule.max)
        ) {
            return false;
        }
    } else if (rule.each && val != null) {//逐项检测
        var eachArr = null;
        if (Array.isArray(val) || util.types.isTypedArray(val)) {
            eachArr = val;
        } else if (typeof (val) == 'object') {
            eachArr = Object.values(val);
        }
        if (eachArr) {
            for (var x = 0; x < eachArr.length; x++) {
                var eachItem: any = eachArr[x];
                if (rule.in && !rule.in.includes(eachItem)) {
                    return false
                }
                if (Number.isFinite(eachItem)) {
                    if ((rule.min != undefined && eachItem < rule.min) || (rule.max != undefined && eachItem > rule.max)) {
                        return false;
                    }
                } else if (typeof (eachItem) == 'string') {
                    if ((rule.min != undefined && eachItem.length < rule.min) || (rule.max != undefined && eachItem.length > rule.max)) {
                        return false;
                    }
                }
            }
        }
    }
    return true;
}
//api-方法标记参数
export interface ApiRouting {
    method: string,//访问方法
    path: string,//访问路径
    code: number,//方法的访问编码
    key: string,//源-方法名
    rules: Array<ApiParamRule>,//参数规则
    filter?: ApiFilterHandler, //序列化方式
    res?: new () => AbsRes, //序列化方式
    absolute?: boolean,//是否需要忽略类路径（避免前缀追加问题）
}

//api过滤器参数
export interface ApiFilterHandler {
    (ctx: AbsHttpCtx): Promise<boolean>;
}

interface ApiRoute {
    //访问路径定义，不写则默认函数名or类名
    path?: string,
    //权限函数：返回true/false表示是否允许访问
    filter?: ApiFilterHandler,
    //序列化结果类
    res?: new () => AbsRes,
}

//路由-类型参数
export interface ApiMethod extends ApiRoute {
    //是否需要忽略类路径（避免前缀追加问题）
    absolute?: boolean,
}

//类标记参数
export interface ApiClass extends ApiRoute {
    //本类下面函数的通用的参数规则
    baseRules?: Array<ApiParamRule>,
}

import { Facade } from "./api_facade";