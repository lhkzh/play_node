说明：    
  轻量级api手脚架  
 -
**特性**    
 - （基于Typescript&Decorator）编写  
 - 注解配置路由、参数规则、输出格式、权限判断  
 - 自动生成简单的在线接口文档（需要按照规则写注释       

快速使用    
  <pre>
npm install -g create-pn_api  

create-pn_api create ProjectName    
cd ProjectName    
npm start
  </pre>
  
注意可选项  
<pre>
//接口请求日志输出
Facade._hootDebug = console.log;
//接口错误输出
Facade._hookErr = (ctx,err)=>{ console.error(ctx.getPath(), err); };


//添加msgpack编码支持
Facade._msgpack = {encode:require("@msgpack/msgpack").encode, decode:require("@msgpack/msgpack").decode};
//添加xml编码支持
const fxp = require("fast-xml-parser");
const fxp_parser = new fxp.XMLParser();
const fxp_builder = new fxp.XMLBuilder();
Facade._xml = {encode:fxp_builder.build.bind(fxp_builder), decode:fxp_parser.parse.bind(fxp_parser)};
</pre>

https://github.com/lhkzh/play_node