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

import React, { useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'
import type { DataItem } from '../hooks/useDashboard'
import type { BubbleChartConfig } from '../hooks/useDashboard'

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

    // 如果是类目轴，添加数据列表
    if (config.type === 'category' && config.data) {
      return { ...baseConfig, data: config.data }
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
    })

    const yAxis = createAxisConfig({
      type: yAxisType,
      name: yFieldName || t('chart.defaultYAxis'),
      data: yAxisType === 'category' ? yAxisData : undefined,
      isPercentage: yIsPercentage
    })

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
          }
        }
      ]
    }

    chartInstanceRef.current.setOption(option)
  }, [data, xFieldName, yFieldName, sizeFieldName, loading, xAxisType, yAxisType, xAxisData, yAxisData, xIsPercentage, yIsPercentage, sizeIsPercentage, enableMultiColor, t, chartStyles])

  useEffect(() => {
    const handleResize = () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.resize()
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* 图表容器：始终渲染，让 Echarts 可以初始化 */}
      <div ref={chartRef} style={{ width: '100%', height: '100%' }}></div>

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
