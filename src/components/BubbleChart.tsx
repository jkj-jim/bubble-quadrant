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
 */
export interface BubbleChartProps {
  data: DataItem[]          // 图表数据
  xFieldName?: string       // 横轴字段名（用于显示）
  yFieldName?: string       // 纵轴字段名（用于显示）
  loading?: boolean         // 加载状态
}

/**
 * BubbleChart - 气泡图组件
 * 功能：封装ECharts气泡图，支持数据渲染和响应式布局
 */
export const BubbleChart: React.FC<BubbleChartProps> = ({
  data,
  xFieldName,
  yFieldName,
  loading
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
    const option: EChartsOption = {
      backgroundColor: 'transparent',
      grid: {
        left: '10%',
        right: '10%',
        bottom: '10%',
        top: '10%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        name: xFieldName || '横轴',
        nameLocation: 'middle',
        nameGap: 30,
        splitLine: {
          lineStyle: {
            color: '#f0f0f0'
          }
        }
      },
      yAxis: {
        type: 'value',
        name: yFieldName || '纵轴',
        nameLocation: 'middle',
        nameGap: 40,
        splitLine: {
          lineStyle: {
            color: '#f0f0f0'
          }
        }
      },
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const data = params.data
          return `
            <div style="padding: 8px;">
              ${data.name ? `<div>名称: ${data.name}</div>` : ''}
              <div>${xFieldName || 'X'}: ${data.value[0]}</div>
              <div>${yFieldName || 'Y'}: ${data.value[1]}</div>
              <div>大小: ${data.value[2]}</div>
            </div>
          `
        }
      },
      series: [
        {
          type: 'scatter',
          symbolSize: (val: any) => {
            // 根据第三个值(大小)决定气泡尺寸，最小10，最大80
            const size = val[2] as number
            return Math.max(10, Math.min(80, size))
          },
          data: data.map(item => ({
            name: item.name,
            value: [item.x, item.y, item.size],
            itemStyle: {
              color: '#1890ff',
              opacity: 0.7
            }
          })),
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
  }, [data, xFieldName, yFieldName, loading])

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
