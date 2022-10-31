/**
 * 系统运行基础配置
 */
var sys={
    "ver":"1.0.0",
    "debug":true,
    "port":8200,
    "api_prefix":"/home_pet",
    "crossOriginHeaders":"content-type,x-wx-skey",
    "redis":{
        main:{host:"192.168.1.215",port:6379,db:15,password:"redis123",prefix:"ndApp:"}
    },
    "db":{
        main:{host:'localhost', user: 'root', password:"123456", database: 'test'}
    },
}
module.exports=sys;