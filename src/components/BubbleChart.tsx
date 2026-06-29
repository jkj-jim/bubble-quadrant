/**
 * BubbleChart.tsx - 气泡图渲染组件
 *
 * 功能说明：
 * 1. 使用ECharts库渲染气泡图
 * 2. 负责图表的初始化、数据更新和响应式布局
 * 3. 提供加载状态和空状态提示
 * 4. 根据数据中的size字段控制气泡大小
 *
 * 逻辑流程：
 * - 组件挂载时初始化ECharts实例
 * - 数据变化时更新图表配置和重新渲染
 * - 监听窗口大小变化进行图表重绘
 * - 组件卸载时清理ECharts实例
 *
 * 依赖引用：
 * - echarts: 图表渲染库
 * - ../hooks/useDashboard: 数据类型定义（DataItem）
 */

import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'
import type { DataItem } from '../hooks/useDashboard'
import type { BubbleChartConfig } from '../hooks/useDashboard'
import { useCategoryAxisMapper } from '../hooks/useCategoryAxisMapper'
import { Empty, Toast, Input } from '@douyinfe/semi-ui'
import { IconSearch } from '@douyinfe/semi-icons'

/**
 * BubbleChartProps - 气泡图组件属性
 * 功能：定义组件接收的props类型
 * 扩展：支持数值轴、类目轴和日期轴三种模式
 */
export interface BubbleChartProps {
  data: DataItem[]
  loading: boolean
  permissionDenied?: boolean   // 权限错误状态（应用模式下无权限访问数据源）
  config: BubbleChartConfig
  theme?: string
  xFieldName?: string       // 横轴字段名（用于显示）
  yFieldName?: string       // 纵轴字段名（用于显示）
  sizeFieldName?: string    // 大小字段名（用于显示）
  nameFieldName?: string    // 名称字段名（用于判断是否显示标签）
  xAxisType?: 'value' | 'category' | 'date'  // 横轴类型（数值/类目/日期）
  yAxisType?: 'value' | 'category' | 'date'  // 纵轴类型（数值/类目/日期）
  xAxisData?: string[]      // 横轴类目选项列表
  yAxisData?: string[]      // 纵轴类目选项列表
  xIsPercentage?: boolean   // 横轴是否为百分比格式
  yIsPercentage?: boolean   // 纵轴是否为百分比格式
  sizeIsPercentage?: boolean // 气泡大小是否为百分比格式
  enableMultiColor?: boolean // 是否开启多彩模式
  showLabel?: boolean        // 是否常显名称标签
  xFieldHasTime?: boolean    // 横轴日期字段是否包含时间
  yFieldHasTime?: boolean    // 纵轴日期字段是否包含时间
}

/**
 * BubbleChart - 气泡图组件
 * 功能：封装ECharts气泡图，支持数据渲染、响应式布局、数值轴、类目轴和日期轴
 * 说明：
 * - 支持数值轴（type: 'value'）用于传统的气泡图
 * - 支持类目轴（type: 'category'）用于散点图和混合轴场景
 * - 支持日期轴（type: 'date'）用于时间序列数据，底层使用时间戳
 * - 类目轴显示用户在单选字段中设定的选项顺序
 */

/**
 * 日期格式化工具函数
 * @param timestamp 毫秒时间戳
 * @param hasTime 是否包含时间
 * @param forTooltip 是否用于tooltip（tooltip显示年份）
 */
const formatDate = (timestamp: number, hasTime: boolean, forTooltip: boolean = false): string => {
  const date = new Date(timestamp)
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  if (forTooltip) {
    // tooltip 显示完整日期（含年份）
    const year = date.getFullYear()
    const monthStr = String(month).padStart(2, '0')
    const dayStr = String(day).padStart(2, '0')
    if (hasTime) {
      return `${year}-${monthStr}-${dayStr} ${hours}:${minutes}`
    }
    return `${year}-${monthStr}-${dayStr}`
  }

  // 轴刻度不显示年份
  if (hasTime) {
    return `${month}.${day} ${hours}:${minutes}`
  }
  return `${month}.${day}`
}

/**
 * ECharts axisLabel 默认 fontSize 12px，中文字符宽度约等于字号
 * 用于估算最长类目标签的像素宽度
 */
const ESTIMATED_CHAR_WIDTH = 12

/**
 * 复用的离屏 canvas，用于精确量测刻度标签的像素宽度
 * 比"字符数 × 字宽"更准确（兼顾中文、数字、英文、标点的不同宽度）
 */
let measureCanvas: HTMLCanvasElement | null = null
const measureTextWidth = (text: string, font: string): number => {
  if (!measureCanvas) measureCanvas = document.createElement('canvas')
  const ctx = measureCanvas.getContext('2d')
  if (!ctx) return text.length * ESTIMATED_CHAR_WIDTH  // 量测失败时退化为字符数估算
  ctx.font = font
  return ctx.measureText(text).width
}

/**
 * 根据"每个刻度的可用宽度"和"最长标签宽度"，计算横轴标签的旋转角度
 *
 * 核心原则：全程不截断、不隐藏，靠"最小必要旋转角"让标签彼此不重叠；
 * 只有当旋转到 90°（纵排）仍放不下时，才交给 hideOverlap 隐藏部分标签。
 *
 * 几何依据：一段长 L、行高 h 的文本旋转 θ 后，其水平投影宽度约为
 *   footprint(θ) = L·cosθ + h·sinθ
 * 只要 footprint(θ) ≤ 单刻度可用宽度 avgWidth，相邻标签就不会重叠。
 * 从 0° 逐度增大，取第一个满足条件的角度即为"最小必要旋转角"，可读性最佳。
 *
 * @param avgWidth     单个刻度可用的水平像素宽度（= grid 宽度 / 刻度数）
 * @param labelPx      最长标签的像素宽度
 * @param lineHeight   标签行高（旋转后纵向占据的水平投影厚度）
 * @returns rotate 旋转角度；hideOverlap 是否需要隐藏重叠（仅 90° 仍放不下时为 true）
 */
const computeRotateForFit = (
  avgWidth: number,
  labelPx: number,
  lineHeight: number
): { rotate: number; hideOverlap: boolean } => {
  // 横排即可完整放下 → 不旋转
  if (labelPx <= avgWidth) return { rotate: 0, hideOverlap: false }
  // 从 1° 起逐度寻找能容纳的最小旋转角（步进 1°，缩放时过渡顺滑）
  for (let deg = 1; deg <= 90; deg++) {
    const rad = (deg * Math.PI) / 180
    const footprint = labelPx * Math.cos(rad) + lineHeight * Math.sin(rad)
    if (footprint <= avgWidth) return { rotate: deg, hideOverlap: false }
  }
  // 即便 90° 纵排也放不下（avgWidth < 行高）→ 纵排 + 隐藏重叠兜底
  return { rotate: 90, hideOverlap: true }
}

// 统一的图表样式配置
// 使用 Semi UI 的 CSS 变量名，支持暗黑模式自动切换
const CHART_STYLE_CONFIG = {
  colors: {
    axisName: '--semi-grey-5',
    axisLine: '--semi-grey-2',
    axisLabel: '--semi-grey-5',
    splitLine: '--semi-grey-1'  // 浅灰色网格线
  },
  bubble: {
    minSize: 7,
    maxSize: 70,
    defaultSize: 8,
    opacity: 0.7,
    nativeColorOpacity: 0.9,  // 使用飞书原生单选颜色时的不透明度（更接近原始色）
    borderColor: '--semi-grey-9'
  },
  label: {
    fontSize: 12,
    opacity: 0.8,
    position: 'inside' as const,
  },
  grid: {
    left: '20px',
    right: '60px',
    bottom: '30px',
    top: '40px',
    containLabel: true
  },
  emphasis: {
    opacity: 1,
    shadowBlur: 10,
    shadowColor: 'rgba(0, 0, 0, 0.3)',
  }
}

/**
 * 象限标识符类型
 * TL: Top-Left (左上), TR: Top-Right (右上)
 * BL: Bottom-Left (左下), BR: Bottom-Right (右下)
 * LEFT/RIGHT: 左右分割模式
 * TOP/BOTTOM: 上下分割模式
 */

type QuadrantKey = 'TL' | 'TR' | 'BL' | 'BR' | 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM'

/**
 * 象限标签信息
 * 用于渲染自定义的象限名称 label
 */
interface QuadrantLabelInfo {
  key: QuadrantKey
  name: string
  x: number  // 像素坐标
  y: number  // 像素坐标
  position: 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'  // label 在象限中的位置
}

/**
 * 象限 tooltip 信息
 */
interface QuadrantTooltipInfo {
  visible: boolean
  x: number
  y: number
  name: string
  count: number
  avg?: number
  median?: number
  max?: number
  min?: number
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

/**
 * 计算数组的中位数
 */
const calculateMedian = (numbers: number[]): number => {
  if (numbers.length === 0) return 0
  const sorted = [...numbers].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * 复制文本到剪贴板（兼容飞书 iframe 环境）
 * 使用传统的 textarea + execCommand 方法作为主要方案
 */
const copyToClipboard = (text: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    // 创建临时 textarea 元素
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '-9999px'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()

    try {
      const success = document.execCommand('copy')
      document.body.removeChild(textarea)
      if (success) {
        resolve()
      } else {
        reject(new Error('execCommand failed'))
      }
    } catch (err) {
      document.body.removeChild(textarea)
      reject(err)
    }
  })
}

/**
 * 判断一个气泡属于哪个象限
 * @param x 气泡的 x 值（数值或类目索引）
 * @param y 气泡的 y 值（数值或类目索引）
 * @param xThreshold x 轴分割线位置
 * @param yThreshold y 轴分割线位置
 * @returns 象限标识符
 */
const getQuadrantForBubble = (
  x: number,
  y: number,
  xThreshold: number | null,
  yThreshold: number | null
): QuadrantKey | null => {
  // 无分割线
  if (xThreshold === null && yThreshold === null) return null

  // 仅 X 轴分割（左右模式）
  if (xThreshold !== null && yThreshold === null) {
    return x < xThreshold ? 'LEFT' : 'RIGHT'
  }

  // 仅 Y 轴分割（上下模式）
  if (xThreshold === null && yThreshold !== null) {
    return y >= yThreshold ? 'TOP' : 'BOTTOM'
  }

  // 双轴分割（4 象限模式）
  if (xThreshold !== null && yThreshold !== null) {
    if (x < xThreshold && y >= yThreshold) return 'TL'
    if (x >= xThreshold && y >= yThreshold) return 'TR'
    if (x < xThreshold && y < yThreshold) return 'BL'
    return 'BR'
  }

  return null
}


/**
 * 计算指定区域内气泡的统计数据（支持多分割线）
 * @param data 所有气泡数据
 * @param regionKey 区域标识符，格式为 "row_col"
 * @param xThresholds x 轴分割线位置数组（已排序）
 * @param yThresholds y 轴分割线位置数组（已排序）
 * @param xAxisType x 轴类型
 * @param yAxisType y 轴类型
 */
const calculateRegionStats = (
  data: DataItem[],
  regionKey: string,
  xThresholds: number[],
  yThresholds: number[],
  xAxisType: 'value' | 'category' | 'date',
  yAxisType: 'value' | 'category' | 'date'
) => {
  // 解析区域 key
  const [targetRow, targetCol] = regionKey.split('_').map(Number)

  // 日期轴视同数值轴处理
  const xIsCategory = xAxisType === 'category'
  const yIsCategory = yAxisType === 'category'

  // 筛选属于该区域的气泡
  const bubblesInRegion = data.filter(item => {
    // 获取 x 值（数值轴/日期轴直接用值，类目轴用索引）
    const xVal = xIsCategory && item.xCategoryIndex !== undefined
      ? item.xCategoryIndex
      : item.x as number

    // 获取 y 值
    const yVal = yIsCategory && item.yCategoryIndex !== undefined
      ? item.yCategoryIndex
      : item.y as number

    // 计算列位置
    let col = 0
    for (const threshold of xThresholds) {
      if (xVal >= threshold) col++
      else break
    }

    // 计算行位置
    let row = 0
    for (const threshold of yThresholds) {
      if (yVal >= threshold) row++
      else break
    }

    return row === targetRow && col === targetCol
  })

  const count = bubblesInRegion.length
  const sizes = bubblesInRegion.map(b => b.size).filter(s => typeof s === 'number' && !isNaN(s))

  if (sizes.length === 0) {
    return { count, avg: undefined, median: undefined, max: undefined, min: undefined }
  }

  return {
    count,
    avg: sizes.reduce((a, b) => a + b, 0) / sizes.length,
    median: calculateMedian(sizes),
    max: Math.max(...sizes),
    min: Math.min(...sizes)
  }
}


export const BubbleChart: React.FC<BubbleChartProps> = ({
  data,
  xFieldName,
  yFieldName,
  sizeFieldName,
  nameFieldName,
  loading,
  permissionDenied,  // 权限错误状态
  theme,
  xAxisType = 'value',  // 默认为数值轴，向后兼容
  yAxisType = 'value',  // 默认为数值轴，向后兼容
  xAxisData,
  yAxisData,
  xIsPercentage,
  yIsPercentage,
  sizeIsPercentage,
  enableMultiColor,
  showLabel,
  config,
  xFieldHasTime = false,  // 横轴日期是否包含时间
  yFieldHasTime = false,  // 纵轴日期是否包含时间
}) => {
  const { t } = useTranslation()

  // chartRef: ECharts容器DOM元素引用
  const chartRef = useRef<HTMLDivElement>(null)

  // chartInstanceRef: ECharts实例引用
  const chartInstanceRef = useRef<echarts.ECharts | null>(null)

  // bubblePositionsRef: 缓存所有气泡的像素坐标和半径，用于 tooltip 雷达聚合
  // 在 setOption 后预计算，ResizeObserver 时清空，formatter 中按需兜底重算
  const bubblePositionsRef = useRef<Array<{
    idx: number        // 全局索引（对应数据点 __idx）
    pixelX: number     // 像素 X 坐标
    pixelY: number     // 像素 Y 坐标
    radius: number     // 像素半径（= symbolSizeFn(value) / 2）
    sizeVal: number    // 原始 size 值（用于排序）
    data: any          // 原始数据点引用（含 name, value, data 等字段）
  }>>([])

  // ===== 图例搜索（颜色分组项很多时，按关键字快速定位）=====
  // legendSearch: 搜索关键字；legendDataRef/groupNamesRef: 缓存完整图例数据供筛选复用
  const [legendSearch, setLegendSearch] = useState('')
  const legendDataRef = useRef<Array<{ name: string; itemStyle: { color: string; opacity: number } }>>([])
  const groupNamesRef = useRef<string[]>([])

  // 优化色板（9色）：4明4暗 + 灰，每个色相唯一，无同色系混淆
  const colorPalette = [
    '#3370FF', // 蔚蓝（暗）
    '#FF5255', // 正红（明）
    '#7ED957', // 苹果绿（明）
    '#FF7A30', // 橙色（明）
    '#7B61FF', // 靛紫（暗）
    '#FFD000', // 金黄（明）
    '#2DBDB6', // 青碧（暗）
    '#E54598', // 玫红（暗）
    '#6B7B8D', // 深灰
  ]

  // 获取 CSS 变量颜色的辅助函数
  // Semi UI 的 grey 系列变量存储的是 RGB 数字（如 "230,232,234"），需要转换为 rgb() 格式
  const getTokenColor = (token: string, defaultValue: string = '') => {
    const value = getComputedStyle(document.body).getPropertyValue(token).trim()
    if (!value) return defaultValue

    // 如果值是纯数字和逗号（RGB 格式），转换为 rgb()
    if (/^[\d\s,]+$/.test(value)) {
      return `rgb(${value})`
    }

    // 否则直接返回（已经是完整颜色值）
    return value
  }

  // 使用 useMemo 自动解析样式配置
  // 依赖 theme 属性，当主题变化时自动重新计算颜色
  const chartStyles = useMemo(() => {
    return {
      colors: {
        axisName: getTokenColor(CHART_STYLE_CONFIG.colors.axisName, '#646A73'),
        axisLine: getTokenColor(CHART_STYLE_CONFIG.colors.axisLine, '#BBBFC4'),
        axisLabel: getTokenColor(CHART_STYLE_CONFIG.colors.axisLabel, '#646A73'),
        // splitLine 使用 grey-1 + 50% 透明度，介于 grey-0（太浅）和 grey-1（太深）之间
        // Semi UI 的 grey 系列变量存储的是纯 RGB 数值（如 "230, 232, 234"）
        splitLine: `rgba(${getComputedStyle(document.body).getPropertyValue(CHART_STYLE_CONFIG.colors.splitLine).trim() || '243, 244, 245'}, 0.5)`,
      },
      bubble: {
        ...CHART_STYLE_CONFIG.bubble,
        borderColor: getTokenColor(CHART_STYLE_CONFIG.bubble.borderColor, '#555')
      },
      label: CHART_STYLE_CONFIG.label,
      grid: CHART_STYLE_CONFIG.grid,
      emphasis: CHART_STYLE_CONFIG.emphasis
    }
  }, [theme])

  // ===== 类目轴映射器 =====
  // 使用数值轴"伪装"类目轴，解决 markLine/markArea 无法精确定位的问题
  const xAxisMapper = useCategoryAxisMapper(xAxisData)
  const yAxisMapper = useCategoryAxisMapper(yAxisData)

  // ===== 象限 Label 状态管理 =====
  // 存储象限 label  // 移除 quadrantLabels 状态
  // const [quadrantLabels, setQuadrantLabels] = useState<QuadrantLabelInfo[]>([])

  // 象限 tooltip 状态
  const [quadrantTooltip, setQuadrantTooltip] = useState<QuadrantTooltipInfo>({
    visible: false,
    x: 0,
    y: 0,
    name: '',
    count: 0
  })

  // 当前 hover 的象限（用于高亮/弱化效果）
  const [hoveredQuadrant, setHoveredQuadrant] = useState<QuadrantKey | null>(null)

  /**
   * 计算分割线在坐标轴上的数值位置
   * 用于判断气泡所属象限和计算 label 位置
   * 类目轴使用 mapper.getThresholdPosition() 精确定位到类目之间
   * 
   * 返回 xVal/yVal 为第一条分割线（向后兼容）
   * 返回 xVals/yVals 为所有分割线数组（新功能）
   */
  const getThresholdValues = useCallback(() => {
    // 获取有效的分割线数组（优先使用新格式）
    const xThresholdsList = config.xThresholds || (config.xThreshold ? [config.xThreshold] : [])
    const yThresholdsList = config.yThresholds || (config.yThreshold ? [config.yThreshold] : [])

    // 转换为数值数组
    const xVals = xThresholdsList
      .filter(Boolean)
      .map(t => xAxisType === 'category'
        ? xAxisMapper.getThresholdPosition(t as string)
        : parseFloat(t as string)
      )
      .filter(v => v !== null && !isNaN(v))
      .sort((a, b) => a - b) as number[]

    const yVals = yThresholdsList
      .filter(Boolean)
      .map(t => yAxisType === 'category'
        ? yAxisMapper.getThresholdPosition(t as string)
        : parseFloat(t as string)
      )
      .filter(v => v !== null && !isNaN(v))
      .sort((a, b) => a - b) as number[]

    // 向后兼容：xVal/yVal 为第一条分割线
    const xVal = xVals.length > 0 ? xVals[0] : null
    const yVal = yVals.length > 0 ? yVals[0] : null

    return { xVal, yVal, xVals, yVals }
  }, [config.xThreshold, config.yThreshold, config.xThresholds, config.yThresholds, xAxisType, yAxisType, xAxisMapper, yAxisMapper])




  /**
   * 创建轴配置
   * @param axisConfig 轴特定配置
   *
   * 类目轴处理策略（方案 B）：
   * - 不使用 type: 'category'，而是使用 type: 'value'
   * - 通过 mapper.getAxisConfig() 提供 min/max/interval/formatter
   * - 这样可以让 markLine/markArea 精确定位到类目之间
   * 
   * 日期轴处理策略：
   * - 使用 type: 'value'，底层是毫秒时间戳
   * - 通过自定义 formatter 将时间戳转换为日期显示
   */
  const createAxisConfig = (axisConfig: {
    type: 'value' | 'category' | 'date'
    name: string
    data?: string[]
    isPercentage?: boolean
    mapper?: ReturnType<typeof useCategoryAxisMapper>  // 类目轴映射器
    otherAxisIsCategory?: boolean  // 另一个轴是否是类目轴
    hasTime?: boolean  // 日期轴是否包含时间
    isHorizontal?: boolean  // 是否为横轴：影响 overflow/rotate 策略
  }) => {
    // 基础配置（两种轴类型共用）
    const baseConfig = {
      name: axisConfig.name,
      nameLocation: 'end' as const,
      nameGap: 10,
      nameTextStyle: {
        color: chartStyles.colors.axisName
      },
      splitLine: {
        show: true,
        lineStyle: {
          type: 'dashed' as const,
          color: chartStyles.colors.splitLine
        }
      },
      axisLine: {
        // 如果另一个轴是类目轴，则当前轴显示在边缘而非另一轴的 0 点位置
        onZero: !axisConfig.otherAxisIsCategory,
        lineStyle: {
          color: chartStyles.colors.axisLine
        }
      },
      axisLabel: {
        color: chartStyles.colors.axisLabel
      },
      scale: true
    }

    // 类目轴：使用数值轴"伪装"
    if (axisConfig.type === 'category' && axisConfig.mapper && axisConfig.mapper.length > 0) {
      const mapperConfig = axisConfig.mapper.getAxisConfig()
      // 原始 formatter 将索引转换为类目文本
      const originalFormatter = mapperConfig.axisLabel.formatter
      const isHorizontal = axisConfig.isHorizontal ?? false
      return {
        ...baseConfig,
        type: 'value' as const,  // 关键：使用数值轴
        min: mapperConfig.min,
        max: mapperConfig.max,
        splitNumber: mapperConfig.splitNumber,
        axisLabel: {
          color: chartStyles.colors.axisLabel,
          formatter: originalFormatter,
          ...(isHorizontal
            ? {
                // 横轴：rotate / hideOverlap 由 updateXAxisLabelLayout 在布局后按真实宽度动态计算
                // 这里仅给初始占位值；width 999 表示不截断，hideOverlap 先关闭等待动态计算
                // （横轴只在旋转到 90° 仍放不下时才隐藏，避免旋转途中误隐藏）
                interval: 'auto',
                overflow: 'truncate',
                width: 999,
                rotate: 0,
                hideOverlap: false
              }
            : {
                // 纵轴：超宽自动换行，刻度稀疏时可多行展示完整文本；开启 hideOverlap 兜底
                overflow: 'break',
                width: 60,
                lineHeight: 14,
                hideOverlap: true
              }
          )
        },
        // 禁用 scale，使用固定的 min/max
        scale: false
      }
    }

    // 日期轴：使用 ECharts 内置的 time 轴类型
    // time 轴会自动将刻度对齐到日期边界（如每天午夜），避免气泡位置和刻度标签的视觉偏移
    if (axisConfig.type === 'date') {
      const hasTime = axisConfig.hasTime ?? false
      return {
        ...baseConfig,
        type: 'time' as const,
        // 纯日期字段：最小刻度间隔为 1 天（86400000ms），防止出现小时级子刻度
        // 含时间字段：不设限制，允许按小时/分钟级别显示刻度
        ...(hasTime ? {} : { minInterval: 86400000 }),
        // 给两端加留白，防止首尾数据点紧贴轴边缘且没有对应刻度，纯日期字段两端扩展1天，含时间字段两端扩展半天
        min: (value: any) => value.min - (hasTime ? 43200000 : 86400000),
        max: (value: any) => value.max + (hasTime ? 43200000 : 86400000),
        axisLabel: {
          color: chartStyles.colors.axisLabel,
          hideOverlap: true,
          formatter: (value: any) => {
            if (typeof value === 'number') {
              return formatDate(value, hasTime, false)
            }
            return value
          }
        }
      }
    }

    return {
      ...baseConfig,
      type: 'value' as const,
      axisLabel: {
        color: chartStyles.colors.axisLabel,
        hideOverlap: true,
        formatter: (value: any) => {
          if (axisConfig.isPercentage && typeof value === 'number') {
            return parseFloat((value * 100).toFixed(2)) + '%'
          }
          return value
        }
      }
    }
  }

  /**
   * 依据布局完成后真实的 grid 宽度与实际渲染的刻度标签，动态计算横轴标签的旋转角度
   *
   * 统一处理数值轴 / 日期轴 / 类目轴：通过 ECharts 的 getViewLabels() 读取真实标签，
   * 用离屏 canvas 量测最长标签宽度，再结合 grid 实际像素宽度算出"最小必要旋转角"。
   * 这样既修复了"数值轴/日期轴横轴从不旋转"，也避免了不同轴类型各写一套估算逻辑。
   *
   * 仅在 rotate / hideOverlap 真正变化时才 setOption，避免无谓重绘。
   * 仅修改 xAxis[0]，不触碰 yAxis 与其它组件。
   *
   * @returns 布局是否已就绪并完成计算（false 表示坐标系/刻度尚未就绪，需由调用方重试）
   */
  const updateXAxisLabelLayout = useCallback((): boolean => {
    const chart = chartInstanceRef.current
    if (!chart) return false
    try {
      const ecModel = (chart as any).getModel()
      const xAxisModel = ecModel.getComponent('xAxis', 0)
      const axis = xAxisModel?.axis
      if (!axis || !xAxisModel) return false

      // 实际将要绘制的刻度标签（已考虑 interval，但尚未做 hideOverlap 裁剪）
      const viewLabels = (axis.getViewLabels?.() || []) as Array<{ formattedLabel?: string }>
      const labelTexts = viewLabels
        .map(l => (l.formattedLabel ?? '').trim())
        .filter(s => s.length > 0)
      const tickCount = labelTexts.length

      // grid 实际像素宽度（真实可用区，比"容器宽度 × 经验系数"更准确）
      const gridRect = ecModel.getComponent('grid')?.coordinateSystem?.getRect()
      const gridWidth = gridRect?.width ?? 0

      // 布局尚未就绪（拿不到 grid 宽度或刻度还没生成）→ 返回 false，交给调用方逐帧重试
      // 这是修复"冷刷新后不旋转"的关键：首屏同步阶段坐标系常常还没建好
      if (gridWidth <= 0 || tickCount === 0) return false

      // 当前横轴标签配置：用于"无变化则跳过"
      const labelModel = xAxisModel.getModel('axisLabel')
      const curRotate = labelModel.get('rotate') ?? 0
      const curHide = labelModel.get('hideOverlap') ?? false
      const applyXLabel = (rotate: number, hideOverlap: boolean) => {
        if (curRotate === rotate && curHide === hideOverlap) return
        chart.setOption({ xAxis: [{ axisLabel: { rotate, hideOverlap, width: 999 } }] })
      }

      // 只有 1 个标签不可能重叠 → 恢复横排
      if (tickCount === 1) {
        applyXLabel(0, false)
        return true
      }

      // 用真实字体量测最长标签像素宽度
      const fontSize = Number(labelModel.get('fontSize')) || CHART_STYLE_CONFIG.label.fontSize
      const fontFamily = labelModel.get('fontFamily') || 'sans-serif'
      const font = `${fontSize}px ${fontFamily}`
      let maxLabelPx = 0
      for (const text of labelTexts) {
        maxLabelPx = Math.max(maxLabelPx, measureTextWidth(text, font))
      }

      const avgWidth = gridWidth / tickCount   // 单刻度可用宽度
      const lineHeight = fontSize * 1.2        // 旋转后纵向占据的水平投影厚度
      const { rotate, hideOverlap } = computeRotateForFit(avgWidth, maxLabelPx, lineHeight)
      applyXLabel(rotate, hideOverlap)
      return true
    } catch {
      // getViewLabels / grid 模型属于 ECharts 内部能力，异常时视为未就绪，交给调用方重试
      return false
    }
  }, [])

  /**
   * ECharts 'finished' 事件回调：在每次"渲染完全结束"后重算横轴旋转。
   *
   * 这是修复"冷刷新后不旋转"的关键：'finished' 保证此刻 grid 矩形是最终值
   * （已完成 containLabel 等布局调整），不会像 setTimeout/rAF 那样取到首屏过渡态的
   * 过大 grid 宽度而误判为"无需旋转"。每次渲染都会触发，配合 updateXAxisLabelLayout
   * 内部的"无变化则跳过"，会自然收敛到正确角度后停止 setOption（X 轴旋转不改变 grid
   * 宽度，因此计算稳定、不会来回抖动）。
   */
  const handleChartFinished = useCallback(() => {
    updateXAxisLabelLayout()
  }, [updateXAxisLabelLayout])

  useEffect(() => {
    return () => {
      // 组件卸载时清理
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose()
        chartInstanceRef.current = null
      }
    }
  }, [])

  // 使用 ResizeObserver 监听容器尺寸变化
  useEffect(() => {
    const container = chartRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (chartInstanceRef.current && width > 100 && height > 100) {
          // 先按新尺寸重新布局，再依据真实 grid 宽度与刻度标签重算横轴旋转角
          // resize() 本身会触发 'finished' 兜底，这里直接同步算一次以求即时响应
          chartInstanceRef.current.resize()
          updateXAxisLabelLayout()
          // 尺寸变化后像素坐标失效，清空缓存，下次 hover 时按需重算
          bubblePositionsRef.current = []
        }
      }
    })

    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [updateXAxisLabelLayout])

  useEffect(() => {
    // loading 状态或无数据时，跳过渲染
    // loading 时保留旧图表，避免闪烁；无数据时跳过渲染
    if (loading) {
      return
    }

    if (data.length === 0) {
      // 不使用 clear()，避免导致后续 setOption 无法正常渲染
      // 改为跳过渲染，保留上一帧画面
      return
    }

    // 如果 echarts 实例不存在或者 DOM 已变化，重新初始化
    if (!chartInstanceRef.current || chartInstanceRef.current.getDom() !== chartRef.current) {
      // 如果有旧实例，先销毁
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose()
      }
      if (chartRef.current) {
        chartInstanceRef.current = echarts.init(chartRef.current)
        // 每个实例只注册一次：渲染完全结束后重算横轴旋转（冷刷新关键兜底）
        chartInstanceRef.current.on('finished', handleChartFinished)
      } else {
        return
      }
    }
    /**
     * 使用工厂函数生成X轴和Y轴配置
     * 类目轴传入 mapper 以实现"伪装数值轴"效果
     * 日期轴传入 hasTime 以决定日期显示格式
     */
    const xAxis = createAxisConfig({
      type: xAxisType,
      name: xFieldName || t('chart.defaultXAxis'),
      data: xAxisType === 'category' ? xAxisData : undefined,
      isPercentage: xIsPercentage,
      mapper: xAxisType === 'category' ? xAxisMapper : undefined,
      otherAxisIsCategory: yAxisType === 'category',  // Y轴是类目轴时，X轴显示在边缘
      hasTime: xFieldHasTime,  // 日期轴是否显示时间
      isHorizontal: true
    }) as any

    const yAxis = createAxisConfig({
      type: yAxisType,
      name: yFieldName || t('chart.defaultYAxis'),
      data: yAxisType === 'category' ? yAxisData : undefined,
      isPercentage: yIsPercentage,
      mapper: yAxisType === 'category' ? yAxisMapper : undefined,
      otherAxisIsCategory: xAxisType === 'category',  // X轴是类目轴时，Y轴显示在边缘
      hasTime: yFieldHasTime,  // 日期轴是否显示时间
      isHorizontal: false
    }) as any

    // ===== 轴范围限制：数值轴和日期轴生效 =====
    // 如果配置了轴范围限制且是数值轴/日期轴，应用 min/max 到轴配置
    if ((xAxisType === 'value' || xAxisType === 'date') && config.xAxisRangeEnabled) {
      if (config.xAxisMin !== undefined && config.xAxisMin !== '') {
        // 日期轴：配置值可能是时间戳（已经是毫秒）
        xAxis.min = xAxisType === 'date' ? Number(config.xAxisMin) : parseFloat(config.xAxisMin)
      }
      if (config.xAxisMax !== undefined && config.xAxisMax !== '') {
        xAxis.max = xAxisType === 'date' ? Number(config.xAxisMax) : parseFloat(config.xAxisMax)
      }
    }
    if ((yAxisType === 'value' || yAxisType === 'date') && config.yAxisRangeEnabled) {
      if (config.yAxisMin !== undefined && config.yAxisMin !== '') {
        yAxis.min = yAxisType === 'date' ? Number(config.yAxisMin) : parseFloat(config.yAxisMin)
      }
      if (config.yAxisMax !== undefined && config.yAxisMax !== '') {
        yAxis.max = yAxisType === 'date' ? Number(config.yAxisMax) : parseFloat(config.yAxisMax)
      }
    }

    // ===== 横轴类目轴：把旋转角度"焼き込み"进首个 option（冷刷新关键）=====
    // ECharts 官方建议：rotate 应写入初始 option，而非渲染后再 late-merge setOption
    // （late-merge 在首屏会出现"转了但被隐藏的标签不恢复/根本不转"的问题，见 issue #9723）。
    // 类目轴的标签文本（xAxisData）此刻同步可得，容器 clientWidth 也同步可得，
    // 因此能在首次渲染前就算出正确角度，冷刷新即生效；之后再由 'finished' 事件按真实 grid 精修。
    if (xAxisType === 'category' && xAxisData && xAxisData.length > 0 && xAxis.axisLabel) {
      const containerWidth = chartRef.current?.clientWidth ?? 0
      if (containerWidth > 0) {
        const fontSize = CHART_STYLE_CONFIG.label.fontSize
        const font = `${fontSize}px sans-serif`
        let maxLabelPx = 0
        for (const s of xAxisData) {
          maxLabelPx = Math.max(maxLabelPx, measureTextWidth(String(s ?? ''), font))
        }
        // 估算 grid 绘图区宽度：扣除左右内边距(20+60)与纵轴标签占用(约45px)，并设下限
        const plotWidth = Math.max(containerWidth - 125, containerWidth * 0.5)
        const avgWidth = plotWidth / xAxisData.length
        const { rotate, hideOverlap } = computeRotateForFit(avgWidth, maxLabelPx, fontSize * 1.2)
        xAxis.axisLabel.rotate = rotate
        xAxis.axisLabel.hideOverlap = hideOverlap
        xAxis.axisLabel.width = 999
      }
    }

    /**
     * 处理图表数据，根据轴类型选择不同的值
     * 数值轴：直接使用数值（如果是字符串则尝试转换）
     * 类目轴：使用类目索引（指向 options 数组中的位置），但显示原始文本
     */
    // emptyLabel 用于颜色分组时空值的显示文本
    const emptyLabel = t('legend.empty')

    const seriesData = data.map((item, index) => {
      // X轴值处理
      let xValue: number | string
      let xDisplay: number | string

      if (xAxisType === 'category' && item.xCategoryIndex !== undefined) {
        xValue = item.xCategoryIndex  // 使用索引
        xDisplay = String(item.x)     // 显示原始文本
      } else {
        // 数值轴：确保值是数字类型
        const numX = typeof item.x === 'number' ? item.x : parseFloat(String(item.x))
        xValue = isNaN(numX) ? 0 : numX
        xDisplay = xValue
      }

      // Y轴值处理
      let yValue: number | string
      let yDisplay: number | string

      if (yAxisType === 'category' && item.yCategoryIndex !== undefined) {
        yValue = item.yCategoryIndex  // 使用索引
        yDisplay = String(item.y)     // 显示原始文本
      } else {
        // 数值轴：确保值是数字类型
        const numY = typeof item.y === 'number' ? item.y : parseFloat(String(item.y))
        yValue = isNaN(numY) ? 0 : numY
        yDisplay = yValue
      }

      // 颜色分组逻辑：
      // 1. 如果配置了颜色分组（按象限或按字段），优先使用颜色分组
      // 2. 如果开启多彩模式，按索引分配颜色
      // 3. 否则使用默认单色
      let itemColor = '#336DF4'
      let colorGroupKey = ''

      if (config.colorGroupType === 'quadrant') {
        // 按象限/区域分组：根据数据点所在区域决定颜色分组
        const { xVals, yVals } = getThresholdValues()

        // 如果没有配置分割线，无法进行象限分组
        if (xVals.length === 0 && yVals.length === 0) {
          colorGroupKey = emptyLabel
        } else {
          // 获取数据点坐标
          const xValNum = xAxisType === 'category' && item.xCategoryIndex !== undefined
            ? item.xCategoryIndex
            : xValue as number
          const yValNum = yAxisType === 'category' && item.yCategoryIndex !== undefined
            ? item.yCategoryIndex
            : yValue as number

          // 计算列位置（基于 xVals 分割线）
          let col = 0
          for (const threshold of xVals) {
            if (xValNum >= threshold) col++
            else break
          }

          // 计算行位置（基于 yVals 分割线）
          let row = 0
          for (const threshold of yVals) {
            if (yValNum >= threshold) row++
            else break
          }

          // 构建 region key 并获取区域名称
          const regionKey = `${row}_${col}`
          const regionConfig = config.regions?.[regionKey]
          colorGroupKey = regionConfig?.name || emptyLabel
        }
      } else if (config.colorGroupType === 'field' && item.colorGroupValue !== undefined) {
        // 按字段分组
        colorGroupKey = item.colorGroupValue || ''
      } else if (enableMultiColor) {
        // 多彩模式
        itemColor = colorPalette[index % colorPalette.length]
      }

      return {
        name: item.name,
        value: [xValue, yValue, item.size] as [number | string, number | string, number],
        // 使用原始文本作为显示值
        data: [xDisplay, yDisplay, item.size],
        colorGroupKey,  // 存储颜色分组 key
        __idx: index,   // 全局索引，用于 tooltip 雷达聚合（多 series 模式下定位全局数据）
        itemStyle: {
          color: itemColor,
          opacity: chartStyles.bubble.opacity,
          borderColor: chartStyles.bubble.borderColor
        }
      }
    })

    // ===== 颜色分组映射 =====
    // 如果配置了颜色分组，构建分组 -> 颜色的映射
    const colorGroupMap = new Map<string, { color: string, count: number, isNativeColor: boolean }>()

    if (config.colorGroupType) {
      // 收集所有唯一的分组 key
      // 优先使用飞书原生单选颜色，降级使用固定色板
      const optionColors = config.colorGroupOptionColors || {}
      let fallbackColorIndex = 0  // 降级色板的独立计数器

      seriesData.forEach((item: any) => {
        const key = item.colorGroupKey || ''
        const displayKey = key || emptyLabel  // 空值显示为"空"
        if (!colorGroupMap.has(displayKey)) {
          // 优先使用飞书原生颜色（通过选项名匹配）
          let color: string
          let isNativeColor = false
          if (optionColors[key]) {
            color = optionColors[key]
            isNativeColor = true
          } else {
            // 降级使用固定色板
            color = colorPalette[fallbackColorIndex % colorPalette.length]
            fallbackColorIndex++
          }
          colorGroupMap.set(displayKey, { color, count: 0, isNativeColor })
        }
        const groupInfo = colorGroupMap.get(displayKey)!
        groupInfo.count++
      })

      // 更新 seriesData 中的颜色和透明度
      seriesData.forEach((item: any) => {
        const key = item.colorGroupKey || ''
        const displayKey = key || emptyLabel
        const groupInfo = colorGroupMap.get(displayKey)
        if (groupInfo) {
          item.itemStyle.color = groupInfo.color
          // 使用飞书原生颜色时采用更高的不透明度，使颜色更接近飞书表格中的视觉效果
          if (groupInfo.isNativeColor) {
            item.itemStyle.opacity = chartStyles.bubble.nativeColorOpacity
          }
        }
      })
    }

    // 计算气泡大小的极值，用于线性映射
    const sizes = data.map(item => item.size)
    const minSize = Math.min(...sizes)
    const maxSize = Math.max(...sizes)

    // 气泡大小映射函数（size 值 → 像素直径）
    // 提取到 option 构造之前，供 tooltip formatter 和预计算逻辑共用
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

    // 格式化轴显示值（日期/百分比/原始值），供 tooltip formatter 中 hover 气泡和被包含气泡共用
    const formatAxisValue = (
      val: number | string,
      axisType: string,
      isPercentage: boolean | undefined,
      hasTime: boolean | undefined
    ): string => {
      if (axisType === 'date' && typeof val === 'number') {
        return formatDate(val, !!hasTime, true)
      } else if (isPercentage && typeof val === 'number') {
        return parseFloat((val * 100).toFixed(2)) + '%'
      }
      return String(val)
    }

    // 获取被指定气泡完全覆盖的其他气泡分组（按 size 降序，相同位置合并）
    // 供 tooltip formatter 使用；click handler 中有相同逻辑的副本（因跨 useEffect 作用域）
    // 判定：hoverRadius >= 圆心距离 + 小气泡半径（小气泡整个在大气泡内）
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

    // ===== 图例数据：提取出来供「图例搜索」筛选与高亮复用 =====
    const legendData = config.colorGroupType && colorGroupMap.size > 0
      ? Array.from(colorGroupMap.entries()).map(([key, info]) => ({
          name: key,
          itemStyle: {
            color: info.color,
            opacity: info.isNativeColor ? chartStyles.bubble.nativeColorOpacity : chartStyles.bubble.opacity
          }
        }))
      : []
    legendDataRef.current = legendData
    groupNamesRef.current = legendData.map(d => d.name)

    const option: EChartsOption = {
      backgroundColor: 'transparent',
      grid: chartStyles.grid,
      xAxis,
      yAxis,
      // 图例配置：仅在开启颜色分组时显示
      legend: legendData.length > 0 ? {
        show: true,
        type: 'scroll',
        orient: 'horizontal',
        top: 12,
        // 搜索框在左上角（已右移避开纵轴标题），图例从其右侧开始；翻页器在图例最右端，互不重叠
        left: 260,
        right: 12,
        // 不使用 selectedMode: false，因为会禁用 hover 效果
        // 改用事件监听 legendselectchanged 来阻止隐藏数据
        data: legendData,
        textStyle: {
          color: chartStyles.colors.axisLabel
        }
      } : { show: false },
      tooltip: {//用于调整 hover 时的提示框
        trigger: 'item',
        confine: true,           // tooltip 约束在图表容器内，不被外层 overflow:hidden 裁切
        enterable: true,         // 允许鼠标进入 tooltip，以便滚动条可滚动
        hideDelay: 300,          // 鼠标移出后 300ms 才隐藏，给用户时间移入 tooltip
        padding: [8, 10],        // 统一 padding：上下 8px，左右 10px（紧凑）
        // white-space: normal + word-break/overflow-wrap：内容超过 max-width 时自动换行，
        // 避免长文本（如较长的字段名/选项值）溢出到 tooltip 外部被裁切看不到
        extraCssText: 'max-width: 360px; max-height: 320px; overflow-y: auto; overflow-x: hidden; white-space: normal; word-break: break-word; overflow-wrap: anywhere;',
        formatter: (params: any) => {
          const hoveredData = params.data
          const hoveredIdx = hoveredData.__idx ?? params.dataIndex

          // 计数模式下，size 显示为"计数: N"
          const sizeLabel = config.sizeMode === 'count' ? t('label.count') : sizeFieldName

          // ===== 1. 格式化 hover 气泡信息（主体，立即显示）=====
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

          // ===== 2. 雷达探测（调用共享函数，完全覆盖判定）=====
          const groups = getCoveredGroups(hoveredIdx)
          if (groups.length === 0) return html

          // ===== 3. 拼接覆盖气泡列表 HTML =====
          html += `<div style="border-top: 1px solid rgba(255,255,255,0.2); margin: 6px 0;"></div>`
          html += `<div style="font-size: 11px; opacity: 0.7; margin-bottom: 4px;">覆盖的气泡 (${groups.length})</div>`
          for (const g of groups) {
            const nameStr = g.names.filter(n => n).join(', ')
            html += `<div style="margin-bottom: 4px;">
              ${nameStr ? `<div style="font-weight: 500;">${nameStr}</div>` : ''}
              <div style="font-size: 11px; opacity: 0.85;">
                <span style="margin-right: 8px;">${xFieldName || 'X'}: ${g.xDisplay}</span>
                <span style="margin-right: 8px;">${yFieldName || 'Y'}: ${g.yDisplay}</span>
                <span>${sizeLabel}: ${g.sizeDisplay}</span>
              </div>
            </div>`
          }

          return html
        }
      },
      series: (() => {
        // 公共的 series 配置
        // shouldUseDynamicSize 和 symbolSizeFn 已提取到 option 构造之前，此处直接引用

        const labelConfig = {
          show: !!nameFieldName && !!showLabel,
          formatter: '{b}',
          position: chartStyles.label.position,
          fontSize: chartStyles.label.fontSize,
          opacity: chartStyles.label.opacity
        }

        const emphasisConfig = {
          focus: 'self' as const,
          label: { show: true },
          itemStyle: {
            opacity: chartStyles.emphasis.opacity,
            shadowBlur: chartStyles.emphasis.shadowBlur,
            shadowColor: chartStyles.emphasis.shadowColor
          }
        }

        const blurConfig = {
          label: { show: false },
          itemStyle: {
            opacity: 0.15,
            color: '#ccc'
          }
        }

        // markLine 配置 - 支持多条分割线
        const { xVals, yVals } = getThresholdValues()
        const markLineConfig = {
          z: 1,
          silent: true,
          symbol: ['none', 'none'],
          lineStyle: {
            type: 'solid' as const,
            color: chartStyles.colors.splitLine,
            width: 1
          },
          label: { show: false },
          data: [
            // 所有 X 轴分割线
            ...xVals.map(xVal => ({ xAxis: xVal })),
            // 所有 Y 轴分割线
            ...yVals.map(yVal => ({ yAxis: yVal }))
          ]
        }

        // markArea 配置 - 支持多分割线（最多9个区域）
        const markAreaConfig = {
          z: 0,
          silent: true,
          emphasis: { disabled: true },
          data: (() => {
            if (xVals.length === 0 && yVals.length === 0) return []

            // 计算轴边界值
            // 注意：日期轴的值是毫秒时间戳（~1.7e12），普通 -1e10/1e10 不够覆盖
            // 使用 -1e15/1e15 可以覆盖所有可能的数值和日期范围
            const defaultMin = -1e15
            const defaultMax = 1e15
            const xMin = xAxisType === 'category' && xAxisMapper.length > 0 ? xAxisMapper.getAxisConfig().min : defaultMin
            const xMax = xAxisType === 'category' && xAxisMapper.length > 0 ? xAxisMapper.getAxisConfig().max : defaultMax
            const yMin = yAxisType === 'category' && yAxisMapper.length > 0 ? yAxisMapper.getAxisConfig().min : defaultMin
            const yMax = yAxisType === 'category' && yAxisMapper.length > 0 ? yAxisMapper.getAxisConfig().max : defaultMax

            // 构建边界数组
            const xBounds = [xMin, ...xVals, xMax]
            const yBounds = [yMin, ...yVals, yMax]

            const areas: any[] = []
            const cols = xBounds.length - 1
            const rows = yBounds.length - 1

            // 遍历所有区域（从下到上，从左到右）
            for (let row = 0; row < rows; row++) {
              for (let col = 0; col < cols; col++) {
                const regionKey = `${row}_${col}`
                const regionConfig = config.regions?.[regionKey]

                // 获取区域颜色，如果未配置则使用透明
                const baseColor = regionConfig?.color || 'transparent'

                // Hover 效果：如果有 hoveredQuadrant 且不是当前区域，则透明
                const color = hoveredQuadrant && hoveredQuadrant !== regionKey
                  ? 'transparent'
                  : baseColor

                areas.push([
                  {
                    name: regionConfig?.name || '',
                    itemStyle: { color, opacity: 0.1 },
                    label: { show: false },
                    xAxis: xBounds[col],
                    yAxis: yBounds[row]
                  },
                  {
                    xAxis: xBounds[col + 1],
                    yAxis: yBounds[row + 1]
                  }
                ])
              }
            }

            return areas
          })()
        }


        // 如果开启了颜色分组，按分组拆分为多个 series
        if (config.colorGroupType && colorGroupMap.size > 0) {
          const seriesList: any[] = []

          // 首先添加一个专门用于 markLine 和 markArea 的空数据 series
          // 这个 series 不会被图例控制，确保象限背景始终显示
          seriesList.push({
            name: '__quadrant_bg__',  // 内部名称，不会显示在图例中
            type: 'scatter',
            data: [],  // 空数据
            markLine: markLineConfig,
            markArea: markAreaConfig
          })

          colorGroupMap.forEach((info, groupName) => {
            const groupData = seriesData.filter((item: any) => {
              const key = item.colorGroupKey || ''
              const displayKey = key || emptyLabel
              return displayKey === groupName
            })

            seriesList.push({
              name: groupName,  // series 名称用于图例
              type: 'scatter',
              symbolSize: symbolSizeFn,
              label: labelConfig,
              labelLayout: { hideOverlap: true },
              data: groupData,
              itemStyle: { color: info.color },
              emphasis: emphasisConfig,
              blur: blurConfig
              // 不在数据 series 上添加 markLine 和 markArea
            })
          })

          return seriesList
        }

        // 未开启颜色分组，使用单个 series
        return [{
          type: 'scatter',
          symbolSize: symbolSizeFn,
          label: labelConfig,
          labelLayout: { hideOverlap: true },
          data: seriesData,
          emphasis: emphasisConfig,
          blur: blurConfig,
          markLine: markLineConfig,
          markArea: markAreaConfig
        }]
      })()
    }

    // 使用 notMerge: true 完全替换旧配置，避免轴类型切换时旧配置残留
    try {
      chartInstanceRef.current.setOption(option, { notMerge: true })
      // 强制 resize 确保图表正确渲染
      chartInstanceRef.current.resize()
      // 热路径：图表已就绪时同步精修一次（数值/日期/类目轴通用，按真实 grid 宽度）
      // 冷刷新首屏坐标系未就绪时此处返回 false，由实例上注册的 'finished' 事件兜底
      updateXAxisLabelLayout()
    } catch (e) {
      console.error('[BubbleChart] setOption 错误', e)
    }

    // ===== 预计算所有气泡的像素坐标和半径，供 tooltip 雷达聚合使用 =====
    // convertToPixel 需要图表完成布局后才能正确转换，用 setTimeout 延迟到布局完成后执行
    // formatter 中有按需兜底重算逻辑，即使此处的 setTimeout 尚未执行也不会出错
    setTimeout(() => {
      const chartForConvert = chartInstanceRef.current
      if (!chartForConvert) return
      const positions = seriesData.map((item: any, index: number) => {
        const [xVal, yVal, sizeVal] = item.value
        const pixel = chartForConvert.convertToPixel(
          { xAxisIndex: 0, yAxisIndex: 0 },
          [Number(xVal), Number(yVal)]
        )
        const radius = symbolSizeFn(item.value) / 2
        return { idx: index, pixelX: pixel[0], pixelY: pixel[1], radius, sizeVal, data: item }
      })
      bubblePositionsRef.current = positions
    }, 0)

    // ===== 计算象限 label 的像素位置 =====
    // 使用 ECharts 的 grid 区域边界来计算 label 位置
    const chart = chartInstanceRef.current
    // 计算并设置 Graphic 元素 (象限 Label)
    const graphicElements: any[] = []

    const createLabelGraphic = (key: QuadrantKey, name: string, x: number, y: number, position: 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center') => {
      // ECharts Text Graphic Style configuration
      // align: 'center' | 'left' | 'right'
      // verticalAlign: 'middle' | 'top' | 'bottom'
      let align: 'center' | 'left' | 'right' = 'center'
      let verticalAlign: 'middle' | 'top' | 'bottom' = 'middle'

      const offset = 5
      let finalX = x
      let finalY = y

      switch (position) {
        case 'top':
          align = 'center'; verticalAlign = 'top';
          finalY = y + offset
          break
        case 'bottom':
          align = 'center'; verticalAlign = 'bottom';
          finalY = y - offset
          break
        case 'left':
          align = 'left'; verticalAlign = 'middle';
          finalX = x + offset
          break
        case 'right':
          align = 'right'; verticalAlign = 'middle';
          finalX = x - offset
          break
        case 'top-left':
          align = 'left'; verticalAlign = 'top';
          finalX = x + offset
          finalY = y + offset
          break
        case 'top-right':
          align = 'right'; verticalAlign = 'top';
          finalX = x - offset
          finalY = y + offset
          break
        case 'bottom-left':
          align = 'left'; verticalAlign = 'bottom';
          finalX = x + offset
          finalY = y - offset
          break
        case 'bottom-right':
          align = 'right'; verticalAlign = 'bottom';
          finalX = x - offset
          finalY = y - offset
          break
        case 'center':
          // 正中心：居中对齐，不加偏移
          align = 'center'; verticalAlign = 'middle';
          break
      }

      // === 象限名称样式配置 ===
      // 可调整项：
      // - maxLabelLength: 最大字符数，超出省略
      // - font: 字体大小和粗细（如 '500 12px sans-serif'）
      // - fill: 字体颜色（如 '#666'）
      // - backgroundColor: 背景颜色和透明度（如 'rgba(255, 255, 255, 0.85)'）
      // - borderColor (hover): Hover 时的边框颜色（如 '#1f2329'）
      const maxLabelLength = 10
      const displayName = name.length > maxLabelLength
        ? name.slice(0, maxLabelLength) + '...'
        : name

      return {
        type: 'text',
        id: `quadrant-label-${key}`,
        z: 15,
        x: finalX,
        y: finalY,
        style: {
          text: displayName,
          font: '500 16px sans-serif',         // 字体大小/粗细
          fill: '#666666aa',                         // 字体颜色
          backgroundColor: 'rgba(255, 255, 255, 0)',  // 背景透明度
          borderRadius: 4,
          padding: [4, 4],
          align: align,
          verticalAlign: verticalAlign,
          shadowBlur: hoveredQuadrant === key ? 8 : 0,
          shadowColor: 'rgba(0,0,0,0.1)',
          shadowOffsetY: hoveredQuadrant === key ? 2 : 0,
          // borderWidth: 0.5,
          // borderColor: hoveredQuadrant === key ? 'rgba(204, 204, 204, 1)' : 'transparent'  // Hover 边框颜色
        },
        draggable: false,
        silent: false,
        info: { key, name, x: finalX, y: finalY, position }  // 保留完整名称用于 Tooltip
      }
    }

    const { xVals, yVals } = getThresholdValues()

    if (xVals.length === 0 && yVals.length === 0) {
      // 仅替换 graphic 组件，避免连带覆盖 updateXAxisLabelLayout 动态设置的横轴旋转
      chart.setOption({ graphic: [] }, { replaceMerge: ['graphic'] })
      return
    }

    // 获取 grid 区域的像素边界
    const gridModel = (chart as any).getModel().getComponent('grid')
    const gridRect = gridModel?.coordinateSystem?.getRect()

    if (!gridRect) {
      console.warn('无法获取 ECharts grid 信息')
      // 仅替换 graphic 组件，避免连带覆盖 updateXAxisLabelLayout 动态设置的横轴旋转
      chart.setOption({ graphic: [] }, { replaceMerge: ['graphic'] })
      return
    }

    // grid 区域边界（像素坐标）
    const gridLeft = gridRect.x
    const gridRight = gridRect.x + gridRect.width
    const gridTop = gridRect.y
    const gridBottom = gridRect.y + gridRect.height

    // 计算分割线在像素坐标中的位置
    const convertToPixel = (chart as any).convertToPixel?.bind(chart as any)

    // 构建 X 轴像素边界数组
    const xPixelBounds = [gridLeft]
    xVals.forEach(val => {
      const pixel = convertToPixel('grid', [val, 0])
      if (pixel) xPixelBounds.push(pixel[0])
    })
    xPixelBounds.push(gridRight)

    // 构建 Y 轴像素边界数组
    const yPixelBounds = [gridBottom]  // Y 轴像素从下到上
    yVals.forEach(val => {
      const pixel = convertToPixel('grid', [0, val])
      if (pixel) yPixelBounds.push(pixel[1])
    })
    yPixelBounds.push(gridTop)
    // Y 轴需要反转（像素坐标 Y 轴从上到下，数据坐标从下到上）
    yPixelBounds.sort((a, b) => b - a)

    // 计算网格尺寸
    const cols = xPixelBounds.length - 1
    const rows = yPixelBounds.length - 1

    // 遍历所有区域，生成标签
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const regionKey = `${row}_${col}`
        const regionConfig = config.regions?.[regionKey]
        const name = regionConfig?.name

        if (!name) continue  // 没有名称则不显示标签

        // 计算区域边界
        const left = xPixelBounds[col]
        const right = xPixelBounds[col + 1]
        const bottom = yPixelBounds[row]
        const top = yPixelBounds[row + 1]

        // 判断标签位置
        const isTop = row === rows - 1
        const isBottom = row === 0
        const isLeft = col === 0
        const isRight = col === cols - 1
        const isMiddleRow = !isTop && !isBottom
        const isMiddleCol = !isLeft && !isRight

        // 确定显示位置
        let position: 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'
        let x: number
        let y: number

        // 四角位置
        if (isTop && isLeft) {
          position = 'top-left'
          x = left
          y = top
        } else if (isTop && isRight) {
          position = 'top-right'
          x = right
          y = top
        } else if (isBottom && isLeft) {
          position = 'bottom-left'
          x = left
          y = bottom
        } else if (isBottom && isRight) {
          position = 'bottom-right'
          x = right
          y = bottom
        } else if (isTop && isMiddleCol) {
          // 顶部中间
          position = 'top'
          x = (left + right) / 2
          y = top
        } else if (isBottom && isMiddleCol) {
          // 底部中间
          position = 'bottom'
          x = (left + right) / 2
          y = bottom
        } else if (isMiddleRow && isLeft) {
          // 左侧中间
          position = 'left'
          x = left
          y = (top + bottom) / 2
        } else if (isMiddleRow && isRight) {
          // 右侧中间
          position = 'right'
          x = right
          y = (top + bottom) / 2
        } else {
          // 正中心（9宫格的中心）- 标签显示在区域正中间
          position = 'center'  // 使用 center 定位，完全居中
          x = (left + right) / 2
          y = (top + bottom) / 2
        }

        graphicElements.push(createLabelGraphic(
          regionKey as QuadrantKey,
          name,
          x,
          y,
          position
        ))
      }
    }


    // Apply Graphic（仅替换 graphic 组件，避免覆盖 updateXAxisLabelLayout 的动态横轴旋转配置）
    chartInstanceRef.current.setOption({ graphic: graphicElements }, { replaceMerge: ['graphic'] })

  }, [data, xFieldName, yFieldName, sizeFieldName, loading, xAxisType, yAxisType, xAxisData, yAxisData, xIsPercentage, yIsPercentage, sizeIsPercentage, enableMultiColor, t, chartStyles, config, getThresholdValues, hoveredQuadrant])

  useEffect(() => {
    const handleResize = () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.resize()
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // ===== 图例搜索：按关键字筛选图例 + 高亮匹配分组的气泡 =====
  // 声明在主渲染 effect 之后，确保数据变化重渲染后能再次套用当前搜索条件
  useEffect(() => {
    const chart = chartInstanceRef.current
    if (!chart) return
    const allLegend = legendDataRef.current
    // 仅在开启颜色分组且有分组项时生效
    if (!config.colorGroupType || allLegend.length === 0) return

    const q = legendSearch.trim().toLowerCase()
    const matches = q
      ? groupNamesRef.current.filter(n => n.toLowerCase().includes(q))
      : groupNamesRef.current

    // 1) 筛选图例：只保留匹配的图例项，便于在众多分组中快速定位
    chart.setOption({
      legend: { data: q ? allLegend.filter(d => matches.includes(d.name)) : allLegend }
    })

    // 2) 高亮匹配分组的气泡（复用象限高亮的可靠模式：先 downplay 全部重置，
    //    再 highlight 匹配的 series，其余气泡借助 series.blur 自动变暗）
    const seriesArr = (chart.getOption().series as any[]) || []
    for (let si = 0; si < seriesArr.length; si++) {
      chart.dispatchAction({ type: 'downplay', seriesIndex: si })
    }
    if (q && matches.length > 0) {
      chart.dispatchAction({ type: 'highlight', seriesName: matches })
    }
  }, [legendSearch, data, config.colorGroupType])

  // ===== 注册 Graphic 事件监听 =====
  useEffect(() => {
    const chart = chartInstanceRef.current
    if (!chart) return

    const handleGraphicMouseOver = (params: any) => {
      // 检查是否是我们的象限 Label
      if (params.componentType === 'graphic' && params.info && params.info.key) {
        const { key, name, x, y, position } = params.info as QuadrantLabelInfo

        // 计算统计信息（使用新的多分割线统计函数）
        const { xVals, yVals } = getThresholdValues()
        const stats = calculateRegionStats(
          data,
          key,
          xVals,
          yVals,
          xAxisType,
          yAxisType
        )

        // 显示 Tooltip
        // 使用传递的 x, y 作为基准坐标
        // x, y 是 Label 的定位点，但我们需要根据 alignment 调整
        // 简单策略：显示在 Label 旁边
        // text height 约 20px, width varying.
        // Let's assume a safe offset.

        // 修正：params.event.event 是原生 DOM 事件，target 是 graphic 元素
        // 如果我们使用 info 中的 x, y，这是相对于 canvas 左上角的准确位置

        let tooltipX = x
        let tooltipY = y
        let placement: 'top' | 'bottom' | 'left' | 'right' = 'bottom'

        // 根据 position 调整 tooltip 位置
        // 目标：将 tooltip 放在标签的旁边，不遮挡
        // 注意：标签使用 align 属性，x/y 是锚点位置
        // - left 对齐的标签：文字从 x 向右延伸，tooltip 应偏右以对齐标签中心
        // - right 对齐的标签：文字从 x 向左延伸，tooltip 应偏左以对齐标签中心
        const labelWidth = 70  // 估算标签宽度的一半

        switch (position) {
          case 'left':
            // 标签在左侧，向右延伸。Tooltip 显示在标签右下方
            tooltipX = x + labelWidth
            tooltipY = y + 15
            placement = 'bottom'
            break
          case 'right':
            // 标签在右侧，向左延伸。Tooltip 显示在标签左下方
            tooltipX = x - labelWidth
            tooltipY = y + 15
            placement = 'bottom'
            break
          case 'top':
            // 标签在顶部中央。Tooltip 显示在下方
            tooltipY = y + 25
            placement = 'bottom'
            break
          case 'bottom':
            // 标签在底部中央。Tooltip 显示在上方
            tooltipY = y - 25
            placement = 'top'
            break
          case 'top-left':
            // 左上角标签。Tooltip 显示在标签下方偏右
            tooltipX = x + labelWidth
            tooltipY = y + 25
            placement = 'bottom'
            break
          case 'top-right':
            // 右上角标签。Tooltip 显示在标签下方偏左
            tooltipX = x - labelWidth
            tooltipY = y + 25
            placement = 'bottom'
            break
          case 'bottom-left':
            // 左下角标签。Tooltip 显示在标签上方偏右
            tooltipX = x + labelWidth
            tooltipY = y - 25
            placement = 'top'
            break
          case 'bottom-right':
            // 右下角标签。Tooltip 显示在标签上方偏左
            tooltipX = x - labelWidth
            tooltipY = y - 25
            placement = 'top'
            break
          default:
            tooltipY = y + 25
            placement = 'bottom'
        }

        // 边界检查
        const estimatedHeight = sizeFieldName ? 160 : 60
        if (tooltipY - estimatedHeight < 0 && placement === 'top') {
          // Too close to top, force below
          tooltipY = y + 30
          placement = 'bottom'
        }

        setQuadrantTooltip({
          visible: true,
          x: tooltipX,
          y: tooltipY,
          name: name,
          count: stats.count,
          avg: stats.avg,
          median: stats.median,
          max: stats.max,
          min: stats.min,
          placement: placement
        })

        setHoveredQuadrant(key)

        // ===== 气泡高亮逻辑 =====
        // 当开启任何分组模式（象限分组/字段分组）时，图例的高亮行为与象限高亮存在冲突，
        // 因此在分组模式下禁用象限标题的气泡高亮，只保留 tooltip 统计
        // 只有无分组模式下才执行高亮
        const isGroupingEnabled = !!config.colorGroupType

        if (isGroupingEnabled) {
          // 分组模式：不执行高亮，避免与图例高亮冲突
          return
        }

        // ===== 以下是非字段分组模式的高亮逻辑 =====
        // 使用原始 data 数组计算区域归属
        const [targetRow, targetCol] = key.split('_').map(Number)

        // 获取所有 series 的名称列表（用于匹配 colorGroupKey）
        const seriesArr = chart.getOption().series as any[]
        const emptyLabel = t('legend.empty')

        // 构建 seriesName -> seriesIndex 的映射
        const seriesNameToIndex = new Map<string, number>()
        seriesArr.forEach((s, idx) => {
          if (s.name && s.name !== '__quadrant_bg__') {
            seriesNameToIndex.set(s.name, idx)
          }
        })

        // 构建 seriesIndex -> 该 series 内的数据点索引列表
        const highlightMap = new Map<number, number[]>()

        // 追踪每个 series 的当前计数器（用于确定数据点在 series 内的索引）
        const seriesDataCounter = new Map<number, number>()

        // 遍历原始 data，计算每个点的区域
        data.forEach((item) => {
          // 获取坐标值
          const xVal = xAxisType === 'category' && item.xCategoryIndex !== undefined
            ? item.xCategoryIndex
            : (typeof item.x === 'number' ? item.x : parseFloat(String(item.x)) || 0)

          const yVal = yAxisType === 'category' && item.yCategoryIndex !== undefined
            ? item.yCategoryIndex
            : (typeof item.y === 'number' ? item.y : parseFloat(String(item.y)) || 0)

          // 计算列位置
          let col = 0
          for (const threshold of xVals) {
            if (xVal >= threshold) col++
            else break
          }

          // 计算行位置
          let row = 0
          for (const threshold of yVals) {
            if (yVal >= threshold) row++
            else break
          }

          // 确定此数据点属于哪个 series
          let seriesIndex = 0
          if (config.colorGroupType && seriesNameToIndex.size > 0) {
            // 开启了颜色分组
            let colorGroupKey = ''
            if (config.colorGroupType === 'quadrant') {
              // 按象限分组 - 使用旧的象限 key 逻辑
              const { xVal: thresholdX, yVal: thresholdY } = getThresholdValues()
              const quadrant = getQuadrantForBubble(xVal, yVal, thresholdX, thresholdY)
              if (quadrant) {
                switch (quadrant) {
                  case 'TL': colorGroupKey = config.quadrantTLName || emptyLabel; break
                  case 'TR': colorGroupKey = config.quadrantTRName || emptyLabel; break
                  case 'BL': colorGroupKey = config.quadrantBLName || emptyLabel; break
                  case 'BR': colorGroupKey = config.quadrantBRName || emptyLabel; break
                  case 'LEFT': colorGroupKey = config.quadrantTLName || emptyLabel; break
                  case 'RIGHT': colorGroupKey = config.quadrantTRName || emptyLabel; break
                  case 'TOP': colorGroupKey = config.quadrantTLName || emptyLabel; break
                  case 'BOTTOM': colorGroupKey = config.quadrantBLName || emptyLabel; break
                }
              }
            } else if (config.colorGroupType === 'field') {
              // 按字段分组
              colorGroupKey = item.colorGroupValue || ''
            }
            const displayKey = colorGroupKey || emptyLabel
            seriesIndex = seriesNameToIndex.get(displayKey) ?? 0
          }

          // 获取或初始化此 series 的计数器
          const currentIndex = seriesDataCounter.get(seriesIndex) || 0
          seriesDataCounter.set(seriesIndex, currentIndex + 1)

          // 如果在目标区域内，记录高亮索引
          if (row === targetRow && col === targetCol) {
            if (!highlightMap.has(seriesIndex)) {
              highlightMap.set(seriesIndex, [])
            }
            highlightMap.get(seriesIndex)!.push(currentIndex)
          }
        })

        // 先 downplay 所有 series 重置状态，解决 focus: 'self' 导致的冲突
        for (let si = 0; si < seriesArr.length; si++) {
          chart.dispatchAction({
            type: 'downplay',
            seriesIndex: si
          })
        }

        // 执行高亮
        let hasHighlight = false
        highlightMap.forEach((indices, seriesIndex) => {
          if (indices.length > 0) {
            hasHighlight = true
            chart.dispatchAction({
              type: 'highlight',
              seriesIndex: seriesIndex,
              dataIndex: indices
            })
          }
        })

        if (!hasHighlight) {
          // 空象限：所有气泡进入 blur 状态
          const seriesCount = seriesArr.length
          for (let si = 0; si < seriesCount; si++) {
            chart.dispatchAction({
              type: 'highlight',
              seriesIndex: si,
              dataIndex: []
            })
          }
        }
      }
    }

    const handleGraphicMouseOut = (params: any) => {
      if (params.componentType === 'graphic' && params.info && params.info.key) {
        setQuadrantTooltip(prev => ({ ...prev, visible: false }))
        setHoveredQuadrant(null)
        // Downplay 所有 series
        const seriesCount = (chart.getOption().series as any[])?.length || 1
        for (let si = 0; si < seriesCount; si++) {
          chart.dispatchAction({ type: 'downplay', seriesIndex: si })
        }
      }
    }

    // ===== 点击复制功能 =====
    // 点击象限标题复制统计信息
    const handleGraphicClick = (params: any) => {
      if (params.componentType === 'graphic' && params.info && params.info.key) {
        const { key } = params.info as QuadrantLabelInfo
        const { xVals, yVals } = getThresholdValues()
        const stats = calculateRegionStats(
          data,
          key,
          xVals,
          yVals,
          xAxisType,
          yAxisType
        )

        // 获取区域名称
        const regionConfig = config.regions?.[key]
        const regionName = regionConfig?.name || t('legend.empty')

        // 构建复制文本
        let copyText = `${regionName}\n${t('quadrant.count', '数量')}: ${stats.count}`
        if (sizeFieldName && stats.avg !== undefined) {
          const formatValue = (v: number) => sizeIsPercentage
            ? parseFloat((v * 100).toFixed(2)) + '%'
            : parseFloat(v.toFixed(2))
          copyText += `\n${t('quadrant.avg', '平均值')}: ${formatValue(stats.avg)}`
          copyText += `\n${t('quadrant.median', '中位数')}: ${formatValue(stats.median ?? 0)}`
          copyText += `\n${t('quadrant.max', '最大值')}: ${formatValue(stats.max ?? 0)}`
          copyText += `\n${t('quadrant.min', '最小值')}: ${formatValue(stats.min ?? 0)}`
        }

        copyToClipboard(copyText).then(() => {
          Toast.success({ content: t('toast.copySuccess', '复制成功'), theme: 'light', showClose: false })
        }).catch(() => {
          Toast.error({ content: t('toast.copyFailed', '复制失败'), theme: 'light', showClose: false })
        })
      }
    }

    // 点击气泡复制详情信息（复制完整 tooltip 内容：主气泡 + 覆盖气泡列表）
    const handleBubbleClick = (params: any) => {
      if (params.componentType === 'series' && params.seriesType === 'scatter') {
        const data = params.data
        if (!data) return
        const hoveredIdx = data.__idx ?? params.dataIndex
        const sizeLabel = config.sizeMode === 'count' ? t('label.count') : sizeFieldName

        // 格式化主气泡显示值（与 tooltip formatter 一致）
        let xDisplay = data.data ? data.data[0] : data.value[0]
        let yDisplay = data.data ? data.data[1] : data.value[1]
        let sizeDisplay: number | string = data.data ? data.data[2] : data.value[2]

        // 日期/百分比格式化（内联实现，因 formatAxisValue 在主渲染 useEffect 作用域内不可访问）
        if (xAxisType === 'date' && typeof xDisplay === 'number') {
          xDisplay = formatDate(xDisplay, xFieldHasTime, true)
        } else if (xIsPercentage && typeof xDisplay === 'number') {
          xDisplay = parseFloat((xDisplay * 100).toFixed(2)) + '%'
        }
        if (yAxisType === 'date' && typeof yDisplay === 'number') {
          yDisplay = formatDate(yDisplay, yFieldHasTime, true)
        } else if (yIsPercentage && typeof yDisplay === 'number') {
          yDisplay = parseFloat((yDisplay * 100).toFixed(2)) + '%'
        }
        if (sizeIsPercentage && typeof sizeDisplay === 'number' && config.sizeMode !== 'count') {
          sizeDisplay = parseFloat((sizeDisplay * 100).toFixed(2)) + '%'
        }

        // 构建复制文本（主气泡）
        let copyText = ''
        if (data.name) {
          copyText += `${data.name}\n`
        }
        copyText += `${xFieldName || 'X'}: ${xDisplay}`
        copyText += `\n${yFieldName || 'Y'}: ${yDisplay}`
        if (sizeLabel) {
          copyText += `\n${sizeLabel}: ${sizeDisplay}`
        }

        // 追加覆盖气泡列表（与 tooltip 内容一致）
        // 覆盖判定 + 分组逻辑与主渲染 useEffect 中的 getCoveredGroups 相同
        // 此处因跨 useEffect 作用域无法直接调用 getCoveredGroups，故复制逻辑
        const positions = bubblePositionsRef.current
        if (positions.length > 0 && positions[hoveredIdx]) {
          const hovered = positions[hoveredIdx]
          // 完全覆盖判定：distance + smallRadius <= hoverRadius
          const contained = positions.filter(p => {
            if (p.idx === hoveredIdx) return false
            const dx = p.pixelX - hovered.pixelX
            const dy = p.pixelY - hovered.pixelY
            const distance = Math.sqrt(dx * dx + dy * dy)
            return distance + p.radius <= hovered.radius
          })

          if (contained.length > 0) {
            // 按 (x, y, size) 分组合并同位置气泡
            const groupMap = new Map<string, { names: string[]; xDisplay: string; yDisplay: string; sizeDisplay: string; sizeVal: number }>()
            for (const p of contained) {
              const item = p.data
              const rawX = item.data ? item.data[0] : item.value[0]
              const rawY = item.data ? item.data[1] : item.value[1]
              const rawS: number | string = item.data ? item.data[2] : item.value[2]

              // 格式化（内联，同主气泡逻辑）
              let px: string
              if (xAxisType === 'date' && typeof rawX === 'number') {
                px = formatDate(rawX, xFieldHasTime, true)
              } else if (xIsPercentage && typeof rawX === 'number') {
                px = parseFloat((rawX * 100).toFixed(2)) + '%'
              } else {
                px = String(rawX)
              }
              let py: string
              if (yAxisType === 'date' && typeof rawY === 'number') {
                py = formatDate(rawY, yFieldHasTime, true)
              } else if (yIsPercentage && typeof rawY === 'number') {
                py = parseFloat((rawY * 100).toFixed(2)) + '%'
              } else {
                py = String(rawY)
              }
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
            const groups = Array.from(groupMap.values()).sort((a, b) => b.sizeVal - a.sizeVal)

            copyText += `\n\n覆盖的气泡 (${groups.length})`
            for (const g of groups) {
              const nameStr = g.names.filter(n => n).join(', ')
              copyText += `\n${nameStr ? nameStr + ' | ' : ''}${xFieldName || 'X'}: ${g.xDisplay}, ${yFieldName || 'Y'}: ${g.yDisplay}, ${sizeLabel}: ${g.sizeDisplay}`
            }
          }
        }

        copyToClipboard(copyText).then(() => {
          Toast.success({ content: t('toast.copySuccess', '复制成功'), theme: 'light', showClose: false })
        }).catch(() => {
          Toast.error({ content: t('toast.copyFailed', '复制失败'), theme: 'light', showClose: false })
        })
      }
    }

    // 绑定事件
    chart.on('mouseover', handleGraphicMouseOver)
    chart.on('mouseout', handleGraphicMouseOut)
    chart.on('click', handleGraphicClick)
    chart.on('click', handleBubbleClick)

    return () => {
      chart.off('mouseover', handleGraphicMouseOver)
      chart.off('mouseout', handleGraphicMouseOut)
      chart.off('click', handleGraphicClick)
      chart.off('click', handleBubbleClick)
    }
  }, [data, getThresholdValues, xAxisType, yAxisType, xAxisData, yAxisData, sizeFieldName]) // Deps need to be correct

  // 无数据时的显示逻辑：区分权限错误和真的没数据
  if (!data || data.length === 0) {
    // 权限错误时显示特定提示
    if (permissionDenied) {
      return (
        <Empty
          description={t('empty.noPermission', '当前数据源暂无权限，请切换同表格的其他数据源并保存后，再次尝试配置当前数据源')}
          style={{ marginTop: '20%' }}
        />
      )
    }
    // 真的没数据
    return (
      <Empty
        description={t('noData', '暂无数据')}
        style={{ marginTop: '20%' }}
      />
    )
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden' // 防止 tooltip 溢出容器
      }}
    // Removed onMouseMove / onMouseLeave handlers as we switch to ECharts graphic events
    >
      <div
        ref={chartRef}
        style={{
          width: '100%',
          height: '100%',
          opacity: loading ? 0.5 : 1,
          transition: 'opacity 0.3s',
          position: 'relative',
          zIndex: 10 // 图表层级较高，覆盖 Label
        }}
      />

      {/* ===== 图例搜索框：颜色分组项多时按关键字筛选图例并高亮气泡 ===== */}
      {/* 仅在开启颜色分组时显示；左上角并右移避开纵轴标题，图例从 left:260 起，避开右端翻页器 */}
      {config.colorGroupType && (
        <div style={{ position: 'absolute', top: 8, left: 150, zIndex: 20, width: 100 }}>
          <Input
            size="small"
            // 放大镜仅在为空时作为 placeholder 提示出现；有输入后隐藏以腾出空间
            prefix={legendSearch ? undefined : <IconSearch />}
            showClear
            placeholder={t('legend.search', '搜索分组')}
            value={legendSearch}
            onChange={(v) => setLegendSearch(v)}
          />
        </div>
      )}

      {/* 移除自定义象限 label 的 JSX 渲染 */}

      {/* ===== 象限 Tooltip 渲染 ===== */}
      {quadrantTooltip.visible && (
        <div
          style={{
            position: 'absolute',
            left: quadrantTooltip.x,
            top: quadrantTooltip.y,
            transform: (() => {
              switch (quadrantTooltip.placement) {
                case 'bottom': return 'translate(-50%, 0)'      // Tooltip 在下方，水平居中
                case 'top': return 'translate(-50%, -100%)'     // Tooltip 在上方，水平居中
                case 'right': return 'translate(0, -50%)'       // Tooltip 在右侧，垂直居中
                case 'left': return 'translate(-100%, -50%)'    // Tooltip 在左侧，垂直居中
                default: return 'translate(-50%, 0)'
              }
            })(),
            width: '110px',                    // 固定宽度
            padding: '10px 14px',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',  // 半透明背景
            borderRadius: '6px',
            fontSize: '13px',
            color: '#666',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            zIndex: 100,
            pointerEvents: 'none',
            whiteSpace: 'normal',              // 允许换行
            wordBreak: 'break-word'            // 长词换行
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#333', lineHeight: '1.4' }}>
            {quadrantTooltip.name}
          </div>
          <div style={{ marginBottom: '4px' }}>
            {t('quadrant.count', '数量')}: {quadrantTooltip.count}
          </div>
          {/* 仅当配置了气泡大小字段时显示统计信息 */}
          {sizeFieldName && quadrantTooltip.avg !== undefined && (
            <>
              <div style={{ marginBottom: '4px' }}>
                {t('quadrant.avg', '平均值')}: {sizeIsPercentage ? parseFloat((quadrantTooltip.avg * 100).toFixed(2)) + '%' : parseFloat(quadrantTooltip.avg.toFixed(2))}
              </div>
              <div style={{ marginBottom: '4px' }}>
                {t('quadrant.median', '中位数')}: {sizeIsPercentage ? parseFloat(((quadrantTooltip.median ?? 0) * 100).toFixed(2)) + '%' : parseFloat((quadrantTooltip.median ?? 0).toFixed(2))}
              </div>
              <div style={{ marginBottom: '4px' }}>
                {t('quadrant.max', '最大值')}: {sizeIsPercentage ? parseFloat(((quadrantTooltip.max ?? 0) * 100).toFixed(2)) + '%' : parseFloat((quadrantTooltip.max ?? 0).toFixed(2))}
              </div>
              <div>
                {t('quadrant.min', '最小值')}: {sizeIsPercentage ? parseFloat(((quadrantTooltip.min ?? 0) * 100).toFixed(2)) + '%' : parseFloat((quadrantTooltip.min ?? 0).toFixed(2))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 加载状态：已移除遮罩层，保持旧图表显示直到新数据到来 */}
      {/* {loading && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#999',
          background: 'transparent',
          zIndex: 10
        }}>
          {t('chart.loading')}
        </div>
      )} */}

      {/* 空状态提示：覆盖在图表上层 */}
      {!loading && data.length === 0 && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#999',
          background: 'transparent',
          padding: '24px',
          pointerEvents: 'none'  // 允许点击穿透到图表
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🫧</div>
          <div style={{ fontSize: '16px', marginBottom: '8px' }}>{t('chart.emptyTitle')}</div>
          <div style={{ fontSize: '12px', textAlign: 'center', lineHeight: '1.5' }}>
            {t('chart.emptyDescription')}
          </div>
        </div>
      )}
    </div>
  )
}
