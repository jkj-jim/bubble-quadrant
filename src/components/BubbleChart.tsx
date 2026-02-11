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
import { Empty, Toast } from '@douyinfe/semi-ui'

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

  //Echarts 风格色板
  // const colorPalette = [
  //   '#5070dd', '#b6d634', '#505372', '#ff994d', '#0ca8df', '#ffd10a', '#fb628b', '#785db0', '#3fbe95'
  // ]

  // 飞书风格色板
  const colorPalette = [
    '#336DF4', '#5B65F5', '#25B0E7', '#DB7018', '#FFC60A', '#8C55EC', '#FFE928', '#F54A45', '#91AD00', '#BF3DBF', '#35BD4B', '#DF58A5', '#1FA18F'
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
      // 包装 formatter：先转换为文本，再截断超长文本
      const truncatedFormatter = (value: number) => {
        const text = originalFormatter(value)
        const maxLen = 6  // 最大显示字符数
        if (typeof text === 'string' && text.length > maxLen) {
          return text.slice(0, maxLen - 1) + '...'
        }
        return text
      }
      return {
        ...baseConfig,
        type: 'value' as const,  // 关键：使用数值轴
        min: mapperConfig.min,
        max: mapperConfig.max,
        splitNumber: mapperConfig.splitNumber,
        axisLabel: {
          color: chartStyles.colors.axisLabel,
          // 使用截断 formatter，防止超长文本压缩图表
          formatter: truncatedFormatter
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
        formatter: (value: any) => {
          if (axisConfig.isPercentage && typeof value === 'number') {
            return parseFloat((value * 100).toFixed(2)) + '%'
          }
          return value
        }
      }
    }
  }

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
          chartInstanceRef.current.resize()
        }
      }
    })

    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

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
      hasTime: xFieldHasTime  // 日期轴是否显示时间
    }) as any

    const yAxis = createAxisConfig({
      type: yAxisType,
      name: yFieldName || t('chart.defaultYAxis'),
      data: yAxisType === 'category' ? yAxisData : undefined,
      isPercentage: yIsPercentage,
      mapper: yAxisType === 'category' ? yAxisMapper : undefined,
      otherAxisIsCategory: xAxisType === 'category',  // X轴是类目轴时，Y轴显示在边缘
      hasTime: yFieldHasTime  // 日期轴是否显示时间
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
        itemStyle: {
          color: itemColor,
          opacity: chartStyles.bubble.opacity,
          borderColor: chartStyles.bubble.borderColor
        }
      }
    })

    // ===== 颜色分组映射 =====
    // 如果配置了颜色分组，构建分组 -> 颜色的映射
    const colorGroupMap = new Map<string, { color: string, count: number }>()

    if (config.colorGroupType) {
      // 收集所有唯一的分组 key
      seriesData.forEach((item: any) => {
        const key = item.colorGroupKey || ''
        const displayKey = key || emptyLabel  // 空值显示为"空"
        if (!colorGroupMap.has(displayKey)) {
          const colorIndex = colorGroupMap.size % colorPalette.length
          colorGroupMap.set(displayKey, { color: colorPalette[colorIndex], count: 0 })
        }
        const groupInfo = colorGroupMap.get(displayKey)!
        groupInfo.count++
      })

      // 更新 seriesData 中的颜色
      seriesData.forEach((item: any) => {
        const key = item.colorGroupKey || ''
        const displayKey = key || emptyLabel
        const groupInfo = colorGroupMap.get(displayKey)
        if (groupInfo) {
          item.itemStyle.color = groupInfo.color
        }
      })
    }

    // 计算气泡大小的极值，用于线性映射
    const sizes = data.map(item => item.size)
    const minSize = Math.min(...sizes)
    const maxSize = Math.max(...sizes)

    const option: EChartsOption = {
      backgroundColor: 'transparent',
      grid: chartStyles.grid,
      xAxis,
      yAxis,
      // 图例配置：仅在开启颜色分组时显示
      // 图例配置：仅在开启颜色分组时显示
      legend: config.colorGroupType && colorGroupMap.size > 0 ? {
        show: true,
        type: 'scroll',
        orient: 'horizontal',
        top: 12,
        left: 'center',
        // 不使用 selectedMode: false，因为会禁用 hover 效果
        // 改用事件监听 legendselectchanged 来阻止隐藏数据
        data: Array.from(colorGroupMap.entries()).map(([key, info]) => ({
          name: key,
          itemStyle: { color: info.color }
        })),
        textStyle: {
          color: chartStyles.colors.axisLabel
        }
      } : { show: false },
      tooltip: {//用于调整 hover 时的提示框
        trigger: 'item',
        formatter: (params: any) => {
          const data = params.data
          // 使用 data.data 获取原始显示值（避免类目轴显示索引）
          let xDisplay = data.data ? data.data[0] : data.value[0]
          let yDisplay = data.data ? data.data[1] : data.value[1]
          let sizeDisplay: number | string = data.data ? data.data[2] : data.value[2]

          // 格式化显示 - 日期轴处理
          if (xAxisType === 'date' && typeof xDisplay === 'number') {
            xDisplay = formatDate(xDisplay, xFieldHasTime, true)  // tooltip 显示完整日期
          } else if (xIsPercentage && typeof xDisplay === 'number') {
            xDisplay = parseFloat((xDisplay * 100).toFixed(2)) + '%'
          }

          if (yAxisType === 'date' && typeof yDisplay === 'number') {
            yDisplay = formatDate(yDisplay, yFieldHasTime, true)  // tooltip 显示完整日期
          } else if (yIsPercentage && typeof yDisplay === 'number') {
            yDisplay = parseFloat((yDisplay * 100).toFixed(2)) + '%'
          }

          // 计数模式下 size 是整数，不需要百分比格式化
          if (sizeIsPercentage && typeof sizeDisplay === 'number' && config.sizeMode !== 'count') {
            sizeDisplay = parseFloat((sizeDisplay * 100).toFixed(2)) + '%'
          }

          // 计数模式下，size 显示为"计数: N"
          const sizeLabel = config.sizeMode === 'count' ? t('label.count') : sizeFieldName

          return `
            <div style="padding: 8px;">
              ${data.name ? `<div style="font-weight: bold; margin-bottom: 4px;">${data.name}</div>` : ''}
              <div>${xFieldName || 'X'}: ${xDisplay}</div>
              <div>${yFieldName || 'Y'}: ${yDisplay}</div>
              ${sizeLabel ? `<div>${sizeLabel}: ${sizeDisplay}</div>` : ''}
            </div>
          `
        }
      },
      series: (() => {
        // 公共的 series 配置
        // 计数模式或有 sizeFieldName 时，根据 size 值动态计算气泡大小
        const shouldUseDynamicSize = config.sizeMode === 'count' || !!sizeFieldName
        const symbolSizeFn = (val: any) => {
          if (!shouldUseDynamicSize) {
            return chartStyles.bubble.defaultSize
          }
          const sizeVal = val[2] as number
          if (maxSize === minSize) {
            return (chartStyles.bubble.minSize + chartStyles.bubble.maxSize) / 2
          }
          const size = chartStyles.bubble.minSize + (sizeVal - minSize) / (maxSize - minSize) * (chartStyles.bubble.maxSize - chartStyles.bubble.minSize)
          return size
        }

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
    } catch (e) {
      console.error('[BubbleChart] setOption 错误', e)
    }

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
      option.graphic = []
      chart.setOption(option, { replaceMerge: ['graphic'] })
      return
    }

    // 获取 grid 区域的像素边界
    const gridModel = (chart as any).getModel().getComponent('grid')
    const gridRect = gridModel?.coordinateSystem?.getRect()

    if (!gridRect) {
      console.warn('无法获取 ECharts grid 信息')
      option.graphic = []
      chart.setOption(option, { replaceMerge: ['graphic'] })
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


    // Apply Graphic
    option.graphic = graphicElements
    chartInstanceRef.current.setOption(option, { replaceMerge: ['graphic'] })

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

    // 点击气泡复制详情信息
    const handleBubbleClick = (params: any) => {
      if (params.componentType === 'series' && params.seriesType === 'scatter') {
        const data = params.data
        if (!data) return

        // 获取显示值
        let xDisplay = data.data ? data.data[0] : data.value[0]
        let yDisplay = data.data ? data.data[1] : data.value[1]
        let sizeDisplay: number | string = data.data ? data.data[2] : data.value[2]

        // 格式化百分比显示
        if (xIsPercentage && typeof xDisplay === 'number') {
          xDisplay = parseFloat((xDisplay * 100).toFixed(2)) + '%'
        }
        if (yIsPercentage && typeof yDisplay === 'number') {
          yDisplay = parseFloat((yDisplay * 100).toFixed(2)) + '%'
        }
        if (sizeIsPercentage && typeof sizeDisplay === 'number') {
          sizeDisplay = parseFloat((sizeDisplay * 100).toFixed(2)) + '%'
        }

        // 格式化日期显示（将时间戳转为可读日期）
        if (xAxisType === 'date' && typeof xDisplay === 'number') {
          xDisplay = formatDate(xDisplay, xFieldHasTime, true)
        }
        if (yAxisType === 'date' && typeof yDisplay === 'number') {
          yDisplay = formatDate(yDisplay, yFieldHasTime, true)
        }

        // 构建复制文本
        let copyText = ''
        if (data.name) {
          copyText += `${data.name}\n`
        }
        copyText += `${xFieldName || 'X'}: ${xDisplay}`
        copyText += `\n${yFieldName || 'Y'}: ${yDisplay}`
        if (sizeFieldName) {
          copyText += `\n${sizeFieldName}: ${sizeDisplay}`
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
