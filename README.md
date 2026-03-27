# Turtle Soup Mystery

基于 `TURTLE_SOUP_SPEC.md` 全量重建的海龟汤项目。

当前版本是一个前后端一体的 MVP：

- 前端基于 `Vue 3 + Vuetify`，界面组织参考 Berry Free Vuetify Vue Admin Template 的侧边栏 + 顶栏管理台结构
- 后端基于 `Node.js + TypeScript + Express`
- AI 接入走局域网 Ollama
- 会话、配置、历史记录先使用本地 JSON 持久化
- Docker 使用单镜像打包，便于直接推送到阿里云 ACR

## 目录结构

```text
front/                 前端管理台
backend/               后端 API 与静态资源承载
backend/data/puzzles/  固定谜题
backend/data/runtime/  运行时持久化数据
scripts/               初始化与发布脚本
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

初始化运行时数据：

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

## Ollama 配置

进入前端“系统设置”页面后：

1. 填写局域网 Ollama 地址，例如 `http://192.168.1.20:11434`
2. 点击“检测连接并拉取模型”
3. 若连通成功，模型下拉会自动从接口获取
4. 选择默认模型并保存

如果应用跑在 Docker 中而 Ollama 跑在宿主机上，可以尝试：

```text
http://host.docker.internal:11434
```

## 构建

本地构建：

```bash
npm run build
```

这会先构建前端，再把前端产物复制到 `backend/public`，最后构建后端。

## Docker

### 本地构建镜像

```bash
docker build -t turtle-soup-mystery:local .
```

### 本地运行

```bash
docker compose up --build
```

服务默认监听：

```text
http://localhost:8080
```

## 阿里云 ACR 推送教程

你的目标仓库：

```text
crpi-2iicgf8z27uyvaq1.cn-hangzhou.personal.cr.aliyuncs.com/silvericekey/turtle_soup_mystery
```

### 1. 登录仓库

```bash
docker login --username=z516798599@qq.com crpi-2iicgf8z27uyvaq1.cn-hangzhou.personal.cr.aliyuncs.com
```

### 2. 给镜像打 tag

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

第一次执行会把配置保存到：

```text
.deploy/registry.env
```

## 当前 MVP 范围

- 固定谜题加载
- 单人问答
- Ollama 主持判定
- 最终猜测结算
- 会话历史存档
- 系统设置中的连通性检测与模型自动拉取

## 后续可继续做

- 动态提示模式
- 推理进度条更细化
- 多谜题批量管理
- 多人模式
- AI 自动生成谜题
