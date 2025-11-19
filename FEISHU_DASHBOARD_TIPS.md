# 飞书仪表盘插件开发 - 经验总结

> 总结开发飞书多维表格仪表盘插件过程中的踩坑点和验证有效的实践
> 更新日期：2025-11-13

## 🚀 两种核心开发模式

飞书仪表盘插件存在两种核心的数据处理模式，理解它们的区别至关重要，因为它们的最佳实践完全不同。

### 模式 A：后端计算模式

- **工作方式**：在 `dashboard.saveConfig` 时提供 `dataConditions`，由飞书后端完成数据聚合（如求和、计数）。
- **数据来源**：通过 `dashboard.getData()` 或 `onDataChange` 的 `event.data` 获取**已计算好的结果**。
- **优点**：简单、快速，无需在前端编写复杂计算逻辑。
- **缺点**：灵活性有限，仅支持飞书提供的聚合能力。

#### 模式 A 最佳实践

1.  **直接使用 `event.data`**：在 `onDataChange` 回调中，`event.data` 就是最新的计算结果，应该直接使用它来渲染图表。
2.  **避免调用 `getData()`**：在 `onDataChange` 回调中再次调用 `dashboard.getData()` 可能会因为缓存问题拿到旧数据。

```typescript
// 模式 A: 后端计算
useEffect(() => {
  const unsubscribe = dashboard.onDataChange((event) => {
    // event.data 是飞书后端计算好的结果，直接使用
    const backendCalculatedData = event.data;
    renderChart(backendCalculatedData);
  });
  return () => unsubscribe();
}, []);
```

---

### 模式 B：前端计算模式

- **工作方式**：插件通过 `table.getRecords({})` 获取**原始数据**，然后在前端的 JavaScript 代码中自行实现分组、聚合等所有计算逻辑。
- **数据来源**：插件获取的是原始数据，需要自行处理。
- **优点**：灵活性极高，可以实现任意复杂的计算和数据转换。
- **缺点**：需要在前端编写更多代码，对大数据量的处理需要注意性能。

#### 模式 B 最佳实践 (我们当前项目的模式)

1.  **将 `onDataChange` 作为通知**：`onDataChange` 事件只作为一个“数据已变更”的信号，**应忽略其 `event.data` 参数**。
2.  **重新获取配置**：在 `onDataChange` 回调中，应通过 `await dashboard.getConfig()` 从服务器获取最新的配置。
3.  **状态驱动更新**：用获取到的新配置去更新组件的顶层 State (`setConfig`)。
4.  **触发前端计算**：`config` State 的变化会驱动 `useData` 等 hooks 重新执行，运行我们自定义的前端计算逻辑，并最终渲染图表。

```typescript
// 模式 B: 前端计算 (在 App.tsx 等顶层组件中)
useEffect(() => {
  let unsubscribe: (() => void) | undefined;
  if (state === 'view' || state === 'fullscreen') {
    unsubscribe = dashboard.onDataChange(async () => {
      // 1. 接收到“数据变更”通知
      // 2. 重新从服务器获取权威配置
      const savedConfig = await dashboard.getConfig();
      if (savedConfig.customConfig) {
        // 3. 更新顶层 state，从而驱动整个前端重新计算和渲染
        setConfig(savedConfig.customConfig);
      }
    });
  }
  return () => {
    if (unsubscribe) unsubscribe();
  };
}, [state]);
```

---

## 🔍 数据同步问题深度解析 (前端计算模式)

**问题**：在 `config` 模式下保存配置后，`view` 模式不刷新，显示旧数据。

**根源**：竞态条件 (Race Condition)。`saveConfig` 会触发 `onDataChange`。如果此时我们既有主动刷新逻辑（如 `refreshKey`），又有处理 `onDataChange` 的逻辑，且后者实现不当（如使用了旧的 state 或 ref），就会导致用旧配置发起的请求覆盖了新配置的请求结果。

**最终解决方案**：采用上述**模式 B 的最佳实践**，将 `onDataChange` 的职责明确为“触发一次配置重载”，而不是直接处理数据。这能从根本上消除竞态条件。

## 🐛 调试与排查技巧

### 日志记录策略
1.  **关键节点必须记录**：
    -   `saveConfig` 前后的配置
    -   `onDataChange` 触发
    -   `getConfig` 的调用和返回
    -   前端数据计算的输入和输出

### 如果数据不更新：
1.  **确认开发模式**：首先确定你的插件是“后端计算”还是“前端计算”模式。
2.  **检查事件处理**：
    -   **后端计算模式**：检查 `onDataChange` 是否触发，`event.data` 结构是否符合预期。
    -   **前端计算模式**：检查 `onDataChange` 是否触发了 `getConfig`，以及 `setConfig` 是否成功更新了状态。
3.  **检查数据获取**：检查 `useData` 等 hooks 的 `useEffect` 依赖项是否正确，是否在新 `config` 传入后重新执行。

## ✅ 总结：选择适合你的模式

-   如果你的图表逻辑简单，飞书的 `dataConditions` 聚合能力已经满足需求，请选择 **模式 A (后端计算)**，它更简单高效。
-   如果你的图表需要复杂的、自定义的数据处理逻辑（比如我们的气泡图），请选择 **模式 B (前端计算)**，并严格遵循其数据同步方案。

---

## 🎯 类目轴支持的经验总结（2025-11-18）

在实现「单选字段可作为 X/Y 轴类目」功能时，积累了以下关键经验：

### 1. 数据流设计：区分实时状态 vs 权威状态

**核心挑战**：字段选项（fieldOptions）的获取时机和位置

- **Config 状态**：需要实时获取选项（通过 `useFieldOptions` hook），以便在用户切换字段时立即显示图表预览
- **View 状态**：需要使用已保存的权威选项（从 `config.xFieldOptions` 读取），避免重复请求

**解决方案**：
```typescript
// 实时获取（config 状态使用）
const { options: xFieldOptionsFromHook } = useFieldOptions(...)

// 根据状态选择使用哪份数据
const xFieldOptions = state === 'view' || state === 'fullscreen'
  ? config.xFieldOptions || xFieldOptionsFromHook  // view 优先用已保存的
  : xFieldOptionsFromHook                           // config 用实时获取的
```

**经验教训**：
- 不要将所有数据都塞进 `config` state
- 明确区分「需要实时获取的数据」和「需要保存的权威数据」
- 在组件层面做数据选择，而不是在 hook 内部

### 2. 字段识别与分类

**实现方式**：
```typescript
// 识别类目字段（目前只支持单选字段）
const CATEGORY_FIELD_TYPES = [FieldType.SingleSelect]

// 在 useFields 中为字段添加标识
export interface FieldInfo {
  id: string
  name: string
  type: any
  isCategory?: boolean  // 是否支持类目轴（单选字段）
}
```

**最佳实践**：
- 在获取字段列表时立即识别类型，避免后续重复判断
- 使用 `isCategory` 标志，而不是运行时判断 `field.type === FieldType.SingleSelect`
- UI 层面根据 `isCategory` 显示标签，帮助用户理解字段用途

### 3. 外部传入选项的架构设计

**问题**：`useData` hook 如何获取字段选项？

**方案对比**：

**方案A（不推荐）**：在 `useData` 内部调用 `useFieldOptions`
```typescript
// ❌ 导致 hook 嵌套，违反 React Rules of Hooks
const useData = (config, state) => {
  const { options } = useFieldOptions(config.dataSource, config.xField)
  // ...
}
```

**方案B（推荐）**：父组件获取，通过参数传递
```typescript
// ✅ 清晰的数据流，符合 React 设计原则
const useData = (config, state, xFieldOptions?, yFieldOptions?) => {
  // 直接使用传入的选项
}

// App.tsx 中
const { options: xFieldOptions } = useFieldOptions(...)
const { data } = useData(config, state, xFieldOptions)
```

**经验总结**：
- 保持 hooks 的职责单一，不要嵌套调用
- 由调用方负责数据获取，被调用方专注于业务逻辑
- 符合「依赖注入」原则，提高可测试性

### 4. 向后兼容的接口设计

**挑战**：新增字段类型后，避免破坏现有代码

**解决方案**：
```typescript
export interface BubbleChartConfig {
  // ...现有字段
  xFieldType?: 'number' | 'category'  // 可选，默认 'number'
  yFieldType?: 'number' | 'category'  // 可选，默认 'number'
  xFieldOptions?: string[]  // 只在类目模式时使用
  yFieldOptions?: string[]  // 只在类目模式时使用
}

// 使用时提供回退值
const xAxisType = config.xFieldType === 'category' ? 'category' : 'value'
```

**最佳实践**：
- 新字段使用可选类型（`?`）
- 提供合理的默认值（通常是不改变原有行为的值）
- 在取值处做兼容处理，而不是在存储处

### 5. ECharts 类目轴的数据映射

**关键技巧**：类目索引 vs 显示文本

```typescript
// 数据处理（useData3.ts）
const processCategoryValue = (value, fieldOptions) => {
  // 返回索引位置（ECharts 需要）
  const index = fieldOptions.indexOf(textValue)
  return { original: textValue, index }
}

// 图表配置（BubbleChart.tsx）
const seriesData = data.map(item => {
  return {
    value: [
      item.xCategoryIndex ?? item.x,  // 使用索引，ECharts 自动映射
      item.yCategoryIndex ?? item.y,
      item.size
    ],
    // ...
  }
})
```

**经验总结**：
- ECharts 类目轴需要通过索引（0,1,2...）定位
- 但 tooltip 中显示给用户时，应使用原始文本
- 在 DataItem 中同时保存 `xCategoryIndex` 和原始值 `x`

### 6. 错误处理：非类目字段调用 getOptions

**问题**：`useFieldOptions` 可能被用于非单选字段

**错误方案**：
```typescript
// ❌ 抛出错误，导致调用方崩溃
if (fieldMeta.type !== FieldType.SingleSelect) {
  throw new Error('该字段不是单选字段')
}
```

**正确方案**：
```typescript
// ✅ 返回空数组，让调用方优雅处理
if (fieldMeta.type !== FieldType.SingleSelect) {
  return []  // 返回空数组，而不是报错
}
```

**设计原则**：
- Hooks 应该「优雅降级」，而不是「崩溃报错」
- 让调用方根据返回值做决策（`options.length === 0`）
- 提高组件的健壮性和容错性

### 7. onDataChange 事件的可靠性问题

**问题**：飞书 SDK 的 `onDataChange` 事件在某些场景下不触发

**现象**：
- ✅ 双数值 → 混合轴：触发频率 100%
- ❌ 混合轴 → 双数值：触发频率约 20%（80% 概率不触发）

**临时解决方案**：
```typescript
useEffect(() => {
  if ((state === 'view' || state === 'fullscreen') && refreshKey === 0) {
    setRefreshKey(k => k + 1)  // 强制刷新
  }
}, [state])
```

**经验教训**：
- 不要完全依赖第三方事件的可靠性
- 设计时考虑降级方案（如本例中的 state 变化监听）
- 建立详细的日志系统，通过日志分析定位问题
- 关键操作（如数据刷新）应有多种触发机制

---

