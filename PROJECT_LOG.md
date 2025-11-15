# 飞书气泡图插件 - 项目日志

## 项目概述
为飞书多维表格开发一个仪表盘插件，实现可配置的气泡图，支持用户选择数据源、横轴、纵轴、气泡大小和气泡名称字段。

## 当前状态（2025-11-15）

### 🎉 已完成
- [x] 基础项目架构搭建（React + TypeScript + Vite）
- [x] 集成飞书官方 UI 组件（@douyinfe/semi-ui）
- [x] 集成 ECharts 实现气泡图渲染
- [x] 完成数据源和字段选择器 UI
- [x] 实现数据获取逻辑（`getData`/`getPreviewData`）
- [x] 配置保存和加载功能（`saveConfig`/`getConfig`）
- [x] 视图模式切换（`config`/`view`）及实时预览
- [x] 修复数据同步问题（config → view 模式切换后自动刷新）
- [x] 优化用户体验（移除欢迎页面，与官方插件行为一致）

### 🔍 关键问题解决

#### 1. 数据同步问题（2025-11-13）

**问题**：config 模式保存配置后，view 模式显示旧数据，需手动刷新。

**根源**：`saveConfig()` 触发 `onDataChange` 事件，竞态条件导致旧配置覆盖新配置。

**方案**：重构数据流，采用 `onDataChange` → `getConfig()` 权威模式
- 事件处理上移至 App.tsx
- 将事件作为变更通知，而非数据源
- 重新获取权威配置并更新 state
- 通过 React 标准数据流驱动更新

**结果**：彻底消除竞态条件，确保数据可预测。详见 `FEISHU_DASHBOARD_TIPS.md`。

#### 2. 用户体验优化（2025-11-15）

**问题**：添加插件时显示欢迎页面，需点击「配置图表」才能进入配置界面，与官方行为不一致。

**方案**：
- 在 `useDashboard` 中添加 `isConfig`（`state === 'config' || state === 'create'`）
- 删除欢迎页面逻辑，统一使用 `isConfig` 判断配置界面
- 配置加载使用 `state !== 'create'`（而非 `!isConfig`）确保从 view 切换时正确加载配置

**结果**：
- ✅ 点击「添加插件」直接进入配置界面
- ✅ 从 view → config 正确加载已保存配置
- ✅ 与官方插件行为保持一致

**关键细节**：配置加载必须用 `state !== 'create'` 而不是 `!isConfig`，否则会跳过 `config` 状态的加载（已于 FEISHU_DASHBOARD_TIPS.md 中记录）


## 技术栈
- 框架：React 18 + TypeScript
- 构建：Vite
- SDK：@lark-base-open/js-sdk（飞书开放能力）
- UI：@douyinfe/semi-ui（飞书官方组件）
- 图表：ECharts

## 核心文件
- `src/App.tsx` - 主应用组件
- `src/components/BubbleChart.tsx` - 气泡图组件
- `src/hooks/useData3.ts` - 数据获取和处理逻辑
- `src/hooks/useDashboard.ts` - 仪表盘状态管理
- `src/hooks/useTables.ts` - 数据表管理
- `src/hooks/useFields.ts` - 字段管理

