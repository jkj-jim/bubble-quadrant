/**
 * useWorkspace.ts - Workspace 管理 hook
 *
 * 功能说明：
 * 1. 检测当前是应用插件（needChangeBase=true）还是仪表盘插件（needChangeBase=false）
 * 2. 管理当前选中的 baseToken（多维表格标识）
 * 3. 提供 bitable 实例（通过 workspace.getBitable() 获取）
 * 4. 获取默认 baseToken（从 dashboard.getConfig() 中读取）
 *
 * 使用方式：
 * const { needChangeBase, baseToken, setBaseToken, bitable } = useWorkspace();
 *
 * 性能优化（2026-01-14）：
 * - 同步初始化默认 bitable 实例，避免仪表盘模式下的等待
 * - 环境检测异步进行，但不阻塞数据获取
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { dashboard, workspace, bitable as defaultBitable } from '@lark-base-open/js-sdk'

// IBitableApp 接口定义（从 SDK 导入的类型）
interface IBitableApp {
    readonly base: any
    readonly bridge: any
    readonly ui: any
    readonly dashboard: any
}

// 同步创建默认 bitable 实例（仪表盘模式使用）
const createDefaultBitableInstance = (): IBitableApp => ({
    base: defaultBitable.base,
    bridge: defaultBitable.bridge,
    ui: defaultBitable.ui,
    dashboard: dashboard
})

/**
 * useWorkspace - Workspace 管理 hook
 *
 * 返回值：
 * - needChangeBase: 是否需要显示多维表格选择器（true=应用插件，false=仪表盘插件）
 * - baseToken: 当前选中的多维表格 token
 * - setBaseToken: 更新 baseToken 的函数
 * - bitable: 当前 bitable 实例（应用模式从 workspace 获取，仪表盘模式使用默认实例）
 * - loading: 初始化加载状态
 */
export const useWorkspace = () => {
    // 是否需要切换多维表格（应用插件模式）
    const [needChangeBase, setNeedChangeBase] = useState(false)
    // 当前选中的 baseToken
    const [baseToken, setBaseToken] = useState<string | undefined>(undefined)
    // 当前 bitable 实例 - 【性能优化】初始就设置默认实例，仪表盘模式无需等待
    const [bitable, setBitable] = useState<IBitableApp | null>(() => createDefaultBitableInstance())
    // 环境检测完成标志
    const [envChecked, setEnvChecked] = useState(false)
    // 应用模式下的 loading 状态
    const [appModeLoading, setAppModeLoading] = useState(false)

    /**
     * useEffect: 初始化 - 检测环境并获取默认 baseToken
     */
    useEffect(() => {
        const init = async () => {
            try {
                // 1. 获取环境信息，判断是否为应用插件
                const env = await defaultBitable.bridge.getEnv()
                // @ts-ignore - needChangeBase 是新 SDK 中添加的属性
                const isAppMode = env.needChangeBase === true
                setNeedChangeBase(isAppMode)
                console.log('[useWorkspace] 环境检测完成, needChangeBase:', isAppMode)

                // 2. 获取默认 baseToken（从已保存的配置中读取）
                if (isAppMode) {
                    try {
                        const config = await dashboard.getConfig()
                        const defaultToken = (config.dataConditions as any)?.[0]?.baseToken
                        if (defaultToken) {
                            setBaseToken(defaultToken)
                            console.log('[useWorkspace] 获取到默认 baseToken:', defaultToken)
                        }
                    } catch (configError) {
                        // Create 状态下 getConfig 会抛错，这是正常的
                        console.log('[useWorkspace] 无法获取配置（可能是 Create 状态）')
                        // 从 workspace.getBaseList() 获取第一个多维表格作为默认值
                        try {
                            const baseList = await workspace.getBaseList({})
                            const firstBaseToken = baseList?.base_list?.[0]?.token
                            if (firstBaseToken) {
                                setBaseToken(firstBaseToken)
                                console.log('[useWorkspace] 使用第一个多维表格作为默认:', firstBaseToken)
                            }
                        } catch (listError) {
                            console.error('[useWorkspace] 获取多维表格列表失败:', listError)
                        }
                    }
                }

                setEnvChecked(true)
            } catch (error) {
                console.error('[useWorkspace] 初始化失败:', error)
                setEnvChecked(true)
            }
        }

        init()
    }, [])

    /**
     * useEffect: 应用模式下，根据 baseToken 获取对应的 bitable 实例
     * 仪表盘模式已在初始化时同步设置，无需等待
     */
    useEffect(() => {
        // 等待环境检测完成
        if (!envChecked) return

        // 仪表盘模式：已在初始化时设置，无需处理
        if (!needChangeBase) {
            console.log('[useWorkspace] 仪表盘模式，使用已初始化的默认实例')
            return
        }

        // 应用模式：需要根据 baseToken 获取实例
        const fetchBitable = async () => {
            if (!baseToken) {
                // 没有 baseToken 时清空实例
                setBitable(null)
                return
            }

            setAppModeLoading(true)
            try {
                const bitableInstance = await workspace.getBitable(baseToken)
                if (bitableInstance) {
                    setBitable(bitableInstance as IBitableApp)
                    console.log('[useWorkspace] 获取到 bitable 实例 (应用模式)')
                } else {
                    console.warn('[useWorkspace] 无法获取 bitable 实例，baseToken 可能无效')
                    setBitable(null)
                }
            } catch (error) {
                console.error('[useWorkspace] 获取 bitable 实例失败:', error)
                setBitable(null)
            } finally {
                setAppModeLoading(false)
            }
        }

        fetchBitable()
    }, [envChecked, needChangeBase, baseToken])

    /**
     * handleSetBaseToken - 更新 baseToken 的回调函数
     */
    const handleSetBaseToken = useCallback((token: string) => {
        console.log('[useWorkspace] 更新 baseToken:', token)
        setBaseToken(token)
    }, [])

    // 计算 loading 状态：仪表盘模式不需要等待环境检测
    const loading = useMemo(() => {
        if (envChecked && !needChangeBase) {
            // 仪表盘模式：环境检测完成后立即可用
            return false
        }
        // 应用模式：需要等待环境检测和 bitable 实例获取
        return !envChecked || appModeLoading
    }, [envChecked, needChangeBase, appModeLoading])

    return {
        needChangeBase,
        baseToken,
        setBaseToken: handleSetBaseToken,
        bitable,
        loading
    }
}
