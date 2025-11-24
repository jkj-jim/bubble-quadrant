# 多维表格仪表盘气泡图插件

一个功能完善的飞书多维表格仪表盘插件，支持将数据可视化为气泡图/散点图。

## 核心功能

- **灵活的数据映射**：支持数值字段、公式字段、单选字段作为坐标轴
- **混合轴模式**：支持数值轴、类目轴及其任意组合（散点图、气泡图）
- **视觉增强**：多彩模式、气泡名称标签、Hover 高亮效果
- **数据范围**：可选择特定视图或全部数据进行展示
- **主题适配**：完美支持飞书浅色/深色模式
- **国际化**：支持中文、English、日本語

## 技术栈

- React 18 + TypeScript
- Vite
- ECharts（图表渲染）
- Semi UI（飞书官方组件）
- @lark-base-open/js-sdk

## 快速开始

```bash
# 安装依赖
npm install

# 本地开发
npm run dev

# 构建
npm run build
```

## 开发说明

插件遵循飞书仪表盘插件开发规范，核心文件：

- `src/App.tsx` - 主应用组件与配置面板
- `src/components/BubbleChart.tsx` - ECharts 图表封装
- `src/hooks/useData3.ts` - 数据获取与处理
- `src/hooks/useDashboard.ts` - 仪表盘状态管理
