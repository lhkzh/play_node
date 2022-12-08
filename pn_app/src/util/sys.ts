import * as util from "util";
import { Pool as PromisePool } from "mysql2/promise";
import Redis from "ioredis";

let base_env = require("../../app_env");// wx qq tt vivo oppo huawei mi
let base_conf = require(`../../config/sys_${base_env}`);

/**
 * 读取配置
 * @param name
 * @param clone
 */
export function config<T extends any>(name: string, clone?: boolean): T {
    try {
        let m = require("../../config/" + name);
        if (typeof (m) == "function") {//函数方式免复制
            m = m();
        } else if (clone) {//对象复制
            return JSON.parse(JSON.stringify(m));
        }
        return m;
    } catch (e) {
        console.error("sys.getConf", name, e);
    }
    return null;
}

//创建数据库-链接对象池
for (var k in base_conf.db) {
    var ver = base_conf.ver, name = "@db_" + k, obj = base_conf.db[k];
    if (!global[name] || global[name].ver != ver) {
        global[name] = require("mysql2").createPool(obj).promise()
    }
}

//从数据库对象池获取一个db
export function dbPool(name = "main"): PromisePool {
    return global["@db_" + name];
}


type RedisUseType = "normal" | "temp" | "sub" | "block"; //临时，通用，事物，监听，阻塞监听
//获取一个redis连接（这里normal的redis会公用一个，其他的都是临时的注意close）
export function redisObj(name = "main", kind: RedisUseType = "normal"): Redis {
    if (name == "temp" || name == "block") {
        return new Redis(base_conf.redis[name]);
    }
    let conn_id = "@redis_" + name + "_" + kind;
    if (!global[conn_id]) {
        global[conn_id] = new Redis(base_conf.redis[name]);
    }
    return global[conn_id];
}
