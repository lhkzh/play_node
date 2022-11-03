#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const writeTextFile = function(filePath, buffer){
    if(fs.existsSync(filePath)){
        return;
    }
    let lastPath = path.dirname(filePath);
    fs.mkdirSync(lastPath, {recursive: true});
    fs.writeFileSync(filePath, buffer, {encoding:"utf8"});
}
const readTextFile = filePath=>{
    return fs.readFileSync(filePath,{encoding:"utf8"});
}
const mkDir = p=>{
	    if(fs.existsSync(p)){
        return;
    }
    fs.mkdirSync(p, {recursive: true});
}
const copyTextFile = (fromDir, toDir, releativePath, procssFn)=>{
    let d = readTextFile(path.normalize(fromDir+releativePath));
    if(procssFn){
        d = procssFn(d);
    }
    writeTextFile(path.normalize(toDir+releativePath), d);
}
if(process.argv.length<4 || process.argv[2]=="help"){
    console.log(process.argv.join(" "));
    console.log("npm init pn_api normal YourProjectName");
    console.log("npm init pn_api qcf YourProjectName");
}else if(process.argv.length>=4 && process.argv[3].length>1){
    const tplDir = path.normalize(__dirname+"/project_api/");
    const appDir = path.normalize(process.cwd()+"/"+process.argv[3]+'/');
    var special_fns = {"package.json":s=>s.replace("fib_app_server", process.argv[3])}
    var file_arrs = ["package.json", "tsconfig.json", "app.js", "src/api/Public.ts", "src/api/WebsocketHandler.ts"];
    file_arrs.forEach(e=>{
        copyTextFile(tplDir, appDir, e, special_fns[e]);
    });
    mkDir(path.normalize(appDir+"www"));
    console.log("your project "+process.argv[3]+"create cpmplete!");
    console.log("call npm install");
    let envOptions = {cwd:appDir};
    require('child_process').exec("npm install", envOptions, function(err,stdout,stderr){
        if(err) {
            console.log('error:'+stderr);
        } else {
            console.log(stdout);
            require('child_process').exec("npm update pn_api", envOptions, function(err,stdout,stderr){
                console.log("call tsc");
                require('child_process').exec("tsc", envOptions, function(err,stdout,stderr){
                    if(err) {
                        console.log('error:'+stderr);
                    } else {
                        console.log(stdout);
                    }
                });
            });
        }
    });
}