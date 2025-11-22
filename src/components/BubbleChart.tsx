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

import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'
import type { DataItem } from '../hooks/useDashboard'

/**
 * BubbleChartProps - 气泡图组件属性
 * 功能：定义组件接收的props类型
 * 扩展：支持数值轴和类目轴两种模式
 */
export interface BubbleChartProps {
  data: DataItem[]          // 图表数据
  xFieldName?: string       // 横轴字段名（用于显示）
  yFieldName?: string       // 纵轴字段名（用于显示）
  sizeFieldName?: string    // 大小字段名（用于显示）
  loading?: boolean         // 加载状态
  xAxisType?: 'value' | 'category'  // 横轴类型（数值/类目）
  yAxisType?: 'value' | 'category'  // 纵轴类型（数值/类目）
  xAxisData?: string[]      // 横轴类目选项列表
  yAxisData?: string[]      // 纵轴类目选项列表
  xIsPercentage?: boolean   // 横轴是否为百分比格式
  yIsPercentage?: boolean   // 纵轴是否为百分比格式
  sizeIsPercentage?: boolean // 气泡大小是否为百分比格式
}

/**
 * BubbleChart - 气泡图组件
 * 功能：封装ECharts气泡图，支持数据渲染、响应式布局、数值轴和类目轴
 * 说明：
 * - 支持数值轴（type: 'value'）用于传统的气泡图
 * - 支持类目轴（type: 'category'）用于散点图和混合轴场景
 * - 类目轴显示用户在单选字段中设定的选项顺序
 */
export const BubbleChart: React.FC<BubbleChartProps> = ({
  data,
  xFieldName,
  yFieldName,
  sizeFieldName,
  loading,
  xAxisType = 'value',  // 默认为数值轴，向后兼容
  yAxisType = 'value',  // 默认为数值轴，向后兼容
  xAxisData,
  yAxisData,
  xIsPercentage,
  yIsPercentage,
  sizeIsPercentage,
}) => {
  // chartRef: ECharts容器DOM元素引用
  const chartRef = useRef<HTMLDivElement>(null)

  // chartInstanceRef: ECharts实例引用
  const chartInstanceRef = useRef<echarts.ECharts | null>(null)

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
    // 如果正在加载或没有数据，清空图表
    if (loading || data.length === 0) {
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
     * 动态生成X轴配置
     * 根据轴类型（value/category）生成不同的配置
     */
    const xAxis: any = {
      type: xAxisType,
      name: xFieldName || '横轴',
      nameLocation: 'end',
      nameGap: 10,
      nameTextStyle: {
        color: '#646A73'
      },
      splitLine: {
        show: true,
        lineStyle: {
          type: 'dashed',
          // color: '#D5D5D7'
        }
      },
      axisLine: {
        lineStyle: {
          color: '#BBBFC4'
        }
      },
      axisLabel: {
        color: '#8F959E',
        formatter: (value: any) => {
          if (xIsPercentage && typeof value === 'number') {
            // 智能百分比格式：去除末尾多余的零
            // 例如：0.09 -> 9%，0.095 -> 9.5%
            return parseFloat((value * 100).toFixed(2)) + '%'
          }
          return value
        }
      }
    }

    // 如果是类目轴，添加数据列表
    if (xAxisType === 'category' && xAxisData) {
      xAxis.data = xAxisData
    }

    /**
     * 动态生成Y轴配置
     * 根据轴类型（value/category）生成不同的配置
     */
    const yAxis: any = {
      type: yAxisType,
      name: yFieldName || '纵轴',
      nameLocation: 'end',
      nameGap: 10,
      nameTextStyle: {
        color: '#646A73'
      },
      splitLine: {
        show: true,
        lineStyle: {
          type: 'dashed',
          // color: '#D5D5D7'
        }
      },
      axisLine: {
        lineStyle: {
          color: '#BBBFC4'
        }
      },
      axisLabel: {
        color: '#8F959E',
        formatter: (value: any) => {
          if (yIsPercentage && typeof value === 'number') {
            // 智能百分比格式：去除末尾多余的零
            return parseFloat((value * 100).toFixed(2)) + '%'
          }
          return value
        }
      }
    }

    // 如果是类目轴，添加数据列表
    if (yAxisType === 'category' && yAxisData) {
      yAxis.data = yAxisData
    }

    /**
     * 处理图表数据，根据轴类型选择不同的值
     * 数值轴：直接使用数值
     * 类目轴：使用类目索引（指向 options 数组中的位置），但显示原始文本
     */
    const seriesData = data.map(item => {
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

      return {
        name: item.name,
        value: [xValue, yValue, item.size] as [number | string, number | string, number],
        // 使用原始文本作为显示值
        data: [xDisplay, yDisplay, item.size],
        itemStyle: {
          color: '#1890ff',
          opacity: 0.7
        }
      }
    })

    // 计算气泡大小的极值，用于线性映射
    const sizes = data.map(item => item.size)
    const minSize = Math.min(...sizes)
    const maxSize = Math.max(...sizes)
    const MIN_BUBBLE_SIZE = 8
    const MAX_BUBBLE_SIZE = 80

    const option: EChartsOption = {
      backgroundColor: 'transparent',
      grid: {
        left: '20px',
        right: '60px',
        bottom: '30px',
        top: '40px',
        containLabel: true
      },
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
              return 10
            }

            // 获取原始大小值
            const sizeVal = val[2] as number

            // 如果所有数据大小相同，返回中间大小
            if (maxSize === minSize) {
              return (MIN_BUBBLE_SIZE + MAX_BUBBLE_SIZE) / 2
            }

            // 线性映射公式: Pixel = MinPixel + (Val - MinVal) / (MaxVal - MinVal) * (MaxPixel - MinPixel)
            const size = MIN_BUBBLE_SIZE + (sizeVal - minSize) / (maxSize - minSize) * (MAX_BUBBLE_SIZE - MIN_BUBBLE_SIZE)
            return size
          },
          data: seriesData,
          emphasis: {
            itemStyle: {
              opacity: 1,
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.3)'
            }
          }
        }
      ]
    }

    chartInstanceRef.current.setOption(option)
  }, [data, xFieldName, yFieldName, sizeFieldName, loading, xAxisType, yAxisType, xAxisData, yAxisData, xIsPercentage, yIsPercentage, sizeIsPercentage])

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

      {/* 加载状态：覆盖在图表上层 */}
      {loading && (
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
          background: 'rgba(255, 255, 255, 0.8)',
          zIndex: 10
        }}>
          数据加载中...
        </div>
      )}

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
          <div style={{ fontSize: '16px', marginBottom: '8px' }}>暂无有效数据</div>
          <div style={{ fontSize: '12px', textAlign: 'center', lineHeight: '1.5' }}>
            请检查所选的横轴和纵轴字段是否包含有效的数字数据
          </div>
        </div>
      )}
    </div>
  )
}
