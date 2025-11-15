import { useEffect, useState } from 'react'
import { bitable } from '@lark-base-open/js-sdk'
import type { BubbleChartConfig } from './useDashboard'

export interface DataItem {
  name?: string
  x: number
  y: number
  size: number
}

export const useData3 = (
  config: BubbleChartConfig,
  state: string,
  refreshKey: number,
) => {
  const [data, setData] = useState<DataItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetchData = async (currentConfig: BubbleChartConfig) => {
      const { dataSource, xField, yField, sizeField, nameField } = currentConfig

      if (!dataSource || !xField || !yField) {
        setData([])
        return
      }

      setLoading(true)

      try {
        const table = await bitable.base.getTable(dataSource)
        const recordResult = await table.getRecords({})

        let records: any[] = []
        if (Array.isArray(recordResult)) {
          records = recordResult
        } else if (recordResult && Array.isArray(recordResult.records)) {
          records = recordResult.records
        }

        const groups: Record<string, any[]> = {}
        if (nameField) {
          for (const record of records) {
            const nameVal = record.fields[nameField]
            let name = ''
            if (nameVal !== null && nameVal !== undefined) {
              if (Array.isArray(nameVal) && nameVal.length > 0) {
                name = nameVal[0]?.text || String(nameVal[0]) || ''
              } else {
                name = String(nameVal)
              }
            }
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
          let xSum = 0
          let ySum = 0
          let sizeSum = 0
          let count = 0

          for (const record of groupRecords) {
            try {
              const xVal = record.fields[xField]
              const x = typeof xVal === 'number' ? xVal : parseFloat(String(xVal))

              const yVal = record.fields[yField]
              const y = typeof yVal === 'number' ? yVal : parseFloat(String(yVal))

              if (!isNaN(x) && !isNaN(y)) {
                xSum += x
                ySum += y
                count++
              }

              if (sizeField) {
                const sizeVal = record.fields[sizeField]
                const size = typeof sizeVal === 'number' ? sizeVal : parseFloat(String(sizeVal))
                if (!isNaN(size)) {
                  sizeSum += size
                }
              }
            } catch (err) {
              console.warn('[useData3] ⚠️ 处理记录失败:', err)
            }
          }

          if (count > 0) {
            const item: DataItem = {
              x: xSum,
              y: ySum,
              size: sizeField ? sizeSum : 20
            }
            if (groupName) {
              item.name = groupName
            }
            processedData.push(item)
          }
        }
        setData(processedData)
      } catch (error) {
        console.error('[useData3] ❌ 获取数据失败:', error)
        setData([])
      } finally {
        setLoading(false)
      }
    }

    fetchData(config)

  }, [config.dataSource, config.xField, config.yField, config.sizeField, config.nameField, state, refreshKey])

  return { data, loading }
}
