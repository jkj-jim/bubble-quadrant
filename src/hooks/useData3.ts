import { useEffect, useState } from 'react'
import type { BubbleChartConfig } from './useDashboard'

/**
 * DataItem - 数据项接口
 * 功能：定义气泡图中每个数据点的结构
 *
 * 说明：
 * - 支持数值轴和类目轴两种模式
 * - 数值轴：x,y 为 number 类型，直接表示数值
 * - 类目轴：x,y 为 string 类型（原始值），通过 xCategoryIndex/yCategoryIndex 映射到类目索引
 * - size: 气泡大小（必须是数值）
 * - name: 气泡名称（可选）
 */
export interface DataItem {
  name?: string
  x: number | string        // 支持数值和字符串（类目轴时使用字符串）
  y: number | string        // 支持数值和字符串（类目轴时使用字符串）
  size: number
  xCategoryIndex?: number   // X轴类目索引（类目轴时使用，指向 options 数组中的位置）
  yCategoryIndex?: number   // Y轴类目索引（类目轴时使用）
  colorGroupValue?: string  // 颜色分组值（用于按字段值分组时的原始值）
}

/**
 * processCategoryValue - 处理类目字段值
 *
 * 功能：将单选字段的值转换为类目的索引位置
 *
 * 处理逻辑：
 * - 从单选字段中提取文本值
 * - 在选项列表中查找该文本值的索引位置
 * - 如果找到，返回索引位置；如果未找到，返回 -1
 *
 * 使用场景：当用户选择单选字段作为横轴或纵轴时，需要将文本值映射到类目索引
 */
const processCategoryValue = (
  value: any,
  fieldOptions: string[] | undefined
): { original: string; index: number } | null => {
  let textValue = ''

  // 提取文本值（处理不同的数据格式）
  if (value === null || value === undefined) {
    textValue = ''
  } else if (typeof value === 'string') {
    textValue = value
  } else if (typeof value === 'object') {
    // 单选字段的存储格式通常是 { id, text }
    if (value.text !== undefined) {
      textValue = value.text
    } else if (Array.isArray(value) && value.length > 0) {
      // 数组情况
      textValue = value[0]?.text || String(value[0]) || ''
    } else {
      textValue = String(value)
    }
  } else {
    textValue = String(value)
  }

  // 空值返回 null，调用方跳过该记录
  if (!textValue) {
    return null
  }

  // 如果未提供选项列表，返回默认值
  if (!fieldOptions || fieldOptions.length === 0) {
    return { original: textValue, index: -1 }
  }

  // 查找选项在列表中的索引位置（按用户设定的顺序）
  const index = fieldOptions.indexOf(textValue)

  // 如果未找到选项，默认为0（第一个位置）
  // 理论上不会出现，因为字段值一定在选项列表中
  return { original: textValue, index: index >= 0 ? index : 0 }
}

/**
 * extractMultiSelectValues - 提取多选字段的所有选中值
 *
 * 功能：将多选字段的值提取为字符串数组
 *
 * 处理逻辑：
 * - 处理多选字段的不同存储格式（数组对象、数组字符串等）
 * - 返回所有选中值的字符串数组
 * - 如果值为空或无法提取，返回空数组
 *
 * 使用场景：当用户选择多选字段作为横轴或纵轴时，需要将一条记录拆分为多条
 */
const extractMultiSelectValues = (value: any): string[] => {
  if (value === null || value === undefined) {
    return []
  }

  // 数组情况（最常见的多选存储格式）
  if (Array.isArray(value)) {
    const results: string[] = []
    for (const item of value) {
      if (typeof item === 'string' && item) {
        results.push(item)
      } else if (typeof item === 'object' && item !== null) {
        // { id, text } 格式
        if (item.text !== undefined && item.text !== '') {
          results.push(item.text)
        }
      }
    }
    return results
  }

  // 单值情况（可能是单选字段误传入）
  if (typeof value === 'string' && value) {
    return [value]
  }

  if (typeof value === 'object' && value.text !== undefined && value.text !== '') {
    return [value.text]
  }

  return []
}

/**
 * processNumericValue - 处理数值字段值
 *
 * 功能：将字段值转换为数值
 *
 * 处理逻辑：
 * - 将字段值转换为 number 类型
 * - 如果值为 null/undefined/空字符串，返回 null（表示空值，调用方应跳过该记录）
 * - 如果转换失败（NaN），返回 null
 * - 适用于数值字段（数字、货币、进度、评分等）
 *
 * 使用场景：当用户选择数值字段作为横轴、纵轴或气泡大小时使用
 */
const processNumericValue = (value: any): number | null => {
  if (value === null || value === undefined || value === '') {
    return null
  }

  // 如果已经是数值类型，直接使用
  if (typeof value === 'number') {
    return value
  }

  // 如果是对象（如公式字段可能返回 { value: 123 } 或其他结构），尝试提取值
  if (typeof value === 'object') {
    if (Array.isArray(value) && value.length > 0) {
      return processNumericValue(value[0])
    }
    // 优先检查 value 属性
    if (value.value !== undefined) {
      return processNumericValue(value.value)
    }
    // 尝试转换为字符串再解析
    const parsed = parseFloat(String(value))
    return isNaN(parsed) ? null : parsed
  }

  // 转换为字符串并去除首尾空格
  const strValue = String(value).trim()
  if (!strValue) return null

  // 处理百分比（如 "9%" -> 0.09）
  if (strValue.endsWith('%')) {
    const floatValue = parseFloat(strValue)
    return isNaN(floatValue) ? null : floatValue / 100
  }

  // 解析为浮点数
  const floatValue = parseFloat(strValue)

  // 如果解析失败（NaN），返回 null
  return isNaN(floatValue) ? null : floatValue
}

/**
 * processDateValue - 处理日期字段值
 *
 * 功能：将日期字段值转换为毫秒时间戳
 *
 * 处理逻辑：
 * - 飞书日期字段返回的是毫秒级时间戳
 * - 直接使用原始数值，不做秒/毫秒的智能检测（因为阈值检测对 2001 年之前的日期会产生误判）
 * - 空值返回 null（用于标记无效记录）
 *
 * 使用场景：当用户选择日期字段作为横轴、纵轴时使用
 */
const processDateValue = (value: any): number | null => {
  if (value === null || value === undefined) {
    return null
  }

  // 如果已经是数值类型，直接作为毫秒时间戳使用
  if (typeof value === 'number') {
    return value
  }

  // 处理字符串格式的时间戳
  if (typeof value === 'string') {
    if (!value.trim()) return null
    const parsed = parseInt(value, 10)
    if (!isNaN(parsed)) {
      return parsed
    }
    // 尝试解析日期字符串
    const dateTime = new Date(value).getTime()
    if (!isNaN(dateTime)) {
      return dateTime
    }
    return null
  }

  // 处理对象格式（可能有 value 属性）
  if (typeof value === 'object' && value.value !== undefined) {
    return processDateValue(value.value)
  }

  return null
}

/**
 * extractTextFromField - 从字段值中提取文本
 *
 * 功能：从不同类型的字段值中提取显示文本
 *
 * 支持的字段类型：
 * - 文本字段：直接返回文本
 * - 单选字段：提取 opt.text 或 opt.name
 * - 其他字段：转换为字符串
 */
const extractTextFromField = (value: any): string => {
  if (value === null || value === undefined) {
    return ''
  }

  // 对象格式（如单选字段）
  if (typeof value === 'object') {
    if (value.text !== undefined) {
      return String(value.text)
    }
    if (value.name !== undefined) {
      return String(value.name)
    }
    if (Array.isArray(value) && value.length > 0) {
      return extractTextFromField(value[0])
    }
  }

  // 其他情况转为字符串
  return String(value)
}

/**
 * useData3 - 数据获取 hook
 *
 * 参数：
 * - config: 图表配置
 * - state: 当前状态
 * - liveXFieldOptions: X轴实时选项
 * - liveYFieldOptions: Y轴实时选项
 * - baseInstance: 可选的 base 实例（应用插件模式下使用）
 */
export const useData3 = (
  config: BubbleChartConfig,
  state: string,
  liveXFieldOptions?: string[],
  liveYFieldOptions?: string[],
  baseInstance?: any,
) => {
  const [data, setData] = useState<DataItem[]>([])
  const [loading, setLoading] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)  // 权限错误状态
  const [finalXOptions, setFinalXOptions] = useState<string[] | undefined>()
  const [finalYOptions, setFinalYOptions] = useState<string[] | undefined>()
  const [resolvedXType, setResolvedXType] = useState<'number' | 'category' | 'date'>('number')
  const [resolvedYType, setResolvedYType] = useState<'number' | 'category' | 'date'>('number')

  useEffect(() => {
    const fetchData = async (currentConfig: BubbleChartConfig) => {
      // console.log('[useData3] 开始获取数据', { dataSource: currentConfig.dataSource, state })

      const {
        dataSource,
        xField,
        yField,
        sizeField,
        nameField,
        xFieldType,
        yFieldType,
        viewId, // 获取 viewId
        colorGroupField, // 获取颜色分组字段
      } = currentConfig

      if (!dataSource || !xField || !yField) {
        // console.log('[useData3] 配置不完整，清空数据')
        setData([])
        setPermissionDenied(false)  // 清空权限错误状态
        return
      }

      setLoading(true)
      // console.log('[useData3] 字段类型:', { xFieldType, yFieldType })

      try {
        // 如果 baseInstance 为 null/undefined，不执行获取（等待有效实例）
        if (!baseInstance) {
          setLoading(false)
          return
        }
        const table = await baseInstance.getTable(dataSource)
        // 如果 viewId 存在，则传入 viewId 进行过滤；否则传入空对象获取全部数据
        const recordResult = await table.getRecords({ viewId: viewId || undefined })

        let records: any[] = []
        if (Array.isArray(recordResult)) {
          records = recordResult
        } else if (recordResult && Array.isArray(recordResult.records)) {
          records = recordResult.records
        }

        // ===== 多选字段拆分逻辑 =====
        // 如果横轴或纵轴是多选字段，将一条记录拆分为多条
        const { xFieldIsMultiSelect, yFieldIsMultiSelect } = currentConfig
        if (xFieldIsMultiSelect || yFieldIsMultiSelect) {
          const expandedRecords: any[] = []
          for (const record of records) {
            // 横轴多选：拆分为多条记录，每条记录的 xField 为单个值
            if (xFieldIsMultiSelect && xField) {
              const multiValues = extractMultiSelectValues(record.fields[xField])
              if (multiValues.length === 0) {
                // 多选值为空，跳过该记录（与单选空值行为一致）
                continue
              }
              for (const val of multiValues) {
                // 创建新记录，xField 替换为单个值
                const newRecord = {
                  ...record,
                  fields: {
                    ...record.fields,
                    [xField]: { text: val }  // 转换为单选格式
                  }
                }
                expandedRecords.push(newRecord)
              }
            }
            // 纵轴多选：拆分为多条记录，每条记录的 yField 为单个值
            else if (yFieldIsMultiSelect && yField) {
              const multiValues = extractMultiSelectValues(record.fields[yField])
              if (multiValues.length === 0) {
                // 多选值为空，跳过该记录
                continue
              }
              for (const val of multiValues) {
                const newRecord = {
                  ...record,
                  fields: {
                    ...record.fields,
                    [yField]: { text: val }
                  }
                }
                expandedRecords.push(newRecord)
              }
            }
            // 都不是多选，保留原记录
            else {
              expandedRecords.push(record)
            }
          }
          records = expandedRecords
        }

        // 核心逻辑：在 hook 内部根据 state 决定使用哪个 options
        // view 状态优先用 config 中存的权威数据，config 状态用实时获取的 live 数据
        // view 状态优先用 config 中存的权威数据，config 状态用实时获取的 live 数据
        let xOptions = state === 'view' || state === 'fullscreen'
          ? (currentConfig.xFieldOptions || liveXFieldOptions)
          : liveXFieldOptions

        let yOptions = state === 'view' || state === 'fullscreen'
          ? (currentConfig.yFieldOptions || liveYFieldOptions)
          : liveYFieldOptions

        // 自动检测字段类型（如果未指定）
        // 日期类型不需要自动检测，直接使用配置中的类型
        const effectiveXType = xFieldType || detectFieldType(records, xField)
        const effectiveYType = yFieldType || detectFieldType(records, yField)

        setResolvedXType(effectiveXType as 'number' | 'category' | 'date')
        setResolvedYType(effectiveYType as 'number' | 'category' | 'date')

        // 动态收集类目选项（针对公式字段或缺少选项的情况）
        if (effectiveXType === 'category' && (!xOptions || xOptions.length === 0)) {
          const uniqueValues = new Set<string>()
          records.forEach(record => {
            const val = extractTextFromField(record.fields[xField])
            if (val) uniqueValues.add(val)
          })
          xOptions = Array.from(uniqueValues).sort()
        }

        if (effectiveYType === 'category' && (!yOptions || yOptions.length === 0)) {
          const uniqueValues = new Set<string>()
          records.forEach(record => {
            const val = extractTextFromField(record.fields[yField])
            if (val) uniqueValues.add(val)
          })
          yOptions = Array.from(uniqueValues).sort()
        }

        // 将最终使用的 options 保存到 state 中，以便返回给 UI 层
        setFinalXOptions(xOptions)
        setFinalYOptions(yOptions)

        const processedData: DataItem[] = []

        // 计数模式：按 x/y 坐标聚合记录，size 表示记录数量
        if (currentConfig.sizeMode === 'count') {
          // 使用 Map 按坐标分组计数
          const coordMap = new Map<string, {
            count: number,
            x: number | string,
            y: number | string,
            xCategoryIndex?: number,
            yCategoryIndex?: number
          }>()

          for (const record of records) {
            // 处理 x 坐标（空值跳过该记录）
            let xVal: number | string
            let xCategoryIndex: number | undefined
            if (effectiveXType === 'category') {
              const result = processCategoryValue(record.fields[xField], xOptions)
              if (result === null) continue  // 类目空值，跳过
              xVal = result.original
              xCategoryIndex = result.index
            } else if (effectiveXType === 'date') {
              const dateVal = processDateValue(record.fields[xField])
              if (dateVal === null) continue  // 日期空值，跳过
              xVal = dateVal
            } else {
              const numVal = processNumericValue(record.fields[xField])
              if (numVal === null) continue  // 数值空值，跳过
              xVal = numVal
            }

            // 处理 y 坐标（空值跳过该记录）
            let yVal: number | string
            let yCategoryIndex: number | undefined
            if (effectiveYType === 'category') {
              const result = processCategoryValue(record.fields[yField], yOptions)
              if (result === null) continue  // 类目空值，跳过
              yVal = result.original
              yCategoryIndex = result.index
            } else if (effectiveYType === 'date') {
              const dateVal = processDateValue(record.fields[yField])
              if (dateVal === null) continue  // 日期空值，跳过
              yVal = dateVal
            } else {
              const numVal = processNumericValue(record.fields[yField])
              if (numVal === null) continue  // 数值空值，跳过
              yVal = numVal
            }

            // 生成坐标 key（用于分组）
            const coordKey = `${String(xVal)}||${String(yVal)}`

            if (coordMap.has(coordKey)) {
              // 已存在该坐标，计数+1
              coordMap.get(coordKey)!.count++
            } else {
              // 新坐标，初始化计数为1
              coordMap.set(coordKey, {
                count: 1,
                x: xVal,
                y: yVal,
                xCategoryIndex,
                yCategoryIndex
              })
            }
          }

          // 将 Map 转换为 DataItem 数组
          for (const entry of coordMap.values()) {
            processedData.push({
              x: entry.x,
              y: entry.y,
              size: entry.count,  // size 即为计数
              xCategoryIndex: entry.xCategoryIndex,
              yCategoryIndex: entry.yCategoryIndex
            })
          }
        } else if (nameField) {
          // 有气泡名称：
          // 1. 过滤掉没有名称的数据
          // 2. 不分组聚合，直接显示每一条数据
          for (const record of records) {
            const nameVal = record.fields[nameField]
            const name = extractTextFromField(nameVal)

            // 如果名称为空，跳过该条数据
            if (!name) continue

            const item = processGroupRecords(
              [record], // 单条记录处理
              xField,
              yField,
              sizeField,
              effectiveXType,
              effectiveYType,
              xOptions,
              yOptions
            )

            if (item) {
              item.name = name
              // 获取颜色分组字段的值
              if (colorGroupField) {
                const colorVal = record.fields[colorGroupField]
                item.colorGroupValue = extractTextFromField(colorVal)
              }
              processedData.push(item)
            }
          }
        } else {
          // 无气泡名称：显示所有数据点
          for (const record of records) {
            const item = processGroupRecords(
              [record],
              xField,
              yField,
              sizeField,
              effectiveXType,
              effectiveYType,
              xOptions,
              yOptions
            )

            if (item) {
              // 获取颜色分组字段的值
              if (colorGroupField) {
                const colorVal = record.fields[colorGroupField]
                item.colorGroupValue = extractTextFromField(colorVal)
              }
              processedData.push(item)
            }
          }
        }

        // console.log('[useData3] 数据处理完成，记录条数:', processedData.length)
        setData(processedData)
        setPermissionDenied(false)  // 成功获取数据，清除权限错误状态
      } catch (error) {
        console.error('[useData3] 获取数据失败:', error)
        setData([])
        // 检测是否是权限错误
        const errorMessage = String(error)
        if (errorMessage.includes('permission denied') || errorMessage.includes('Permission denied')) {
          setPermissionDenied(true)
          console.warn('[useData3] 检测到权限错误')
        } else {
          setPermissionDenied(false)
        }
      } finally {
        setLoading(false)
      }
    }

    fetchData(config)
  }, [
    config,
    liveXFieldOptions,
    liveYFieldOptions,
    baseInstance, // 添加 baseInstance 作为依赖
  ]) // 关键：依赖项不包含 state，因此 state 的变化不会直接触发数据重获取

  return { data, loading, permissionDenied, finalXOptions, finalYOptions, resolvedXType, resolvedYType }
}

/**
 * detectFieldType - 自动检测字段类型
 * 功能：根据数据内容判断字段是数值型还是类目型
 */
const detectFieldType = (records: any[], fieldId: string): 'number' | 'category' => {
  // 检查前 10 条非空记录
  let checkCount = 0
  let numberCount = 0

  for (const record of records) {
    if (checkCount >= 10) break

    const val = record.fields[fieldId]
    if (val === null || val === undefined || val === '') continue

    checkCount++

    // 尝试判断是否为数字
    let isNum = false
    if (typeof val === 'number') {
      isNum = true
    } else if (typeof val === 'object') {
      // 公式可能返回 { value: 123 }
      if (val.value !== undefined && typeof val.value === 'number') {
        isNum = true
      }
    } else if (typeof val === 'string') {
      // 尝试解析字符串数字
      if (!isNaN(parseFloat(val))) {
        isNum = true
      }
    }

    if (isNum) numberCount++
  }

  // 如果大部分（>50%）是数字，则认为是数值轴
  if (checkCount > 0 && (numberCount / checkCount) > 0.5) {
    return 'number'
  }

  // 默认为类目轴
  return 'category'
}

/**
 * processGroupRecords - 处理分组记录
 *
 * 功能：处理同一个分组（按名称分组）的多条记录，计算该分组在气泡图中的数据点
 *
 * 处理逻辑根据字段类型分为4种情况：
 * 1. X轴数值 + Y轴数值：传统的数值气泡图，进行数值聚合
 * 2. X轴数值 + Y轴类目：混合轴，X轴聚合数值，Y轴使用类目
 * 3. X轴类目 + Y轴数值：混合轴，X轴使用类目，Y轴聚合数值
 * 4. X轴类目 + Y轴类目：散点图，直接显示每个点（不进行聚合）
 *
 * 返回值：DataItem 或 null（如果数据无效）
 */
const processGroupRecords = (
  records: any[],
  xField: string,
  yField: string,
  sizeField: string | undefined,
  xFieldType: 'number' | 'category' | 'date' | undefined,
  yFieldType: 'number' | 'category' | 'date' | undefined,
  xFieldOptions: string[] | undefined,
  yFieldOptions: string[] | undefined
): DataItem | null => {
  // 日期类型视同数值类型处理（底层是时间戳）
  const xIsNumeric = xFieldType !== 'category'
  const yIsNumeric = yFieldType !== 'category'
  const xIsDate = xFieldType === 'date'
  const yIsDate = yFieldType === 'date'

  // 情况1：双轴都是数值/日期（传统气泡图，进行数值聚合）
  if (xIsNumeric && yIsNumeric) {
    let xSum = 0
    let ySum = 0
    let sizeSum = 0
    let count = 0

    for (const record of records) {
      try {
        // 日期字段使用 processDateValue，数值字段使用 processNumericValue
        const x = xIsDate
          ? processDateValue(record.fields[xField])
          : processNumericValue(record.fields[xField])

        const y = yIsDate
          ? processDateValue(record.fields[yField])
          : processNumericValue(record.fields[yField])

        // 横轴或纵轴为空值，跳过该记录
        if (x === null || y === null) continue

        xSum += x
        ySum += y
        count++

        if (sizeField) {
          const sizeVal = record.fields[sizeField]
          const size = processNumericValue(sizeVal)
          sizeSum += (size ?? 0)
        }
      } catch (err) {
        console.warn('[useData3] ⚠️ 处理记录失败:', err)
      }
    }

    if (count > 0) {
      return {
        x: xSum,
        y: ySum,
        size: sizeField ? sizeSum : 10,
      }
    }
  }

  // 情况2：X轴类目 + Y轴数值/日期（混合轴）
  if (!xIsNumeric && yIsNumeric) {
    if (records.length > 0) {
      const firstRecord = records[0]
      const xCategory = processCategoryValue(
        firstRecord.fields[xField],
        xFieldOptions
      )
      // X轴类目空值，跳过
      if (xCategory === null) return null

      let ySum = 0
      let sizeSum = 0
      let count = 0

      for (const record of records) {
        try {
          // 日期字段使用 processDateValue，数值字段使用 processNumericValue
          const y = yIsDate
            ? processDateValue(record.fields[yField])
            : processNumericValue(record.fields[yField])

          // 空值跳过
          if (y === null) continue

          ySum += y
          count++

          if (sizeField) {
            const sizeVal = record.fields[sizeField]
            const size = processNumericValue(sizeVal)
            sizeSum += (size ?? 0)
          }
        } catch (err) {
          console.warn('[useData3] ⚠️ 处理记录失败:', err)
        }
      }

      if (count > 0) {
        return {
          x: xCategory.original,
          y: ySum,
          size: sizeField ? sizeSum : 10,
          xCategoryIndex: xCategory.index,
        }
      }
    }
  }

  // 情况3：X轴数值/日期 + Y轴类目（混合轴）
  if (xIsNumeric && !yIsNumeric) {
    if (records.length > 0) {
      const firstRecord = records[0]
      const yCategory = processCategoryValue(
        firstRecord.fields[yField],
        yFieldOptions
      )
      // Y轴类目空值，跳过
      if (yCategory === null) return null

      let xSum = 0
      let sizeSum = 0
      let count = 0

      for (const record of records) {
        try {
          // 日期字段使用 processDateValue，数值字段使用 processNumericValue
          const x = xIsDate
            ? processDateValue(record.fields[xField])
            : processNumericValue(record.fields[xField])

          // 空值跳过
          if (x === null) continue

          xSum += x
          count++

          if (sizeField) {
            const sizeVal = record.fields[sizeField]
            const size = processNumericValue(sizeVal)
            sizeSum += (size ?? 0)
          }
        } catch (err) {
          console.warn('[useData3] ⚠️ 处理记录失败:', err)
        }
      }

      if (count > 0) {
        return {
          x: xSum,
          y: yCategory.original,
          size: sizeField ? sizeSum : 10,
          yCategoryIndex: yCategory.index,
        }
      }
    }
  }

  // 情况4：双轴都是类目（散点图，显示每个点）
  if (!xIsNumeric && !yIsNumeric) {
    // 类目轴场景下，通常不需要聚合
    // 这里简单处理：如果有数据，返回第一个点的信息
    // TODO: 如果需要显示所有点，需要修改数据结构支持一个name多个点
    if (records.length > 0) {
      const firstRecord = records[0]
      const xCategory = processCategoryValue(
        firstRecord.fields[xField],
        xFieldOptions
      )
      const yCategory = processCategoryValue(
        firstRecord.fields[yField],
        yFieldOptions
      )
      // 类目空值，跳过
      if (xCategory === null || yCategory === null) return null

      let sizeSum = 0
      if (sizeField) {
        for (const record of records) {
          const sizeVal = record.fields[sizeField]
          const size = processNumericValue(sizeVal)
          sizeSum += (size ?? 0)
        }
      }

      return {
        x: xCategory.original,
        y: yCategory.original,
        size: sizeField ? sizeSum : 10,
        xCategoryIndex: xCategory.index,
        yCategoryIndex: yCategory.index,
      }
    }
  }

  return null
}