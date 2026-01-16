/**
 * useViews.ts - 视图管理 hook
 *
 * 功能说明：
 * 获取指定数据表的所有视图列表
 * 支持应用插件模式（从 workspace 获取的 base 实例）
 */

import { useEffect, useState } from 'react'

export interface ViewInfo {
    id: string
    name: string
}

/**
 * useViews - 视图 hook
 * 参数：
 * - tableId: 数据表 ID
 * - baseInstance: 可选的 base 实例（应用插件模式下使用）
 */
export const useViews = (tableId?: string, baseInstance?: any) => {
    const [views, setViews] = useState<ViewInfo[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const fetchViews = async () => {
            if (!tableId) {
                setViews([])
                return
            }

            try {
                setLoading(true)
                // 如果 baseInstance 为 null/undefined，清空数据并等待有效实例
                // 【关键修复】必须清空 views，防止使用旧数据
                if (!baseInstance) {
                    setViews([])
                    return
                }
                const table = await baseInstance.getTable(tableId)
                const viewList = await table.getViewList()

                const viewsData = await Promise.all(viewList.map(async (view: any) => {
                    const name = await view.getName()
                    return {
                        id: view.id,
                        name: name
                    }
                }))

                setViews(viewsData)
                setError(null)
            } catch (err) {
                console.error('Failed to fetch views:', err)
                setError('获取视图列表失败')
                setViews([])
            } finally {
                setLoading(false)
            }
        }

        fetchViews()
    }, [tableId, baseInstance])

    return { views, loading, error }
}
