# Glass Hold’em

一款使用 Vue 3 构建的本地优先德州扑克 PWA。安装后可以断网打开并进行离线练习；朋友聚会时，由一台电脑运行轻量 Node.js 辅助服务，其他设备通过同一个 Wi‑Fi 或热点加入。

> 本项目只使用娱乐筹码，不包含充值、提现、匹配陌生人或任何真实货币功能。

## 已实现

- Vue 3 + TypeScript + Vite，可安装的 PWA，完整静态资源预缓存。
- 电脑、横屏手机、横屏平板响应式牌桌。
- Apple Liquid Glass 风格的大厅、牌桌、设置和规则界面。
- 2–10 人无限注德州扑克：
  - 按钮、小盲、大盲和单挑盲注顺序；
  - 翻牌前、翻牌、转牌、河牌四轮下注；
  - 过牌、下注、跟注、加注、弃牌、全下；
  - 最小完整加注、短码全下、自动跑完公共牌；
  - 主池、多个边池、平分与单枚余筹码分配；
  - 十种牌型与完整踢脚牌比较；
  - 30 秒行动计时，超时自动过牌或弃牌。
- 房主权威状态：牌堆和他人底牌不会广播给客户端；房主断线时自动转移房主权限。
- 加密级随机：
  - 联机服务使用 Node.js `crypto.randomInt()`；
  - 离线练习使用 Web Crypto `crypto.getRandomValues()` 和拒绝采样；
  - 两者都执行无偏 Fisher–Yates 洗牌，代码中不使用 `Math.random()`。
- 头像与名字缓存在当前浏览器。
- 牌面、牌背和筹码主题可预览、校验和切换。
- GitHub Actions 自动执行类型检查、测试、构建和 GitHub Pages 部署。

## 快速开始

需要 Node.js 20 或更高版本。

```powershell
npm install
npm run dev
```

打开终端显示的地址即可开发。完整检查：

```powershell
npm run check
```

## 在局域网创建牌局

纯浏览器 PWA 不能监听局域网端口，因此联机模式需要房主电脑运行本仓库自带的辅助服务。

### 1. 房主构建并启动服务

```powershell
npm ci
npm run build
npm run host
```

终端会列出类似下面的局域网地址并显示二维码：

```text
https://192.168.1.8:4173/
```

服务同时提供：

- 当前构建好的 PWA；
- `/ws` 上的加密 WebSocket 房间服务；
- 权威发牌、行动校验、计时与结算。

### 2. 首次确认本地证书

辅助服务会生成只保存在 `server/.cert/` 的本地自签名证书。每台设备第一次连接时：

1. 使用浏览器打开终端显示的 `https://局域网地址:4173/`；
2. 选择继续访问这个本地地址；
3. 进入应用后输入同一个服务地址。

证书会复用一年；局域网 IP 改变时会自动重新生成，设备需要重新确认一次。

如果旧设备完全不支持本地自签名 HTTPS，可使用：

```powershell
npm run host:http
```

HTTP 模式只适合直接打开房主地址。部署在 GitHub Pages 的 HTTPS 页面不能连接不安全的 `ws://`，而且普通局域网 HTTP 页面不能注册 Service Worker。

### 3. 创建与加入

1. 房主选择“创建牌局”，填写筹码和盲注，连接服务并创建；
2. 把服务地址和六位房间码发给朋友；
3. 玩家选择“加入牌局”，输入相同服务地址与房间码；
4. 两人或以上入座后，房主可以发第一手牌。

所有设备必须连接同一 Wi‑Fi 或热点。操作数据只在局域网中传输。

## 离线安装

1. 在 GitHub Pages 或 HTTPS 本地服务中成功打开应用一次；
2. 使用浏览器的“安装应用”或“添加到主屏幕”；
3. 等待页面加载完成后即可断网启动。

离线状态下可以查看规则、修改本机资料与素材设置，并使用“离线练习”。局域网多人模式仍然需要房主辅助服务正在运行，但不需要访问互联网。

## 部署到 GitHub Pages

工作流位于 [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)，会在推送到 `main` 时：

1. `npm ci`；
2. 类型检查与单元测试；
3. 生成 `dist/` PWA；
4. 上传 Pages artifact；
5. 部署到 `github-pages` 环境。

仓库首次部署前，在 GitHub 中进入：

`Settings → Pages → Build and deployment → Source → GitHub Actions`

随后推送到 `main`，或在 Actions 页面手动运行工作流。Vite 使用相对资源基址，因此同时兼容用户站点和 `用户名.github.io/仓库名/` 形式的项目站点。

## 替换牌面、牌背与筹码

主题清单位于 [`public/assets/themes.json`](public/assets/themes.json)。默认素材保存在各自的 `default/` 目录；自定义主题建议使用 `1/`、`2/`、`3/`……命名。

### 扑克牌牌面

创建目录：

```text
public/assets/cards/1/
```

必须包含 52 个 SVG 文件，命名规则是：

```text
S-A.svg  S-2.svg ... S-10.svg S-J.svg S-Q.svg S-K.svg
H-A.svg  ...
D-A.svg  ...
C-A.svg  ...
```

花色代码：

- `S`：黑桃
- `H`：红心
- `D`：方块
- `C`：梅花

建议要求：

- 比例统一为 `2.5 / 3.5`；
- 每张小于 150 KB；
- 文件内不要包含远程图片、脚本、字体下载或追踪链接；
- 四角留白一致，缩小到横屏手机后仍能读清点数和花色；
- 使用前确认素材允许再分发，推荐 CC0/public domain。

复制 `default/manifest.json` 到新目录并修改名称、来源与许可证。然后在 `themes.json` 的 `cards` 数组添加：

```json
{
  "id": "1",
  "name": "我的牌面",
  "path": "assets/cards/1",
  "license": "CC0-1.0",
  "source": "https://素材来源页面"
}
```

设置页会请求并校验全部 52 张牌。缺少或为空的文件会显示红色错误，主题不会被正常选用；点击“预览”可以在保存前查看完整牌组。

### 牌背

创建：

```text
public/assets/card-backs/1/back.svg
public/assets/card-backs/1/manifest.json
```

`back.svg` 应与牌面使用相同比例，不得透露牌面信息。然后在 `themes.json` 的 `backs` 数组登记路径。设置页会在切换前加载并校验文件。

### 筹码

创建：

```text
public/assets/chips/1/chips.svg
public/assets/chips/1/manifest.json
```

筹码素材用于底池和设置预览。建议提供透明背景、水平构图、清晰的常用面额，并避免真实赌场商标。然后在 `themes.json` 的 `chips` 数组登记。

### 错误处理

- 主题清单无法读取：设置页保留当前已缓存主题；
- 文件缺失或为空：显示“缺少 文件名”；
- 52 张牌未全部通过：主题标记为无效；
- 预览不会立即保存，只有点击“保存设置”才写入当前浏览器。

## 规则实现说明

应用内“规则”页面包含完整的流程、行动、牌型、边池和单挑规则。实现参考：

- [PokerStars — Poker Rules](https://www.pokerstars.com/poker/games/rules/)
- [PokerStars Learn — Texas Hold’em Rules](https://www.pokerstars.com/poker/learn/lesson/texas-holdem-rules/)

牌局状态机位于 [`src/game/engine.ts`](src/game/engine.ts)，牌型比较器位于 [`src/game/evaluator.ts`](src/game/evaluator.ts)。相关单元测试覆盖牌型顺序、A‑2‑3‑4‑5 顺子、底牌隐藏、单挑盲注、弃牌结算、边池守恒和最小加注。

## 素材来源与许可

- 默认牌面与牌背：[letele/playing-cards](https://github.com/letele/playing-cards)，CC0‑1.0；其牌面改编自 public-domain `vector-playing-cards`。
- 默认筹码：[OpenGameArt — Poker Chips](https://opengameart.org/content/poker-chips-0)，作者 looneybits，CC0。
- 视觉效果参考：[LGGC-liquid-glass](https://github.com/u7663394/LGGC-liquid-glass)，MIT；项目通过 npm 使用其 CSS，并在此基础上实现自己的设计系统。
- PWA 图标与界面视觉为本项目生成并使用的原创素材。

各素材目录内保留了许可证或来源说明。

## 项目结构

```text
src/
  components/       通用界面组件
  game/             规则引擎、牌型计算、加密随机工具
  services/         WebSocket、素材校验、本机缓存
  views/            大厅、牌桌、设置、规则
server/
  index.ts          HTTPS/WSS 本地房主辅助服务
public/assets/      可替换的牌面、牌背、筹码主题
tests/              规则引擎单元测试
.github/workflows/  GitHub Pages 自动部署
```

## 常用命令

```powershell
npm run dev          # 开发服务器
npm run typecheck    # TypeScript / Vue 类型检查
npm test             # 单元测试
npm run build        # 生产 PWA
npm run preview      # 预览静态构建
npm run host         # HTTPS/WSS 局域网房主服务
npm run host:http    # HTTP/WS 兼容模式
npm run check        # 类型检查 + 测试 + 构建
```

## License

应用源代码采用 [MIT License](LICENSE)。第三方素材仍按各自目录内的许可证与来源说明使用。
