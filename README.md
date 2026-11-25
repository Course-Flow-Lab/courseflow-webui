# Courseflow WebUI

Courseflow 的独立网页工作台，使用原生 JavaScript、HTML、CSS 和 Vite。提供课程、任务、问答、成绩分析、模块管理、站点管理、注册邀请和日志导出界面；所有业务请求均通过 [Framework](https://github.com/Course-Flow-Lab/courseflow-framework) 的 HTTP API 完成。

前端不读取数据库，不运行平台模块，不保存平台凭据。页面从模块能力描述生成入口，平台实现继续由后端装载。

## 本地开发

需要 Node.js ≥ 24。先在 Framework 仓库启动使用独立测试数据目录的后端：

```sh
CF_BIND=127.0.0.1:8102 \
CF_PUBLIC_URL=http://127.0.0.1:5173 \
CF_DATA_DIR="$HOME/workspace/courseflow/local/webui-dev-data" npm start
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

管理员可从侧栏或「我的账号」打开 `#/admin/users`。用户页提供创建、搜索、停用、角色、密码和任务上限管理；`#/admin/tasks` 按成员与状态筛选全站任务，默认最近更新优先，可选择创建时间或执行状态排序，支持暂停、继续、停止、删除、调整队列和下载日志。执行中任务先停止再删除；删除只清理本站记录，平台进度、草稿及作答保留。`#/admin/settings` 管理并发上限与跨课程并行许可，并链接邀请、模块和日志页面。

0.1.2 配合 Framework 0.1.11，在首次读取目录时显示「目录完成度」，返回列表后同步课程卡片。平台已有百分比保持优先；部分单元状态未知时只显示已完成数量。尚未读取的目录提示「进入课程后读取」，不显示“平台未提供”或虚构零进度。课程列表不会自动扫描其他课程目录。

任务详情和课程执行记录仅提供 UTF-8 纯文本 `.log` 下载。课程页导出只包含当前课程；试卷和成绩单继续通过独立的数据导出入口下载。

## 团队账号

WebUI 0.1.3 配合 Framework 0.1.12 提供团队账号。管理员在「站点管理 → 用户管理」选择团队角色并设置跨平台账号总上限（默认 10，可设 0–1000）；也可修改已有成员的角色或单独调整配额。自助注册仍为普通成员。

团队在「平台连接」为同一平台添加多个账号位、分别登录并选择「查看课程」。所有平台共用总配额，未完成登录也占用名额；断开登录保留账号位，移除绑定释放名额并停止该绑定的未结束任务。降低上限保留已有绑定；模块停用或卸载后仍可移除遗留绑定。

每个平台展示当前选中账号的课程。平台及课程深链使用 `account_id` 查询参数，API、数据导出和课程日志保留绑定选择。任务创建后固定账号，界面切换不会更改运行中的任务；问答草稿按绑定及课程分别保留。团队共用站点模型及任务偏好，不获得管理员权限。

完整用法和数据库升级说明见 [团队账号手册](https://github.com/Course-Flow-Lab/courseflow-framework/blob/main/docs/TEAM-ACCOUNTS.md)。正式发行配套 Framework 0.1.13；数据库升级前先备份，详见手册。

WebUI 0.1.4 配套 Framework 0.1.14。模块升级后，可在「任务中心 → 任务详情」核对版本，点击「迁移到」再点「继续」。管理员也可在全站任务中迁移。已有进度、补答和检查点随原任务保留。
