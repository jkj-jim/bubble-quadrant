/**
 * useCategoryAxisMapper.ts - 类目轴映射器 Hook
 *
 * 功能说明：
 * 将 ECharts 的类目轴转换为"伪装的数值轴"，解决以下问题：
 * 1. markLine 无法定位到两个类目之间
 * 2. markArea 无法完全覆盖图表区域
 *
 * 核心原理：
 * - 使用 type: 'value' 替代 type: 'category'
 * - 通过 min: -0.5, max: length - 0.5 模拟 boundaryGap
 * - 通过 axisLabel.formatter 将数值还原为类目文本
 *
 * 使用方式：
 * const xMapper = useCategoryAxisMapper(xAxisData)
 * const axisConfig = xMapper.getAxisConfig()
 */

import { useMemo } from 'react'

/**
 * CategoryAxisMapper 接口
 * 定义类目轴映射器提供的所有能力
 */
export interface CategoryAxisMapper {
    /** 类目列表 */
    categories: string[]

    /** 类目数量 */
    length: number

    /** 类目 → 索引 映射表 */
    categoryToIndex: Map<string, number>

    /**
     * 索引 → 类目 映射函数
     * @param index 数值索引（支持小数，会四舍五入到最近的整数）
     * @returns 对应的类目文本，超出范围返回空字符串
     */
    indexToCategory: (index: number) => string

    /**
     * 获取轴配置增强器
     * 返回将数值轴伪装成类目轴所需的配置
     */
    getAxisConfig: () => {
        min: number
        max: number
        splitNumber: number
        axisLabel: {
            formatter: (value: number) => string
        }
    }

    /**
     * 获取分割线的精确位置
     * @param categoryName 类目名称（用户选择的分割点）
     * @returns 数值位置，位于选中类目与下一个类目之间
     *
     * 例如：选择"周二"（索引 1），返回 1.5
     * 分割线将精确位于"周二"和"周三"之间
     */
    getThresholdPosition: (categoryName: string) => number

    /**
     * 判断一个值属于分割线的哪一侧
     * @param value 数值（类目索引）
     * @param threshold 分割线位置
     * @returns 'before' | 'after'
     */
    getSide: (value: number, threshold: number) => 'before' | 'after'
}

/**
 * useCategoryAxisMapper - 类目轴映射器 Hook
 *
 * @param categories 类目列表（按显示顺序排列）
 * @returns CategoryAxisMapper 对象
 */
export const useCategoryAxisMapper = (
    categories: string[] | undefined
): CategoryAxisMapper => {
    return useMemo(() => {
        const cats = categories || []
        const length = cats.length

        // 构建 类目 → 索引 映射表
        const categoryToIndex = new Map<string, number>()
        cats.forEach((cat, index) => {
            categoryToIndex.set(cat, index)
        })

        // 索引 → 类目 映射函数
        const indexToCategory = (index: number): string => {
            // 四舍五入到最近的整数索引
            const roundedIndex = Math.round(index)
            if (roundedIndex < 0 || roundedIndex >= length) {
                return ''
            }
            return cats[roundedIndex] || ''
        }

        // 获取轴配置
        const getAxisConfig = () => ({
            // 模拟 boundaryGap: true 的效果
            // 第一个类目在 0 位置，但我们从 -0.5 开始，使其显示在"格子"中间
            min: -0.5,
            max: length - 0.5,
            // 使用 splitNumber 让 ECharts 自动计算刻度数量
            // 设置为类目数量，ECharts 会尽量在整数位置生成刻度
            splitNumber: length,
            // 标签格式化：将数值索引还原为类目文本
            axisLabel: {
                formatter: (value: number): string => {
                    // 过滤边界值：如果原始值不在有效范围内，不显示标签
                    // 例如 -0.5 虽然四舍五入是 0，但原始值 < 0，应该不显示
                    if (value < -0.1 || value > length - 0.9) {
                        return ''
                    }
                    // 四舍五入到最近的整数，然后获取对应的类目
                    return indexToCategory(Math.round(value))
                }
            },
            // 刻度线设置
            axisTick: {
                alignWithLabel: true
            }
        })
        // 获取分割线位置
        const getThresholdPosition = (categoryName: string): number => {
            const index = categoryToIndex.get(categoryName)
            if (index === undefined) {
                // 如果类目不存在，返回中间位置
                return length / 2
            }
            // 分割线位于选中类目的右边界（索引 + 0.5）
            // 例如：选中"周二"（索引 1），分割线在 1.5 位置
            return index + 0.5
        }

        // 判断值属于哪一侧
        const getSide = (value: number, threshold: number): 'before' | 'after' => {
            return value < threshold ? 'before' : 'after'
        }

        return {
            categories: cats,
            length,
            categoryToIndex,
            indexToCategory,
            getAxisConfig,
            getThresholdPosition,
            getSide
        }
    }, [categories])
}

export default useCategoryAxisMapper
