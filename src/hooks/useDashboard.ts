/**
 * useDashboard.ts - 仪表盘状态管理和类型定义
 *
 * 功能说明：
 * 1. 定义仪表盘插件的核心类型和接口
 * 2. 提供仪表盘状态管理hook
 * 3. 聚合导出所有相关的hooks和类型定义
 *
 * 类型定义：
 * - DashboardState: 仪表盘状态（create/config/view/fullscreen）
 * - BubbleChartConfig: 气泡图配置接口
 * - TableInfo: 工作表信息
 * - FieldInfo: 字段信息
 * - DataItem: 数据项
 *
 * 导出内容：
 * - useDashboard: 获取仪表盘当前状态
 * - useTables: 获取工作表列表
 * - useFields: 获取字段列表
 * - useData: 获取和处理图表数据
 */

// import { useEffect, useRef } from 'react'
import { dashboard } from '@lark-base-open/js-sdk'

/**
 * DashboardState - 仪表盘状态类型
 * 四种状态：
 * - create: 首次创建
 * - config: 配置状态
 * - view: 查看状态
 * - fullscreen: 全屏状态
 */
export type DashboardState = 'create' | 'config' | 'view' | 'fullscreen'

/**
 * BubbleChartConfig - 气泡图配置接口
 * 功能：定义气泡图的配置项，包括数据源和字段选择
 * 支持数值轴和类目轴两种模式
 */
export interface BubbleChartConfig {
  [key: string]: string | string[] | boolean | undefined;
  dataSource?: string      // 数据源表ID
  nameField?: string       // 气泡名称字段ID
  xField?: string          // 横轴字段ID
  yField?: string          // 纵轴字段ID
  sizeField?: string       // 气泡大小字段ID
  xFieldType?: 'number' | 'category'  // 横轴字段类型（数值/类目）
  yFieldType?: 'number' | 'category'  // 纵轴字段类型（数值/类目）
  xFieldOptions?: string[]  // 横轴字段选项列表（类目轴时使用）
  yFieldOptions?: string[]  // 纵轴字段选项列表（类目轴时使用）
  viewId?: string           // 数据范围视图ID，undefined 表示全部数据
  enableMultiColor?: boolean // 是否开启多彩模式
  showLabel?: boolean        // 是否常显名称标签

  // 象限配置
  xThreshold?: string        // X轴分割线值
  yThreshold?: string        // Y轴分割线值
  quadrantTLName?: string    // 左上象限名称
  quadrantTLColor?: string   // 左上象限背景色
  quadrantTRName?: string    // 右上象限名称
  quadrantTRColor?: string   // 右上象限背景色
  quadrantBLName?: string    // 左下象限名称
  quadrantBLColor?: string   // 左下象限背景色
  quadrantBRName?: string    // 右下象限名称
  quadrantBRColor?: string   // 右下象限背景色

  // 高级配置 - 颜色分组
  colorGroupType?: 'quadrant' | 'field'  // 分组类型：按象限或按字段
  colorGroupField?: string                // 分组字段ID（当 colorGroupType 为 'field' 时）
}

/**
 * TableInfo - 工作表信息
 */
export interface TableInfo {
  id: string
  name: string
}

/**
 * FieldInfo - 字段信息
 */
export interface FieldInfo {
  id: string
  name: string
  type: any
  isCategory?: boolean  // 是否支持类目轴（单选字段）
  isFormula?: boolean   // 是否为公式字段
  isNumericFormula?: boolean // 是否为数值类型的公式（通过 formatter 判断）
  isTextFormula?: boolean // 是否为文本类型的公式（没有 formatter）
  isPercentage?: boolean // 是否为百分比格式
}

/**
 * useDashboard - 仪表盘状态hook
 * 功能：获取当前仪表盘状态（create/config/view/fullscreen）
 */
export const useDashboard = () => {
  const state = dashboard.state.toLowerCase() as DashboardState

  // 关键优化：将 create 状态视为 config 状态处理
  // 原因：用户点击"添加插件"后，应该直接进入配置界面，而不是显示欢迎页面
  // 参考官方示例的做法：https://github.com/larksuite/.../dashboard-milestone-main
  const isConfig = state === 'config' || state === 'create'

  return { state, isConfig }
}

// 聚合导出其他hooks
export { useTables } from './useTables'
export { useFields } from './useFields'
export { useFieldOptions } from './useFieldOptions'
export { useData3 as useData, type DataItem } from './useData3'

