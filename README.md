# Turtle Soup Mystery

基于 `TURTLE_SOUP_SPEC.md` 重建的海龟汤项目，当前版本已经支持：

- 动态生成汤底
- 多人房间聊天室
- Ollama 局域网接入
- SQLite 持久化
- 管理员登录后访问房间历史和系统设置
- Docker / Compose / 阿里云 ACR 发布

## 技术栈

- 前端：`Vue 3 + Vuetify`
- 后端：`Node.js + TypeScript + Express`
- AI：`Ollama`
- 存储：`SQLite`

## 当前能力

- 房主只选难度也能开局，主题可留空随机
- 成员通过房间码加入同一房间
- 所有成员共享提问记录、主持回答、揭示事实与最终结算
- 聊天室消息区固定高度，可滚动查看历史消息
- 管理员登录后才能访问：
  - 房间历史
  - 系统设置

## 默认管理员账号

默认登录信息：

```text
username: admin
password: admin123456
```

可通过环境变量覆盖：

```text
ADMIN_USERNAME
ADMIN_PASSWORD
```

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

## Ollama 配置

进入前端“系统设置”页面后：

1. 先使用管理员账号登录
2. 填写 Ollama 地址，例如 `http://192.168.1.20:11434`
3. 点击“检测连接并拉取模型”
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
- 应用数据目录：

```text
/usr/local/project/docker/TurtleSoupMyStery/runtime
```

- Nginx 日志目录：

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

登录：

```bash
docker login --username=z516798599@qq.com crpi-2iicgf8z27uyvaq1.cn-hangzhou.personal.cr.aliyuncs.com
```

打 tag：

```bash
docker tag [ImageId] crpi-2iicgf8z27uyvaq1.cn-hangzhou.personal.cr.aliyuncs.com/silvericekey/turtle_soup_mystery:[镜像版本号]
```

推送：

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

## 已验证

本地已完成：

- `npm run init:data`
- `npm run build`
- API 烟测：
  - 未登录访问历史接口返回 `401`
  - 管理员登录成功
  - 登录后可访问房间历史接口
  - 登录后可访问系统设置接口

当前环境没有安装 Docker，因此没有办法在这里直接跑 `docker build` / `docker compose up` / `docker push`。
