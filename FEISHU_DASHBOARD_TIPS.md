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
