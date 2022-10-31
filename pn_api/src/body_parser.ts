import {IncomingMessage} from "http";
import * as querystring from "querystring";

export function readJsonPromise(req: IncomingMessage) {
    return new Promise<any>((cb, err) => {
        readJsonCallBack(req, cb, err);
    });
}

export function readJsonCallBack(req: IncomingMessage, cb: (rsp:any)=>void, err: Function) {
    readTextCallBack(req, (str: string) => {
        let rsp = null;
        try {
            rsp = JSON.parse(str);
        } catch (e) {
            err(e);
            return;
        }
        cb(rsp);
    }, err);
}

export function readQueryPromise(req: IncomingMessage) {
    return new Promise<any>((cb, err) => {
        readQueryCallBack(req, cb, err);
    });
}

export function readQueryCallBack(req: IncomingMessage, cb: (rsp:any)=>void, err: Function) {
    readTextCallBack(req, (str: string) => {
        let rsp = null;
        try {
            rsp = querystring.parse(str);
        } catch (e) {
            err(e);
            return;
        }
        cb(rsp);
    }, err);
}

export function readXmlPromise(req: IncomingMessage) {
    return new Promise<any>((cb, err) => {
        readXmlCallBack(req, cb, err);
    });
}

export function readXmlCallBack(req: IncomingMessage, cb: (rsp:any)=>void, err: Function) {
    readTextCallBack(req, (str: string) => {
        let rsp = null;
        try {
            rsp = require("fast-xml-parser").parse(str);
        } catch (e) {
            err(e);
            console.error("try: npm install fast-xml-parser");
            return;
        }
        cb(rsp);
    }, err);
}

export function readTextPromise(req: IncomingMessage) {
    return new Promise<string>((cb, err) => {
        readTextCallBack(req, cb, err);
    });
}

export function readTextCallBack(req: IncomingMessage, cb: (rsp:string)=>void, err: Function) {
    readRawCallBack(req, (blob: Buffer) => {
        cb(blob.toString("utf8"));
    }, err);
}

export function readMsgpackPromise(req: IncomingMessage) {
    return new Promise<any>((cb, err) => {
        readMsgpackCallBack(req, cb, err);
    });
}

export function readMsgpackCallBack(req: IncomingMessage, cb: (rsp:any)=>void, err: Function) {
    readRawCallBack(req, (blob: Buffer) => {
        let rsp = null;
        try {
            rsp = require("@msgpack/msgpack").decode(blob);
        } catch (e) {
            err(e);
            console.error("try: npm install @msgpack/msgpack");
            return;
        }
        cb(rsp);
    }, err);
}

export function readRawPromise(req: IncomingMessage) {
    return new Promise<Buffer>((cb, err) => {
        readRawCallBack(req, cb, err);
    });
}

export function readRawCallBack(req: IncomingMessage, cb: (rsp:Buffer)=>void, err: Function) {
    let buffer: Buffer;
    if (req["onAborted"]) {//uNetWorking.js
        let res = <any>req;
        res.onData((chunk, isLast) => {
            buffer = buffer ? Buffer.concat([buffer, Buffer.from(chunk)]) : Buffer.from(chunk);
            if (isLast) {
                cb(buffer);
            }
        });
        res.onAborted(err);
    } else {
        req.on('data', chunk => {
            buffer = buffer ? Buffer.concat([buffer, chunk]) : chunk;
        });
        req.on('error', e => {
            err(e);
        });
        req.on('end', () => {
            try {
                cb(buffer);
            } catch (e) {
                err(e);
            }
        });
    }
}
export function readRawProcess(req: IncomingMessage, cb: (isLast:boolean, rsp:Buffer, err:any)=>void) {
    return new Promise((suc,fail)=>{
        if (req["onAborted"]) {//uNetWorking.js
            let res = <any>req;
            res.onData((chunk, isLast) => {
                cb(isLast, chunk, null);
                if(isLast){
                    suc(true);
                }
            });
            res.onAborted((err)=>{
                err=new Error(err?err.toString():"abort");
                cb(false,null,err);
                fail(err);
            });
        } else {
            req.on('data', chunk => {
                cb(false,chunk,null);
            });
            req.on('error', e => {
                cb(false, null, e);
                fail(e);
            });
            req.on('end', () => {
                cb(true,null,null);
                suc(true);
            });
        }
    });
}

let readFormOptions = {limits: {fieldNameSize: 128, fields: 128, files: 1, fileSize: 2 * 1024 * 1024, maxPayLoadSize:16*1024*1024}};

export function setReadFormOptions(opts) {
    if (opts) {
        readFormOptions = {...readFormOptions, ...opts};
    }
}

export function readFormPromise(req: IncomingMessage) {
    return new Promise<any>((cb, err) => {
        readFormCallBack(req, cb, err);
    });
}

export function readFormCallBack(req: IncomingMessage, cb: (rsp:any)=>void, err: Function) {
    var busboy;
    try {
        busboy = (require('busboy'))({...readFormOptions, headers: req.headers});
    } catch (e) {
        err(e);
        console.error("try: npm install busboy");
        return;
    }
    var formFiles = {}, formData = {};
    busboy.on('file', function (fieldname, file, filename, encoding, mimetype) {
        let fileItem = {fileName: filename, contentType: mimetype, fileSize: 0, encoding: encoding};
        if (readFormOptions["filterFile"] && readFormOptions["filterFile"](fileItem, req)==false){
            return;
        }
        if (typeof (readFormOptions["processFile"]) === 'function') {
            fileItem["file"] = readFormOptions["processFile"](file, fileItem);
            file.on('data', function (data) {
                fileItem.fileSize += data.length;
            });
        } else {
            fileItem["body"] = Buffer.allocUnsafe(0);
            file.on('data', function (data) {
                fileItem.fileSize += data.length;
                fileItem["body"] = Buffer.concat([fileItem["body"], data]);
            });
        }
        file.on('end', function () {
            if (formFiles[fieldname]) {
                formFiles[fieldname] = [formFiles[fieldname]];
                formFiles[fieldname].push(fileItem);
            } else {
                formFiles[fieldname] = fileItem;
            }
            formData[fieldname] = formFiles[fieldname]
        });
    });
    busboy.on('field', function (fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) {
        if (formData[fieldname]) {
            formData[fieldname] = [formData[fieldname]];
        } else {
            formData[fieldname] = val;
        }
    });
    busboy.on('finish', function () {
        cb(formData);
    });
    if (req["onAborted"]) {//uNetWorking.js
        let res = <any>req;
        res.onData((chunk, isLast) => {
            busboy.write(Buffer.from(chunk));
        });
        res.onAborted(err);
    } else {
        req.on('error', e => {
            err(e);
        });
        req.pipe(busboy);
    }
}

export function readBodyAutoPromise(req: IncomingMessage) {
    return new Promise<any>((cb, err) => {
        readBodyAutoCallBack(req, cb, err);
    });
}
const NUMBER_REG = /^[1-9]\d*$/;
export function readBodyAutoCallBack(req: IncomingMessage, cb: (rsp:any)=>void, err: Function) {
    let clen = <string>req.headers['content-length'];
    if (!clen) {
        err(new Error("NO_CONTENT_LENGTH"));
    } else if (!NUMBER_REG.test(clen)) {
        err(new Error("INVALID_CONTENT_LENGTH"));
    } else if (Number(clen) > readFormOptions.limits.maxPayLoadSize) {
        err(new Error("TOO_LARGE_CONTENT_LENGTH"));
    } else {
        let ctype = req.headers["content-type"];
        if (!ctype) {
            // err("bad-content-type");
            readRawCallBack(req, cb, err);
        } else {
            if (ctype.includes('json')) {
                readJsonCallBack(req, cb, err);
            } else if (ctype.includes('msgpack')) {
                readMsgpackCallBack(req, cb, err);
            } else if (ctype.includes('xml')) {
                readXmlCallBack(req, cb, err);
            } else if (ctype.includes('urlencoded')) {
                readQueryCallBack(req, cb, err);
            } else if (ctype.includes('form-')) {// x-www-form-urlencoded multipart/form-data
                readFormCallBack(req, cb, err);
            } else {
                readRawCallBack(req, cb, err);
            }
        }
    }
}