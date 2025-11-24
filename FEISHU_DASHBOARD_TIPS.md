# 飞书仪表盘插件开发 - 经验总结
> 总结开发飞书多维表格仪表盘插件过程中的踩坑点和验证有效的实践，描述尽量简洁，但又要触及问题的本质
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
#### 🔍 数据同步问题深度解析 (前端计算模式)

**问题**：在 `config` 模式下保存配置后，`view` 模式不刷新，显示旧数据。

**根源**：竞态条件 (Race Condition)。`saveConfig` 会触发 `onDataChange`。如果此时我们既有主动刷新逻辑（如 `refreshKey`），又有处理 `onDataChange` 的逻辑，且后者实现不当（如使用了旧的 state 或 ref），就会导致用旧配置发起的请求覆盖了新配置的请求结果。

**最终解决方案**：采用上述**模式 B 的最佳实践**，将 `onDataChange` 的职责明确为“触发一次配置重载”，而不是直接处理数据。这能从根本上消除竞态条件。


### ✅ 总结：选择适合你的模式

-   如果你的图表逻辑简单，飞书的 `dataConditions` 聚合能力已经满足需求，请选择 **模式 A (后端计算)**，它更简单高效。
-   如果你的图表需要复杂的、自定义的数据处理逻辑（比如我们的气泡图），请选择 **模式 B (前端计算)**，并严格遵循其数据同步方案。


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
## ⚙️ 高级刷新机制：从“不刷新”到“不闪烁”的完整指南（2025-11-18）

在解决了“类目轴”的功能后，我们遭遇了从“配置保存后不刷新”到“刷新时闪烁”的一系列棘手问题。本章节旨在复盘整个调试过程，提供一个健壮、优雅的仪表盘刷新方案。

### 1. 核心问题：`onConfigChange` 事件丢失之谜

**现象**：保存配置后，图表在某些情况下（特别是涉及类目轴时）不刷新。

**错误根源**：**竞态条件 (Race Condition)**。`saveConfig()` 成功后，飞书后端会**立即**触发 `onConfigChange` 事件。但此时前端的 `useEffect` 监听器可能因为依赖了 `[state]`，尚未从 `config` 状态切换到 `view` 状态，导致监听器还未注册，完美错过了这个关键事件。

**错误代码示例**:
```typescript
// ❌ 错误示范：依赖 state，监听器注册太晚
useEffect(() => {
  if (state === 'view') {
    // 当 state 切换到 'view' 时，事件可能已经发送完毕
    const unsubscribe = dashboard.onConfigChange(update);
    return () => unsubscribe();
  }
}, [state]); // 问题就在这个依赖项
```

**正确解法**：`useEffect` 的依赖项必须为空数组 `[]`，确保监听器在组件首次挂载时就“全程在线”，绝不错过任何事件。

**关键知识点**：`onConfigChange` 是 `saveConfig` 之后最快、最可靠的事件，必须优先监听它。`onDataChange` 则主要用于响应用户在多维表格中直接修改单元格数据的场景。

### 2. 副作用：“闪烁”问题（二次刷新）的产生与解决

**现象**：解决了“不刷新”的问题后，视图在保存后会快速闪烁一下。

**根源分析**：两个几乎同时发生的异步更新导致的二次渲染。
1.  **第一次刷新**：`onConfigChange` 事件被监听到，触发 `getConfig()` 和 `setConfig()`。
2.  **第二次刷新**：几乎在同时，SDK 内部也将 `state` 从 `'config'` 切换到 `'view'`，这又一次触发了组件的重新渲染。

**最终方案：“防抖 (Debounce) + 深度比对 (Deep Compare)”**

这个方案可以优雅地合并短时间内的多次刷新请求，并忽略内容完全相同的更新。

-   **防抖**：使用 `setTimeout` 将短时间内连续触发的多个事件（如 `onConfigChange` 和 `onDataChange`）合并为一次最终执行。一个 200ms 的延时足以覆盖这两个事件的间隔。
-   **深度比对**：在 `setConfig` 前，使用 `JSON.stringify` 对比新旧配置的内容。如果内容完全相同，则通过返回旧的 state 对象（`return prevConfig`）来完全阻止 React 的这次无效渲染。

**最佳实践代码**:
```typescript
// App.tsx 中的最终解决方案
useEffect(() => {
  let debounceTimer: number | undefined;

  const fetchAndSetConfig = async () => {
    const savedConfig = await dashboard.getConfig();
    if (savedConfig.customConfig) {
      const newConfig = savedConfig.customConfig as BubbleChartConfig;
      setConfig(prevConfig => {
        // 只有当新配置和旧配置的内容真正不同时，才更新 state
        if (JSON.stringify(prevConfig) === JSON.stringify(newConfig)) {
          return prevConfig; // 内容相同，跳过渲染
        }
        return newConfig; // 内容不同，执行更新
      });
    }
  };

  const triggerUpdate = () => {
    clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(fetchAndSetConfig, 200);
  };

  // 注册全局监听器
  const offConfigChange = dashboard.onConfigChange(triggerUpdate);
  const offDataChange = dashboard.onDataChange(triggerUpdate);

  return () => {
    clearTimeout(debounceTimer);
    offConfigChange();
    offDataChange();
  };
}, []); // 依赖项为空，确保只注册一次
```

### 3. 架构优化：分离数据逻辑与 UI 状态

**问题**：在 `App.tsx` (UI层) 中根据 `state` 来计算要传递给 `useData` 的 `props`，导致 `useData` 的依赖项不稳定，从而引发二次刷新。

**错误代码**:
```typescript
// ❌ 错误示范：在 App.tsx 中根据 state 计算 options
const options = state === 'view' ? config.options : liveOptions;
const { data } = useData(config, state, options); // state 和 options 都会在保存后变化，触发两次 effect
```

**正确架构**：让 `useData` hook 成为数据处理的唯一权威，UI 层只负责传递“原材料”。

-   **`App.tsx`**：只负责传递原始材料 (`config`, `state`, `liveOptions`)。
-   **`useData` 内部**：根据传入的 `state` 来决定是使用 `liveOptions` 还是 `config.options`。
-   **`useData` 的 `useEffect`**：其依赖项中**不包含** `state`，只包含 `config` 和 `liveOptions` 等“数据”依赖。
-   **`useData` 的返回值**：同时返回 `data` 和最终用于渲染的 `finalOptions`，供 `BubbleChart` 组件消费。

**清晰的数据流**: `App.tsx` -> `useData(原始材料)` -> `(返回 {data, finalOptions})` -> `BubbleChart(data, finalOptions)`

### 4. 健壮性：为 `dataConditions` 选择正确的 `Rollup` 策略

**原则**：`saveConfig` 中 `dataConditions` 的 `rollup` 策略会影响飞书后端对数据变化的侦测，进而影响 `onDataChange` 的触发。

**最佳实践**：
-   **数值类型字段**：使用求和 `Rollup.SUM`。
-   **类目类型字段**：应使用计数类聚合，例如 `Rollup.COUNT_ALL`（**注意**：请查阅最新版 SDK 文档确认准确的枚举值，`COUNTA` 和 `COUNT` 都可能是错误的）。
-   **教训**：错误或不匹配的 `Rollup` 策略可能导致 `onDataChange` 在表格数据更新后不触发，是我们之前遇到的“不刷新”问题的潜在原因之一。

---

## 🧪 公式字段与数据展示优化（2025-11-22）

在支持公式字段和优化气泡图展示效果时，我们总结了以下关键经验：

### 1. 公式字段的类型识别

**问题**：公式字段（`FieldType.Formula`）的返回值类型是不确定的，可能是数字、文本、布尔值甚至对象。简单地通过 `type === FieldType.Number` 无法识别出数值类型的公式。

**解决方案**：
- **检查 `formatter` 属性**：飞书 SDK 返回的字段元数据中，数值类型的公式通常带有 `formatter` 属性（例如数字格式、百分比格式）。
- **动态检测数据内容**：在无法通过元数据判断时，读取前几条数据的内容进行推断。

```typescript
// 识别数值公式
if (meta.type === FieldType.Formula) {
  // 带有 formatter 属性通常意味着是数值或日期
  if (meta.property?.formatter) {
    isNumericFormula = true;
    // 进一步检查是否为百分比
    if (typeof formatter === 'string' && formatter.includes('%')) {
      isPercentage = true;
    }
  }
}
```

### 2. 百分比数值的陷阱

**问题**：飞书中的百分比字段，其底层存储的是小数（如 `0.09`），但用户期望看到的是 `9%`。

**解决方案**：
- **数据层**：保持数值类型（`0.09`），以便进行坐标轴的数值计算和排序。
- **展示层**：在 Axis Label 和 Tooltip 中进行格式化。
- **智能识别**：通过字段的 `formatter` 属性自动识别百分比字段，无需用户手动配置。

```typescript
// Tooltip formatter
if (isPercentage) {
  // 乘以 100 并保留两位小数，再加 %
  displayValue = parseFloat((value * 100).toFixed(2)) + '%';
}
```

---

## 🔄 React useEffect 中的字段验证模式（2025-11-23）

在实现配置自动填充功能时，遇到了切换数据源时字段ID不匹配的问题。总结了一套健壮的字段验证模式。

### 问题场景

**问题**：当用户从数据源 A 切换到数据源 B 时，虽然配置被重置（`xField = undefined`），但如果字段列表更新有延迟，自动填充逻辑可能选择了错误的字段 ID。

**典型表现**：
- 下拉框显示字段 ID（如 `fldXXX`）而不是字段名称
- 切换到字段数量不足的数据源时，仍然显示旧数据源的字段

### 解决方案：字段存在性验证

**核心思路**：在自动填充前，验证当前选中的字段 ID 是否存在于新的字段列表中。

```typescript
useEffect(() => {
  if (!config.dataSource || fieldsLoading) return
  
  // 获取当前数据源的字段列表
  const currentFields = getCombinedFields()
  
  setConfig(prev => {
    const updates: Partial<Config> = {}
    
    // 验证当前选中的字段是否在新字段列表中
    const xFieldExists = prev.xField 
      ? currentFields.some(f => f.id === prev.xField) 
      : false
    
    // 如果字段不存在或未选择，则自动填充
    if (!prev.xField || !xFieldExists) {
      if (currentFields.length > 0) {
        // 有可用字段，选择第一个
        updates.xField = currentFields[0].id
      } else {
        // 没有可用字段，清空配置
        updates.xField = undefined
      }
    }
    
    return Object.keys(updates).length > 0 
      ? { ...prev, ...updates } 
      : prev
  })
}, [config.dataSource, fieldsLoading, fields])
```

### 关键要点

1. **等待字段加载完成**：使用 `!fieldsLoading` 条件，确保字段列表已加载
2. **验证字段存在性**：`currentFields.some(f => f.id === prev.xField)`
3. **处理边缘情况**：
   - 字段数为 0：清空配置（`undefined`）
   - 字段数为 1：只填充第一个字段
   - 字段数 >= 2：分别填充横轴和纵轴
4. **避免无效更新**：检查 `updates` 是否为空，避免触发不必要的重渲染

### 最佳实践

- ✅ 始终验证字段 ID 的有效性，不要假设它一定存在
- ✅ 使用函数式 `setState`，基于最新的 state 做判断
- ✅ 处理所有边缘情况（0 个、1 个、多个字段）
- ✅ 只在有实际变更时更新 state，避免性能问题
- ❌ 不要在 useEffect 依赖数组中包含 `config.xField` 等会被修改的字段，会导致循环触发

---

## 🎨 主题适配与 UI 体验优化（2025-11-24）

在解决暗黑模式适配和白屏闪烁问题时，我们总结了一套完整的 UI 最佳实践。

### 1. 完美适配暗黑模式

**核心原理**：
飞书插件运行在 iframe 中，背景默认透明。要实现完美适配，需要同时处理 Semi UI 组件库和 ECharts 图表库。

**实现步骤**：

1.  **监听主题变化**：
    使用 `bitable.bridge.onThemeChange` 监听宿主环境的主题切换。

2.  **Semi UI 适配**：
    Semi UI 依赖 `body` 上的 `theme-mode` 属性。
    ```typescript
    // App.tsx
    useEffect(() => {
      // 初始化
      bitable.bridge.getTheme().then(theme => {
        document.body.setAttribute('theme-mode', theme.toLowerCase());
      });
      
      // 监听变化
      return bitable.bridge.onThemeChange(theme => {
        document.body.setAttribute('theme-mode', theme.toLowerCase());
      });
    }, []);
    ```

3.  **ECharts 适配（最佳实践）**：
    不要使用 `MutationObserver` 监听 DOM，而是利用 React 的 `useMemo` 和 CSS 变量。
    
    ```typescript
    // BubbleChart.tsx
    
    // 1. 定义配置，直接使用 CSS 变量名
    const CHART_STYLE_CONFIG = {
      colors: {
        axisName: '--semi-grey-5',      // Semi UI 灰度色板
        splitLine: '--semi-grey-1',     // 网格线
        // ...
      }
    }
    
    // 2. 辅助函数：获取 CSS 变量值并处理 RGB 格式
    const getTokenColor = (token, defaultValue = '') => {
      const value = getComputedStyle(document.body).getPropertyValue(token).trim();
      if (!value) return defaultValue;
      
      // Semi UI 的 grey 系列变量存储的是裸 RGB 值（如 "230,232,234"）
      // 需要转换为 rgb() 格式才能用于 Canvas
      if (/^[\d\s,]+$/.test(value)) {
        return `rgb(${value})`;
      }
      
      return value;
    };
    
    // 3. 自动响应主题变化
    const chartStyles = useMemo(() => {
      return {
        axisName: getTokenColor(CHART_STYLE_CONFIG.colors.axisName),
        // ...
      }
    }, [theme]); // 依赖 theme prop
    ```
    
    **重要提示：Semi UI CSS 变量的格式差异**
    - `--semi-color-*` 系列：存储完整颜色值（如 `#333`、`rgba(0,0,0,0.5)`）
    - `--semi-grey-*` 系列：存储**裸 RGB 值**（如 `230,232,234`），这是为了方便在 CSS 中使用 `rgba(var(--semi-grey-1), 0.5)` 添加透明度
    - **ECharts 使用时**：裸 RGB 值必须包装成 `rgb()` 格式，否则无法正确渲染

### 2. 国际化 (i18n) 的正确姿势

**误区**：依赖 URL 参数 (`lang`) 或 `navigator.language`。
**正解**：直接调用飞书 SDK 能力。

```typescript
// main.tsx
const initApp = async () => {
  // 1. 获取准确的宿主语言
  const lang = await bitable.bridge.getLanguage();
  
  // 2. 初始化 i18n
  await i18n.init({ lng: lang, ... });
  
  // 3. 渲染应用
  ReactDOM.createRoot(...).render(<App />);
};
```

**LoadApp 模式**：
为了避免 i18n 初始化期间的白屏，建议创建一个 `LoadApp` 组件，先显示 Loading，待初始化完成后再渲染主应用。
