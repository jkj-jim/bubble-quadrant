/**
 * BaseSelector.tsx - 多维表格选择器组件
 *
 * 功能说明：
 * 该组件用于应用插件模式下选择多维表格（Base）
 * 参考官方 baseDashboardMileStone 项目实现
 *
 * 功能特点：
 * - 使用 workspace.getBaseList() 获取多维表格列表
 * - 支持搜索功能（防抖 300ms）
 * - 支持滚动分页加载
 * - 选中项右侧显示跳转按钮
 * - 标签右侧显示 tooltip 说明
 */

import React, { memo, useState, useCallback, useEffect, useMemo } from 'react'
import { Select, Spin, Tooltip, Typography } from '@douyinfe/semi-ui'
import { workspace } from '@lark-base-open/js-sdk'
import { useTranslation } from 'react-i18next'
import './BaseSelector.css'

const { Option } = Select
const { Text } = Typography

// 多维表格信息接口
interface IBaseInfo {
    name: string
    token: string
    url?: string
}

// 缓存上次请求的 base 列表，防止过多的 loading
let cacheCurBases: IBaseInfo[] = []

/**
 * DataSourceOption - 选项渲染组件
 */
function DataSourceOption(props: {
    url: string
    optName: string
    isLabel?: boolean
}) {
    const { url, optName, isLabel = false } = props
    const { t } = useTranslation()

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        window.open(url, '_blank')
    }

    const content = (
        <>
            {/* 多维表格图标 */}
            <span className="base-selector-option-icon">
                <svg
                    width="1em"
                    height="1em"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    data-icon="FileLinkBitableOutlined"
                >
                    <path
                        d="M16.595 3H4v14.823c0 .814.337 1.613.966 2.216a3.53 3.53 0 0 0 2.44.961H20V6.176a3.07 3.07 0 0 0-.966-2.215A3.53 3.53 0 0 0 16.593 3ZM2 2a1 1 0 0 1 1-1h13.595a5.53 5.53 0 0 1 3.822 1.516A5.068 5.068 0 0 1 22 6.176V22a1 1 0 0 1-1 1H7.405a5.529 5.529 0 0 1-3.822-1.516A5.068 5.068 0 0 1 2 17.824V2Zm13.74 10L12 8.26l2.275-1.76L17.5 9.725 15.74 12ZM12 15.735 15.74 12l1.76 2.275-3.225 3.225L12 15.735ZM8.26 12 6.5 9.725 9.725 6.5 12 8.26 8.26 12Zm0 0L6.5 14.275 9.725 17.5 12 15.735 8.26 12Z"
                        fill="currentColor"
                    ></path>
                </svg>
            </span>
            <span>{optName}</span>
        </>
    )

    return (
        <div className="base-selector-option">
            <Tooltip content={optName}>
                <div className="base-selector-option-content">{content}</div>
            </Tooltip>
            {/* 仅在已选中的标签上显示跳转按钮 */}
            {isLabel && url && (
                <Tooltip content={t('tooltip.openBase')}>
                    <span className="base-selector-option-link" onClick={handleClick}>
                        <svg
                            width="1em"
                            height="1em"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            data-icon="WindowNewOutlined"
                        >
                            <path
                                d="M22 3a1 1 0 0 0-1-1h-7a1 1 0 0 0 0 2h4.586l-6.293 6.293a1 1 0 0 0 1.414 1.414L20 5.414V10a1 1 0 1 0 2 0V3Z"
                                fill="currentColor"
                            ></path>
                            <path
                                d="M4 5h6v2H4v13h16v-5.5h2V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
                                fill="currentColor"
                            ></path>
                        </svg>
                    </span>
                </Tooltip>
            )}
        </div>
    )
}

// 组件 Props
interface BaseSelectorProps {
    baseToken?: string
    onChange: (token: string) => void
    loading?: boolean // 外部传入的加载状态（切换多维表格时使用）
}

/**
 * BaseSelector - 多维表格选择器
 */
const BaseSelector: React.FC<BaseSelectorProps> = ({ baseToken, onChange, loading: externalLoading }) => {
    const { t } = useTranslation()

    const [currentBaseToken, setCurrentBaseToken] = useState(baseToken)
    const [curBases, setCurBases] = useState<IBaseInfo[]>([])
    const [currentCursor, setCurrentCursor] = useState('')
    const [hasMore, setHasMore] = useState(true)
    const [searchValue, setSearchValue] = useState('')
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [isInitialLoading, setIsInitialLoading] = useState(false)

    // 综合 loading 状态：内部初始化加载 或 外部传入的加载状态
    const isLoading = isInitialLoading || externalLoading

    // 同步外部 baseToken 变化
    useEffect(() => {
        setCurrentBaseToken(baseToken)
    }, [baseToken])

    // 搜索函数
    const search = useCallback(async (value: string) => {
        try {
            const res = await workspace.getBaseList({
                query: value || undefined,
                page: { cursor: '' }
            })
            const baseList = res?.base_list || []
            setCurBases(baseList)
            setHasMore(res?.page?.hasMore ?? false)
            setCurrentCursor(res?.page?.cursor || '')
            // 更新缓存，保留当前选中项
            cacheCurBases = [
                ...baseList,
                ...cacheCurBases.filter((item) => item.token === currentBaseToken && !baseList.find(b => b.token === item.token))
            ]
        } catch (error) {
            console.error('[BaseSelector] 搜索失败:', error)
        }
    }, [currentBaseToken])

    // 初始化加载
    useEffect(() => {
        const init = async () => {
            try {
                // 如果缓存中有当前选中项，先用缓存显示
                if (cacheCurBases.length > 0 && cacheCurBases.find((item) => item.token === currentBaseToken)) {
                    setCurBases(cacheCurBases)
                } else {
                    setIsInitialLoading(true)
                }
                await search('')
            } catch (error) {
                console.error('[BaseSelector] 初始化失败:', error)
            } finally {
                setIsInitialLoading(false)
            }
        }
        init()
    }, [])

    // 防抖搜索
    const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
    const handleSearch = useCallback((value: string) => {
        setSearchValue(value)
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current)
        }
        debounceTimerRef.current = setTimeout(() => {
            search(value)
        }, 300)
    }, [search])

    // 下拉框显示变化时
    const onVisibleChange = useCallback((visible: boolean) => {
        if (visible) {
            search('')
            setSearchValue('')
        }
    }, [search])

    // 加载更多
    const handleLoadMore = useCallback(async () => {
        if (isLoadingMore || !hasMore) return
        setIsLoadingMore(true)
        try {
            const res = await workspace.getBaseList({
                query: searchValue || undefined,
                page: { cursor: currentCursor }
            })
            setCurBases((prev) => [...prev, ...(res?.base_list || [])])
            setHasMore(res?.page?.hasMore ?? false)
            setCurrentCursor(res?.page?.cursor || '')
        } finally {
            setIsLoadingMore(false)
        }
    }, [currentCursor, hasMore, isLoadingMore, searchValue])

    // 滚动加载更多
    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const target = e.target as HTMLDivElement
        if (isLoadingMore || !hasMore) return
        const { scrollTop, scrollHeight, clientHeight } = target
        const isNearBottom = scrollTop + clientHeight >= scrollHeight - 10
        if (isNearBottom) {
            handleLoadMore()
        }
    }, [isLoadingMore, hasMore, handleLoadMore])

    // 选择变化
    const handleBaseChange = useCallback((value: string | number | any[] | Record<string, any> | undefined) => {
        if (typeof value === 'string') {
            setCurrentBaseToken(value)
            onChange(value)
        }
    }, [onChange])

    // 是否显示选中的 base 名称
    const showBaseName = useMemo(() => {
        return (
            currentBaseToken &&
            cacheCurBases.find((item) => item.token === currentBaseToken) &&
            !isInitialLoading
        )
    }, [currentBaseToken, isInitialLoading])

    const hasResult = curBases.length > 0

    // 清理定时器
    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current)
            }
        }
    }, [])

    return (
        <div style={{ marginBottom: '20px' }}>
            {/* 标题行：多维表格 + tooltip */}
            <div className="label base-label" style={{ marginBottom: 8 }}>
                <Text strong>{t('label.multidimTable')}</Text>
                <Tooltip content={t('tooltip.basePermission')} position="bottom">
                    <span className="info-icon">
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            data-icon="InfoOutlined"
                        >
                            <path
                                d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 2C5.925 23 1 18.075 1 12S5.925 1 12 1s11 4.925 11 11-4.925 11-11 11Zm-1-7.5v-4a1 1 0 1 1 0-2h1.004c.55 0 .998.445.998.996.003 1.668-.002 3.336-.002 5.004h.5a1 1 0 1 1 0 2h-3a1 1 0 1 1 0-2h.5Zm1-7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"
                                fill="currentColor"
                            ></path>
                        </svg>
                    </span>
                </Tooltip>
            </div>

            {/* 选择器 */}
            <Select
                searchPosition="dropdown"
                filter
                remote
                dropdownMatchSelectWidth
                placeholder={t('placeholder.selectBase')}
                style={{ width: '100%' }}
                showClear={false}
                loading={isLoading}
                disabled={isLoading}
                value={showBaseName ? currentBaseToken : ''}
                onListScroll={handleScroll}
                onChange={handleBaseChange}
                onSearch={handleSearch}
                onDropdownVisibleChange={onVisibleChange}
                renderSelectedItem={() => {
                    const currentBase = cacheCurBases.find((base) => base.token === currentBaseToken)
                    if (!currentBase) {
                        return <Spin size="small" />
                    }
                    return (
                        <DataSourceOption
                            url={currentBase?.url ?? ''}
                            optName={currentBase?.name ?? ''}
                            isLabel={true}
                        />
                    )
                }}
            >
                {curBases.map((base) => (
                    <Option key={base.token} value={base.token}>
                        <DataSourceOption
                            url={base?.url ?? ''}
                            optName={base?.name ?? ''}
                            isLabel={base.token === currentBaseToken}
                        />
                    </Option>
                ))}
                {!hasResult && !isInitialLoading && (
                    <Option value="no-result" disabled style={{ cursor: 'auto' }}>
                        {t('empty.noMatch')}
                    </Option>
                )}
                {isLoadingMore && (
                    <Option value="loading-more" disabled style={{ textAlign: 'center' }}>
                        <Spin size="small" />
                    </Option>
                )}
            </Select>
        </div>
    )
}

export default memo(BaseSelector)
export { BaseSelector }
