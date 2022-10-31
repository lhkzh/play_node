import {IncomingMessage, ServerResponse} from "http";

/**
 * 路由回调方法
 */
export type RouteCallBack = (reqInfo: { req: IncomingMessage, res: ServerResponse, address: string, query?: any, pathArg?: any } & any, path?: string) => void;
/**
 * 允许的HTTP方法
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'CONNECT' | 'ANY' | 'UPGRADE';
/**
 * 临时存储路由结构
 */
type RegexNode = {
    keys: Array<string>,
    pattern: RegExp,
    fn: RouteCallBack
};

export interface HttpRouteMatch {
    match(path: string): [RouteCallBack, string, { [index: string]: string } | null]
}

/**
 * 路由类
 */
export class HttpMethodRoute implements HttpRouteMatch {
    protected paths: Map<string, RouteCallBack> = new Map<string, RouteCallBack>();
    protected regs: Map<string, RegexNode> = new Map<string, RegexNode>();

    constructor(protected _method: string) {
    }

    /**
     * 当前允许的HTTP方法
     */
    public get method(): string {
        return this._method;
    }

    /**
     * 清空路由
     */
    public clear() {
        this.paths.clear();
        this.regs.clear();
    }
    private reg_more=/[+*]/g;
    /**
     * 添加路由
     * @param path
     * @param fn
     */
    public add(path: string, fn: RouteCallBack) {
        let rsp = matchByRegexParamPath(path);
        if (rsp.keys.length == 0 && this.reg_more.test(path)==false) {
            this.paths.set(path, fn);
        } else {
            this.regs.set(path, {...rsp, fn: fn});
        }
    }

    /**
     * 匹配路由
     * @param path
     */
    public match(path: string): [RouteCallBack, string, { [index: string]: string } | null] {
        let fn = this.paths.get(path);
        if (fn) {
            return [fn, path, null];
        } else {
            for (let item of this.regs) {
                let matches = item[1].pattern.exec(path);
                if (matches) {
                    let i = 0, out = {};
                    while (i < item[1].keys.length) {
                        out[item[1].keys[i]] = matches[++i] || null;
                    }
                    return [item[1].fn, item[0], out];
                }
            }
        }
        return null;
    }
}

export class HttpMethodRoute2 extends HttpMethodRoute {
    constructor(protected _method: string, protected _prefixs: Array<string>) {
        super(_method);
    }

    public add(path: string, fn: RouteCallBack) {
        super.add(path, fn);
        this._prefixs.forEach(p => {
            super.add(p + path, fn);
        });
    }

    public match(path: string): [RouteCallBack, string, ({ [p: string]: string } | null)] {
        let r = super.match(path);
        if (!r) {
            for (let i = 0; i < this._prefixs.length; i++) {
                r = super.match(this._prefixs[i] + path);
                if (r) {
                    break;
                }
            }
        }
        return r;
    }
}

/**
 * 正则路由处理方法，提取参数用
 * '/movies/:id([0-9]+)/:title([a-z]+).mp4' '/movies/:title.(mp4|mov)' '/movies/:tag/:title.(mp4|mov)'
 * @param path 路径
 * @param loose 是否忽略参数后续
 * @returns 对象{keys:string[], pattern:RegExp}
 * @see https://github.com/lukeed/regexparam base
 */
export function matchByRegexParamPath(path: string, loose?: boolean) {
    let c: string, o: number, tmp: string, ext: number, keys: string[] = [], pattern = '', arr = path.split('/'),
        e: string;
    arr[0] || arr.shift();
    while (tmp = arr.shift()) {
        c = tmp[0];
        if (c === '*') {
            keys.push('wild');
            pattern += '/(.*)';
        } else if (c === ':') {
            o = tmp.indexOf('?', 1);
            ext = tmp.indexOf('.', 1);
            e = tmp.substring(1, !!~o ? o : !!~ext ? ext : tmp.length);
            let tidx = e.indexOf('<');
            if (tidx < 1) {
                tidx = e.indexOf('(');
                if (tidx < 1) {// :name([a-zA-Z]+)
                    keys.push(e);
                    pattern += !!~o && !~ext ? '(?:/([^/]+?))?' : '/([^/]+?)';
                } else {// :name
                    keys.push(e.substr(0, tidx));
                    pattern += '/' + e.substr(tidx);
                }
            } else {// :name>[0-9]+  :name>([0-9]+)
                keys.push(e.substr(0, tidx));
                let tpart = e.substr(tidx);
                if (tpart.charAt(0) == '(') {
                    pattern += '/' + tpart;
                } else {
                    pattern += '/(' + tpart + ')';
                }
            }
            if (!!~ext) pattern += (!!~o ? '?' : '') + '\\' + tmp.substring(ext);
        } else {
            pattern += '/' + tmp;
        }
    }
    return {
        keys: keys,
        pattern: new RegExp('^' + pattern + (loose ? '(?=$|\/)' : '\/?$'), 'i')
    };
}

export class HttpAllMethodRouting {
    private r: Map<string, HttpMethodRoute>;
    private methods: string[];
    public readonly _get: HttpRouteMatch;
    public readonly _post: HttpRouteMatch;
    public readonly _upgrade: HttpRouteMatch;
    public readonly _options: HttpRouteMatch;
    public readonly _head: HttpRouteMatch;
    public readonly _delete: HttpRouteMatch;
    public readonly _put: HttpRouteMatch;

    constructor(prefixes?: string[]) {
        let r = this.r = new Map<string, HttpMethodRoute>();
        let ms = this.methods = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'CONNECT', 'UPGRADE', 'OPTIONS'];
        ms.forEach((method: string) => {
            let mr = prefixes && prefixes.length ? new HttpMethodRoute2(method, prefixes) : new HttpMethodRoute(method);
            r.set(method.toUpperCase(), mr);
            r.set(method.toLowerCase(), mr);
        });
        this._get = r.get('GET');
        this._post = r.get('POST');
        this._upgrade = r.get('UPGRADE');
        this._options = r.get('OPTIONS');
        this._head = r.get('HEAD');
        this._delete = r.get('DELETE');
        this._put = r.get('PUT');
    }

    /**
     * 添加缓存路由
     * @param method
     * @param path
     * @param fn
     */
    public addOne(method: HttpMethod, path: string, fn: RouteCallBack) {
        let r = this.r.get(method);
        if (r) {
            r.add(path, fn);
            return true;
        } else if (method == 'ANY') {
            this.r.get('GET').add(path, fn);
            this.r.get('POST').add(path, fn);
            return true;
        }
        return false;
    }

    /**
     * 清空缓存的路由
     */
    public clearAll() {
        this.methods.forEach(m => {
            this.r.get(m).clear();
        })
    }

    /**
     * 清空并重置新的路由
     * @param list 【http方法,路由path,回调方法】
     */
    public resetAll(list: [HttpMethod, string, RouteCallBack][]) {
        this.clearAll();
        list.forEach(item => {
            this.addOne(item[0], item[1], item[2]);
        });
    }

    /**
     * 匹配路由
     * @param method 当前请求的方法
     * @param path 当前请求的address
     * @returns null|[回调方法,配置的path,路径参数|null]
     */
    public matchByParamPath(method: string, path: string): [RouteCallBack, string, { [index: string]: string } | null] {
        let r = this.r.get(method);
        if (r) {
            return r.match(path);
        }
        return null;
    }
}