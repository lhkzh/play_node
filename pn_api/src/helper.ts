import * as os from "os";

export function base64_encode(s: string | Buffer, urlSafe?: boolean): string {
    return Buffer.from(s).toString("base64")
}
export function base64_decode(s: string | Buffer): Buffer {
    return Buffer.from(s.toString(), "base64");
}

const regPos = /^\d+(\.\d+)?$/; //非负浮点数
const regNeg = /^(-(([0-9]+\.[0-9]*[1-9][0-9]*)|([0-9]*[1-9][0-9]*\.[0-9]+)|([0-9]*[1-9][0-9]*)))$/; //负浮点数
export function isNumber(v: string | number): boolean {
    let s = <string>v;
    return Number.isFinite(<number>v) || (s !== undefined && (regPos.test(s) || regNeg.test(s)));
}
export function keysToNumber(obj: any): number[] {
    let keys: any[] = Object.keys(obj);
    keys.forEach((v, i, a) => {
        a[i] = Number(v);
    });
    return <number[]>keys;
}
/**
 * JSON.parse(JSON.stringify(v))
 * @param v
 */
export function cloneByJson<T>(v: T): T {
    return JSON.parse(JSON.stringify(v));
}

/**
 * 深度复制。需要安装模块（ lodash._baseclone ）
 * @param v 需要复制的数据
 * @param fn  过滤函数，function(v,k,obj){ if(k=="parent"){ return null; } if(k=="stage"){return null;} }
 */
export function cloneByDeep<T>(v: T, fn?: (v: any, field?: any, obj?: any) => any): T {
    return (require("lodash._baseclone"))(v, true, true, fn);
}

export function encodeUrlSafe(str: string): string {
    return encodeURIComponent(str)
        .replace(/!/g, '%21')
        .replace(/'/g, '%27')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29')
        .replace(/\*/g, '%2A');
}
/**
 * 比较版本号
 * @param v1 版本号1不支持首尾部字母
 * @param v2 版本号2不支持首尾部字母
 * @return 1 -1 0 vs1和vs2比较结果, 1=v1比v2大，-1=v1比v2小，0=v1等于v2
 */
export function compareVersion(v1: string, v2: string): number {
    let r1 = v1.replace(/[^\d\.]/g, "").split('.')
    let r2 = v2.replace(/[^\d\.]/g, "").split('.')
    const len = Math.max(r1.length, r2.length)
    for (let i = 0; i < len; i++) {
        let a = parseInt(r1[i] || '0')
        let b = parseInt(r2[i] || '0')
        if (a != b) {
            return a > b ? 1 : -1;
        }
    }
    return 0
}
/**
 * 判断obj是否为空（可迭代）
 * @param obj
 */
export function isEmptyObj(obj: any): boolean {
    if (!obj) return true;
    for (var k in obj) {
        return false;
    }
    return true;
}

/**
 * 翻转键值对，返回新的object
 * @param obj
 */
export function flipObj(obj: any): any {
    let ret = {};
    for (var k in obj) {
        ret[obj[k]] = k;
    }
    return ret;
}
export function ip2long(ip: string): number {
    let b = Buffer.alloc(4);
    var t = ip.split('.');
    for (var i = 0; i < t.length; i++) {
        b[i] = Number(t[i]);
    }
    return Number(b.readUInt32BE(0));
}
export function long2ip(longValue: number): string {
    var b = Buffer.alloc(4);
    b.writeInt32BE(longValue);
    return b.join('.');
}
export function isBase64(bin: Buffer): boolean {
    return bin.toString() == Buffer.from(bin.toString(), "base64").toString("base64");
}

function gen_ip() {
    var av4 = [], av6 = [];
    var ifaces = os.networkInterfaces();
    for (var dev in ifaces) {
        var k = dev.toLowerCase();
        if (k.indexOf("virtual") > -1 || k.indexOf("vmware") > -1 || k.indexOf("loopback") > -1) {
            continue;
        }
        ifaces[dev].forEach(e => {
            if (!e.internal) {
                if (e.family == "IPv4" && e.address != "127.0.0.1") {
                    av4.push(e.address);
                } else if (e.family == "IPv6" && e.address != "00:00:00:00:00:00") {
                    av6.push(e.address);
                }
            }
        })
    }
    return { v4: av4[0], v6: av6[0] };
}
let ip_info: { v4?: string, v6?: string } = {};
//本机-真ipv4
export function getLocalIp(): string {
    if (!ip_info.v4) {
        ip_info = gen_ip();
    }
    return ip_info.v4 || "127.0.0.1";
}
//本机-真ipv6
export function getLocalIpV6(): string {
    if (!ip_info.v6) {
        ip_info = gen_ip();
    }
    return ip_info.v6 || "::1";
}

export class JsCheck {
    static __constructor_AsyncFunction = (async () => { }).constructor;
    static __constructor_GeneratorFunction = (function* () { yield undefined; }).constructor;
    static isAsyncFunction(fn) {
        // fn instanceof ( (async () => {}).constructor )
        // return fn.constructor.name=="AsyncFunction";
        // return fn[Symbol.toStringTag] == 'AsyncFunction';
        return fn instanceof this.__constructor_AsyncFunction;
    }
    static isPromise(p) {
        // return !!p && (typeof p === 'object' || typeof p === 'function') && p.then && p.catch;
        // return p.constructor.name == "Promise";
        // return p[Symbol.toStringTag] == "Promise";
        return p instanceof Promise;
    }
    static isGeneratorFunction(fn) {
        //var GeneratorFunction = (function*(){yield undefined;}).constructor; return fn instanceof GeneratorFunction
        // return fn.constructor.name == "GeneratorFunction";
        // return fn[Symbol.toStringTag] == "GeneratorFunction";
        return fn instanceof this.__constructor_GeneratorFunction;
    }
    static isGenerator(p) {
        // return typeof p.next=="function" && p.next.name=="next";
        return p[Symbol.toStringTag] == 'Generator';
    }
}