# 页间 · 项目交付文档

交付日期：2026-09-20。本文描述当前阅读盲盒；衍生产品设计另见 [VARIANTS.md](VARIANTS.md)。

## 1. 交付内容与状态

- 线上通用版：https://between-pages-reading-wj.fumika981117.chatgpt.site
- 当前项目是 React + TypeScript + Vite 前端，配套 Node 开发接口、Cloudflare Workers 兼容生产接口及 D1 数据库。
- GitHub 私有模板仓库：https://github.com/10878749/between-pages
- Git 保留开发、初次部署和中断恢复修复历史；GitHub 保存源码及文档。GitHub 上传不会自动更新线上站点。
- 交付前最近一次功能验证：85 项自动测试通过，构建、lint 通过；覆盖预算、退款、模型切换、数据质量、Worker/D1 和中断恢复。
- 上次线上诊断确认抽书请求取消后遗留全站锁。修复已发布；命令行线上抽取复测被站点防护返回 403，因此不将它记作真实外部书库抽取验收通过。
- 当前不是已完成抽象的多品类框架。电影、艺术品需要独立适配，不能只换标题和颜色。

## 2. 产品规则

| 项目 | 当前规则 |
| --- | --- |
| 推敲选书 | 每位浏览器访客每 8 小时 5 次；北京时间 00:00、08:00、16:00 重置，不累积 |
| 随手抽书 | 不调用模型，不扣推敲次数；仍经过书目资料准入和防刷限制 |
| 轻量补全 | 用户主动点击后可消耗一次推敲机会；成功解锁后重复查看不重复扣费 |
| 免费模型 | 北京地域 qwen-flash → qwen-flash-2025-07-28；仅这两个已批准版本 |
| 免费额度耗尽 | 记录 FreeTierOnly 结果，停用该模型；两者都停用后保留轻量版 |
| 全站预算 | 不设置每日 Token 或总调用数上限 |
| 并发与防刷 | 生产环境同时处理一个抽书或详情写任务；同 IP 每分钟 30 次非进度接口请求 |
| 私用版 | 本地独立口令、存储和端口；生产接口没有解锁入口，不接受无限版参数 |

访客身份由签名 Cookie 标识，并非登录账号。清除 Cookie 或换设备会成为新访客；IP 限制只能抑制高频访问，不能保证“一自然人一个额度”。收藏、历史仍是浏览器本地数据，没有跨设备同步。

“免费额度用完即停”必须分别在百炼控制台开启；本项目中的确认变量只是配置记录，不能代替服务商的计费开关。私用版无限仅代表应用次数不限，仍消耗服务商额度。

## 3. 从新电脑运行

建议使用 Node.js 22、npm 和 Git。首次执行：

```sh
git clone https://github.com/10878749/between-pages.git
cd between-pages
npm ci
```

将 `.env.example` 复制为 `.env.local`，填写服务端配置，然后：

```sh
npm run dev
# 私用测试入口，首次口令由本地程序生成
npm run dev:play
```

普通版默认 `http://127.0.0.1:5173/`，私用版使用 5174。私用口令在本机 `.local-data/play-access.txt`。手机测试时使用同一局域网并让开发服务器监听 `0.0.0.0`；本机防火墙须允许该端口。不要把私用入口暴露到公网。

### 配置说明

| 变量 | 用途 |
| --- | --- |
| MODEL_PROVIDER | 本地开发选 bailian 或 bigmodel；生产 Worker 固定使用百炼白名单 |
| DASHSCOPE_API_KEY | 百炼服务端密钥，不可使用 VITE_ 前缀 |
| BAILIAN_FREE_QUOTA_CONFIRMED | 主版本已开启免费额度用完即停后设为 true |
| BAILIAN_FALLBACK_FREE_QUOTA_CONFIRMED | 备用版本也已开启上述开关后设为 true |
| BIGMODEL_API_KEY | 本地旧智谱兼容入口的密钥，生产版不读取 |
| LIBRARY_PROXY_URL | 仅本地外部书库代理；生产 Worker 直接访问书库，不使用本机代理 |

空密钥可运行界面与轻量流程，推敲不可用。首次轻量抽书仍需要外部网络，不是完全离线应用。

## 4. 代码入口

| 路径 | 职责 |
| --- | --- |
| src/App.tsx | 场景编排、客户端状态、选牌与准备抽取、历史收藏 |
| src/components/ClueScene.tsx | 主题牌组、选牌归拢、收牌换手 |
| src/components/ParcelScene.tsx | 找书状态、封条短滑、连续拆封动画 |
| src/components/ReadingScene.tsx | 封面、详情、推敲补全和外部跳转 |
| src/components/QuotaNotice.tsx | 服务端次数与重置时间展示 |
| src/styles/globals.css | 酒红/石灰白视觉、响应式布局和间距 |
| src/data/types.ts | Book、Selection、Draw 等业务数据结构 |
| src/lib/providers/ | 外部书库发现、解析、准入、编码和搜索链接 |
| server/api.ts | 会话、抽取、资料补全、身份校验、退款和幂等 |
| server/selection.ts | 合格候选整理、推敲排序与结果验证 |
| server/details.ts | 来源证据、模板提示词、结构验证、有限修复重试 |
| server/model.ts | 白名单、超时、重试、免费额度失效与备用模型 |
| server/store.ts | 本地状态和配额规则 |
| server/cloud.ts / database.ts | 生产请求入口、D1 持久化、全站租约 |
| server/task.ts | 请求级取消信号，避免任务超时后继续发出外部调用 |
| db/schema.ts / drizzle/ | 数据库定义与已生成迁移 |
| scripts/build-cloud.mjs | 生成生产 Worker 和前端静态资源 |

## 5. 数据流与接口

选牌 → 服务端预留机会 → 外部召回 → 资料准入 → 推敲排序或轻量随机 → 保存结果 → 用户拆封 → 资料详情。

Open Library 是主书库，Google Books 是备用。它们的中文覆盖率、响应速度和资料质量会影响结果。候选至少有可用简介，专业资料默认过滤。模型不能凭空造一本不存在的书；从候选 ID 中选书，介绍依据来源资料生成并校验引用。该验证不能等同完整的人工事实审校。

| 接口 | 用途 |
| --- | --- |
| GET /api/session | 建立 Cookie 会话、读取额度与最近结果、推敲可用状态 |
| POST /api/draw | 按 UUID 和线索抽取；重复请求不重复扣费 |
| POST /api/progress | 查询这次抽取阶段 |
| POST /api/details | 查看、生成或主动补全介绍 |
| POST /api/unlock | 仅本地私用服务存在；生产明确返回 404 |

POST 需同源及 `X-Page-Request: 1`。不要绕过服务端直接在浏览器调用模型；前端显示的次数不是权威预算。

生产 D1 的 `control` 保存签名密钥、租约和失效模型列表；`entries` 保存业务状态；`rate_limits` 保存短期防刷计数。密钥、Cookie、完整用户状态不要写入诊断日志或文档。

## 6. 部署、备份与回退

```sh
npm run build
npm run lint
npm test
```

先构建再测试：Worker 集成测试读取 `dist/server/index.js`。GitHub Actions 采用同一顺序，不需要真实模型密钥，也不执行消耗额度的模型请求。

当前部署使用 Sites：保留本项目 `.openai/hosting.json` 的 project_id；设置服务端环境变量；将确切源码上传到 Sites 专属仓库，打包 `dist/client`、`dist/server`、`dist/.openai`，保存版本后部署。GitHub `origin` 与 Sites 的源码远端是两个不同目的地。不要把单独的前端静态文件当成完整应用部署。

数据库结构变化：修改 `db/schema.ts` → `npm run db:generate` → 检查生成 SQL → 迁移连同代码一起发布。已经上线的迁移和元数据不可重写，应追加迁移。源码回退不会回退 D1 数据，需检查新旧版本的数据库兼容性。

GitHub 只备份源码；不包含 `.env.local`、`.local-data`、D1 数据或个人收藏。需要另外保管服务商账号和密钥，在托管平台导出/备份数据库；浏览器本地收藏需要另行迁移方案。

## 7. 排障与已知边界

- 持续“有人正在推敲”：先查 `/api/draw` 的取消/超时日志及租约。现为 30 秒锁、10 秒续期，只有活跃任务可续期；整项任务最长 75 秒，`waitUntil` 保护清理。过期待完成记录不占用额度，旧请求不能覆盖新请求。
- 没有介绍：区分书库资料不足、模型超时、额度耗尽和结构校验失败。查服务端错误码，避免单纯放宽资料准入或让模型编造作者经历。
- 免费版仍报错：轻量版不调用模型，但仍依赖外部书库网络和合格候选，失败并不一定由模型造成。
- 新增可用模型：需测试中文质量、证据引用、JSON、延迟和免费配额，再加入明确白名单；不能把控制台列出的所有模型直接轮换。
- 当前全站串行写任务、读取状态集合的方式适合小规模试用，不适合高并发。下一步应分离用户预算与共享书库、使用任务队列和独立并发名额，而不是简单取消锁。
- 缺少账号体系、管理界面、跨设备收藏、正式运营监控；没有完整生产压测。
- 页面中的封面是排版生成的设计，不代表出版商原版封面；搜索入口不保证可免费阅读。

## 8. 下一位开发者的第一步

先运行构建与测试，再读 `server/api.ts` 和对应测试；修改交互前看三幕组件与 `tests/motion-flow.mjs`。修改预算、退款、并发或模型路由时必须增加对应回归测试。新建电影/艺术品项目时遵循扩展指南，不要复用阅读站点的部署 ID、数据库和密钥。
