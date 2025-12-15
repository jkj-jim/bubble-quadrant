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
import { Empty } from '@douyinfe/semi-ui'

/**
 * BubbleChartProps - 气泡图组件属性
 * 功能：定义组件接收的props类型
 * 扩展：支持数值轴和类目轴两种模式
 */
export interface BubbleChartProps {
  data: DataItem[]
  loading: boolean
  config: BubbleChartConfig
  theme?: string
  xFieldName?: string       // 横轴字段名（用于显示）
  yFieldName?: string       // 纵轴字段名（用于显示）
  sizeFieldName?: string    // 大小字段名（用于显示）
  nameFieldName?: string    // 名称字段名（用于判断是否显示标签）
  xAxisType?: 'value' | 'category'  // 横轴类型（数值/类目）
  yAxisType?: 'value' | 'category'  // 纵轴类型（数值/类目）
  xAxisData?: string[]      // 横轴类目选项列表
  yAxisData?: string[]      // 纵轴类目选项列表
  xIsPercentage?: boolean   // 横轴是否为百分比格式
  yIsPercentage?: boolean   // 纵轴是否为百分比格式
  sizeIsPercentage?: boolean // 气泡大小是否为百分比格式
  enableMultiColor?: boolean // 是否开启多彩模式
  showLabel?: boolean        // 是否常显名称标签
}

/**
 * BubbleChart - 气泡图组件
 * 功能：封装ECharts气泡图，支持数据渲染、响应式布局、数值轴和类目轴
 * 说明：
 * - 支持数值轴（type: 'value'）用于传统的气泡图
 * - 支持类目轴（type: 'category'）用于散点图和混合轴场景
 * - 类目轴显示用户在单选字段中设定的选项顺序
 */
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
    minSize: 10,
    maxSize: 80,
    defaultSize: 8,
    opacity: 0.6,
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
 * 计算指定象限内气泡的统计数据
 * @param data 所有气泡数据
 * @param quadrantKey 目标象限标识
 * @param xThreshold x 轴分割线位置
 * @param yThreshold y 轴分割线位置
 * @param xAxisType x 轴类型
 * @param yAxisType y 轴类型
 * @param xAxisData x 轴类目数据（用于类目轴）
 * @param yAxisData y 轴类目数据（用于类目轴）
 */
const calculateQuadrantStats = (
  data: DataItem[],
  quadrantKey: QuadrantKey,
  xThreshold: number | null,
  yThreshold: number | null,
  xAxisType: 'value' | 'category',
  yAxisType: 'value' | 'category',
  _xAxisData?: string[],  // 保留供将来使用
  _yAxisData?: string[]   // 保留供将来使用
) => {
  // 筛选属于该象限的气泡
  const bubblesInQuadrant = data.filter(item => {
    // 获取 x 值（数值轴直接用值，类目轴用索引）
    const xVal = xAxisType === 'category' && item.xCategoryIndex !== undefined
      ? item.xCategoryIndex
      : item.x as number

    // 获取 y 值
    const yVal = yAxisType === 'category' && item.yCategoryIndex !== undefined
      ? item.yCategoryIndex
      : item.y as number

    return getQuadrantForBubble(xVal, yVal, xThreshold, yThreshold) === quadrantKey
  })

  const count = bubblesInQuadrant.length
  const sizes = bubblesInQuadrant.map(b => b.size).filter(s => typeof s === 'number' && !isNaN(s))

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
        splitLine: getTokenColor(CHART_STYLE_CONFIG.colors.splitLine, '#F3F4F5'),
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
   */
  const getThresholdValues = useCallback(() => {
    const xVal = config.xThreshold ? (
      xAxisType === 'category'
        ? (xAxisData?.indexOf(config.xThreshold as string) ?? -1)
        : parseFloat(config.xThreshold as string)
    ) : null

    const yVal = config.yThreshold ? (
      yAxisType === 'category'
        ? (yAxisData?.indexOf(config.yThreshold as string) ?? -1)
        : parseFloat(config.yThreshold as string)
    ) : null

    return { xVal, yVal }
  }, [config.xThreshold, config.yThreshold, xAxisType, yAxisType, xAxisData, yAxisData])



  /**
   * 创建轴配置
   * @param config 轴特定配置
   */
  const createAxisConfig = (config: {
    type: 'value' | 'category'
    name: string
    data?: string[]
    isPercentage?: boolean
  }) => {
    const baseConfig = {
      type: config.type,
      name: config.name,
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
        lineStyle: {
          color: chartStyles.colors.axisLine
        }
      },
      axisLabel: {
        color: chartStyles.colors.axisLabel,
        formatter: (value: any) => {
          if (config.isPercentage && typeof value === 'number') {
            return parseFloat((value * 100).toFixed(2)) + '%'
          }
          return value
        }
      },
      scale: true
    }

    // 如果是类目轴，添加数据列表和 boundaryGap
    if (config.type === 'category' && config.data) {
      return {
        ...baseConfig,
        data: config.data,
        boundaryGap: true  // 确保类目轴有边界间隙，这样 markLine 可以正确显示在类目之间
      }
    }

    return baseConfig
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

  useEffect(() => {
    // 只有当非加载状态且没有数据时，才清空图表
    // 这样在 loading 期间会保留上一份数据的渲染结果，避免白屏闪烁
    if (!loading && data.length === 0) {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.clear()
      }
      return
    }

    // 如果 echarts 实例不存在，立即初始化（关键修复点）
    if (!chartInstanceRef.current) {
      if (chartRef.current) {
        chartInstanceRef.current = echarts.init(chartRef.current)
      } else {
        return
      }
    }
    /**
     * 使用工厂函数生成X轴和Y轴配置
     */
    const xAxis = createAxisConfig({
      type: xAxisType,
      name: xFieldName || t('chart.defaultXAxis'),
      data: xAxisType === 'category' ? xAxisData : undefined,
      isPercentage: xIsPercentage
    }) as any

    const yAxis = createAxisConfig({
      type: yAxisType,
      name: yFieldName || t('chart.defaultYAxis'),
      data: yAxisType === 'category' ? yAxisData : undefined,
      isPercentage: yIsPercentage
    }) as any

    /**
     * 处理图表数据，根据轴类型选择不同的值
     * 数值轴：直接使用数值
     * 类目轴：使用类目索引（指向 options 数组中的位置），但显示原始文本
     */
    const seriesData = data.map((item, index) => {
      // X轴值处理
      let xValue: number | string
      let xDisplay: number | string

      if (xAxisType === 'category' && item.xCategoryIndex !== undefined) {
        xValue = item.xCategoryIndex  // 使用索引，ECharts会自动映射到类目
        xDisplay = String(item.x)     // 显示原始文本
      } else {
        xValue = item.x as number
        xDisplay = item.x
      }

      // Y轴值处理
      let yValue: number | string
      let yDisplay: number | string

      if (yAxisType === 'category' && item.yCategoryIndex !== undefined) {
        yValue = item.yCategoryIndex  // 使用索引
        yDisplay = String(item.y)     // 显示原始文本
      } else {
        yValue = item.y as number
        yDisplay = item.y
      }

      // 根据 enableMultiColor 属性决定颜色方案：
      // 如果开启多彩模式 (enableMultiColor 为 true)，则从预定义的飞书风格色板 (colorPalette) 中根据当前数据项的索引 (index) 循环选择颜色，实现多彩气泡；
      // 否则 (enableMultiColor 为 false)，所有气泡都使用默认的单色 #336DF4
      const itemColor = enableMultiColor
        ? colorPalette[index % colorPalette.length]
        : '#336DF4'

      return {
        name: item.name,
        value: [xValue, yValue, item.size] as [number | string, number | string, number],
        // 使用原始文本作为显示值
        data: [xDisplay, yDisplay, item.size],
        itemStyle: {
          color: itemColor,
          opacity: chartStyles.bubble.opacity,
          borderColor: chartStyles.bubble.borderColor
        }
      }
    })

    // 计算气泡大小的极值，用于线性映射
    const sizes = data.map(item => item.size)
    const minSize = Math.min(...sizes)
    const maxSize = Math.max(...sizes)

    const option: EChartsOption = {
      backgroundColor: 'transparent',
      grid: chartStyles.grid,
      xAxis,
      yAxis,
      tooltip: {//用于调整 hover 时的提示框
        trigger: 'item',
        formatter: (params: any) => {
          const data = params.data
          // 使用 data.data 获取原始显示值（避免类目轴显示索引）
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

          return `
            <div style="padding: 8px;">
              ${data.name ? `<div style="font-weight: bold; margin-bottom: 4px;">${data.name}</div>` : ''}
              <div>${xFieldName || 'X'}: ${xDisplay}</div>
              <div>${yFieldName || 'Y'}: ${yDisplay}</div>
              ${sizeFieldName ? `<div>${sizeFieldName}: ${sizeDisplay}</div>` : ''}
            </div>
          `
        }
      },
      series: [
        {
          type: 'scatter',
          symbolSize: (val: any) => {
            // 如果没有配置大小字段，使用固定大小
            if (!sizeFieldName) {
              return chartStyles.bubble.defaultSize
            }

            // 获取原始大小值
            const sizeVal = val[2] as number

            // 如果所有数据大小相同，返回中间大小
            if (maxSize === minSize) {
              return (chartStyles.bubble.minSize + chartStyles.bubble.maxSize) / 2
            }

            // 线性映射公式: Pixel = MinPixel + (Val - MinVal) / (MaxVal - MinVal) * (MaxPixel - MinPixel)
            const size = chartStyles.bubble.minSize + (sizeVal - minSize) / (maxSize - minSize) * (chartStyles.bubble.maxSize - chartStyles.bubble.minSize)
            return size
          },
          label: {
            show: !!nameFieldName && !!showLabel, // 只有当配置了气泡名称字段且开启了常显时才显示标签
            formatter: '{b}',      // 显示数据项名称 (name)
            position: chartStyles.label.position,
            fontSize: chartStyles.label.fontSize,
            // color: CHART_STYLES.label.color,
            // textBorderWidth: 0,
            opacity: chartStyles.label.opacity
          },
          labelLayout: {
            hideOverlap: true      // 自动隐藏重叠的标签
          },
          data: seriesData,
          emphasis: {
            focus: 'self',  // 聚焦当前项，其他项自动进入 blur 状态
            label: {
              show: true    // hover 时强制显示当前项的标签
            },
            itemStyle: {
              opacity: chartStyles.emphasis.opacity,
              shadowBlur: chartStyles.emphasis.shadowBlur,
              shadowColor: chartStyles.emphasis.shadowColor
            }
          },
          blur: {
            label: {
              show: false    // hover 时隐藏其他气泡的标签
            },
            itemStyle: {
              opacity: 0.15,  // 降低其他气泡的透明度
              color: '#ccc'   // 其他气泡变灰
            }
          },
          /**
           * ===== 象限分割线配置 (markLine) =====
           * 用于在图表上绘制水平或垂直的分割线，将图表划分为不同象限
           *
           * 坐标计算逻辑：
           * - 数值轴：直接使用用户输入的数值
           * - 类目轴：使用类目在数据数组中的索引位置
           *   （注：ECharts 类目轴不支持在类目之间绘制 markLine，只能在类目位置上绘制）
           */
          markLine: {
            silent: true, // 不响应鼠标事件，避免干扰图表交互
            symbol: ['none', 'none'], // 不显示箭头
            lineStyle: {
              type: 'solid',
              color: '#999', // 分割线颜色
              width: 1
            },
            label: { show: false }, // 不显示分割线数值标签
            data: [
              // X轴分割线（垂直线）
              config.xThreshold ? {
                xAxis: xAxisType === 'category'
                  ? (xAxisData?.indexOf(config.xThreshold as string) ?? -1)  // 类目轴：使用索引
                  : parseFloat(config.xThreshold as string)                   // 数值轴：直接使用数值
              } : null,
              // Y轴分割线（水平线）
              config.yThreshold ? {
                yAxis: yAxisType === 'category'
                  ? (yAxisData?.indexOf(config.yThreshold as string) ?? -1)  // 类目轴：使用索引
                  : parseFloat(config.yThreshold as string)                   // 数值轴：直接使用数值
              } : null
            ].filter(Boolean) as any[]
          },
          /**
           * ===== 象限背景区域配置 (markArea) =====
           * 用于在分割线划分的各个象限中填充不同的背景颜色
           *
           * 区域命名规则：
           * - TL (Top-Left): 左上象限
           * - TR (Top-Right): 右上象限
           * - BL (Bottom-Left): 左下象限
           * - BR (Bottom-Right): 右下象限
           *
           * 坐标计算说明：
           * - 每个 markArea 由两个点定义：左下角和右上角
           * - 数值轴使用极大/极小值（-1e308 / 1e308）确保覆盖整个可视区域
           * - 类目轴使用 -0.5 到 length-0.5 尝试覆盖，但由于 ECharts 限制，边缘可能有少许空隙
           */
          markArea: {
            silent: true, // 不响应鼠标事件
            emphasis: {
              disabled: true // 防止响应 highlight/downplay
            },
            data: (() => {
              // 如果没有设置分割线，不显示任何区域
              if (!config.xThreshold && !config.yThreshold) return []

              // 计算分割线在坐标轴上的位置
              const xVal = config.xThreshold ? (
                xAxisType === 'category'
                  ? (xAxisData?.indexOf(config.xThreshold as string) ?? -1)
                  : parseFloat(config.xThreshold as string)
              ) : null

              const yVal = config.yThreshold ? (
                yAxisType === 'category'
                  ? (yAxisData?.indexOf(config.yThreshold as string) ?? -1)
                  : parseFloat(config.yThreshold as string)
              ) : null

              // 计算轴边界值，用于定义区域的边界
              // 数值轴：使用足够大的极值（避免 1e308 导致的渲染问题）
              // 类目轴：使用 -0.5 到 data.length - 0.5，尽可能覆盖完整区域
              const xMin = xAxisType === 'category' ? -0.5 : -1e10
              const xMax = xAxisType === 'category' ? (xAxisData?.length ?? 0) - 0.5 : 1e10
              const yMin = yAxisType === 'category' ? -0.5 : -1e10
              const yMax = yAxisType === 'category' ? (yAxisData?.length ?? 0) - 0.5 : 1e10

              // 仅 X 轴分割
              if (xVal !== null && yVal === null) {
                return [
                  // 左区域
                  [
                    {
                      name: config.quadrantTLName || '',
                      itemStyle: { color: hoveredQuadrant && hoveredQuadrant !== 'LEFT' ? 'transparent' : (config.quadrantTLColor || 'transparent'), opacity: 0.1 },
                      label: { show: false },  // 禁用原生 label，改用 React DOM 渲染
                      xAxis: xMin, yAxis: yMin
                    },
                    {
                      xAxis: xVal, yAxis: yMax
                    }
                  ],
                  // 右区域
                  [
                    {
                      name: config.quadrantTRName || '',
                      itemStyle: { color: hoveredQuadrant && hoveredQuadrant !== 'RIGHT' ? 'transparent' : (config.quadrantTRColor || 'transparent'), opacity: 0.1 },
                      label: { show: false },
                      xAxis: xVal, yAxis: yMin
                    },
                    {
                      xAxis: xMax, yAxis: yMax
                    }
                  ]
                ]
              }

              // 仅 Y 轴分割
              if (xVal === null && yVal !== null) {
                return [
                  // 上区域
                  [
                    {
                      name: config.quadrantTLName || '',
                      itemStyle: { color: hoveredQuadrant && hoveredQuadrant !== 'TOP' ? 'transparent' : (config.quadrantTLColor || 'transparent'), opacity: 0.1 },
                      label: { show: false },
                      xAxis: xMin, yAxis: yVal
                    },
                    {
                      xAxis: xMax, yAxis: yMax
                    }
                  ],
                  // 下区域
                  [
                    {
                      name: config.quadrantBLName || '',
                      itemStyle: { color: hoveredQuadrant && hoveredQuadrant !== 'BOTTOM' ? 'transparent' : (config.quadrantBLColor || 'transparent'), opacity: 0.1 },
                      label: { show: false },
                      xAxis: xMin, yAxis: yMin
                    },
                    {
                      xAxis: xMax, yAxis: yVal
                    }
                  ]
                ]
              }

              // 双轴分割 (4个象限)
              if (xVal !== null && yVal !== null) {
                return [
                  // 左上 (TL)
                  [
                    {
                      name: config.quadrantTLName || '',
                      itemStyle: { color: hoveredQuadrant && hoveredQuadrant !== 'TL' ? 'transparent' : (config.quadrantTLColor || 'transparent'), opacity: 0.1 },
                      label: { show: false },
                      xAxis: xMin, yAxis: yVal
                    },
                    { xAxis: xVal, yAxis: yMax }
                  ],
                  // 右上 (TR)
                  [
                    {
                      name: config.quadrantTRName || '',
                      itemStyle: { color: hoveredQuadrant && hoveredQuadrant !== 'TR' ? 'transparent' : (config.quadrantTRColor || 'transparent'), opacity: 0.1 },
                      label: { show: false },
                      xAxis: xVal, yAxis: yVal
                    },
                    { xAxis: xMax, yAxis: yMax }
                  ],
                  // 左下 (BL)
                  [
                    {
                      name: config.quadrantBLName || '',
                      itemStyle: { color: hoveredQuadrant && hoveredQuadrant !== 'BL' ? 'transparent' : (config.quadrantBLColor || 'transparent'), opacity: 0.1 },
                      label: { show: false },
                      xAxis: xMin, yAxis: yMin
                    },
                    { xAxis: xVal, yAxis: yVal }
                  ],
                  // 右下 (BR)
                  [
                    {
                      name: config.quadrantBRName || '',
                      itemStyle: { color: hoveredQuadrant && hoveredQuadrant !== 'BR' ? 'transparent' : (config.quadrantBRColor || 'transparent'), opacity: 0.1 },
                      label: { show: false },
                      xAxis: xVal, yAxis: yMin
                    },
                    { xAxis: xMax, yAxis: yVal }
                  ]
                ]
              }

              return []
            })()
          }
        }
      ]
    }

    chartInstanceRef.current.setOption(option)

    // ===== 计算象限 label 的像素位置 =====
    // 使用 ECharts 的 grid 区域边界来计算 label 位置
    const chart = chartInstanceRef.current
    // 计算并设置 Graphic 元素 (象限 Label)
    const graphicElements: any[] = []

    const createLabelGraphic = (key: QuadrantKey, name: string, x: number, y: number, position: 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right') => {
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

    const { xVal, yVal } = getThresholdValues()

    if (!config.xThreshold && !config.yThreshold) {
      // setQuadrantLabels([]) // Removed
      option.graphic = []
      chart.setOption(option, { replaceMerge: ['graphic'] })
      return
    }

    // 获取 grid 区域的像素边界
    // 使用 grid.coordinateSystem.getRect() 获取真实绘图区域边界
    // 这是 ECharts 内部用于 markArea 定位的同一方法，保证一致性
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

    const gridCenterX = (gridLeft + gridRight) / 2
    const gridCenterY = (gridTop + gridBottom) / 2

    // 1. 左右模式 (仅 X 轴分割)
    if (xVal !== null && yVal === null) {
      if (config.quadrantTLName) { // LEFT
        graphicElements.push(createLabelGraphic('LEFT', config.quadrantTLName, gridLeft, gridCenterY, 'left'))
      }
      if (config.quadrantTRName) { // RIGHT
        graphicElements.push(createLabelGraphic('RIGHT', config.quadrantTRName, gridRight, gridCenterY, 'right'))
      }
    }

    // 2. 上下模式 (仅 Y 轴分割)
    if (xVal === null && yVal !== null) {
      if (config.quadrantTLName) { // TOP
        graphicElements.push(createLabelGraphic('TOP', config.quadrantTLName, gridCenterX, gridTop, 'top'))
      }
      if (config.quadrantBLName) { // BOTTOM
        graphicElements.push(createLabelGraphic('BOTTOM', config.quadrantBLName, gridCenterX, gridBottom, 'bottom'))
      }
    }

    // 3. 双轴分割 (4象限模式)
    if (xVal !== null && yVal !== null) {
      if (config.quadrantTLName) graphicElements.push(createLabelGraphic('TL', config.quadrantTLName, gridLeft, gridTop, 'top-left'))
      if (config.quadrantTRName) graphicElements.push(createLabelGraphic('TR', config.quadrantTRName, gridRight, gridTop, 'top-right'))
      if (config.quadrantBLName) graphicElements.push(createLabelGraphic('BL', config.quadrantBLName, gridLeft, gridBottom, 'bottom-left'))
      if (config.quadrantBRName) graphicElements.push(createLabelGraphic('BR', config.quadrantBRName, gridRight, gridBottom, 'bottom-right'))
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

        // 计算统计信息
        const { xVal, yVal } = getThresholdValues()
        const stats = calculateQuadrantStats(
          data,
          key,
          xVal,
          yVal,
          xAxisType,
          yAxisType,
          xAxisData,
          yAxisData
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

        // Highlight
        const bubbleIndicesInQuadrant: number[] = []
        data.forEach((item, index) => {
          const xValue = xAxisType === 'category' && item.xCategoryIndex !== undefined
            ? item.xCategoryIndex
            : item.x as number
          const yValue = yAxisType === 'category' && item.yCategoryIndex !== undefined
            ? item.yCategoryIndex
            : item.y as number

          if (getQuadrantForBubble(xValue, yValue, xVal, yVal) === key) {
            bubbleIndicesInQuadrant.push(index)
          }
        })

        if (bubbleIndicesInQuadrant.length > 0) {
          chart.dispatchAction({
            type: 'highlight',
            seriesIndex: 0,
            dataIndex: bubbleIndicesInQuadrant
          })
        } else {
          // Empty quadrant, downplay all
          // chart.dispatchAction({ type: 'downplay', seriesIndex: 0 }) 
          // 用户反馈“hover 象限标题的时候，当前象限的背景色还是要展示的”
          // Downplay 会导致整个 series 变淡，但 markArea 即使在 downplay 下也应该受 opacity 控制
          // 保持 downplay 逻辑，确保未选中气泡变淡
          chart.dispatchAction({ type: 'downplay', seriesIndex: 0 })
        }
      }
    }

    const handleGraphicMouseOut = (params: any) => {
      if (params.componentType === 'graphic' && params.info && params.info.key) {
        setQuadrantTooltip(prev => ({ ...prev, visible: false }))
        setHoveredQuadrant(null)
        chart.dispatchAction({ type: 'downplay', seriesIndex: 0 })
      }
    }

    // 绑定事件
    chart.on('mouseover', handleGraphicMouseOver)
    chart.on('mouseout', handleGraphicMouseOut)

    return () => {
      chart.off('mouseover', handleGraphicMouseOver)
      chart.off('mouseout', handleGraphicMouseOut)
    }
  }, [data, getThresholdValues, xAxisType, yAxisType, xAxisData, yAxisData, sizeFieldName]) // Deps need to be correct

  if (!data || data.length === 0) {
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
