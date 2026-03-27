# Turtle Soup Mystery

基于 `TURTLE_SOUP_SPEC.md` 重建的海龟汤项目，当前版本已经改为：

- 前端：`Vue 3 + Vuetify`，界面参考 Berry Free Vuetify Vue Admin Template 的后台风格
- 后端：`Node.js + TypeScript + Express`
- AI：接入局域网 `Ollama`
- 持久化：`SQLite`
- 玩法：动态生成汤底 + 多人可加入的聊天室房间
- 部署：支持 `Dockerfile`、`docker-compose.yml`、阿里云 ACR 推送脚本

## 当前能力

- 房主输入主题后，系统动态生成汤底
- 成员通过房间码加入同一房间
- 所有成员共享提问记录、主持回答、揭示事实与最终结算
- 设置页支持：
  - 检测 Ollama 连通性
  - 自动拉取模型列表
  - 保存默认模型
- 数据写入 SQLite，房间历史会持续保留

## 目录结构

```text
front/                 前端项目
backend/               后端 API 与静态资源承载
backend/data/puzzles/  内置谜题种子
backend/data/runtime/  SQLite 数据与运行时文件
scripts/               初始化与发布脚本
deploy/                Nginx 等部署模板
TURTLE_SOUP_SPEC.md    需求规格
```

## 本地开发

要求：

- Node.js 22+
- npm 10+

安装依赖：

```bash
npm install
```

初始化 SQLite：

```bash
npm run init:data
```

启动开发环境：

```bash
npm run dev
```

默认端口：

- 前端开发服务：`http://localhost:5174`
- 后端 API：`http://localhost:8080`

## 数据存储

默认 SQLite 文件：

```text
backend/data/runtime/turtle-soup.db
```

当前会持久化的内容：

- Ollama 配置
- Ollama 模型列表缓存
- 多人房间
- 房间成员
- 聊天消息
- 问答记录
- 最终猜测结果

内置谜题种子仍保留在 `backend/data/puzzles/`，服务启动时会自动同步进 SQLite。

## Ollama 配置

进入前端“系统设置”页面后：

1. 填写 Ollama 地址，例如 `http://192.168.1.20:11434`
2. 点击“检测连接并拉取模型”
3. 连通成功后，模型下拉会自动从接口加载
4. 选择默认模型并保存

如果应用跑在 Docker 中，而 Ollama 跑在宿主机上，可以尝试：

```text
http://host.docker.internal:11434
```

## 构建

```bash
npm run build
```

这个命令会：

1. 构建前端
2. 把前端产物复制到 `backend/public`
3. 构建后端

## Docker

### 本地构建镜像

```bash
docker build -t turtle-soup-mystery:local .
```

### Compose 启动

```bash
docker compose up -d --build
```

当前 `docker-compose.yml` 默认行为：

- 对外 HTTPS 端口：`41203`
- 应用数据目录映射到：

```text
/usr/local/project/docker/TurtleSoupMyStery/runtime
```

- Nginx 日志目录映射到：

```text
/usr/local/project/docker/TurtleSoupMyStery/nginx/logs
```

- 证书目录映射：

```text
/usr/local/project/cert:/etc/nginx/certs:ro
```

如果证书文件名不是默认的 `fullchain.pem` / `privkey.pem`，可以在启动前覆盖：

```bash
SSL_CERT_FILE=/etc/nginx/certs/你的证书.pem \
SSL_CERT_KEY_FILE=/etc/nginx/certs/你的私钥.pem \
docker compose up -d --build
```

## 阿里云 ACR 推送

目标仓库：

```text
crpi-2iicgf8z27uyvaq1.cn-hangzhou.personal.cr.aliyuncs.com/silvericekey/turtle_soup_mystery
```

### 1. 登录仓库

```bash
docker login --username=z516798599@qq.com crpi-2iicgf8z27uyvaq1.cn-hangzhou.personal.cr.aliyuncs.com
```

### 2. 打 tag

```bash
docker tag [ImageId] crpi-2iicgf8z27uyvaq1.cn-hangzhou.personal.cr.aliyuncs.com/silvericekey/turtle_soup_mystery:[镜像版本号]
```

### 3. 推送镜像

```bash
docker push crpi-2iicgf8z27uyvaq1.cn-hangzhou.personal.cr.aliyuncs.com/silvericekey/turtle_soup_mystery:[镜像版本号]
```

## 发布脚本

Windows：

```bat
scripts\deploy.bat
scripts\deploy.bat --tag=0.1.0
scripts\deploy.bat --reconfigure
```

PowerShell：

```powershell
.\scripts\deploy.ps1
.\scripts\deploy.ps1 -Tag 0.1.0
.\scripts\deploy.ps1 -Reconfigure
```

Linux / macOS：

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
./scripts/deploy.sh --tag=0.1.0
./scripts/deploy.sh --reconfigure
```

脚本默认使用以下发布配置：

- Registry host: `crpi-2iicgf8z27uyvaq1.cn-hangzhou.personal.cr.aliyuncs.com`
- Namespace: `silvericekey`
- Image name: `turtle_soup_mystery`
- Login username: `z516798599@qq.com`

首次执行会把配置保存到：

```text
.deploy/registry.env
```

## 当前 MVP 范围

- 动态生成汤底
- 多人聊天室房间
- Ollama 主持裁决
- 轮询同步
- 最终猜测结算
- SQLite 持久化

## 已验证

本地已完成：

- `npm run init:data`
- `npm run build`
- API 烟测：
  - 创建房间
  - 加入房间
  - 提问
  - 最终猜测结算

当前环境没有安装 Docker，因此没有办法在这里直接跑 `docker build` / `docker compose up` / `docker push`。
