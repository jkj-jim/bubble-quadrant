# 气泡 Tooltip 优化：覆盖判定 + 样式统一 + 完整复制 + 滚动方案

## Summary

在上一轮"雷达探测 Tooltip 聚合"基础上做 4 项优化：
1. **覆盖判定**：从"中心点在大气泡内"改为"小气泡被完全覆盖"（`distance + smallRadius <= hoverRadius`）
2. **样式统一**：统一 tooltip 主体与"覆盖的气泡"列表的页边距（采用更紧凑的边距）；"包含的气泡"改名为"覆盖的气泡"
3. **完整复制**：点击气泡时复制 tooltip 展示的全部内容（含覆盖气泡列表），而非仅主气泡信息
4. **滚动方案**：tooltip 加最大高度 + 纵向滚动条，用 `enterable: true` + `hideDelay` 解决"光标不在 tooltip 上无法滚动"的问题

---

## Current State Analysis

### 关键代码位置（`src/components/BubbleChart.tsx`）

| 内容 | 行号 | 说明 |
|------|------|------|
| tooltip 配置块（仅 `trigger` + `formatter`） | 910-1012 | 无 `padding`/`confine`/`enterable`/`extraCssText`/`hideDelay` |
| 覆盖判定逻辑（中心点法） | 960-966 | `Math.sqrt(dx*dx+dy*dy) <= hovered.radius` |
| 主体 HTML（`padding: 8px`） | 930-937 | 内联 padding，与列表区页边距不一致 |
| "包含的气泡"标题 | 999 | 待改名为"覆盖的气泡" |
| 列表项 HTML（`margin-bottom: 4px`） | 1000-1008 | 无外层 padding 包裹，依赖 ECharts 默认 tooltip padding |
| `handleBubbleClick`（仅复制主气泡 4 项） | 1756-1803 | 未复制覆盖气泡列表；size 字段名用 `sizeFieldName` 而非 `sizeLabel`（与 tooltip 不一致）；格式化逻辑内联手写，未复用 `formatAxisValue` |
| `formatAxisValue` 辅助函数 | 870-882 | 已提取，但 click handler 未使用 |
| `symbolSizeFn` | 858-867 | 已提取到外层，formatter 和预计算共用 |
| `bubblePositionsRef` 预计算 | 1108-1124 | 已实现，存储每个气泡的 `radius` |
| `copyToClipboard` 辅助函数 | 189-214 | `textarea + execCommand('copy')`，已存在 |
| 图表外层容器 `overflow: 'hidden'` | 1845 | 防止 tooltip 溢出容器，需配合 `confine: true` 验证 |

### 当前 tooltip HTML 结构（问题所在）
```html
<div style="padding: 8px;">           <!-- 主体：8px 内联 padding -->
  <div style="font-weight: bold;">名称</div>
  <div>X: ...</div>
  <div>Y: ...</div>
  <div>Size: ...</div>
</div>
<div style="border-top: ...; margin: 6px 0;"></div>  <!-- 列表区：无 padding 包裹，依赖 ECharts 默认 padding -->
<div style="font-size: 11px;">包含的气泡 (N)</div>
<div style="margin-bottom: 4px;">...</div>
```
主体区有 `padding: 8px`，列表区无 padding 包裹 → 两区到 tooltip 边框距离不一致。

### 当前 click 复制内容
```
名称
X: xDisplay
Y: yDisplay
sizeFieldName: sizeDisplay
```
仅 4 行，不含覆盖气泡列表；且 `sizeFieldName` 在计数模式下应为"计数"（与 tooltip 的 `sizeLabel` 不一致）。

---

## Proposed Changes

### 改动 1：覆盖判定改为"完全覆盖"

**文件**: `src/components/BubbleChart.tsx`
**位置**: 第 960-966 行（`contained` 的 filter 逻辑）

**做什么**: 将判定条件从 `distance <= hoverRadius` 改为 `distance + p.radius <= hoverRadius`。

**为什么**: 用户要求"小气泡整个被覆盖后才算是包含关系"。当前中心点法会把"中心在大气泡内但边缘露出"的小气泡也算进来，过于宽松。完全覆盖法更符合"无法 hover 到"的实际场景——只有小气泡完全被遮挡时才真正无法 hover。

**怎么做**:
```typescript
// 扫描被 hover 气泡完全覆盖的其他气泡
// 判定：hoverRadius >= 圆心距离 + 小气泡半径（小气泡整个在大会泡内）
const contained = positions.filter(p => {
  if (p.idx === hoveredIdx) return false
  const dx = p.pixelX - hovered.pixelX
  const dy = p.pixelY - hovered.pixelY
  const distance = Math.sqrt(dx * dx + dy * dy)
  return distance + p.radius <= hovered.radius
})
```

### 改动 2：提取共享的覆盖气泡分组逻辑

**文件**: `src/components/BubbleChart.tsx`
**位置**: 在 `formatAxisValue` 之后（约第 883 行），`const option` 之前

**做什么**: 提取 `getCoveredGroups(hoveredIdx)` 函数，返回排序后的覆盖气泡分组数组。formatter 和 click handler 共用此函数。

**为什么**: 改动 3（完整复制）需要 click handler 获取与 tooltip 相同的覆盖气泡数据。若不提取，需在两处重复 ~30 行雷达探测 + 分组 + 排序逻辑。提取后 formatter 负责 HTML 渲染、click handler 负责纯文本生成，数据来源统一。

**怎么做**:
```typescript
// 获取被指定气泡完全覆盖的其他气泡分组（按 size 降序，相同位置合并）
// 供 tooltip formatter 和 click handler 共用
const getCoveredGroups = (hoveredIdx: number) => {
  let positions = bubblePositionsRef.current
  // 缓存为空时按需计算（兜底）
  if (positions.length === 0 && chartInstanceRef.current) {
    const chartForConvert = chartInstanceRef.current
    positions = seriesData.map((item: any, index: number) => {
      const [xVal, yVal, sizeVal] = item.value
      const pixel = chartForConvert.convertToPixel(
        { xAxisIndex: 0, yAxisIndex: 0 },
        [Number(xVal), Number(yVal)]
      )
      const radius = symbolSizeFn(item.value) / 2
      return { idx: index, pixelX: pixel[0], pixelY: pixel[1], radius, sizeVal, data: item }
    })
    bubblePositionsRef.current = positions
  }
  if (positions.length === 0) return []

  const hovered = positions[hoveredIdx]
  if (!hovered) return []

  // 完全覆盖判定：distance + smallRadius <= hoverRadius
  const contained = positions.filter(p => {
    if (p.idx === hoveredIdx) return false
    const dx = p.pixelX - hovered.pixelX
    const dy = p.pixelY - hovered.pixelY
    const distance = Math.sqrt(dx * dx + dy * dy)
    return distance + p.radius <= hovered.radius
  })

  // 按 (x, y, size) 分组合并同位置气泡
  const groupMap = new Map<string, { names: string[]; xDisplay: string; yDisplay: string; sizeDisplay: string; sizeVal: number }>()
  for (const p of contained) {
    const item = p.data
    const rawX = item.data ? item.data[0] : item.value[0]
    const rawY = item.data ? item.data[1] : item.value[1]
    const rawS: number | string = item.data ? item.data[2] : item.value[2]

    const px = formatAxisValue(rawX, xAxisType, xIsPercentage, xFieldHasTime)
    const py = formatAxisValue(rawY, yAxisType, yIsPercentage, yFieldHasTime)
    let ps = rawS
    if (sizeIsPercentage && typeof ps === 'number' && config.sizeMode !== 'count') {
      ps = parseFloat((ps * 100).toFixed(2)) + '%'
    }
    const psStr = String(ps)

    const key = `${px}_${py}_${psStr}`
    if (groupMap.has(key)) {
      groupMap.get(key)!.names.push(item.name || '')
    } else {
      groupMap.set(key, { names: [item.name || ''], xDisplay: px, yDisplay: py, sizeDisplay: psStr, sizeVal: p.sizeVal })
    }
  }

  // 按 size 降序
  return Array.from(groupMap.values()).sort((a, b) => b.sizeVal - a.sizeVal)
}
```

### 改动 3：重写 tooltip.formatter，统一 padding + 改名 + 调用共享函数

**文件**: `src/components/BubbleChart.tsx`
**位置**: 第 910-1012 行（替换整个 tooltip 配置块）

**做什么**:
1. tooltip 配置增加 `padding`、`confine`、`enterable`、`hideDelay`、`extraCssText`（见改动 5）
2. formatter 内部调用 `getCoveredGroups(hoveredIdx)` 替代内联的雷达逻辑
3. 移除主体 `<div style="padding: 8px;">` 的内联 padding，改由 tooltip 配置层统一控制
4. "包含的气泡" → "覆盖的气泡"
5. 整体 HTML 结构调整：主体和列表区不再各自包 padding div，统一由 tooltip padding 控制

**为什么**:
- 移除内联 `padding: 8px` 后，主体和列表区到 tooltip 边框的距离一致（均由 tooltip 配置的 `padding` 决定）
- 调用共享函数避免重复逻辑
- 改名符合用户语义（"覆盖"比"包含"更准确）

**怎么做**:
```typescript
tooltip: {
  trigger: 'item',
  confine: true,           // tooltip 约束在图表容器内
  enterable: true,         // 允许鼠标进入 tooltip，以便滚动
  hideDelay: 300,          // 鼠标移出后 300ms 才隐藏，给用户时间移入 tooltip
  padding: [8, 10],        // 统一 padding：上下 8px，左右 10px（紧凑）
  extraCssText: 'max-width: 360px; max-height: 320px; overflow-y: auto; overflow-x: hidden;',  // 见改动 5
  formatter: (params: any) => {
    const hoveredData = params.data
    const hoveredIdx = hoveredData.__idx ?? params.dataIndex
    const sizeLabel = config.sizeMode === 'count' ? t('label.count') : sizeFieldName

    // ===== 1. 格式化 hover 气泡信息 =====
    let xDisplay = hoveredData.data ? hoveredData.data[0] : hoveredData.value[0]
    let yDisplay = hoveredData.data ? hoveredData.data[1] : hoveredData.value[1]
    let sizeDisplay: number | string = hoveredData.data ? hoveredData.data[2] : hoveredData.value[2]
    xDisplay = formatAxisValue(xDisplay, xAxisType, xIsPercentage, xFieldHasTime)
    yDisplay = formatAxisValue(yDisplay, yAxisType, yIsPercentage, yFieldHasTime)
    if (sizeIsPercentage && typeof sizeDisplay === 'number' && config.sizeMode !== 'count') {
      sizeDisplay = parseFloat((sizeDisplay * 100).toFixed(2)) + '%'
    }

    // 主体（无内联 padding，由 tooltip 配置统一控制）
    let html = `${hoveredData.name ? `<div style="font-weight: bold; margin-bottom: 4px;">${hoveredData.name}</div>` : ''}
      <div>${xFieldName || 'X'}: ${xDisplay}</div>
      <div>${yFieldName || 'Y'}: ${yDisplay}</div>
      ${sizeLabel ? `<div>${sizeLabel}: ${sizeDisplay}</div>` : ''}`

    // ===== 2. 雷达探测（调用共享函数）=====
    const groups = getCoveredGroups(hoveredIdx)
    if (groups.length === 0) return html

    // ===== 3. 拼接覆盖气泡列表 =====
    html += `<div style="border-top: 1px solid rgba(255,255,255,0.2); margin: 6px 0;"></div>`
    html += `<div style="font-size: 11px; opacity: 0.7; margin-bottom: 4px;">覆盖的气泡 (${groups.length})</div>`
    for (const g of groups) {
      const nameStr = g.names.filter(n => n).join(', ')
      html += `<div style="margin-bottom: 4px;">
        ${nameStr ? `<div style="font-weight: 500;">${nameStr}</div>` : ''}
        <div style="font-size: 11px; opacity: 0.85;">
          ${xFieldName || 'X'}: ${g.xDisplay}&nbsp;&nbsp;${yFieldName || 'Y'}: ${g.yDisplay}&nbsp;&nbsp;${sizeLabel}: ${g.sizeDisplay}
        </div>
      </div>`
    }

    return html
  }
}
```

### 改动 4：重写 handleBubbleClick，复制完整 tooltip 内容

**文件**: `src/components/BubbleChart.tsx`
**位置**: 第 1756-1803 行（替换整个 `handleBubbleClick`）

**做什么**: 复用 `formatAxisValue` 和 `getCoveredGroups`，生成与 tooltip 内容一致的纯文本，包含覆盖气泡列表。

**为什么**: 用户要求"tooltip 中展示什么信息就都复制了"。当前只复制主气泡 4 项，且 size 字段名与 tooltip 不一致（`sizeFieldName` vs `sizeLabel`）。

**怎么做**:
```typescript
const handleBubbleClick = (params: any) => {
  if (params.componentType === 'series' && params.seriesType === 'scatter') {
    const data = params.data
    if (!data) return
    const hoveredIdx = data.__idx ?? params.dataIndex
    const sizeLabel = config.sizeMode === 'count' ? t('label.count') : sizeFieldName

    // 格式化主气泡（复用 formatAxisValue，与 tooltip 一致）
    let xDisplay = data.data ? data.data[0] : data.value[0]
    let yDisplay = data.data ? data.data[1] : data.value[1]
    let sizeDisplay: number | string = data.data ? data.data[2] : data.value[2]
    xDisplay = formatAxisValue(xDisplay, xAxisType, xIsPercentage, xFieldHasTime)
    yDisplay = formatAxisValue(yDisplay, yAxisType, yIsPercentage, yFieldHasTime)
    if (sizeIsPercentage && typeof sizeDisplay === 'number' && config.sizeMode !== 'count') {
      sizeDisplay = parseFloat((sizeDisplay * 100).toFixed(2)) + '%'
    }

    // 构建复制文本（主气泡）
    let copyText = ''
    if (data.name) copyText += `${data.name}\n`
    copyText += `${xFieldName || 'X'}: ${xDisplay}`
    copyText += `\n${yFieldName || 'Y'}: ${yDisplay}`
    if (sizeLabel) copyText += `\n${sizeLabel}: ${sizeDisplay}`

    // 追加覆盖气泡列表（与 tooltip 内容一致）
    const groups = getCoveredGroups(hoveredIdx)
    if (groups.length > 0) {
      copyText += `\n\n覆盖的气泡 (${groups.length})`
      for (const g of groups) {
        const nameStr = g.names.filter(n => n).join(', ')
        copyText += `\n${nameStr ? nameStr + ' | ' : ''}${xFieldName || 'X'}: ${g.xDisplay}, ${yFieldName || 'Y'}: ${g.yDisplay}, ${sizeLabel}: ${g.sizeDisplay}`
      }
    }

    copyToClipboard(copyText).then(() => {
      Toast.success({ content: t('toast.copySuccess', '复制成功'), theme: 'light', showClose: false })
    }).catch(() => {
      Toast.error({ content: t('toast.copyFailed', '复制失败'), theme: 'light', showClose: false })
    })
  }
}
```

### 改动 5：Tooltip 最大高度 + 滚动方案

**文件**: `src/components/BubbleChart.tsx`
**位置**: tooltip 配置块（改动 3 中已包含）

**做什么**: 在 tooltip 配置中增加：
- `confine: true` — tooltip 约束在图表容器内，不被外层 `overflow: hidden` 裁切
- `enterable: true` — 允许鼠标移入 tooltip
- `hideDelay: 300` — 鼠标离开气泡后 300ms 才隐藏 tooltip，给用户时间移入 tooltip
- `extraCssText: 'max-width: 360px; max-height: 320px; overflow-y: auto; overflow-x: hidden;'` — 限制尺寸 + 纵向滚动

**关于用户疑问的分析**（"光标不在 tooltip 上，滚动能否远距离触发"）：

**结论：可以解决，但需要用户把光标移到 tooltip 上，而非远距离滚动。**

ECharts 的 `enterable: true` 是专门为此场景设计的：
1. 鼠标 hover 气泡 → tooltip 显示
2. 鼠标移向 tooltip → 因 `hideDelay: 300`，tooltip 不会立即消失
3. 鼠标进入 tooltip 区域 → tooltip 持续显示，此时滚轮滚动会触发 tooltip 内部的 `overflow-y: auto` 滚动条
4. 鼠标离开 tooltip → 300ms 后隐藏

**这是 ECharts 官方推荐的滚动 tooltip 方案**，不存在"远距离触发"的不可靠性——光标确实在 tooltip 上，滚动是原生 DOM 行为，触控板和鼠标滚轮都支持。

**注意事项**：
- `confine: true` 确保 tooltip 不超出图表容器，否则 `overflow-y: auto` 的滚动区域可能被外层 `overflow: hidden`（第 1845 行）裁切
- `max-height: 320px` 约为 8-10 行气泡信息的高度，超出后滚动
- `max-width: 360px` 防止单行内容过宽撑爆 tooltip
- 若内容未超限，tooltip 保持自然大小，不影响现有体验

---

## Assumptions & Decisions

### 设计决策

1. **完全覆盖判定**：`distance + smallRadius <= hoverRadius`。用户原文"小气泡整个被覆盖后才算是包含关系"明确要求完全覆盖。这比中心点法严格，只有真正无法 hover 到的气泡才被探测。

2. **padding 统一策略**：移除 formatter 内联的 `padding: 8px`，改由 tooltip 配置层 `padding: [8, 10]` 统一控制。主体和列表区不再各自包裹 padding div，结构更扁平。`[8, 10]`（上下 8px、左右 10px）比原来的 8px 略紧凑，符合用户"更紧凑"的要求。

3. **共享函数提取**：`getCoveredGroups(hoveredIdx)` 封装雷达探测 + 分组 + 排序，formatter 和 click handler 共用。避免 ~30 行逻辑重复，确保 tooltip 显示内容与复制内容完全一致。

4. **滚动方案**：`enterable: true` + `hideDelay: 300` + `extraCssText` 三件套。这是 ECharts 官方方案，可靠。用户担心的"远距离滚动"问题不存在——光标移入 tooltip 后滚动是原生 DOM 行为。

5. **复制文本格式**：主气泡保持多行格式；覆盖气泡列表每行一条，格式为 `名称 | X: ..., Y: ..., Size: ...`，用 `|` 分隔名称和坐标，便于阅读和粘贴到表格。

6. **不改名 i18n key**："覆盖的气泡"直接硬编码在 formatter 中（与当前"包含的气泡"硬编码方式一致），不新增 i18n key。如后续需国际化可再提取。

### 假设

- ECharts 6 的 `enterable` + `hideDelay` + `extraCssText` 行为与 ECharts 5 一致（官方 API 稳定）。
- `confine: true` 能正确约束 tooltip 在图表容器内，不被第 1845 行的 `overflow: hidden` 裁切。若发现裁切，可调整外层容器 overflow 或 tooltip position。
- `max-height: 320px` 能容纳约 8-10 行覆盖气泡信息，满足大多数场景。极端数据下滚动查看。
- `getCoveredGroups` 提取到 `const option` 之前的作用域，formatter（在 option 内）和 `handleBubbleClick`（在事件监听 useEffect 内）都能访问。需确认 `handleBubbleClick` 所在 useEffect 与主渲染 useEffect 的作用域关系——`getCoveredGroups` 定义在主渲染 useEffect 内部，`handleBubbleClick` 在另一个 useEffect 中，**无法直接访问**。

### ⚠️ 作用域问题与解决

`getCoveredGroups` 若定义在主渲染 useEffect 内部，`handleBubbleClick`（在另一个 useEffect 中）无法访问。两个解决方案：

**方案 A（推荐）**：将 `getCoveredGroups` 提取为组件级函数，依赖项通过 ref 传递。但 `seriesData`、`symbolSizeFn`、`formatAxisValue` 都在主渲染 useEffect 内部定义，提取到组件级需要大量重构。

**方案 B（采用）**：将 `getCoveredGroups` 的核心数据（`seriesData`、`symbolSizeFn`、`formatAxisValue`、轴配置）通过 ref 暴露，函数定义在组件级。

实际上更简单的方案：**将 `getCoveredGroups` 定义为组件级函数，内部从 ref 读取所需数据**。新增一个 `chartDataContextRef` 存储当前渲染所需的 `seriesData`、`symbolSizeFn`、`formatAxisValue`、轴配置等，在主渲染 useEffect 中更新此 ref，`getCoveredGroups` 从 ref 读取。

但这会增加复杂度。**更务实的方案**：`handleBubbleClick` 中不调用 `getCoveredGroups`，而是直接从 `bubblePositionsRef` 重新实现覆盖判定 + 分组（复制 ~20 行逻辑）。虽然有小幅重复，但避免跨 useEffect 作用域问题。

**最终决策**：采用务实方案——`getCoveredGroups` 定义在主渲染 useEffect 内部供 formatter 使用；`handleBubbleClick` 中复制覆盖判定 + 分组逻辑（约 20 行）。两处逻辑相同，通过注释标明关联。这样改动最小，不引入 ref 传递复杂度。

---

## Verification Steps

1. **覆盖判定验证**：
   - 构造大气泡（size=100，半径 35px）+ 小气泡（size=5，半径 3.5px），小气泡中心距大气泡中心 30px
   - 旧逻辑（中心点法）：30 <= 35 → 判定为覆盖 ✓
   - 新逻辑（完全覆盖）：30 + 3.5 = 33.5 <= 35 → 判定为覆盖 ✓
   - 将小气泡移到距中心 33px：旧逻辑 33 <= 35 → 覆盖；新逻辑 33 + 3.5 = 36.5 > 35 → 不覆盖 ✓（边缘露出，可 hover）

2. **padding 统一验证**：
   - hover 大气泡，观察 tooltip 主体区和"覆盖的气泡"区到 tooltip 边框的距离是否一致
   - 对比改动前后，确认主体区不再有额外的 8px 内边距

3. **改名验证**：
   - tooltip 中"包含的气泡"已变为"覆盖的气泡"

4. **完整复制验证**：
   - hover 大气泡（有覆盖气泡），点击该大气泡
   - 粘贴板内容应包含主气泡信息 + "覆盖的气泡 (N)" + 每个覆盖气泡的详细信息
   - 复制的 size 字段名在计数模式下应为"计数"（与 tooltip 一致）

5. **滚动验证**：
   - 构造 1 个大气泡覆盖 20+ 个小气泡的场景
   - hover 大气泡，tooltip 出现滚动条
   - 鼠标移入 tooltip，滚轮滚动，tooltip 内容可上下滚动
   - 鼠标移出 tooltip，300ms 后 tooltip 消失
   - tooltip 不超出图表容器边界（`confine: true` 生效）

6. **无覆盖气泡回归**：
   - hover 独立小气泡（无覆盖），tooltip 只显示主气泡信息，无滚动条，无"覆盖的气泡"部分
   - 点击该独立小气泡，复制内容只有主气泡信息

7. **现有功能回归**：
   - 象限标题 hover 高亮、点击复制统计信息不受影响
   - 颜色分组图例不受影响
   - Resize 后 tooltip 仍能正确探测覆盖气泡

8. **Lint / TypeCheck**：
   - `npx tsc --noEmit` 无错误
   - `npx eslint src/components/BubbleChart.tsx` 无新增错误（`any` 为既有风格）
