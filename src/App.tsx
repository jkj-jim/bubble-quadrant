/**
 * App.tsx - 飞书气泡图插件主组件
 *
 * 功能概述：
 * 本组件是飞书多维表格仪表盘插件的入口和核心逻辑处理中心，负责：
 * 1. 管理用户配置（数据源、横纵轴字段、气泡大小和名称字段）
 * 2. 控制不同状态的 UI 展示（create/config/view/fullscreen）
 * 3. 处理配置保存与加载
 * 4. 监听数据变化并自动刷新图表
 * 5. 协调各子组件（图表组件和配置面板）的数据流
 *
 * 页面结构：
 * - 配置状态（create/config）：左侧显示配置后的实时预览图表，右侧显示配置面板
 * - 查看状态（view/fullscreen）：全屏显示气泡图图表
 *
 * 关键设计决策：
 * - 使用 state !== 'create' 而非 !isConfig 加载配置，确保从 view→config 切换时正确加载
 * - 将 onDataChange 事件处理上移，采用 getConfig 权威模式解决数据同步问题
 *
 * 依赖：
 * - React hooks（useState, useEffect）
 * - 飞书官方 UI 组件库（@douyinfe/semi-ui）
 * - 飞书 SDK（@lark-base-open/js-sdk）
 * - 自定义 hooks（useDashboard, useTables, useFields, useData3）
 * - 子组件（BubbleChart）
 */

import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Typography, Select, Tooltip, Checkbox, Tabs, TabPane, Input } from '@douyinfe/semi-ui'
import { IconIssueStroked } from '@douyinfe/semi-icons'
import { bitable, dashboard, Rollup, type ISeries } from '@lark-base-open/js-sdk'
import { useDashboard, useTables, useFields, type BubbleChartConfig } from './hooks/useDashboard'
import { useFieldOptions } from './hooks/useFieldOptions'
import { useViews } from './hooks/useViews'
import { useData3 as useData } from './hooks/useData3'
import { BubbleChart } from './components/BubbleChart'
import { useGridRegions } from './hooks/useGridRegions'


const { Text } = Typography


/**
 * FieldSelect - 字段选择器组件
 *
 * 功能：封装飞书 Select 组件，提供统一的字段选择器样式
 * 特点：
 * - 带标签显示
 * - 支持加载状态
 * - 支持过滤搜索
 * - 统一的样式设计
 *
 * 参数：
 * - label: 字段标签（显示在顶部）
 * - value: 当前选中的值
 * - onChange: 值变化回调
 * - fields: 字段列表（id、name，可选的 typeLabel）
 * - loading: 加载状态
 * - placeholder: 占位文本
 */
const FieldSelect: React.FC<{
  label: string
  value?: string
  onChange: (value: string | number | any[] | Record<string, any> | undefined) => void
  fields: Array<{ id: string; name: string; typeLabel?: string }>
  loading?: boolean
  placeholder?: string
  showClear?: boolean
  tooltip?: string
}> = ({ label, value, onChange, fields, loading, placeholder, showClear = false, tooltip }) => {
  const { t } = useTranslation()
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Text strong>{label}</Text>
          {tooltip && (
            <Tooltip content={tooltip}>
              <IconIssueStroked style={{ color: 'var(--semi-color-text-2)', marginLeft: 4, cursor: 'help' }} />
            </Tooltip>
          )}
        </div>
        {showClear && value && (
          <span
            style={{ cursor: 'pointer', fontSize: '12px', userSelect: 'none', color: 'var(--semi-color-text-1)' }}
            onClick={() => onChange(undefined)}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--semi-color-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--semi-color-text-1)'}
          >
            {t('label.clear')}
          </span>
        )}
      </div>
      <Select
        value={value}
        onChange={onChange}
        placeholder={placeholder || t('placeholder.selectField')}
        style={{ width: '100%' }}
        loading={loading}
        filter
      >
        {fields.map(field => (
          <Select.Option key={field.id} value={field.id}>
            {field.typeLabel || field.name}
          </Select.Option>
        ))}
      </Select>
    </div>
  )
}

/**
 * ColorPicker - 颜色选择器组件
 * 
 * 功能：封装原生颜色选择器，优化性能
 * 特点：
 * - 本地状态管理颜色预览，拖动时不触发父组件渲染
 * - 停止拖动 200ms 后自动触发配置更新（防抖）
 * - 仅在颜色实际变化时才触发更新
 */
const ColorPicker = ({
  value,
  onChange
}: {
  value: string;
  onChange: (color: string) => void
}) => {
  const [localColor, setLocalColor] = useState(value)
  const lastCommittedColor = useRef(value)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 同步外部值变化
  useEffect(() => {
    setLocalColor(value)
    lastCommittedColor.current = value
  }, [value])

  // 清理定时器
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }
    }
  }, [])

  const handleColorChange = (newColor: string) => {
    setLocalColor(newColor)

    // 清除之前的防抖定时器
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
    }

    // 设置新的防抖定时器：200ms 后触发更新
    debounceTimer.current = setTimeout(() => {
      // 仅在颜色实际变化时才触发更新
      if (newColor !== lastCommittedColor.current) {
        lastCommittedColor.current = newColor
        onChange(newColor)
      }
    }, 200)
  }

  return (
    <div style={{
      width: '32px', height: '32px', borderRadius: '4px', border: '1px solid var(--semi-color-border)',
      overflow: 'hidden', cursor: 'pointer', position: 'relative'
    }}>
      <input
        type="color"
        value={localColor}
        onChange={(e) => handleColorChange(e.target.value)}
        style={{
          position: 'absolute', top: '-50%', left: '-50%', width: '200%', height: '200%',
          padding: 0, margin: 0, border: 'none', cursor: 'pointer'
        }}
      />
    </div>
  )
}

/**
 * QuadrantConfigPanel - 象限配置面板组件
 * 
 * 功能：
 * 1. 支持每个轴最多2条分割线（渐进式添加）
 * 2. 动态计算区域数量（最多9个）
 * 3. 使用 useGridRegions hook 计算区域 placeholder 和标题位置
 */
interface QuadrantConfigPanelProps {
  config: BubbleChartConfig
  resolvedXType: 'number' | 'category'
  resolvedYType: 'number' | 'category'
  finalXOptions: string[] | undefined
  finalYOptions: string[] | undefined
  data: any[]
  handleConfigChange: (key: keyof BubbleChartConfig, value: any) => void
  t: (key: string) => string
}

const QuadrantConfigPanel: React.FC<QuadrantConfigPanelProps> = ({
  config,
  resolvedXType,
  resolvedYType,
  finalXOptions,
  finalYOptions,
  data,
  handleConfigChange,
  t
}) => {
  // 使用 useGridRegions 计算区域配置
  const gridRegions = useGridRegions(config, t)

  // 辅助函数：计算平均值
  const calculateAverage = (values: number[]) => {
    if (values.length === 0) return 0
    return values.reduce((a, b) => a + b, 0) / values.length
  }

  // 辅助函数：计算中位数
  const calculateMedian = (values: number[]) => {
    if (values.length === 0) return 0
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }

  // 获取当前有效的分割线数组（优先使用新格式，回退到旧格式）
  const getEffectiveThresholds = (axis: 'x' | 'y'): string[] => {
    if (axis === 'x') {
      return config.xThresholds || (config.xThreshold ? [config.xThreshold] : [])
    } else {
      return config.yThresholds || (config.yThreshold ? [config.yThreshold] : [])
    }
  }

  // 辅助函数：更新第 N 条分割线值
  const updateThreshold = (axis: 'x' | 'y', index: number, value: string | undefined) => {
    // 获取当前有效的分割线数组（兼容旧格式）
    const currentThresholds = [...getEffectiveThresholds(axis)]

    if (value === undefined) {
      // 删除指定位置的分割线
      currentThresholds.splice(index, 1)
    } else {
      // 更新或添加分割线
      currentThresholds[index] = value
    }

    // 同时更新新旧格式
    const key = axis === 'x' ? 'xThresholds' : 'yThresholds'
    const oldKey = axis === 'x' ? 'xThreshold' : 'yThreshold'

    handleConfigChange(key as keyof BubbleChartConfig, currentThresholds.length > 0 ? currentThresholds : undefined)
    handleConfigChange(oldKey as keyof BubbleChartConfig, currentThresholds[0])
  }

  // 辅助函数：更新区域配置
  const updateRegion = (regionKey: string, field: 'name' | 'color', value: string) => {
    // 深拷贝现有的 regions 配置
    const currentRegions: Record<string, { name?: string; color?: string }> = {}

    if (config.regions) {
      Object.keys(config.regions).forEach(key => {
        currentRegions[key] = { ...config.regions![key] }
      })
    }

    // 确保目标 key 存在
    if (!currentRegions[regionKey]) {
      currentRegions[regionKey] = {}
    }

    // 更新字段
    currentRegions[regionKey][field] = value

    // 更新配置
    handleConfigChange('regions', currentRegions)
  }

  // 渲染单条分割线配置
  const renderSplitLineConfig = (
    axis: 'x' | 'y',
    index: number,
    label: string,
    value: string | undefined,
    axisType: 'number' | 'category',
    options: string[] | undefined,
    dataKey: 'x' | 'y'
  ) => {
    const thresholds = getEffectiveThresholds(axis)
    const hasValue = !!value
    const canAddSecond = index === 0 && hasValue && thresholds.length < 2
    const isSecondLine = index === 1

    return (
      <div style={{ marginBottom: isSecondLine ? '24px' : '12px' }} key={`${axis}-${index}`}>
        {/* 标题行 - 第二条分割线不显示标题文字 */}
        <div style={{ display: 'flex', justifyContent: isSecondLine ? 'flex-end' : 'space-between', alignItems: 'center', marginBottom: 8 }}>
          {/* 第一条分割线显示标题，第二条不显示 */}
          {!isSecondLine && <Text strong>{label}</Text>}
          <div style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
            {/* 已设置值时显示：添加分割线 | 清除 */}
            {hasValue ? (
              <>
                {canAddSecond && (
                  <>
                    <span
                      style={{ cursor: 'pointer', userSelect: 'none', color: 'var(--semi-color-text-1)' }}
                      onClick={() => updateThreshold(axis, 1, '')}
                      onMouseEnter={(e) => e.currentTarget.style.color = 'var(--semi-color-primary)'}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'var(--semi-color-text-1)'}
                    >
                      {t('button.addSplitLine')}
                    </span>
                    <span style={{ color: 'var(--semi-color-text-2)' }}>|</span>
                  </>
                )}
                <span
                  style={{ cursor: 'pointer', userSelect: 'none', color: 'var(--semi-color-text-1)' }}
                  onClick={() => updateThreshold(axis, index, undefined)}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--semi-color-primary)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--semi-color-text-1)'}
                >
                  {t('label.clear')}
                </span>
              </>
            ) : (
              // 未设置值时显示快捷填充
              axisType === 'category' && options && options.length > 0 ? (
                <span
                  style={{ cursor: 'pointer', userSelect: 'none', color: 'var(--semi-color-text-1)' }}
                  onClick={() => {
                    const middleIndex = Math.floor((options.length - 1) / 2)
                    updateThreshold(axis, index, options[middleIndex])
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--semi-color-primary)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--semi-color-text-1)'}
                >
                  {t('button.selectMiddle')}
                </span>
              ) : (
                <span style={{ userSelect: 'none', color: 'var(--semi-color-text-1)' }}>
                  {t('button.fillPrefix')}{' '}
                  <span
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      const values = data.map(d => Number(d[dataKey])).filter(n => !isNaN(n))
                      if (values.length > 0) {
                        updateThreshold(axis, index, calculateAverage(values).toFixed(2))
                      }
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--semi-color-primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--semi-color-text-1)'}
                  >
                    {t('button.average')}
                  </span>
                  <span style={{ margin: '0 2px' }}>|</span>
                  <span
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      const values = data.map(d => Number(d[dataKey])).filter(n => !isNaN(n))
                      if (values.length > 0) {
                        updateThreshold(axis, index, calculateMedian(values).toFixed(2))
                      }
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--semi-color-primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--semi-color-text-1)'}
                  >
                    {t('button.median')}
                  </span>
                </span>
              )
            )}
          </div>
        </div>

        {/* 输入控件 */}
        {axisType === 'category' && options && options.length > 0 ? (
          <Select
            value={value}
            onChange={(val) => updateThreshold(axis, index, val as string)}
            placeholder={t('placeholder.splitAfterOption')}
            style={{ width: '100%' }}
          >
            {options.map(opt => (
              <Select.Option key={opt} value={opt}>{opt}</Select.Option>
            ))}
          </Select>
        ) : (
          <Input
            value={value || ''}
            onChange={(val) => updateThreshold(axis, index, val)}
            placeholder={t('placeholder.splitAtValue')}
            style={{ width: '100%' }}
            type="number"
          />
        )}
      </div>
    )
  }

  const xThresholds = getEffectiveThresholds('x')
  const yThresholds = getEffectiveThresholds('y')

  return (
    <div>
      {/* ===== 横轴分割线配置 ===== */}
      {renderSplitLineConfig('x', 0, t('label.xAxisSplit'), xThresholds[0], resolvedXType, finalXOptions, 'x')}
      {xThresholds.length > 1 && renderSplitLineConfig('x', 1, t('label.xAxisSplit2'), xThresholds[1], resolvedXType, finalXOptions, 'x')}

      {/* ===== 纵轴分割线配置 ===== */}
      {renderSplitLineConfig('y', 0, t('label.yAxisSplit'), yThresholds[0], resolvedYType, finalYOptions, 'y')}
      {yThresholds.length > 1 && renderSplitLineConfig('y', 1, t('label.yAxisSplit2'), yThresholds[1], resolvedYType, finalYOptions, 'y')}

      {/* ===== 区域名称和颜色配置 ===== */}
      {gridRegions.hasRegions && (
        <div style={{ borderTop: '1px solid var(--semi-color-border)', paddingTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <Text strong>{t('label.quadrantName')}</Text>
            <Text strong>{t('label.backgroundColor')}</Text>
          </div>

          {gridRegions.regionConfigs.map(regionConfig => (
            <div
              key={regionConfig.key}
              style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'center' }}
            >
              <Input
                value={config.regions?.[regionConfig.key]?.name || ''}
                onChange={(value) => updateRegion(regionConfig.key, 'name', value)}
                placeholder={regionConfig.placeholder}
                style={{ flex: 1 }}
              />
              <ColorPicker
                value={config.regions?.[regionConfig.key]?.color || '#FFFFFF'}
                onChange={(color) => updateRegion(regionConfig.key, 'color', color)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * App - 主应用组件
 *
 * 状态说明：
 * - state: 当前仪表盘状态（create/config/view/fullscreen）
 * - isConfig: 是否是配置状态（create 或 config）
 * - tables: 多维表格中的所有工作表列表
 * - tablesLoading: 工作表列表加载状态
 * - config: 当前气泡图配置（数据源、字段选择等）
 * - refreshKey: 刷新计数器（用于手动触发图表重绘）
 * - numericFields: 选中表中的数字字段列表
 * - textFields: 选中表中的文本字段列表
 * - fieldsLoading: 字段列表加载状态
 * - data: 计算后的气泡图数据
 * - dataLoading: 数据加载状态
 */
function App() {
  const { t } = useTranslation()
  const [theme, setTheme] = useState('LIGHT')

  useEffect(() => {
    function changeTheme(theme: string) {
      const body = document.body;
      if (theme === 'DARK') {
        body.setAttribute('theme-mode', 'dark');
        setTheme('DARK')
      } else {
        body.removeAttribute('theme-mode');
        setTheme('LIGHT')
      }
    }

    bitable.bridge.getTheme().then((theme) => {
      changeTheme(theme)
    })

    const offThemeChange = bitable.bridge.onThemeChange((res) => {
      changeTheme(res.data.theme)
    })

    return () => {
      offThemeChange()
    }
  }, [])

  // 1. 初始化 Dashboard 钩子
  const {
    state,
    isConfig
  } = useDashboard()

  // 获取所有工作表列表（用于数据源选择）
  const { tables, loading: tablesLoading } = useTables()

  // 当前配置状态（数据源、字段选择等）
  const [config, setConfig] = useState<BubbleChartConfig>({})

  // 根据选中的数据源表，获取数字字段、文本字段、类目字段和颜色分组字段列表
  const { fields, numericFields, textFields, categoryFields, colorGroupFields, loading: fieldsLoading, loadedTableId } = useFields(config.dataSource)

  // 获取数据源下的所有视图列表
  const { views, loading: viewsLoading } = useViews(config.dataSource)

  // 获取横轴字段的选项（如果是单选字段）
  // 重要：无论xFieldType是什么，都尝试获取选项。如果字段不是单选，useFieldOptions会返回空数组
  // 这样可以确保当字段从数值切换到单选时，选项能立即获取
  const { options: liveXFieldOptions } = useFieldOptions(
    config.dataSource,
    config.xField,
    true  // 总是获取选项，让hook内部根据字段类型决定返回什么
  )

  // 获取纵轴字段的选项（如果是单选字段）
  const { options: liveYFieldOptions } = useFieldOptions(
    config.dataSource,
    config.yField,
    true  // 总是获取选项
  )

  // 根据当前配置获取和处理气泡图数据
  // useData hook 现在会返回 data 和最终用于渲染的 options，以及自动检测出的轴类型
  const { data, loading: dataLoading, finalXOptions, finalYOptions, resolvedXType, resolvedYType } = useData(config, state, liveXFieldOptions, liveYFieldOptions)

  /**
   * useEffect: 组件挂载时加载已保存的配置（初始化）
   */
  useEffect(() => {
    const loadInitialConfig = async () => {
      // console.log('[App] 初始化加载配置，state:', state, 'isConfig:', isConfig)
      if (state !== 'create') {
        try {
          const savedConfig = await dashboard.getConfig()
          if (savedConfig.customConfig) {
            setConfig(savedConfig.customConfig as BubbleChartConfig)
          }
        } catch (error) {
          console.error('[App] 加载初始配置失败:', error)
        }
      }
    }
    loadInitialConfig()
  }, [])


  /**
   * useEffect: 全局事件监听 (真正的防抖 + 深度比对)
   * 修复：
   * 1. 使用 setTimeout 实现后置防抖，合并短时间内的多次事件
   * 2. 使用 JSON.stringify 进行内容比对，避免相同配置导致的重复渲染
   */
  useEffect(() => {
    let debounceTimer: number | undefined;

    // 1. 核心更新逻辑
    const fetchAndSetConfig = async () => {
      try {
        // console.log('[App] 防抖等待结束，开始获取配置...')
        const savedConfig = await dashboard.getConfig()

        if (savedConfig.customConfig) {
          const newConfig = savedConfig.customConfig as BubbleChartConfig

          // 【关键修复】函数式更新 + 深度比对
          // 只有当新配置和旧配置的内容真正不同时，才更新 state
          setConfig(prevConfig => {
            if (JSON.stringify(prevConfig) === JSON.stringify(newConfig)) {
              console.log('[App] 配置内容无变化，跳过视图更新')
              return prevConfig // 返回旧对象，React 会完全跳过这次渲染
            }
            console.log('[App] 配置有变化，执行更新')
            return newConfig
          })
        }
      } catch (error) {
        console.error('[App] 获取配置失败:', error)
      }
    }

    // 2. 防抖触发器 (Trailing Edge)
    // 收到事件不马上做，而是设定一个延时。如果延时内又有事件，就重置延时。
    const triggerUpdate = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }

      // 200ms 的窗口期足以覆盖 onConfigChange 和 onDataChange 的间隔
      debounceTimer = window.setTimeout(() => {
        fetchAndSetConfig()
      }, 200)
    }

    // 3. 注册监听
    console.log('[App] 注册全局事件监听器')

    const offConfigChange = dashboard.onConfigChange(() => {
      console.log('[App] 收到 onConfigChange -> 进入防抖队列')
      triggerUpdate()
    })

    const offDataChange = dashboard.onDataChange(() => {
      console.log('[App] 收到 onDataChange -> 进入防抖队列')
      triggerUpdate()
    })

    // 4. 清理
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      offConfigChange()
      offDataChange()
    }
  }, [])


  /**
   * useEffect: 自动填充 - 新建图表时选择第一个数据源
   */
  useEffect(() => {
    if (state === 'create' && tables.length > 0 && !config.dataSource) {
      handleConfigChange('dataSource', tables[0].id)
    }
  }, [state, tables, config.dataSource])


  /**
   * useEffect: 自动填充 - 当数据源变化且字段可用时，自动选择横轴和纵轴
   */
  useEffect(() => {
    if (!config.dataSource) return

    // 辅助函数：合并数字字段和类目字段
    const getCombinedFields = () => {
      const fieldMap = new Map()
      numericFields.forEach(f => fieldMap.set(f.id, f))
      categoryFields.forEach(f => fieldMap.set(f.id, f))
      return Array.from(fieldMap.values())
    }

    const combinedFields = getCombinedFields()

    // 只有在字段加载完成时才执行逻辑（即使字段数量为0也要执行，用于清空无效字段）
    // 【关键修复】必须确保当前加载的字段确实属于当前选中的数据源
    // 否则在切换数据源或初始加载时，可能会用旧的字段列表去校验新的配置，导致误判为字段不存在而重置
    if (!fieldsLoading && loadedTableId === config.dataSource) {
      setConfig(prev => {
        const updates: Partial<BubbleChartConfig> = {}

        // 验证当前选中的字段是否在新的字段列表中
        const currentXFieldExists = prev.xField ? combinedFields.some(f => f.id === prev.xField) : false
        const currentYFieldExists = prev.yField ? combinedFields.some(f => f.id === prev.yField) : false

        // 处理横轴
        if (!prev.xField || !currentXFieldExists) {
          if (combinedFields.length > 0) {
            // 如果有可用字段，选择第一个
            updates.xField = combinedFields[0].id
            const field = fields.find(f => f.id === combinedFields[0].id)
            if (field) {
              if (!field.isFormula) {
                updates.xFieldType = field.isCategory ? 'category' : 'number'
              }
            }
          } else {
            // 如果没有可用字段，清空横轴
            if (prev.xField) {
              updates.xField = undefined
              delete updates.xFieldType
            }
          }
        }

        // 处理纵轴
        if (!prev.yField || !currentYFieldExists) {
          if (combinedFields.length > 1) {
            // 如果有至少两个字段，选择第二个
            updates.yField = combinedFields[1].id
            const field = fields.find(f => f.id === combinedFields[1].id)
            if (field) {
              if (!field.isFormula) {
                updates.yFieldType = field.isCategory ? 'category' : 'number'
              }
            }
          } else {
            // 如果少于两个字段，清空纵轴
            if (prev.yField) {
              updates.yField = undefined
              delete updates.yFieldType
            }
          }
        }

        // 只有when有更新时才返回新对象
        if (Object.keys(updates).length > 0) {
          return { ...prev, ...updates }
        }
        return prev
      })
    }
  }, [config.dataSource, fieldsLoading, numericFields, categoryFields, fields, config.xField, config.yField, loadedTableId])


  /**
   * handleConfigChange - 处理配置字段变化
   */
  const handleConfigChange = (
    key: keyof BubbleChartConfig,
    value: string | number | boolean | any[] | Record<string, any> | undefined
  ) => {
    // const stringValue = typeof value === 'string' ? value : undefined
    // 修复：不再强制转换为 string，允许 boolean 等类型通过
    const finalValue = value

    setConfig(prev => {
      const newConfig: BubbleChartConfig = { ...prev, [key]: finalValue as any }

      // 当数据源变化时，重置所有字段选择和象限配置
      if (key === 'dataSource') {
        newConfig.viewId = undefined      // 重置为"全部数据"
        newConfig.xField = undefined       // 清空横轴
        newConfig.yField = undefined       // 清空纵轴
        newConfig.sizeField = undefined    // 清空气泡大小
        newConfig.nameField = undefined    // 清空气泡名称
        delete newConfig.xFieldType
        delete newConfig.yFieldType
        // 清空新格式象限配置
        newConfig.xThresholds = undefined
        newConfig.yThresholds = undefined
        newConfig.regions = undefined
        // 清空旧格式象限配置（向后兼容）
        newConfig.xThreshold = undefined
        newConfig.yThreshold = undefined
        newConfig.quadrantTLName = undefined
        newConfig.quadrantTLColor = undefined
        newConfig.quadrantTRName = undefined
        newConfig.quadrantTRColor = undefined
        newConfig.quadrantBLName = undefined
        newConfig.quadrantBLColor = undefined
        newConfig.quadrantBRName = undefined
        newConfig.quadrantBRColor = undefined
        // 清空颜色分组配置
        newConfig.colorGroupType = undefined
        newConfig.colorGroupField = undefined
        return newConfig
      }


      // 当横轴字段变化时，检测字段类型
      if (key === 'xField' && typeof finalValue === 'string') {
        const field = fields.find(f => f.id === finalValue)
        if (field) {
          // 如果是公式字段，不设置 xFieldType，让 useData 自动检测
          if (field.isFormula) {
            delete newConfig.xFieldType
          } else {
            // 否则根据是否为类目字段决定
            newConfig.xFieldType = field.isCategory ? 'category' : 'number'
          }
        }
      }

      // 当纵轴字段变化时，检测字段类型
      if (key === 'yField' && typeof finalValue === 'string') {
        const field = fields.find(f => f.id === finalValue)
        if (field) {
          // 如果是公式字段，不设置 yFieldType，让 useData 自动检测
          if (field.isFormula) {
            delete newConfig.yFieldType
          } else {
            newConfig.yFieldType = field.isCategory ? 'category' : 'number'
          }
        }
      }

      return newConfig
    })
  }

  /**
   * handleSave - 保存配置
   */
  const handleSave = async () => {
    console.log('[App] 开始保存配置')

    const latestConfig = config
    if (!latestConfig.dataSource || !latestConfig.xField || !latestConfig.yField) {
      console.log('[App] 配置不完整，无法保存')
      return
    }

    const { dataSource, xField, yField, sizeField, nameField } = latestConfig

    const series: ISeries[] = [{ fieldId: xField, rollup: Rollup.SUM }, { fieldId: yField, rollup: Rollup.SUM }]

    if (sizeField) {
      series.push({ fieldId: sizeField, rollup: Rollup.SUM }) // sizeField 总是数值类型
    }

    const dataConditions = {
      tableId: dataSource,
      groups: nameField ? [{ fieldId: nameField }] : [],
      series: series,
    }

    const configToSave: BubbleChartConfig = {
      ...latestConfig,
      xFieldOptions: latestConfig.xFieldType === 'category' ? liveXFieldOptions : undefined,
      yFieldOptions: latestConfig.yFieldType === 'category' ? liveYFieldOptions : undefined,
    }

    try {
      await dashboard.saveConfig({
        // @ts-ignore - TypeScript 类型推导限制
        dataConditions: dataConditions,
        customConfig: configToSave
      })

      console.log('[App] 配置保存成功')
      // 保存成功后，不再需要手动更新本地 state
      // 全局的 onConfigChange 监听器会接收到通知，并自动从服务器获取最新配置来更新 state，从而保证了单一数据源
    } catch (error) {
      console.error('[App] 保存配置失败:', error)
    }
  }

  /**
   * renderContent - 根据当前状态渲染不同内容
   */
  const renderContent = () => {
    // console.log('[App] 渲染图表，state:', state, 'data.length:', data?.length)

    // 辅助函数：合并数字字段和类目字段，并标注字段类型
    const getCombinedFieldsWithType = () => {
      // 使用 Map 去重
      const fieldMap = new Map()

      // 添加数字字段
      numericFields.forEach(f => fieldMap.set(f.id, f))
      // 添加类目字段
      categoryFields.forEach(f => fieldMap.set(f.id, f))

      return Array.from(fieldMap.values()).map(field => {
        const isCategory = categoryFields.some(f => f.id === field.id)
        const isNumeric = numericFields.some(f => f.id === field.id)

        let typeLabel = ''
        if (field.isFormula) {
          typeLabel = `${field.name}`
        } else if (isCategory && isNumeric) {
          typeLabel = `${field.name}`
        } else if (isCategory) {
          typeLabel = `${field.name}`
        } else {
          typeLabel = `${field.name}`
        }

        return {
          id: field.id,
          name: field.name,
          typeLabel: typeLabel
        }
      })
    }
    if (!isConfig) {
      return (
        <div style={{
          width: '100%',
          height: '100%',
          background: 'transparent'
        }}>
          <BubbleChart
            theme={theme}
            config={config}
            data={data}
            xFieldName={config.xField ? numericFields.find(f => f.id === config.xField)?.name || categoryFields.find(f => f.id === config.xField)?.name : undefined}
            yFieldName={config.yField ? numericFields.find(f => f.id === config.yField)?.name || categoryFields.find(f => f.id === config.yField)?.name : undefined}
            sizeFieldName={config.sizeField ? numericFields.find(f => f.id === config.sizeField)?.name || categoryFields.find(f => f.id === config.sizeField)?.name : undefined}
            nameFieldName={config.nameField ? textFields.find(f => f.id === config.nameField)?.name : undefined}
            showLabel={config.showLabel}
            loading={dataLoading}
            xAxisType={resolvedXType === 'number' ? 'value' : 'category'}
            yAxisType={resolvedYType === 'number' ? 'value' : 'category'}
            xAxisData={finalXOptions}
            yAxisData={finalYOptions}
            xIsPercentage={fields.find(f => f.id === config.xField)?.isPercentage}
            yIsPercentage={fields.find(f => f.id === config.yField)?.isPercentage}
            sizeIsPercentage={fields.find(f => f.id === config.sizeField)?.isPercentage}
            enableMultiColor={config.enableMultiColor}
          />
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', height: '100%' }}>
        {/* 左侧：图表预览区域（配置状态时显示） */}
        <div style={{ flex: 1, padding: '0px', display: 'flex', flexDirection: 'column' }}>
          <div style={{
            flex: 1,
            background: 'transparent',
            borderRadius: '8px',
            minHeight: 0  // 防止 flex 布局出现不必要滚动
          }}>
            <BubbleChart
              theme={theme}
              config={config}
              data={data}
              xFieldName={config.xField ? numericFields.find(f => f.id === config.xField)?.name || categoryFields.find(f => f.id === config.xField)?.name : undefined}
              yFieldName={config.yField ? numericFields.find(f => f.id === config.yField)?.name || categoryFields.find(f => f.id === config.yField)?.name : undefined}
              sizeFieldName={config.sizeField ? numericFields.find(f => f.id === config.sizeField)?.name || categoryFields.find(f => f.id === config.sizeField)?.name : undefined}
              nameFieldName={config.nameField ? textFields.find(f => f.id === config.nameField)?.name : undefined}
              showLabel={config.showLabel}
              loading={dataLoading}
              xAxisType={resolvedXType === 'number' ? 'value' : 'category'}
              yAxisType={resolvedYType === 'number' ? 'value' : 'category'}
              xAxisData={finalXOptions}
              yAxisData={finalYOptions}
              xIsPercentage={fields.find(f => f.id === config.xField)?.isPercentage}
              yIsPercentage={fields.find(f => f.id === config.yField)?.isPercentage}
              sizeIsPercentage={fields.find(f => f.id === config.sizeField)?.isPercentage}
              enableMultiColor={config.enableMultiColor}
            />
          </div>
        </div>

        {/* 右侧：配置面板 */}
        <div style={{
          width: '340px',  // 固定宽度，不会随窗口大小变化
          minWidth: '340px',
          maxWidth: '340px',
          borderLeft: '1px solid var(--semi-color-border)',  // 左侧边框分隔预览区域
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden'
        }}>
          {/* 配置内容：可滚动区域 */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', width: '100%' }}>
            <Tabs
              type="line"
              className="custom-tabs"
              style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}
              tabBarStyle={{ padding: '0 16px' }}
              contentStyle={{
                flex: 1,
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: '20px',
                boxSizing: 'border-box',
                width: '100%',
                scrollbarWidth: 'none',  // Firefox
                msOverflowStyle: 'none'  // IE/Edge
              }}
            >
              <TabPane tab={t('tab.bubble')} itemKey="bubble">
                {/* 数据源选择：必须先选择数据源，才会显示其他字段 */}
                <div style={{ marginBottom: '20px' }}>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>{t('label.dataSource')}</Text>
                  <Select
                    value={config.dataSource}
                    onChange={(value) => handleConfigChange('dataSource', value)}
                    placeholder={t('placeholder.selectWorksheet')}
                    style={{ width: '100%' }}
                    loading={tablesLoading}
                    filter
                  >
                    {tables.map(table => (
                      <Select.Option key={table.id} value={table.id}>
                        {table.name}
                      </Select.Option>
                    ))}
                  </Select>
                </div>

                {/* 数据范围选择：仅在选中数据源后显示 */}
                {config.dataSource && (
                  <div style={{ marginBottom: '20px' }}>
                    <Text strong style={{ display: 'block', marginBottom: 8 }}>{t('label.dataRange')}</Text>
                    <Select
                      value={config.viewId}
                      onChange={(value) => handleConfigChange('viewId', value)}
                      placeholder={t('placeholder.allData')}
                      style={{ width: '100%' }}
                      loading={viewsLoading}
                      filter
                    >
                      <Select.Option value={undefined}>{t('placeholder.allData')}</Select.Option>
                      {views.map(view => (
                        <Select.Option key={view.id} value={view.id}>
                          {view.name}
                        </Select.Option>
                      ))}
                    </Select>
                  </div>
                )}

                {/* 字段选择器：仅在选中数据源后显示 */}
                {config.dataSource && (
                  <>
                    {/* 横轴：必选，支持数字字段和单选字段（类目） */}
                    <FieldSelect
                      label={t('label.xAxis')}
                      value={config.xField}
                      onChange={(value) => handleConfigChange('xField', value)}
                      fields={getCombinedFieldsWithType()}
                      loading={fieldsLoading}
                      placeholder={t('placeholder.selectField')}
                    />


                    {/* 纵轴：必选，支持数字字段和单选字段（类目） */}
                    <FieldSelect
                      label={t('label.yAxis')}
                      value={config.yField}
                      onChange={(value) => handleConfigChange('yField', value)}
                      fields={getCombinedFieldsWithType()}
                      loading={fieldsLoading}
                      placeholder={t('placeholder.selectField')}
                    />


                    {/* 气泡大小：可选，仅支持数值类型（包括数值公式） */}
                    <FieldSelect
                      label={t('label.bubbleSize')}
                      value={config.sizeField}
                      onChange={(value) => handleConfigChange('sizeField', value)}
                      fields={numericFields.filter(f => f.type !== 3 || f.isNumericFormula)} // 3 is FieldType.Formula. Using literal or import if available. Better to use property check.
                      loading={fieldsLoading}
                      placeholder={t('placeholder.selectNumericField')}
                      showClear={true}
                    />

                    {/* 气泡名称：选填，必须为文本字段 */}
                    <FieldSelect
                      label={t('label.bubbleName')}
                      value={config.nameField}
                      onChange={(value) => handleConfigChange('nameField', value)}
                      fields={textFields}
                      loading={fieldsLoading}
                      placeholder={t('placeholder.selectTextField')}
                      showClear={true}
                      tooltip={t('tooltip.bubbleName')}
                    />

                    {/* 多彩模式和名称常显复选框 */}
                    <div style={{ marginBottom: '20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                        <Checkbox
                          checked={config.enableMultiColor || false}
                          onChange={(e: any) => handleConfigChange('enableMultiColor', e.target.checked)}
                        >
                          <Text>{t('label.multiColor')}</Text>
                        </Checkbox>

                        {config.nameField && (
                          <Checkbox
                            checked={config.showLabel || false}
                            onChange={(e: any) => handleConfigChange('showLabel', e.target.checked)}
                          >
                            <Text>{t('label.showLabel')}</Text>
                          </Checkbox>
                        )}

                        <div style={{ marginLeft: 'auto' }}>
                          <a
                            href="https://ai.feishu.cn/wiki/EbYewxi0yiUfd1kV8Jhccsp5nwh"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: 'var(--semi-color-info)',
                              textDecoration: 'none',
                              fontSize: '14px',
                              fontWeight: 'normal',
                              cursor: 'pointer'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--semi-color-info-hover)'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--semi-color-info)'}
                          >
                            更多说明
                          </a>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </TabPane>
              <TabPane tab={t('tab.quadrant')} itemKey="quadrant">
                {(!config.dataSource || !config.xField || !config.yField) ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--semi-color-text-1)' }}>
                    {t('message.completeConfigFirst')}
                  </div>
                ) : (
                  <QuadrantConfigPanel
                    config={config}
                    resolvedXType={resolvedXType}
                    resolvedYType={resolvedYType}
                    finalXOptions={finalXOptions}
                    finalYOptions={finalYOptions}
                    data={data}
                    handleConfigChange={handleConfigChange}
                    t={t}
                  />
                )}
              </TabPane>

              <TabPane tab={t('tab.advanced')} itemKey="advanced">
                {(!config.dataSource || !config.xField || !config.yField) ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--semi-color-text-1)' }}>
                    {t('message.completeConfigFirst')}
                  </div>
                ) : (
                  <div>
                    {/* 颜色分组选择器 */}
                    <div style={{ marginBottom: '20px' }}>
                      {/* 标题行：包含标签和清除按钮 */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text strong>{t('label.colorGroup')}</Text>
                        {/* 已选择时显示清除按钮 */}
                        {(config.colorGroupType) && (
                          <span
                            style={{ cursor: 'pointer', fontSize: '12px', userSelect: 'none', color: 'var(--semi-color-text-1)' }}
                            onClick={() => {
                              handleConfigChange('colorGroupType', undefined)
                              handleConfigChange('colorGroupField', undefined)
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--semi-color-primary)'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--semi-color-text-1)'}
                          >
                            {t('label.clear')}
                          </span>
                        )}
                      </div>
                      <Select
                        value={config.colorGroupType === 'quadrant' ? '__quadrant__' : config.colorGroupField}
                        onChange={(value) => {
                          if (value === '__quadrant__') {
                            handleConfigChange('colorGroupType', 'quadrant')
                            handleConfigChange('colorGroupField', undefined)
                          } else if (value) {
                            handleConfigChange('colorGroupType', 'field')
                            handleConfigChange('colorGroupField', value)
                          } else {
                            handleConfigChange('colorGroupType', undefined)
                            handleConfigChange('colorGroupField', undefined)
                          }
                        }}
                        placeholder={t('placeholder.selectColorGroup')}
                        style={{ width: '100%' }}
                        filter
                      >
                        {/* 如果配置了象限（有分割线），显示象限选项 */}
                        {(config.xThreshold || config.yThreshold) && (
                          <Select.Option value="__quadrant__">{t('option.quadrant')}</Select.Option>
                        )}
                        {/* 可选的字段选项 */}
                        {colorGroupFields.map(field => (
                          <Select.Option key={field.id} value={field.id}>{field.name}</Select.Option>
                        ))}
                      </Select>
                    </div>
                  </div>
                )}
              </TabPane>
            </Tabs>
          </div>

          {/* 底部按钮区域：固定在底部 */}
          <div style={{ height: '40px', padding: '15px 20px', borderTop: '1px solid var(--semi-color-border)', background: 'transparent' }}>
            <Button
              type="primary"
              theme="solid"
              style={{ width: '100%' }}  // 按钮占满宽度
              loading={dataLoading}
              disabled={!config.dataSource || !config.xField || !config.yField}  // 必填项未选择时禁用
              onClick={handleSave}
            >
              {t('button.saveAndView')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  /**
   * 组件根渲染函数
   *
   * 功能：渲染整个应用的根容器
   * 样式：
   * - 占满整个视口（100% 宽度，100vh 高度）
   * - 隐藏溢出内容（overflow: hidden）
   * - 相对定位（position: relative）
   *
   * 内容：通过 renderContent() 根据当前状态渲染不同内容
   */
  return (
    <div style={{
      width: '100%',
      height: '100vh',
      overflow: 'hidden',  // 防止出现滚动条
      position: 'relative',
      borderTop: isConfig ? '1px solid var(--semi-color-border)' : 'none', // 配置模式下添加顶部边框
      boxSizing: 'border-box' // 确保边框包含在高度内，防止溢出
    }}>
      {renderContent()}
    </div>
  )
}

export default App
