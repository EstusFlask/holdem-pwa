# Glass Hold’em

使用 Vue 3 构建的本地优先德州扑克 PWA。安装并缓存完成后，可以在没有互联网的情况下打开应用、离线练习，并通过二维码与同一 Wi‑Fi 或热点内的朋友建立 WebRTC 点对点牌局。

> 仅使用娱乐筹码，不包含充值、提现、陌生人匹配或任何真实货币功能。

## 特性

- 纯 Vue 3 + TypeScript + Vite PWA；运行和联机均不需要 Node.js 服务器。
- 电脑、横屏手机和横屏平板响应式牌桌。
- Apple Liquid Glass 风格的大厅、二维码配对、牌桌、设置和规则界面。
- 离线二维码信令：
  - 房主生成一次性 WebRTC 邀请二维码；
  - 玩家扫描邀请并生成应答二维码；
  - 房主回扫应答后，双方直接建立 `RTCDataChannel`；
  - 支持摄像头、二维码图片和复制/粘贴配对码三种交换方式。
- 2–10 人无限注德州扑克：
  - 按钮、小盲、大盲与单挑盲注顺序；
  - 翻牌前、翻牌、转牌、河牌四轮下注；
  - 过牌、下注、跟注、加注、弃牌、全下；
  - 最小完整加注、短码全下与重新开放加注规则；
  - 主池、多个边池、平分及单枚余筹码分配；
  - 十种牌型与完整踢脚牌比较；
  - 30 秒行动计时，超时自动过牌或弃牌。
- 房主浏览器保存权威牌局状态；客户端只收到自己的底牌。
- 全部洗牌使用 Web Crypto `crypto.getRandomValues()`、拒绝采样和无偏 Fisher–Yates，不使用 `Math.random()`。
- 头像、名字、主题与辅助设置缓存在当前设备。
- 牌面、牌背和筹码主题可预览、校验与切换。
- GitHub Actions 自动检查并部署到 GitHub Pages。

## 玩家使用方法

### 第一次安装

1. 用浏览器打开 GitHub Pages 部署地址；
2. 等待页面完整加载；
3. 使用浏览器的“安装应用”或“添加到主屏幕”；
4. 每台参与设备至少在线打开一次，以缓存完整 PWA。

完成后可以关闭互联网。多人设备只需连接同一个 Wi‑Fi 或由其中一台设备创建的热点。

### 房主创建牌局

1. 在大厅选择“创建牌局”，设置名称、筹码和盲注；
2. 点击“创建离线牌局”；
3. 页面会显示一次性邀请二维码；
4. 让一名玩家扫描邀请；
5. 玩家设备会显示应答二维码，房主点击“扫描玩家应答”并回扫；
6. 显示“连接成功”后，可继续为下一名玩家生成新邀请。

每名玩家都需要单独完成一次双向扫码。房主无需输入 IP 地址，也不需要启动终端或 Node 服务。

### 玩家加入

1. 在大厅选择“加入牌局”；
2. 点击“开始扫码配对”；
3. 扫描房主邀请二维码；
4. 把生成的应答二维码展示给房主；
5. 房主回扫后自动进入牌桌。

摄像头不可用时，可以：

- 截图或保存二维码后选择“选择二维码图片”；
- 展开“文本配对码”，通过附近分享或聊天复制给另一台设备，再粘贴读取。

### 联机限制

- 两台设备必须位于可以互相访问的同一本地网络；启用了客户端隔离的公共 Wi‑Fi 可能阻止直连。
- 不配置公网 STUN/TURN 或信令服务器，因此设计目标是同一 Wi‑Fi/热点，而不是互联网远程联机。
- 房主页面负责发牌、校验、计时和结算。房主关闭应用、系统冻结后台页面或离开牌桌会结束当前联机。
- 二维码含本次 WebRTC SDP 与局域网 ICE 候选信息，只应展示给同桌玩家；邀请为一次性使用。
- WebRTC 数据通道由浏览器使用 DTLS/SCTP 加密。

## 开发

开发或自行构建需要 Node.js 24：

```powershell
npm ci
npm run dev
```

开发服务器仅用于编译和预览，不参与实际牌局联机。完整检查：

```powershell
npm run check
```

## GitHub Pages 部署

工作流位于 [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)，推送到 `main` 后会：

1. `npm ci`；
2. 类型检查与单元测试；
3. 构建完整 PWA；
4. 上传 Pages artifact；
5. 部署到 `github-pages` 环境。

仓库第一次部署前，在 GitHub 中进入：

`Settings → Pages → Build and deployment → Source → GitHub Actions`

Vite 使用相对资源基址，同时兼容用户站点和 `用户名.github.io/仓库名/` 项目站点。

## 替换牌面、牌背与筹码

主题清单位于 [`public/assets/themes.json`](public/assets/themes.json)。默认素材位于各自的 `default/` 目录；自定义主题建议使用 `1/`、`2/`、`3/`……命名。

### 扑克牌牌面

创建：

```text
public/assets/cards/1/
```

目录必须包含 52 个 SVG：

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

素材要求：

- 建议比例 `2.5 / 3.5`，四角留白一致；
- 每张建议小于 150 KB；
- 不得包含远程图片、脚本、字体下载或追踪链接；
- 缩小到横屏手机后仍能识别点数与花色；
- 使用前确认允许再分发，推荐 CC0/public domain。

复制 `default/manifest.json` 到新目录并修改名称、来源与许可证，然后在 `themes.json` 的 `cards` 数组添加：

```json
{
  "id": "1",
  "name": "我的牌面",
  "path": "assets/cards/1",
  "license": "CC0-1.0",
  "source": "https://素材来源页面"
}
```

设置页会加载并校验全部 52 张牌。文件缺失或为空时显示红色错误，完整通过后才能安全选用；“预览”可在保存前查看完整牌组。

### 牌背

创建：

```text
public/assets/card-backs/1/back.svg
public/assets/card-backs/1/manifest.json
```

`back.svg` 应与牌面比例一致，不得泄露牌面信息。随后在 `themes.json` 的 `backs` 数组登记目录。

### 筹码

创建：

```text
public/assets/chips/1/chips.svg
public/assets/chips/1/manifest.json
```

建议提供透明背景、水平构图和清晰面额，避免真实赌场商标。随后在 `themes.json` 的 `chips` 数组登记目录。

### 主题错误处理

- 主题清单无法读取：保留当前已缓存主题；
- 文件缺失或为空：显示缺失文件名；
- 52 张牌未全部通过：主题标记为无效；
- 预览不保存更改，只有点击“保存设置”才写入当前浏览器。

## 技术架构

```text
房主 PWA
  ├─ 权威规则引擎与加密洗牌
  ├─ 每位玩家一个 RTCPeerConnection
  └─ 按玩家裁剪公开状态
       │
       ├── 加密 RTCDataChannel ── 玩家 A
       ├── 加密 RTCDataChannel ── 玩家 B
       └── 加密 RTCDataChannel ── 玩家 C
```

二维码只是离线交换 WebRTC offer/answer。建立连接后，二维码不再参与牌局通信。为了适应二维码容量，SDP 使用 DEFLATE 压缩和 Base64URL 编码。

规则状态机位于 [`src/game/engine.ts`](src/game/engine.ts)，牌型比较器位于 [`src/game/evaluator.ts`](src/game/evaluator.ts)，WebRTC 房间位于 [`src/services/webrtc.ts`](src/services/webrtc.ts)。测试覆盖牌型顺序、A‑2‑3‑4‑5 顺子、底牌隐藏、单挑盲注、弃牌结算、边池守恒、最小加注、短码全下不重新开放加注，以及配对码压缩与损坏检测。

## 素材与许可

- 默认牌面与牌背：[letele/playing-cards](https://github.com/letele/playing-cards)，CC0‑1.0。
- 默认筹码：[OpenGameArt — Poker Chips](https://opengameart.org/content/poker-chips-0)，CC0 衍生素材。
- Liquid Glass 参考：[LGGC-liquid-glass](https://github.com/u7663394/LGGC-liquid-glass)，MIT。
- 二维码识别：[ZXing for JS browser layer](https://github.com/zxing-js/browser)，MIT。
- PWA 图标与界面视觉为本项目生成的原创素材。

## 项目结构

```text
src/
  components/       通用界面与二维码配对组件
  game/             规则引擎、牌型计算、加密随机
  services/         WebRTC 房间、素材校验、本机缓存
  views/            大厅、牌桌、设置、规则
public/assets/      可替换的牌面、牌背、筹码主题
tests/              规则、随机与配对码测试
.github/workflows/  GitHub Pages 自动部署
```

## 常用命令

```powershell
npm run dev          # 开发服务器
npm run typecheck    # TypeScript / Vue 类型检查
npm test             # 单元测试
npm run build        # 生产 PWA
npm run preview      # 预览静态构建
npm run check        # 类型检查 + 测试 + 构建
```

## License

应用源代码采用 [MIT License](LICENSE)。第三方素材仍按各自目录中的许可证与来源说明使用。
