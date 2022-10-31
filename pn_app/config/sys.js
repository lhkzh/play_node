let base_env = require("../app_env");// wx qq tt vivo oppo huawei mi
let base_conf=require(`./sys_${base_env}`);
let util=require("util");
function getConf(name,clone){
    try{
        let m = require(__dirname+"/"+name);
        if(util.isFunction(m)){//函数方式免复制
            m = m();
        }else if(clone){//对象复制
            return JSON.parse(JSON.stringify( m ));
        }
        return m;
    }catch (e) {
        console.error("sys.getConf",name,e);
    }
    return null;
}
function getApp(appid) {
    let v = base_conf[appid];
    if(v && util.isObject(v) && base_conf.pfUrls && base_conf.pfUrls.hasOwnProperty(v.pf)){v.url=base_conf.pfUrls[v.pf]}
    return v;
}

//从数据库对象池获取一个db
function getDbPool(name="main"){
    return global["@db_"+name];
}
//创建数据库-链接对象池
function create_db_pool(ver, name, confObj, limitOpt={max:128, idel:8}){
    if(!global[name] || global[name].ver!=ver){
        global[name] = require("mysql2").createPool(confObj).promise()
    }
}
for(var k in base_conf.db){
    create_db_pool(base_conf.ver,"@db_"+k, base_conf.db[k]);
}

var exports={
    app:getApp,
    config:getConf,
    db:getDbPool
};
for(var k in base_conf){
    if(!exports.hasOwnProperty(k) && !k.startsWith("db") && !k.startsWith("redis")){
        exports[k]=base_conf[k];
    }
}
module.exports=exports;
global["sys"]=global["@sys"]=exports;