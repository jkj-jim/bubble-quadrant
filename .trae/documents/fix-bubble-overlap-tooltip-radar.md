# 修复气泡重叠 Hover 问题：空间雷达探测 Tooltip 聚合方案

## Summary

当大气泡完全包裹小气泡时，ECharts 的 emphasis 机制（z2 提升 + blur 弱化）导致用户永远无法 hover 到小气泡。本方案不修改 emphasis 机制，而是将 tooltip 升级为"探测雷达"：hover 到大气泡时，在 tooltip 中聚合展示所有被其物理覆盖的小气泡信息。

**核心原则**：接受大气泡挡住小气泡的视觉现实，从数据交互层面（tooltip 内容聚合）解决问题，而非视觉层面（z-index/emphasis）。

---

## Current State Analysis

### 关键文件与代码位置

| 内容 | 文件 | 行号 |
|------|------|------|
| tooltip.formatter（当前实现） | `src/components/BubbleChart.tsx` | 867-906 |
| seriesData 数据点映射 | `src/components/BubbleChart.tsx` | 697-788 |
| symbolSizeFn（size→像素直径映射） | `src/components/BubbleChart.tsx` | 911-921 |
| emphasisConfig / blurConfig | `src/components/BubbleChart.tsx` | 931-947 |
| 气泡大小配置（minSize:7px, maxSize:70px） | `src/components/BubbleChart.tsx` | 108-115 |
| minSize/maxSize 数据极值计算 | `src/components/BubbleChart.tsx` | 837-839 |
| 主渲染 useEffect（setOption） | `src/components/BubbleChart.tsx` | 619-1328 |
| setOption 调用点 | `src/components/BubbleChart.tsx` | 1085 |
| ResizeObserver | `src/components/BubbleChart.tsx` | 599-617 |
| chartInstanceRef | `src/components/BubbleChart.tsx` | 353 |
| DataItem 类型定义 | `src/hooks/useData3.ts` | 15-23 |

### 当前 tooltip.formatter 行为
- 动态函数，每次 hover 时被 ECharts 调用
- 接收 `params.data`，其中包含 `value: [xValue, yValue, size]` 和 `data: [xDisplay, yDisplay, size]`
- 根据轴类型（数值/类目/日期/百分比）格式化显示值
- 返回 HTML 字符串，显示单个气泡的 name + X + Y + Size

### 当前 emphasis 配置
- `emphasis.focus: 'self'` — hover 时当前气泡高亮，其他进入 blur
- blur 状态：`opacity: 0.15, color: '#ccc'`
- **本方案不修改此配置**，emphasis 视觉效果保持不变

### symbolSizeFn 映射逻辑（关键）
```
直径 = minSize(7px) + (sizeVal - dataMinSize) / (dataMaxSize - dataMinSize) * (maxSize(70px) - minSize(7px))
半径 = 直径 / 2
```
`symbolSizeFn` 当前定义在 `series: (() => { ... })()` IIFE 内部，外部无法访问。需要提取到更外层作用域。

### 多 series 模式
开启颜色分组时，`seriesData` 被拆分到多个 series。`params.dataIndex` 是 series 内索引，非全局索引。需要通过数据点上的自定义字段（如 `__idx`）来获取全局索引。

---

## Proposed Changes

### 改动 1：提取 symbolSizeFn 到 option 构造之前

**文件**: `src/components/BubbleChart.tsx`
**位置**: 第 837-839 行之后（`minSize`/`maxSize` 计算之后），第 841 行（`const option` 之前）

**做什么**: 将 `symbolSizeFn` 的定义从 series IIFE 内部提取到 `option` 对象构造之前，使其在 tooltip formatter 和预计算逻辑中均可访问。

**为什么**: 当前 `symbolSizeFn` 定义在 `series: (() => { ... })()` IIFE 内部，tooltip formatter（在 option 对象中定义）无法访问它。提取后，formatter 可以用同一函数计算气泡像素半径，确保与实际渲染一致。

**怎么做**:
```typescript
// 在 minSize/maxSize 计算之后，option 构造之前
const shouldUseDynamicSize = config.sizeMode === 'count' || !!sizeFieldName
const symbolSizeFn = (val: any): number => {
  if (!shouldUseDynamicSize) {
    return chartStyles.bubble.defaultSize
  }
  const sizeVal = val[2] as number
  if (maxSize === minSize) {
    return (chartStyles.bubble.minSize + chartStyles.bubble.maxSize) / 2
  }
  return chartStyles.bubble.minSize + (sizeVal - minSize) / (maxSize - minSize) * (chartStyles.bubble.maxSize - chartStyles.bubble.minSize)
}
```
然后在 series IIFE 内部删除原来的 `shouldUseDynamicSize` 和 `symbolSizeFn` 定义（第 910-921 行），改为直接引用外层的。

### 改动 2：为每个数据点添加全局索引 `__idx`

**文件**: `src/components/BubbleChart.tsx`
**位置**: 第 776-787 行（`seriesData.map` 的 return 对象）

**做什么**: 在每个数据点对象中添加 `__idx: index` 字段。

**为什么**: 多 series 模式下 `params.dataIndex` 是 series 内索引，无法直接定位全局数据。`__idx` 随数据点传播到 ECharts，formatter 中可通过 `params.data.__idx` 获取全局索引。ECharts 会保留数据点的自定义字段（现有代码已用 `data.data`、`data.colorGroupKey` 等自定义字段）。

**怎么做**: 在 return 对象中增加一行：
```typescript
return {
  name: item.name,
  value: [xValue, yValue, item.size] as [...],
  data: [xDisplay, yDisplay, item.size],
  colorGroupKey,
  __idx: index,  // ← 新增：全局索引，用于 tooltip 聚合
  itemStyle: { ... }
}
```

### 改动 3：新增气泡像素位置预计算 + 缓存机制

**文件**: `src/components/BubbleChart.tsx`
**位置**: 
- 新增 ref 声明（在第 353 行 `chartInstanceRef` 附近）
- 新增预计算函数（在主渲染 useEffect 内，setOption 之后，约第 1088 行之后）
- ResizeObserver 中增加缓存失效（第 599-617 行）

**做什么**: 
1. 新增 `bubblePositionsRef` 用于缓存所有气泡的像素坐标和半径
2. 在 `setOption` + `resize` 之后，用 `setTimeout(0)` 异步预计算所有气泡的像素位置
3. ResizeObserver 触发时清空缓存（下次 hover 时按需重算）

**为什么**: 
- `chart.convertToPixel()` 需要图表完成布局后才能正确转换坐标
- 预计算将 O(n) 的 `convertToPixel` 调用从 hover 时移到渲染后，hover 时只需 O(n) 简单距离比较（纯数学运算，<1ms）
- 回答用户疑问："tooltip 信息是 hover 时计算的"——formatter 确实在 hover 时调用，但通过预计算把耗时操作前移，formatter 内只剩距离比较，无感知延迟

**预计算数据结构**:
```typescript
interface BubblePosition {
  idx: number           // 全局索引（对应 __idx）
  pixelX: number        // 像素 X 坐标
  pixelY: number        // 像素 Y 坐标
  radius: number        // 像素半径（= symbolSizeFn(value) / 2）
  sizeVal: number       // 原始 size 值（用于排序）
  data: any             // 原始数据点引用（含 name, value, data 等字段）
}
```

**预计算逻辑**:
```typescript
const bubblePositionsRef = useRef<BubblePosition[]>([])

// 在 setOption + resize 之后
setTimeout(() => {
  const chart = chartInstanceRef.current
  if (!chart) return
  const positions: BubblePosition[] = seriesData.map((item: any, index: number) => {
    const [xVal, yVal, sizeVal] = item.value
    const pixel = chart.convertToPixel(
      { xAxisIndex: 0, yAxisIndex: 0 },
      [Number(xVal), Number(yVal)]
    )
    const radius = symbolSizeFn(item.value) / 2
    return { idx: index, pixelX: pixel[0], pixelY: pixel[1], radius, sizeVal, data: item }
  })
  bubblePositionsRef.current = positions
}, 0)
```

**ResizeObserver 中清空缓存**:
```typescript
// 在现有 ResizeObserver 回调中，chart.resize() 之后添加
bubblePositionsRef.current = []  // 清空缓存，下次 hover 时按需重算
```

**Formatter 中的按需重算兜底**（缓存为空时）:
```typescript
// formatter 内部，如果 bubblePositionsRef.current 为空，则现场计算
let positions = bubblePositionsRef.current
if (positions.length === 0 && chartInstanceRef.current) {
  // 现场计算（首次 hover 在 setTimeout 完成前的兜底）
  positions = seriesData.map(...)
  bubblePositionsRef.current = positions
}
```

### 改动 4：重写 tooltip.formatter，实现雷达聚合

**文件**: `src/components/BubbleChart.tsx`
**位置**: 第 867-906 行（替换现有 formatter）

**做什么**: 在现有单气泡 tooltip 的基础上，增加"被包含气泡"列表。

**逻辑流程**:
1. **格式化 hover 气泡信息**（复用现有逻辑，作为 tooltip 主体，立即返回）
2. **读取预计算缓存**，定位 hover 气泡的像素坐标和半径
3. **扫描所有气泡**，找出中心点落在 hover 气泡半径内的其他气泡
   - 条件：`sqrt((px-hx)² + (py-hy)²) <= hoverRadius`（小气泡中心在大气泡范围内）
   - 排除 hover 气泡自身
4. **按 (xDisplay, yDisplay, sizeDisplay) 分组**，相同位置+大小的气泡合并名称（用 "," 拼接）
5. **排序**：按 sizeVal 降序（大气泡优先，符合"高效"要求）
6. **拼接 HTML**：主体信息 + 分隔线 + "包含的气泡 (N)" + 分组列表

**containment 判定条件说明**:
- 用户原文："把物理位置落在当前大气泡范围内的所有小气泡数据捞出来"
- 采用**中心点判定**：`distance(centers) <= hoverRadius`
- 这覆盖了"完全包裹"和"中心被遮挡"两种场景，确保所有无法被 hover 到的气泡都能被探测到

**formatter 伪代码**:
```typescript
formatter: (params: any) => {
  const hoveredData = params.data
  const hoveredIdx = hoveredData.__idx ?? params.dataIndex

  // ===== 1. 格式化 hover 气泡（复用现有逻辑）=====
  let xDisplay = hoveredData.data ? hoveredData.data[0] : hoveredData.value[0]
  let yDisplay = hoveredData.data ? hoveredData.data[1] : hoveredData.value[1]
  let sizeDisplay = hoveredData.data ? hoveredData.data[2] : hoveredData.value[2]
  // ... 日期/百分比格式化（保持现有逻辑不变）...
  const sizeLabel = config.sizeMode === 'count' ? t('label.count') : sizeFieldName

  // 构建 hover 气泡 HTML
  let html = `<div style="padding: 8px;">
    ${hoveredData.name ? `<div style="font-weight: bold; margin-bottom: 4px;">${hoveredData.name}</div>` : ''}
    <div>${xFieldName || 'X'}: ${xDisplay}</div>
    <div>${yFieldName || 'Y'}: ${yDisplay}</div>
    ${sizeLabel ? `<div>${sizeLabel}: ${sizeDisplay}</div>` : ''}
  </div>`

  // ===== 2. 雷达探测：找出被覆盖的气泡 =====
  let positions = bubblePositionsRef.current
  // 缓存为空时按需计算（兜底）
  if (positions.length === 0 && chartInstanceRef.current) {
    positions = seriesData.map(/* ... 同预计算逻辑 ... */)
    bubblePositionsRef.current = positions
  }
  if (positions.length === 0) return html

  const hovered = positions[hoveredIdx]
  if (!hovered) return html

  // 扫描被覆盖的气泡
  const contained = positions.filter(p => {
    if (p.idx === hoveredIdx) return false
    const dx = p.pixelX - hovered.pixelX
    const dy = p.pixelY - hovered.pixelY
    return Math.sqrt(dx * dx + dy * dy) <= hovered.radius
  })

  if (contained.length === 0) return html  // 无覆盖气泡，返回普通 tooltip

  // ===== 3. 按 (x, y, size) 分组合并同名气泡 =====
  const groupMap = new Map<string, { names: string[], xDisplay, yDisplay, sizeDisplay, sizeVal }>()
  for (const p of contained) {
    // 格式化该气泡的显示值（复用格式化逻辑）
    const item = p.data
    let px = item.data ? item.data[0] : item.value[0]
    let py = item.data ? item.data[1] : item.value[1]
    let ps = item.data ? item.data[2] : item.value[2]
    // ... 日期/百分比格式化 ...

    const key = `${px}_${py}_${ps}`
    if (groupMap.has(key)) {
      groupMap.get(key)!.names.push(item.name || '')
    } else {
      groupMap.set(key, { names: [item.name || ''], xDisplay: px, yDisplay: py, sizeDisplay: ps, sizeVal: p.sizeVal })
    }
  }

  // ===== 4. 排序：按 size 降序 =====
  const groups = Array.from(groupMap.values()).sort((a, b) => b.sizeVal - a.sizeVal)

  // ===== 5. 拼接 HTML =====
  html += `<div style="border-top: 1px solid rgba(255,255,255,0.2); margin: 6px 0;"></div>`
  html += `<div style="font-size: 11px; opacity: 0.7; margin-bottom: 4px;">包含的气泡 (${contained.length})</div>`
  for (const g of groups) {
    const nameStr = g.names.filter(n => n).join(', ')
    html += `<div style="margin-bottom: 4px;">
      ${nameStr ? `<div style="font-weight: 500;">${nameStr}</div>` : ''}
      <div style="font-size: 11px; opacity: 0.85;">
        ${xFieldName || 'X'}: ${g.xDisplay}　${yFieldName || 'Y'}: ${g.yDisplay}　${sizeLabel}: ${g.sizeDisplay}
      </div>
    </div>`
  }

  return html
}
```

### 改动 5：提取格式化逻辑为辅助函数（避免重复）

**文件**: `src/components/BubbleChart.tsx`
**位置**: 在主渲染 useEffect 内部，formatter 定义之前

**做什么**: 将日期/百分比格式化逻辑提取为 `formatAxisValue(val, axisType, isPercentage, hasTime)` 辅助函数。

**为什么**: formatter 中 hover 气泡和被包含气泡都需要相同的格式化逻辑。提取为函数避免代码重复（DRY），也确保格式化一致性。

**怎么做**:
```typescript
const formatAxisValue = (
  val: number | string,
  axisType: string,
  isPercentage: boolean,
  hasTime: boolean
): string => {
  if (axisType === 'date' && typeof val === 'number') {
    return formatDate(val, hasTime, true)
  } else if (isPercentage && typeof val === 'number') {
    return parseFloat((val * 100).toFixed(2)) + '%'
  }
  return String(val)
}
```

---

## Assumptions & Decisions

### 设计决策

1. **不修改 emphasis/blur 机制**：用户已尝试 6 种 emphasis 相关方案均失败。本方案纯粹是 tooltip 内容增强，不触碰 ECharts 的 z-index/emphasis/blur 机制，零风险。

2. **containment 判定：中心点法**：`distance(centers) <= hoverRadius`。用户原文"物理位置落在当前大气泡范围内"明确指中心点判定。这比"完全包裹"（`distance + r_small <= R_large`）更宽松，能覆盖更多"无法 hover"的场景。

3. **预计算 + 按需兜底**：`setOption` 后 `setTimeout(0)` 预计算所有气泡像素位置并缓存；formatter 中若缓存为空则现场计算。双保险，无时序依赖。

4. **不使用异步 tooltip 更新**：ECharts 的 `tooltip.formatter` 是同步函数，返回 HTML 字符串。"先显示再追加"需要 `dispatchAction({type: 'showTip'})` 二次触发，会导致 tooltip 闪烁。通过预计算使 formatter 内只剩 O(n) 纯数学运算（<1ms），无需异步。

5. **排序策略**：被包含气泡按 size 降序排列。大气泡更可能包含更多小气泡，降序排列符合从大到小的自然阅读顺序。用户原文"其他怎么高效怎么来"，降序排列实现简单且直观。

6. **相同位置合并**：按 `(xDisplay, yDisplay, sizeDisplay)` 三元组分组，同组气泡名称用 "," 拼接共用一行。用户原文"相同位置且大小相同的气泡信息可以共用一个标题位置"。

7. **多 series 兼容**：通过 `__idx` 全局索引字段，在多 series（颜色分组）模式下也能正确定位气泡。`__idx` 随数据点传播，`params.data.__idx` 在任何 series 中都可读取。

### 假设

- 数据量在数百到数千条范围内（飞书 Bitable 仪表盘典型规模）。O(n) 扫描在此规模下 <1ms，无需空间索引（网格/四叉树）。
- `chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [x, y])` 对数值轴、类目轴、日期轴均有效。类目轴的 `value[0]` 是类目索引，convertToPixel 能正确转换。
- ECharts 6 保留数据点的自定义字段（`__idx`、`data`、`colorGroupKey` 等），与 ECharts 5 行为一致。
- `setTimeout(0)` 足够等待 `setOption` + `resize` 完成布局。若发现 convertToPixel 返回 NaN，可改用 `chart.on('rendered', ...)` 一次性监听（注意需在回调内解绑避免循环）。

---

## Verification Steps

1. **基本功能验证**：
   - 构造测试数据：1 个大气泡（size=100）完全覆盖 3 个小气泡（size=5，位置在大气泡内部）
   - hover 大气泡，tooltip 应显示大气泡信息 + "包含的气泡 (3)" 列表
   - hover 独立小气泡（未被覆盖），tooltip 应只显示该气泡信息（无"包含的气泡"部分）

2. **相同位置合并验证**：
   - 构造 2 个相同 (x, y, size) 的气泡，名称分别为 "A" 和 "B"
   - hover 覆盖它们的大气泡，tooltip 中应显示 "A, B" 在同一行

3. **排序验证**：
   - 被包含气泡按 size 降序排列，最大的在第一个

4. **多 series（颜色分组）验证**：
   - 开启颜色分组，大气泡和小气泡分属不同分组（不同 series）
   - hover 大气泡，tooltip 仍能正确探测到其他 series 中的小气泡

5. **轴类型验证**：
   - 数值轴：正常工作
   - 类目轴：convertToPixel 正确转换类目索引到像素坐标
   - 日期轴：tooltip 中日期格式化正确

6. **性能验证**：
   - 数据量 500 条时，hover 响应无感知延迟
   - 数据量 2000 条时，hover 响应 < 50ms（可接受）

7. **Resize 验证**：
   - 改变浏览器窗口大小后，hover 仍能正确探测被覆盖气泡（缓存失效后按需重算）

8. **现有功能回归**：
   - 象限标题 hover 高亮功能不受影响
   - 气泡点击复制功能不受影响
   - 颜色分组图例功能不受影响
   - 无颜色分组时单 series 模式正常工作

9. **Lint / TypeCheck**：
   - 运行 `npm run lint` 无错误
   - 运行 `npm run typecheck`（或 `tsc --noEmit`）无类型错误
