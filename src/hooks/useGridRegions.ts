/**
 * useGridRegions.ts - 网格区域计算工具
 * 
 * 功能说明：
 * 1. 支持最多 3×3 (9宫格) 的区域划分
 * 2. 动态计算区域边界、标题位置、ECharts 配置
 * 3. 提供旧配置格式的迁移支持
 */

import { useMemo } from 'react'
import type { BubbleChartConfig } from './useDashboard'

/**
 * 区域坐标类型
 * row: 0 = 底部, 1 = 中间, 2 = 顶部
 * col: 0 = 左侧, 1 = 中间, 2 = 右侧
 */
export interface RegionCoord {
    row: number
    col: number
}

/**
 * 区域配置
 */
export interface RegionConfig {
    name?: string
    color?: string
}

/**
 * 标题位置类型
 */
export type LabelPosition =
    | 'top-left' | 'top' | 'top-right'
    | 'left' | 'center' | 'right'
    | 'bottom-left' | 'bottom' | 'bottom-right'

/**
 * 计算网格尺寸
 * @param xCount X轴分割线数量 (0-2)
 * @param yCount Y轴分割线数量 (0-2)
 * @returns 网格的列数和行数
 */
export function getGridSize(xCount: number, yCount: number): { cols: number; rows: number } {
    return {
        cols: Math.min(xCount, 2) + 1,  // 最多3列
        rows: Math.min(yCount, 2) + 1   // 最多3行
    }
}

/**
 * 生成区域 key
 * @param row 行号 (0-2, 从下到上)
 * @param col 列号 (0-2, 从左到右)
 * @returns 格式为 "row_col" 的字符串
 */
export function getRegionKey(row: number, col: number): string {
    return `${row}_${col}`
}

/**
 * 解析区域 key
 * @param key 格式为 "row_col" 的字符串
 * @returns 区域坐标
 */
export function parseRegionKey(key: string): RegionCoord {
    const [row, col] = key.split('_').map(Number)
    return { row, col }
}

/**
 * 获取所有区域坐标（按显示顺序：从上到下，从左到右）
 * @param cols 列数
 * @param rows 行数
 * @returns 区域坐标数组
 */
export function getAllRegionCoords(cols: number, rows: number): RegionCoord[] {
    const coords: RegionCoord[] = []
    // 从上到下遍历（row 从大到小）
    for (let row = rows - 1; row >= 0; row--) {
        // 从左到右遍历
        for (let col = 0; col < cols; col++) {
            coords.push({ row, col })
        }
    }
    return coords
}

/**
 * 判断数据点所在区域
 * @param x 数据点 X 坐标
 * @param y 数据点 Y 坐标
 * @param xThresholds X轴分割线值数组（已排序）
 * @param yThresholds Y轴分割线值数组（已排序）
 * @returns 区域坐标，如果无分割线则返回 null
 */
export function getRegionForPoint(
    x: number,
    y: number,
    xThresholds: number[],
    yThresholds: number[]
): RegionCoord | null {
    // 无分割线时返回 null
    if (xThresholds.length === 0 && yThresholds.length === 0) {
        return null
    }

    // 计算列位置
    let col = 0
    for (const threshold of xThresholds) {
        if (x >= threshold) col++
        else break
    }

    // 计算行位置
    let row = 0
    for (const threshold of yThresholds) {
        if (y >= threshold) row++
        else break
    }

    return { row, col }
}

/**
 * 获取区域的 Placeholder 文本
 * 根据网格位置返回对应的描述文字
 */
export function getRegionPlaceholder(
    row: number,
    col: number,
    rows: number,
    cols: number,
    t: (key: string) => string
): string {
    // 单行情况（仅 X 轴分割）
    if (rows === 1) {
        if (cols === 2) {
            return col === 0 ? t('placeholder.regionLeft') : t('placeholder.regionRight')
        }
        if (cols === 3) {
            if (col === 0) return t('placeholder.regionLeft')
            if (col === 1) return t('placeholder.regionMiddleH')
            return t('placeholder.regionRight')
        }
    }

    // 单列情况（仅 Y 轴分割）
    if (cols === 1) {
        if (rows === 2) {
            return row === 0 ? t('placeholder.regionBottom') : t('placeholder.regionTop')
        }
        if (rows === 3) {
            if (row === 0) return t('placeholder.regionBottom')
            if (row === 1) return t('placeholder.regionMiddleV')
            return t('placeholder.regionTop')
        }
    }

    // 多行多列情况
    const rowName = rows === 2
        ? (row === 0 ? 'Bottom' : 'Top')
        : (row === 0 ? 'Bottom' : row === 1 ? 'Middle' : 'Top')

    const colName = cols === 2
        ? (col === 0 ? 'Left' : 'Right')
        : (col === 0 ? 'Left' : col === 1 ? 'Middle' : 'Right')

    // 中心位置特殊处理
    if (rows === 3 && cols === 3 && row === 1 && col === 1) {
        return t('placeholder.regionCenter')
    }

    // 组合位置名称
    const key = `placeholder.region${rowName}${colName}`
    return t(key)
}

/**
 * 获取区域标题的显示位置
 * 根据区域在网格中的位置，返回标题应该显示的对齐方式
 */
export function getRegionLabelPosition(
    row: number,
    col: number,
    rows: number,
    cols: number
): LabelPosition {
    // 判断是否在边缘
    const isTop = row === rows - 1
    const isBottom = row === 0
    const isLeft = col === 0
    const isRight = col === cols - 1
    const isMiddleRow = !isTop && !isBottom
    const isMiddleCol = !isLeft && !isRight

    // 四角位置
    if (isTop && isLeft) return 'top-left'
    if (isTop && isRight) return 'top-right'
    if (isBottom && isLeft) return 'bottom-left'
    if (isBottom && isRight) return 'bottom-right'

    // 边缘中间位置
    if (isTop && isMiddleCol) return 'top'
    if (isBottom && isMiddleCol) return 'bottom'
    if (isMiddleRow && isLeft) return 'left'
    if (isMiddleRow && isRight) return 'right'

    // 正中心
    return 'center'
}

/**
 * 生成 ECharts markLine 配置
 */
export function generateMarkLines(
    xThresholds: number[],
    yThresholds: number[],
    lineStyle: any
): any {
    const data: any[] = []

    // X 轴分割线
    xThresholds.forEach(val => {
        data.push({ xAxis: val })
    })

    // Y 轴分割线
    yThresholds.forEach(val => {
        data.push({ yAxis: val })
    })

    return {
        z: 1,
        silent: true,
        symbol: ['none', 'none'],
        lineStyle,
        label: { show: false },
        data
    }
}

/**
 * 生成 ECharts markArea 配置
 */
export function generateMarkAreas(
    xThresholds: number[],
    yThresholds: number[],
    regions: Record<string, RegionConfig>,
    xMin: number,
    xMax: number,
    yMin: number,
    yMax: number,
    hoveredRegion: string | null
): any[] {
    // 构建边界数组
    const xBounds = [xMin, ...xThresholds.sort((a, b) => a - b), xMax]
    const yBounds = [yMin, ...yThresholds.sort((a, b) => a - b), yMax]

    const areas: any[] = []

    // 遍历所有区域
    for (let row = 0; row < yBounds.length - 1; row++) {
        for (let col = 0; col < xBounds.length - 1; col++) {
            const key = getRegionKey(row, col)
            const config = regions[key] || {}

            // 计算是否高亮
            const isHovered = hoveredRegion === key
            const color = hoveredRegion && !isHovered
                ? 'transparent'
                : (config.color || 'transparent')

            areas.push([
                {
                    name: config.name || '',
                    itemStyle: { color, opacity: 0.1 },
                    label: { show: false },
                    xAxis: xBounds[col],
                    yAxis: yBounds[row]
                },
                {
                    xAxis: xBounds[col + 1],
                    yAxis: yBounds[row + 1]
                }
            ])
        }
    }

    return areas
}

/**
 * 迁移旧版配置到新格式
 * 将 xThreshold/yThreshold 和 quadrantXX 转换为 xThresholds/yThresholds 和 regions
 */
export function migrateOldConfig(config: BubbleChartConfig): {
    xThresholds: string[]
    yThresholds: string[]
    regions: Record<string, RegionConfig>
} {
    // 迁移分割线
    const xThresholds: string[] = config.xThresholds || (config.xThreshold ? [config.xThreshold] : [])
    const yThresholds: string[] = config.yThresholds || (config.yThreshold ? [config.yThreshold] : [])

    // 如果已有新格式 regions，直接使用
    if (config.regions) {
        return { xThresholds, yThresholds, regions: config.regions }
    }

    // 迁移旧版象限配置
    const regions: Record<string, RegionConfig> = {}

    const hasX = xThresholds.length > 0
    const hasY = yThresholds.length > 0

    if (hasX && hasY) {
        // 4象限模式
        // 旧格式: TL=左上(row=1,col=0), TR=右上(row=1,col=1), BL=左下(row=0,col=0), BR=右下(row=0,col=1)
        if (config.quadrantTLName || config.quadrantTLColor) {
            regions['1_0'] = { name: config.quadrantTLName, color: config.quadrantTLColor }
        }
        if (config.quadrantTRName || config.quadrantTRColor) {
            regions['1_1'] = { name: config.quadrantTRName, color: config.quadrantTRColor }
        }
        if (config.quadrantBLName || config.quadrantBLColor) {
            regions['0_0'] = { name: config.quadrantBLName, color: config.quadrantBLColor }
        }
        if (config.quadrantBRName || config.quadrantBRColor) {
            regions['0_1'] = { name: config.quadrantBRName, color: config.quadrantBRColor }
        }
    } else if (hasX && !hasY) {
        // 左右模式
        // 旧格式: TL=左(col=0), TR=右(col=1)
        if (config.quadrantTLName || config.quadrantTLColor) {
            regions['0_0'] = { name: config.quadrantTLName, color: config.quadrantTLColor }
        }
        if (config.quadrantTRName || config.quadrantTRColor) {
            regions['0_1'] = { name: config.quadrantTRName, color: config.quadrantTRColor }
        }
    } else if (!hasX && hasY) {
        // 上下模式
        // 旧格式: TL=上(row=1), BL=下(row=0)
        if (config.quadrantTLName || config.quadrantTLColor) {
            regions['1_0'] = { name: config.quadrantTLName, color: config.quadrantTLColor }
        }
        if (config.quadrantBLName || config.quadrantBLColor) {
            regions['0_0'] = { name: config.quadrantBLName, color: config.quadrantBLColor }
        }
    }

    return { xThresholds, yThresholds, regions }
}

/**
 * useGridRegions Hook
 * 封装网格区域的计算逻辑
 */
export function useGridRegions(config: BubbleChartConfig, t: (key: string) => string) {
    return useMemo(() => {
        // 迁移配置
        const { xThresholds, yThresholds, regions } = migrateOldConfig(config)

        // 计算网格尺寸
        const { cols, rows } = getGridSize(xThresholds.length, yThresholds.length)

        // 获取所有区域（按显示顺序）
        const allRegions = getAllRegionCoords(cols, rows)

        // 生成区域配置项（用于 UI 渲染）
        const regionConfigs = allRegions.map(coord => {
            const key = getRegionKey(coord.row, coord.col)
            const placeholder = getRegionPlaceholder(coord.row, coord.col, rows, cols, t)
            const labelPosition = getRegionLabelPosition(coord.row, coord.col, rows, cols)
            const existingConfig = regions[key] || {}

            return {
                key,
                coord,
                placeholder,
                labelPosition,
                name: existingConfig.name,
                color: existingConfig.color
            }
        })

        return {
            xThresholds,
            yThresholds,
            regions,
            cols,
            rows,
            regionConfigs,
            hasRegions: xThresholds.length > 0 || yThresholds.length > 0
        }
    }, [config, t])
}

export default useGridRegions
