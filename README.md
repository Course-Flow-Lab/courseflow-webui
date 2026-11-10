# Courseflow WebUI

Courseflow 的独立网页工作台，使用原生 JavaScript、HTML、CSS 和 Vite。提供课程、任务、问答、成绩分析、模块管理、站点管理、注册邀请和日志导出界面；所有业务请求均通过 [Framework](https://github.com/Course-Flow-Lab/courseflow-framework) 的 HTTP API 完成。

前端不读取数据库，不运行平台模块，不保存平台凭据。页面从模块能力描述生成入口，平台实现继续由后端装载。

## 本地开发

需要 Node.js ≥ 24。先在 Framework 仓库启动使用独立测试数据目录的后端：

```sh
CF_BIND=127.0.0.1:8102 \
CF_PUBLIC_URL=http://127.0.0.1:5173 \
CF_DATA_DIR="$HOME/.local/share/courseflow-webui-dev" npm start
```

在本仓库运行：

```sh
npm ci
npm run dev
```

打开 `http://127.0.0.1:5173`。Vite 将 `/api` 和 `/healthz` 原样代理至 `http://127.0.0.1:8102`。可用 `CF_API_TARGET` 覆盖代理目标，但后端公开 URL 始终应是浏览器访问地址。端口占用时直接失败，不悄悄换端口。

首次使用，在后端终端读取管理员设置码，再从网页创建测试管理员。只安装模拟模块或启用平台模块的 fixture 模式进行自动验证，不使用真实平台账号。

## 检查与构建

```sh
npm run check
npm test
npm run build
```

构建输出为 `dist/`，包括带内容指纹的脚本、样式及 `version.json`。后者提供前端版本和 `web_api_version`，与后端 `/healthz` 配合核对发布。测试覆盖原有页面逻辑、问答草稿、成绩分区、邀请管理、路径编码、会话、下载和接口故障。

`npm run preview` 仅用于检查构建结果，地址为 `http://127.0.0.1:4173`；配套测试后端的 `CF_PUBLIC_URL` 也应改为该地址。生产使用静态服务器，不使用开发服务器。

## 同源部署

[deploy/nginx.conf](deploy/nginx.conf) 是本机部署配置：前端入口 `127.0.0.1:8100`，后端 `127.0.0.1:8101`。在源码外建立 Nginx 前缀目录，将其中的 `html` 链接指向本次发布的 `dist/`，然后运行：

```sh
nginx -t -p /绝对路径/网关目录/ -c /绝对路径/nginx.conf
nginx -p /绝对路径/网关目录/ -c /绝对路径/nginx.conf
```

后端设置 `CF_BIND=127.0.0.1:8101` 和 `CF_PUBLIC_URL=http://127.0.0.1:8100`。网关保留 Cookie、Origin 和编码路径，API 超时为 300 秒；HTML 配置 CSP，未知文件返回 404。只托管 `dist/`，不要公开源码、数据或主密钥。Nginx 是部署选择，不是 Framework 的依赖。

前端和后端分别保存发布目录、提交编号和回退版本。已有数据与主密钥留在后端原数据目录。完整更新和回退步骤见 [后端本机部署说明](https://github.com/Course-Flow-Lab/courseflow-framework/blob/main/docs/LOCAL-DEPLOYMENT.md)。

## 接口边界

当前要求 `web_api_version: 1`；Framework 0.1.7 开始显式提供该字段。缺失或版本不匹配时显示中文提示，不继续初始化界面。`module_api` 是另一套平台模块协议，前端不以它判断 HTTP 兼容性。

请求使用相对路径、同源 Cookie 和写入请求的 CSRF 标头。图片、日志和报告也经 `/api/*` 下载。接口清单、错误形式和会话规则见 [Web API 文档](https://github.com/Course-Flow-Lab/courseflow-framework/blob/main/docs/WEB-API.md)。

未来桌面或手机 App 可以装载此构建产物，并由宿主启动后端；本仓库不承担 App 生命周期或平台模块运行适配。

## 目录

```text
index.html       页面入口
src/             页面、交互、样式和 HTTP 客户端
test/            离线前端测试
scripts/         语法检查
deploy/          同源静态托管与 API 代理配置
vite.config.js   开发代理、构建与版本信息
```


## 站点管理与日志

管理员可从侧栏或「我的账号」打开 `#/admin/users`。用户页提供创建、搜索、停用、角色、密码和任务上限管理；`#/admin/tasks` 按成员与状态筛选全站任务，支持暂停、继续、停止、调整队列和下载日志；`#/admin/settings` 管理并发上限与跨课程并行许可，并链接邀请、模块和日志页面。

任务详情和课程执行记录仅提供 UTF-8 纯文本 `.log` 下载。课程页导出只包含当前课程；试卷和成绩单继续通过独立的数据导出入口下载。
