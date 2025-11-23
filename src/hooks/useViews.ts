import { useEffect, useState } from 'react'
import { bitable } from '@lark-base-open/js-sdk'

export interface ViewInfo {
    id: string
    name: string
}

export const useViews = (tableId?: string) => {
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
                const table = await bitable.base.getTable(tableId)
                const viewList = await table.getViewList()

                const viewsData = await Promise.all(viewList.map(async (view) => {
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
    }, [tableId])

    return { views, loading, error }
}
