# 页间 / Between Pages

一个可独立运行的中文阅读盲盒 Web App。React 19 + Vite + TypeScript + Motion + Lucide，纯前端，本地书库，不需要 AI API 或账号。

## 运行

建议 Node.js 22 LTS。

```sh
npm install
npm run dev
```

访问终端显示的地址（默认 http://127.0.0.1:5173）。

```sh
npm run build
npm run typecheck
npm run lint
npm test
```

构建输出在 `dist/`，可部署到静态托管平台。

## 已实现

- 118 个预设纸签、7 个分类、16 型 MBTI 可选纸签、别名搜索、自由输入、贴签/揭签。
- 鼠标和真实触摸拖动拆封、阈值回弹、取消恢复、按钮和 Enter / Space 开盒。
- 约 1.2 秒的封带拉开 → 包装展开 → 书本浮起 → 结果显现；减少动态效果时缩短为淡入。
- 36 本书、32 位独立作者；统一排印封面、原创短简介、相遇理由、主观阅读属性。
- 可播种随机、偏好评分、意外探索、最近 8 本避重、最多 20 条历史、收藏与撤销移除。
- 书架/历史保存在当前浏览器 localStorage；禁用或损坏时退回内存，正常阅读不中断。
- 合法平台搜索、可选 Google Books / Open Library 在线增强、4 秒超时、15 分钟内存缓存。
- 390×844、768×1024、1440×900 响应式布局、原生 dialog 焦点管理、可访问名称与 reduced motion。

## 视觉与交互

像黄昏书房里一册尚未拆封的书。暖白 `#f7f5ef`、墨绿 `#294b3e`、浅雾绿纸包装，宋体标题与清晰的无衬线 UI。留白围绕包裹展开，不采用卡片墙。封面均为本站的排印设计，不代表出版实物。

拖动通过 MotionValue 更新，不在 pointermove 中触发 React 状态渲染。桌面阈值 90px，触摸阈值 50px，避免手机手指必须拖出屏幕。未过阈值用低回弹弹簧复位。状态机限定 idle → selecting/ready → dragging → opening → revealed → closing → ready，锁定开盒期间的重复点击。计时器在卸载时清理。

## 标签与推荐

`LocalTagInterpreter` 保留 `originalText`，内部做 NFKC、大小写、标点和空白归一化；按完整词、别名、关键词、双字相似度寻找标签，最后可用书籍 semanticTags 补充。包含简单否定处理，例如「海边但不是治愈系」不映射为治愈。它不是完整自然语言理解；未知表述保留原话并明确提示，抽书仍可继续。`RemoteTagInterpreter` 预留明确启用的远程适配器，失败回退本地。

即时状态权重 5，阅读需求/状态 4，氛围/类型 3，主题 2，人格权重 0.15。人格标签目前没有武断的书籍映射，所以只保留用户表达，不建立固定人格书单。后续纸签按位置递减权重，自定义映射结合置信度。

有可用匹配时约 70% 从高匹配候选池加权抽取，30% 探索整个可用池；无标签、未知标签或匹配书已被最近记录耗尽时扩大探索。不是每连续 10 次一定 7 次匹配。先排除最近 8 本；小型书库耗尽时放宽到仅排除上一本。测试使用 seedable PRNG，正式体验使用系统随机源。

## 书籍、作者和渠道

Book 保留 ISBN、版本、年份、页数等可选字段，本次无法确认的版本字段均省略。Author 以 `authorId` 独立引用。内容为原创短概括，不抓取出版社宣传文或豆瓣书评；阅读属性是编辑主观感受，不是书籍评分。

统一 `BookProvider.lookup(book)` 返回 `BookAvailability[]`：优先经过时间检查的已验证链接，然后并发请求 Google Books 与 Open Library，最后保留平台搜索。动态结果要求 ISBN 或书名+作者身份匹配，且服务明确返回阅读、试读或借阅权限；外部 URL 受协议和域名白名单约束。不会凭搜索命中宣称某书可读。中文平台默认提供微信读书、当当、京东的官方搜索，不推断库存、价格或版权。动态结果标记 `checkedAt`、可取得的 `region`，不永久缓存。

协议参考：[Google Books Volumes](https://developers.google.com/books/docs/v1/reference/volumes)、[Open Library Search API](https://openlibrary.org/dev/docs/api/search)。实测 Google Books 返回过 429，Open Library 返回 200；无匹配时正常展示搜索入口。成功试读/借阅分支用可控响应测试验证，不能把测试响应当作真实在售或可读证明。

## 文件结构

```text
src/
  App.tsx                    状态机、历史、收藏与页面切换
  components/
    TagPicker.tsx            推荐标签、分类、搜索、自定义纸签
    BlindBox.tsx             拖动纸带、包装、贴签和拆封
    BookCover.tsx            排印封面
    BookReveal.tsx           相遇理由、简介、作者和属性
    AvailabilitySection.tsx  渠道入口与降级提示
    Sheet.tsx                原生 dialog 侧页
  data/
    types.ts                 Book / Author / Tag / Draw 等模型
    books.ts                 36 本书的原创概括
    authors.ts               32 位作者的独立资料
    tags.ts                  118 个预设与别名
    editorial.ts             与书籍简介分开的推荐文案
    originalTitles.ts        外部查询所用的原书名
  lib/
    recommendation/          权重、随机、解释器和抽书引擎
    providers/               Google Books、Open Library、搜索与缓存
    core.test.ts             核心算法与渠道测试
  hooks/                     安全本地存储、可选 WebMCP 只读工具
  styles/globals.css         纸张视觉、响应式、动效与可访问性
 tests/                      浏览器验收和无障碍脚本
 artifacts/                  实际浏览器截图（不进入生产包）
```

## 验证

- build、typecheck、lint、9 项核心测试。
- 实际 Edge 浏览器：三个目标尺寸、别名搜索、自定义标签、未知标签、超过 5 张标签、删除纸签、0 标签开盒。
- 鼠标拖动不足回弹、成功拖动；CDP 真实触摸事件完成拖动与取消；键盘开盒。
- 收藏刷新恢复、历史恢复、近期去重、localStorage 禁用、连续点击、API 离线与真实在线失败降级。
- axe WCAG 2 A/AA / 2.1 AA：首页、标签侧页和结果页自动检查无违规；仍不能替代全套读屏人工测试。
- 浏览器不支持 `document.modelContext`，WebMCP 实际宿主验证不可用；功能检测后保持无副作用。提供两个只读工具，读取当前阅读状态和可选标签；不暴露未拆封书名。

浏览器测试需要本机 Edge，并先启动 `npm run dev -- --port 5173`：

```sh
node tests/browser.mjs
node tests/edge-cases.mjs
node tests/accessibility.mjs
```

## 使用的 skills

已按请求安装并读取：

- frontend-design：Anthropic 官方 skills 仓库；用于明确纸张与文学杂志方向。
- web-animation-design：Vercel Labs open-agents；用于弹簧、可中断拖动、进出场和 reduced motion。
- web-design-guidelines：Vercel Labs agent-skills；使用最新 Web Interface Guidelines 审查并修正对比度、ARIA、输入名称、焦点、溢出和侧页滚动。

另使用 skill-installer 安装以上技能，Sites building/hosting 处理预览与托管流程。

## 下一轮最值得精修

1. 更多人工整理的中文版本与正版直达链接，逐条记录版本、版权地区和核验时间。
2. 扩展本地语义词典和否定范围，加入复杂中文偏好回归样例；保持未知表达的诚实降级。
3. 在 iOS Safari 与实际 Android 设备上打磨纸签揭角、触摸阈值和纸张张力，并做读屏人工测试。
