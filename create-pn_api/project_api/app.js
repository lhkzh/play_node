const WebServer = require("pn_api").WebServer;
var config = {
    port:8666,
    dirs:[require("path").join(__dirname,"/dist")],
    www:require("path").join(__dirname,"/www"),
    websocket:{}
};
let imp = new WebServer(config);
imp.registAuto(true).start();

if(process.env.OS.toString().toLowerCase().indexOf("windows")>=0){
    require("fs").watch("./dist/",{recursive:true}, (et,fn)=>{
        if(imp["$_reloading_time_out"]){
            clearTimeout(imp["$_reloading_time_out"]);
        }
        imp["$_reloading_time_out"] = setTimeout(()=>{
            clearTimeout(imp["$_reloading_time_out"]);
            delete imp["$_reloading_time_out"];
            imp.reload();
        },5000);
    });
}else{
    process.on('SIGUSR1', ()=>{imp.reload();});
    process.on('SIGUSR2', ()=>{imp.reload();});

    let stop_server_fn = (signal)=>{
        process.emit("beforeExit");
        imp.stop().then(suc=>{
            process.exit(suc ? 0 : 1);
        });
    };
    process.on("SIGINT", stop_server_fn);
    process.on("SIGTERM", stop_server_fn);
}
//监听未捕获的同步异常事件
process.on('uncaughtException', function(e){
    console.error('uncaughtException:Catch in process', e.message);
});
//监听一个当前事件循环中，未被捕获的异常，该异常可能在之后的循环中被捕获
process.on('unhandledRejection', (reason) => {
    console.info('unhandledRejection:Catch in process', reason.message);
});
//监听一个Rejected Promise在事件循环的下次轮询或者之后被绑定了一个异常处理函数（catch）时触发
process.on('rejectionHandled', (p) => {
    console.info('rejectionHandled:Catch in process', p);
});