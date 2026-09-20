# Design and interaction audit

审查范围：`src/App.tsx`、`src/components/*`、`src/styles/globals.css`。
规则：Vercel Web Interface Guidelines，2026-09-20 获取。

- `src/styles/globals.css` - 已修复次要文字和表单辅助文案对比度；补充侧页 overscroll containment、安全区与长文本换行。
- `src/components/BookReveal.tsx` - 已为阅读属性的图形语义提供合法 role 与描述。
- `src/components/TagPicker.tsx` - 输入标签和 name 完整，空值与重复提示可由读屏获知。
- `src/components/BlindBox.tsx` - 提供 44px 触摸目标、按钮/键盘替代，触摸取消回弹。
- `src/App.tsx` - 开盒锁避免重复写入；书架移除可撤销；历史和收藏数据验证后使用。

| Before                         | After                                                                |
| ------------------------------ | -------------------------------------------------------------------- |
| 手机拖动阈值需要手指接近屏幕外 | 触摸 50px，桌面 90px；实际 touchStart / touchMove / touchCancel 验证 |
| 静态包裹与纸签                 | MotionValue 带动封带、纸折角和书本抬升；贴签/揭签 220ms              |
| 单一开盒切换                   | 封带 → 纸张 → 书本 → 内容，1200ms；减少动态时 80ms                   |
| 收藏移除后缺少恢复入口         | 即时撤销入口                                                         |

实际浏览器 + axe：home、tags、result 未发现 WCAG 2 A/AA、2.1 AA 自动规则违规。截图人工检查三个目标尺寸。WebMCP 宿主不可用，不声明其实际集成已验证。
