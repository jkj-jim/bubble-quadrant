/**
 * useTables.ts - 工作表管理hook
 *
 * 功能说明：
 * 1. 获取当前多维表格中的所有工作表
 * 2. 提供工作表列表供用户选择数据源
 * 3. 并行获取每个工作表的元数据信息（名称）
 *
 * 逻辑流程：
 * - 使用base.getTableList()获取所有表格
 * - 使用Promise.all并行获取每个表格的元数据
 * - 提取表格ID和名称构建选择列表
 * - 提供加载状态和错误处理
 *
 * 依赖引用：
 * - @lark-base-open/js-sdk: 飞书基础SDK
 * - ./useDashboard: TableInfo类型定义
 */

import { useEffect, useState } from 'react'
import { base } from '@lark-base-open/js-sdk'
import type { TableInfo } from './useDashboard'

/**
 * useTables - 工作表hook
 * 功能：异步获取当前多维表格中的所有工作表
 *
 * 返回：
 * - tables: 工作表列表（包含id和name）
 * - loading: 加载状态
 * - error: 错误信息
 */
export const useTables = () => {
  const [tables, setTables] = useState<TableInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /**
   * useEffect: 组件挂载时获取工作表列表
   * 功能：
   * - 调用base.getTableList()获取所有表格
   * - 并行获取每个表格的元数据（使用Promise.all）
   * - 更新tables状态
   * - 处理错误和加载状态
   */
  useEffect(() => {
    const fetchTables = async () => {
      try {
        setLoading(true)
        // 使用 getTableList 获取所有表格
        const tableList = await base.getTableList()

        // 并行获取每个表格的元数据（id和name）
        const tablesWithMeta = await Promise.all(
          tableList.map(async (table) => {
            const meta = await table.getMeta()
            return {
              id: table.id,
              name: meta.name
            }
          })
        )

        setTables(tablesWithMeta)
        setError(null)
      } catch (err) {
        setError('获取工作表失败：' + (err as Error).message)
        console.error('Failed to fetch tables:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchTables()
  }, [])

  // 返回工作表列表、加载状态和错误信息
  return { tables, loading, error }
}
