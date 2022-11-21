import { ANY, API, current_api_ctx, docs_helper, GET, POST, REPEATER, RULE, TextRes, UploadFileInfo } from "pn_api";
import * as fs from "fs";
import * as path from "path";
/**
 * 公开接口
 * @state ok
 */
@API("")
class Public {

  /**
   * ping
   * 简单的ping/pong
   * @state dev
   * @returns string data 响应内容
   * @tpl ok {"code":0,"data":"pong"}
   */
  @GET()
  public async ping() {
    return "pong";
  }
  /**
   * 测试打印被限制的参数
   * @state dev
   * @param name 名字
   * @param age 年龄
   * @returns object data 响应内容
   * @returns string data.name 名字-发上来的
   * @returns int data.age 年龄-发上来的
   * @tpl ok {"code":0,"data":{"name":"test","age":18}}
   * @tpl ok {"code":0,"data":{"name":"test"}}
   */
  @ANY()
  public async dump(@RULE({ min: 1, max: 12, in: ["aa", "bb", "cc"] }) name: string, @RULE({ option: true, min: 1, max: 120 }) age?: number) {
    return { name: name, age: age };
  }
  /**
   * 测试打印参数
   * @state ok
   */
  @POST()
  public dump2(a: Uint8Array) {
    return "hi:" + a.reduce((s, e) => { s.push(e); return s; }, []).join(",");
  }
  /**
   * 测试打印参数
   * @state ok
   */
  @POST()
  public say(name: string) {
    return "hi:" + name;
  }
  /**
   * 测试文件上传
   * @state ok
   */
  @POST()
  public upload(file: UploadFileInfo) {
    fs.writeFileSync(path.resolve(__dirname, "../www", file.fileName), new Uint8Array(file.body.buffer));
    return file.fileName;
  }
  /**
   * 测试转发
   * 请求中继转发给其他地址处理
   * @state ok
   */
  @REPEATER({
    toUrl: "https://nodejs.org/en/",
    fixPath: (req) => {
      return req.url.split('?')[0].replace('/repeater/', '');
    },
    path: "/repeater/"
  })
  public repeater(url, err) {
    console.log(url, err)
  }
  /**
   * 文档接口
   * api文档处理函数
   * @api server
   * @state ok
   */
  @GET({ path: "/docs", res: TextRes })
  public index(@RULE({ option: true }) group: string, @RULE({ option: true, name: "s" }) service: string) {
    return docs_helper.genarateDocsHtml(current_api_ctx(this), { group: group, api: service });
  }
}