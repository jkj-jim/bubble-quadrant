/**
 * useFields.ts - 字段管理hook
 *
 * 功能说明：
 * 1. 根据选中的工作表获取所有字段信息
 * 2. 将字段分类为数字类型和文本类型
 * 3. 为不同类型的图表配置提供合适的字段选择
 *
 * 逻辑流程：
 * - 根据tableId获取指定工作表
 * - 获取工作表的所有字段元数据
 * - 按字段类型分类为数字字段（横轴、纵轴、大小）和文本字段（名称）
 * - 提供加载状态和错误处理
 *
 * 字段类型分类：
 * - NUMBER_FIELD_TYPES: 支持数字计算的字段（数字、货币、进度、评分）
 * - TEXT_FIELD_TYPES: 支持文本显示的字段（文本、单选、多选、邮箱、电话等）
 *
 * 依赖引用：
 * - @lark-base-open/js-sdk: 飞书基础SDK
 * - ./useDashboard: FieldInfo类型定义
 */

import { useEffect, useState } from 'react'
import { FieldType } from '@lark-base-open/js-sdk'
import type { FieldInfo } from './useDashboard'

/**
 * NUMBER_FIELD_TYPES - 数字类型的字段
 * 用途：用于气泡图的横轴、纵轴、大小字段（需要数值计算）
 */
const NUMBER_FIELD_TYPES = [
  FieldType.Number,       // 数字
  FieldType.Currency,     // 货币
  FieldType.Progress,     // 进度
  FieldType.Rating,       // 评分
  FieldType.Formula,      // 公式
]

/**
 * TEXT_FIELD_TYPES - 文本类型的字段
 * 用途：用于气泡名称字段（需要文本显示）
 * 注意：以下类型是飞书多维表格支持的字段类型
 * 部分类型如 CreatedBy、ModifiedBy、Person 在旧版本SDK中可能不存在
 */
const TEXT_FIELD_TYPES = [
  FieldType.Text,         // 文本
  FieldType.SingleSelect, // 单选
  FieldType.MultiSelect,  // 多选
  FieldType.Email,        // 邮箱
  FieldType.Phone,        // 电话
  FieldType.Url,          // 超链接
  FieldType.Barcode,      // 条形码
]

/**
 * CATEGORY_FIELD_TYPES - 支持类目轴的字段类型
 * 用途：用于横轴和纵轴的类目轴（单选/多选字段的选项作为类目）
 * 注意：多选字段会将一条记录拆分为多条
 */
const CATEGORY_FIELD_TYPES = [
  FieldType.SingleSelect, // 单选 - 作为类目轴的主要类型
  FieldType.MultiSelect,  // 多选 - 支持拆分为多条记录
  FieldType.Formula,      // 公式 - 可能返回字符串
]

/**
 * COLOR_GROUP_FIELD_TYPES - 支持颜色分组的字段类型
 * 用途：用于按字段值对气泡进行颜色分组
 * 支持：单选、公式、文本类型
 * 注意：日期类型暂不支持，因为需要时间戳转换
 */
const COLOR_GROUP_FIELD_TYPES = [
  FieldType.SingleSelect, // 单选
  FieldType.Formula,      // 公式
  FieldType.Text,         // 文本
]

/**
 * useFields - 字段hook
 * 功能：根据tableId获取指定工作表的所有字段，并分类为数字字段、文本字段和类目字段
 *
 * 参数：
 * - tableId: 工作表ID（可选，如果为undefined则返回空数组）
 * - baseInstance: 可选的 base 实例（应用插件模式下使用）
 *
 * 返回：
 * - fields: 所有字段列表
 * - numericFields: 数字类型字段列表（用于xField/yField/sizeField）
 * - textFields: 文本类型字段列表（用于nameField）
 * - categoryFields: 类目类型字段列表（可用于xField/yField的类目轴）
 * - loading: 加载状态
 * - error: 错误信息
 */
export const useFields = (tableId?: string, baseInstance?: any) => {
  const [fields, setFields] = useState<FieldInfo[]>([])
  const [numericFields, setNumericFields] = useState<FieldInfo[]>([])
  const [textFields, setTextFields] = useState<FieldInfo[]>([])
  const [categoryFields, setCategoryFields] = useState<FieldInfo[]>([])
  const [multiSelectFields, setMultiSelectFields] = useState<FieldInfo[]>([])  // 多选字段（用于互斥判断）
  const [colorGroupFields, setColorGroupFields] = useState<FieldInfo[]>([])  // 支持颜色分组的字段
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadedTableId, setLoadedTableId] = useState<string | undefined>(undefined)

  /**
   * useEffect: tableId变化时获取字段列表
   * 功能：
   * - 验证tableId有效性
   * - 调用base.getTableById()获取工作表
   * - 调用table.getFieldMetaList()获取所有字段元数据
   * - 按字段类型分类：数字字段（x/y/size）和文本字段（name）
   * - 更新字段状态
   * - 处理错误和加载状态
   *
   * 依赖：tableId（当tableId变化时重新获取字段）
   */
  useEffect(() => {
    const fetchFields = async () => {
      // 如果没有tableId，清空字段并返回
      if (!tableId) {
        setFields([])
        setNumericFields([])
        setTextFields([])
        return
      }

      try {
        setLoading(true)
        setError(null)

        // 如果 baseInstance 为 null/undefined，清空数据并等待有效实例
        // 【关键修复】必须清空字段，防止使用旧数据
        if (!baseInstance) {
          setFields([])
          setNumericFields([])
          setTextFields([])
          setCategoryFields([])
          setMultiSelectFields([])
          setColorGroupFields([])
          setLoading(true)
          return
        }

        // 获取指定工作表
        const table = await baseInstance.getTableById(tableId)
        // 获取工作表的所有字段元数据
        const fieldMetas = await table.getFieldMetaList()

        const allFields: FieldInfo[] = []
        const numeric: FieldInfo[] = []
        const text: FieldInfo[] = []
        const category: FieldInfo[] = []
        const multiSelect: FieldInfo[] = []  // 多选字段
        const colorGroup: FieldInfo[] = []  // 支持颜色分组的字段

        // 遍历所有字段，按类型分类
        fieldMetas.forEach((meta: any) => {
          // 检查公式字段是否为数值类型（通过 formatter 判断）
          let isNumericFormula = false
          let isTextFormula = false
          let isPercentage = false
          if (meta.type === FieldType.Formula) {
            // @ts-ignore - property 类型定义可能不完整
            const formatter = meta.property?.formatter
            // 如果有 formatter，通常意味着是数字或日期（这里我们主要关注数字）
            // 简单的判断：只要有 formatter 就视为数值优先
            if (formatter) {
              isNumericFormula = true
              if (typeof formatter === 'string' && formatter.includes('%')) {
                isPercentage = true
              }
            } else {
              // 没有 formatter 的公式字段视为文本类型
              isTextFormula = true
            }
          }

          const fieldInfo: FieldInfo = {
            id: meta.id,
            name: meta.name,
            type: meta.type,
            isCategory: CATEGORY_FIELD_TYPES.includes(meta.type),
            isFormula: meta.type === FieldType.Formula,
            isNumericFormula,
            isTextFormula,
            isPercentage
          }

          allFields.push(fieldInfo)

          // 分类字段：数字类型、文本类型、类目类型
          if (NUMBER_FIELD_TYPES.includes(meta.type)) {
            // 对于普通数字字段，也检查是否为百分比格式
            if (meta.type === FieldType.Number && !isPercentage) {
              // @ts-ignore
              const formatter = meta.property?.formatter
              if (typeof formatter === 'string' && formatter.includes('%')) {
                // 需要更新 fieldInfo 中的 isPercentage
                fieldInfo.isPercentage = true
              }
            }
            numeric.push(fieldInfo)  // 数字字段：可用于x/y/size
          }
          if (TEXT_FIELD_TYPES.includes(meta.type)) {
            text.push(fieldInfo)     // 文本字段：可用于name
          }
          // 文本类型的公式字段也加入文本字段列表，用于气泡名称选择
          if (meta.type === FieldType.Formula && isTextFormula) {
            text.push(fieldInfo)     // 文本公式字段：可用于name
          }
          if (CATEGORY_FIELD_TYPES.includes(meta.type)) {
            category.push(fieldInfo) // 类目字段：可用于x/y的类目轴
          }
          if (meta.type === FieldType.MultiSelect) {
            multiSelect.push(fieldInfo) // 多选字段：用于互斥判断
          }
          if (COLOR_GROUP_FIELD_TYPES.includes(meta.type)) {
            colorGroup.push(fieldInfo) // 颜色分组字段：可用于按字段值分组
          }
        })

        // 更新状态
        setFields(allFields)
        setNumericFields(numeric)
        setTextFields(text)
        setCategoryFields(category)
        setMultiSelectFields(multiSelect)
        setColorGroupFields(colorGroup)
        setLoadedTableId(tableId)
      } catch (err) {
        setError('获取字段失败：' + (err as Error).message)
        console.error('Failed to fetch fields:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchFields()
  }, [tableId, baseInstance])

  /**
   * 返回字段列表、分类字段、加载状态和错误信息
   * 分类字段包括：数字字段（用于数值计算）、文本字段（用于名称显示）、类目字段（可用于类目轴）、多选字段（用于互斥判断）
   */
  return { fields, numericFields, textFields, categoryFields, multiSelectFields, colorGroupFields, loading, error, loadedTableId }
}
