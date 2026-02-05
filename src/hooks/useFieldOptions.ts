/**
 * useFieldOptions.ts - 字段选项hook（用于获取单选/多选字段的可选项）
 *
 * 功能说明：
 * 1. 根据工作表ID和字段ID获取单选/多选字段的所有可选项
 * 2. 使用飞书SDK的 field.getOptions() API（按用户设定顺序返回）
 * 3. 提供选项缓存机制，避免重复请求
 * 4. 支持加载状态和错误处理
 *
 * 使用场景：
 * - 当用户选择单选/多选字段作为横轴或纵轴时，需要获取字段的选项列表作为类目轴
 * - 类目轴的显示顺序与用户在多维表格中设置的选项顺序一致
 *
 * 接口说明：
 * - field.getOptions() 返回 ISelectFieldOption[]
 * - 数据结构：{ id: string, name: string, color: number }
 * - 返回的数组按用户在飞书多维表格UI中设定的顺序排列
 *
 * 依赖引用：
 * - @lark-base-open/js-sdk: 飞书基础SDK
 * - React hooks: 状态管理和副作用处理
 */

import { useEffect, useState, useRef } from 'react'
import { base, FieldType, type ISelectFieldOption } from '@lark-base-open/js-sdk'

/**
 * OptionsCache - 选项缓存接口
 * 用于存储已获取的字段选项，避免重复请求
 */
interface OptionsCache {
  [key: string]: {
    options: string[]
    timestamp: number
  }
}

/**
 * useFieldOptions - 字段选项hook
 *
 * 功能：根据tableId和fieldId获取单选/多选字段的选项列表
 *
 * 参数：
 * - tableId: 工作表ID（可选）
 * - fieldId: 字段ID（可选）
 * - enabled: 是否启用（可选，用于控制是否自动获取）
 *
 * 返回：
 * - options: 选项名称列表（按用户设定顺序）
 * - loading: 加载状态
 * - error: 错误信息
 * - refetch: 手动刷新函数
 *
 * 使用示例：
 * ```typescript
 * const { options, loading } = useFieldOptions('tbl123', 'fld456');
 * // options = ['选项A', '选项B', '选项C'] （按顺序）
 * ```
 */
export const useFieldOptions = (
  tableId?: string,
  fieldId?: string,
  enabled: boolean = true,
  baseInstance?: any  // 应用插件模式下传入 workspaceBitable.base
) => {
  const [options, setOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 使用useRef创建缓存对象，避免每次渲染重新创建
  const cacheRef = useRef<OptionsCache>({})

  /**
   * 生成缓存key
   * 格式：tableId_fieldId
   */
  const getCacheKey = (tid: string, fid: string): string => `${tid}_${fid}`

  /**
   * 检查缓存是否过期（5分钟）
   * @returns boolean - true表示缓存有效，false表示需要重新获取
   */
  const isCacheValid = (cacheKey: string): boolean => {
    const cached = cacheRef.current[cacheKey]
    if (!cached) return false

    const now = Date.now()
    const cacheTime = cached.timestamp
    const FIVE_MINUTES = 5 * 60 * 1000

    return now - cacheTime < FIVE_MINUTES
  }

  /**
   * 从缓存获取选项
   */
  const getOptionsFromCache = (cacheKey: string): string[] | null => {
    const cached = cacheRef.current[cacheKey]
    return cached ? cached.options : null
  }

  /**
   * 保存选项到缓存
   */
  const saveOptionsToCache = (cacheKey: string, opts: string[]): void => {
    cacheRef.current[cacheKey] = {
      options: opts,
      timestamp: Date.now(),
    }
  }

  /**
   * 清空缓存（用于手动刷新）
   */
  const clearCache = (cacheKey?: string): void => {
    if (cacheKey) {
      delete cacheRef.current[cacheKey]
    } else {
      cacheRef.current = {}
    }
  }

  /**
   * 获取字段选项的实际API调用
   * 使用 field.getOptions() 获取单选字段的所有选项
   *
   * 重要修改：如果字段不是单选字段，返回空数组而不是抛出错误
   * 原因：支持在App.tsx中统一调用，无论字段类型是什么
   */
  const fetchOptions = async (tid: string, fid: string): Promise<string[]> => {
    try {
      // 获取工作表（使用传入的 baseInstance，如果没有则使用默认的 base）
      const currentBase = baseInstance || base
      const table = await currentBase.getTableById(tid)
      // 获取字段
      const field = await table.getField(fid)
      // 获取字段元数据，判断是否为单选字段
      const fieldMeta = await field.getMeta()

      // 只处理单选和多选字段，其他字段返回空数组
      if (fieldMeta.type !== FieldType.SingleSelect && fieldMeta.type !== FieldType.MultiSelect) {
        return []
      }

      // 使用 field.getOptions() 获取选项（按用户设定顺序返回）
      const fieldOptions: ISelectFieldOption[] = await (field as any).getOptions()

      // 提取选项名称（保持顺序）
      return fieldOptions.map((opt) => opt.name)
    } catch (err) {
      console.error(`获取字段选项失败 [table: ${tid}, field: ${fid}]:`, err)
      throw err
    }
  }

  /**
   * useEffect: 当tableId或fieldId变化时，自动获取选项
   * 功能：
   * - 验证参数有效性
   * - 检查缓存是否可用
   * - 从缓存或API获取选项
   * - 更新状态
   * - 处理错误
   *
   * 重要修复：禁用状态下如果fieldId变化，也要重置状态
   * 原因：当字段从数值切换到单选时，即使enabled为false（旧状态），
   * 也需要清空之前的选项，避免显示过期的类目数据
   */
  useEffect(() => {
    let isMounted = true

    const loadOptions = async () => {
      // 参数验证
      if (!tableId || !fieldId) {
        setOptions([])
        setError(null)
        setLoading(false)
        return
      }

      // 如果未启用，清空选项但不获取新数据
      if (!enabled) {
        setOptions([])
        setError(null)
        setLoading(false)
        return
      }

      const cacheKey = getCacheKey(tableId, fieldId)

      // 检查缓存是否有效
      if (isCacheValid(cacheKey)) {
        const cachedOptions = getOptionsFromCache(cacheKey)
        if (cachedOptions) {
          setOptions(cachedOptions)
          setLoading(false)
          setError(null)
          return
        }
      }

      // 缓存无效或不存在，从API获取
      try {
        setLoading(true)
        setError(null)

        const opts = await fetchOptions(tableId, fieldId)

        if (isMounted) {
          setOptions(opts)
          saveOptionsToCache(cacheKey, opts)
          setLoading(false)
        }
      } catch (err) {
        if (isMounted) {
          setError((err as Error).message)
          setLoading(false)
        }
      }
    }

    loadOptions()

    // 清理函数：防止组件卸载后更新状态
    return () => {
      isMounted = false
    }
  }, [tableId, fieldId, enabled, baseInstance])

  /**
   * refetch - 手动刷新选项
   * 功能：强制重新获取字段选项（忽略缓存）
   * 使用场景：用户修改了字段选项后需要刷新
   */
  const refetch = async (): Promise<void> => {
    if (!tableId || !fieldId) {
      return
    }

    const cacheKey = getCacheKey(tableId, fieldId)
    clearCache(cacheKey)

    try {
      setLoading(true)
      setError(null)

      const opts = await fetchOptions(tableId, fieldId)
      setOptions(opts)
      saveOptionsToCache(cacheKey, opts)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return { options, loading, error, refetch }
}
