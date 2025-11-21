import { useEffect, useState } from 'react'
import { bitable } from '@lark-base-open/js-sdk'
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
): { original: string; index: number } => {
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
 * processNumericValue - 处理数值字段值
 *
 * 功能：将字段值转换为数值，并进行聚合计算（求和）
 *
 * 处理逻辑：
 * - 将字段值转换为 number 类型
 * - 如果转换失败（NaN），返回 0
 * - 适用于数值字段（数字、货币、进度、评分等）
 *
 * 使用场景：当用户选择数值字段作为横轴、纵轴或气泡大小时使用
 */
const processNumericValue = (value: any): number => {
  if (value === null || value === undefined) {
    return 0
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
    return parseFloat(String(value)) || 0
  }

  // 转换为字符串并去除首尾空格
  const strValue = String(value).trim()

  // 处理百分比（如 "9%" -> 0.09）
  if (strValue.endsWith('%')) {
    const floatValue = parseFloat(strValue)
    return isNaN(floatValue) ? 0 : floatValue / 100
  }

  // 解析为浮点数
  const floatValue = parseFloat(strValue)

  // 如果解析失败（NaN），返回 0
  return isNaN(floatValue) ? 0 : floatValue
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

export const useData3 = (
  config: BubbleChartConfig,
  state: string,
  liveXFieldOptions?: string[],
  liveYFieldOptions?: string[],
) => {
  const [data, setData] = useState<DataItem[]>([])
  const [loading, setLoading] = useState(false)
  const [finalXOptions, setFinalXOptions] = useState<string[] | undefined>()
  const [finalYOptions, setFinalYOptions] = useState<string[] | undefined>()
  const [resolvedXType, setResolvedXType] = useState<'number' | 'category'>('number')
  const [resolvedYType, setResolvedYType] = useState<'number' | 'category'>('number')

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
      } = currentConfig

      if (!dataSource || !xField || !yField) {
        // console.log('[useData3] 配置不完整，清空数据')
        setData([])
        return
      }

      setLoading(true)
      // console.log('[useData3] 字段类型:', { xFieldType, yFieldType })

      try {
        const table = await bitable.base.getTable(dataSource)
        const recordResult = await table.getRecords({})

        let records: any[] = []
        if (Array.isArray(recordResult)) {
          records = recordResult
        } else if (recordResult && Array.isArray(recordResult.records)) {
          records = recordResult.records
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
        const effectiveXType = xFieldType || detectFieldType(records, xField)
        const effectiveYType = yFieldType || detectFieldType(records, yField)

        setResolvedXType(effectiveXType)
        setResolvedYType(effectiveYType)

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

        const groups: Record<string, any[]> = {}
        if (nameField) {
          for (const record of records) {
            const nameVal = record.fields[nameField]
            const name = extractTextFromField(nameVal)
            if (!groups[name]) {
              groups[name] = []
            }
            groups[name].push(record)
          }
        } else {
          groups[''] = records
        }

        const processedData: DataItem[] = []

        for (const [groupName, groupRecords] of Object.entries(groups)) {
          const item = processGroupRecords(
            groupRecords,
            xField,
            yField,
            sizeField,
            effectiveXType,
            effectiveYType,
            xOptions, // 使用这里计算出的 options
            yOptions  // 使用这里计算出的 options
          )

          if (item) {
            if (groupName) {
              item.name = groupName
            }
            processedData.push(item)
          }
        }

        // console.log('[useData3] 数据处理完成，记录条数:', processedData.length)
        setData(processedData)
      } catch (error) {
        console.error('[useData3] 获取数据失败:', error)
        setData([])
      } finally {
        setLoading(false)
      }
    }

    fetchData(config)
  }, [
    config,
    liveXFieldOptions,
    liveYFieldOptions,
  ]) // 关键：依赖项不包含 state，因此 state 的变化不会直接触发数据重获取

  return { data, loading, finalXOptions, finalYOptions, resolvedXType, resolvedYType }
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
  xFieldType: 'number' | 'category' | undefined,
  yFieldType: 'number' | 'category' | undefined,
  xFieldOptions: string[] | undefined,
  yFieldOptions: string[] | undefined
): DataItem | null => {
  // 情况1：双轴都是数值（传统气泡图，进行数值聚合）
  if (xFieldType !== 'category' && yFieldType !== 'category') {
    let xSum = 0
    let ySum = 0
    let sizeSum = 0
    let count = 0

    for (const record of records) {
      try {
        const xVal = record.fields[xField]
        const x = processNumericValue(xVal)

        const yVal = record.fields[yField]
        const y = processNumericValue(yVal)

        if (x !== 0 || y !== 0) {
          xSum += x
          ySum += y
          count++
        }

        if (sizeField) {
          const sizeVal = record.fields[sizeField]
          const size = processNumericValue(sizeVal)
          sizeSum += size
        }
      } catch (err) {
        console.warn('[useData3] ⚠️ 处理记录失败:', err)
      }
    }

    if (count > 0) {
      return {
        x: xSum,
        y: ySum,
        size: sizeField ? sizeSum : 20,
      }
    }
  }

  // 情况2：X轴类目 + Y轴数值（混合轴）
  if (xFieldType === 'category' && yFieldType !== 'category') {
    if (records.length > 0) {
      const firstRecord = records[0]
      const xCategory = processCategoryValue(
        firstRecord.fields[xField],
        xFieldOptions
      )

      let ySum = 0
      let sizeSum = 0
      let count = 0

      for (const record of records) {
        try {
          const yVal = record.fields[yField]
          const y = processNumericValue(yVal)

          if (y !== 0) {
            ySum += y
            count++
          }

          if (sizeField) {
            const sizeVal = record.fields[sizeField]
            const size = processNumericValue(sizeVal)
            sizeSum += size
          }
        } catch (err) {
          console.warn('[useData3] ⚠️ 处理记录失败:', err)
        }
      }

      if (count > 0) {
        return {
          x: xCategory.original,
          y: ySum,
          size: sizeField ? sizeSum : 20,
          xCategoryIndex: xCategory.index,
        }
      }
    }
  }

  // 情况3：X轴数值 + Y轴类目（混合轴）
  if (xFieldType !== 'category' && yFieldType === 'category') {
    if (records.length > 0) {
      const firstRecord = records[0]
      const yCategory = processCategoryValue(
        firstRecord.fields[yField],
        yFieldOptions
      )

      let xSum = 0
      let sizeSum = 0
      let count = 0

      for (const record of records) {
        try {
          const xVal = record.fields[xField]
          const x = processNumericValue(xVal)

          if (x !== 0) {
            xSum += x
            count++
          }

          if (sizeField) {
            const sizeVal = record.fields[sizeField]
            const size = processNumericValue(sizeVal)
            sizeSum += size
          }
        } catch (err) {
          console.warn('[useData3] ⚠️ 处理记录失败:', err)
        }
      }

      if (count > 0) {
        return {
          x: xSum,
          y: yCategory.original,
          size: sizeField ? sizeSum : 20,
          yCategoryIndex: yCategory.index,
        }
      }
    }
  }

  // 情况4：双轴都是类目（散点图，显示每个点）
  if (xFieldType === 'category' && yFieldType === 'category') {
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

      let sizeSum = 0
      if (sizeField) {
        for (const record of records) {
          const sizeVal = record.fields[sizeField]
          const size = processNumericValue(sizeVal)
          sizeSum += size
        }
      }

      return {
        x: xCategory.original,
        y: yCategory.original,
        size: sizeField ? sizeSum : 20,
        xCategoryIndex: xCategory.index,
        yCategoryIndex: yCategory.index,
      }
    }
  }

  return null
}