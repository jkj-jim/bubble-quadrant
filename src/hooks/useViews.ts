/**
 * useViews.ts - 视图管理 hook
 *
 * 功能说明：
 * 获取指定数据表的所有视图列表
 * 支持应用插件模式（从 workspace 获取的 base 实例）
 */

import { useEffect, useState } from 'react'
import { bitable } from '@lark-base-open/js-sdk'

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
                // 使用传入的 baseInstance，如果没有则使用默认的 bitable.base
                const currentBase = baseInstance || bitable.base
                const table = await currentBase.getTable(tableId)
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
