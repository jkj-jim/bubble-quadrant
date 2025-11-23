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

import { useState, useEffect } from 'react'
import { Button, Typography, Select, Tooltip, Checkbox } from '@douyinfe/semi-ui'
import { IconIssueStroked } from '@douyinfe/semi-icons'
import { dashboard, Rollup, type ISeries } from '@lark-base-open/js-sdk'
import { useDashboard, useTables, useFields, type BubbleChartConfig } from './hooks/useDashboard'
import { useFieldOptions } from './hooks/useFieldOptions'
import { useViews } from './hooks/useViews'
import { useData3 as useData } from './hooks/useData3'
import { BubbleChart } from './components/BubbleChart'

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
          <Text
            type="secondary"
            style={{ cursor: 'pointer', fontSize: '12px', userSelect: 'none' }}
            onClick={() => onChange(undefined)}
          >
            清除
          </Text>
        )}
      </div>
      <Select
        value={value}
        onChange={onChange}
        placeholder={placeholder || '请选择字段'}
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
  // 获取仪表盘状态（create/config/view/fullscreen）和是否配置状态
  const { state, isConfig } = useDashboard()

  // 获取所有工作表列表（用于数据源选择）
  const { tables, loading: tablesLoading } = useTables()

  // 当前配置状态（数据源、字段选择等）
  const [config, setConfig] = useState<BubbleChartConfig>({})

  // 根据选中的数据源表，获取数字字段、文本字段和类目字段列表
  const { fields, numericFields, textFields, categoryFields, loading: fieldsLoading } = useFields(config.dataSource)

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
    if (!fieldsLoading) {
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
  }, [config.dataSource, fieldsLoading, numericFields, categoryFields, fields, config.xField, config.yField])


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

      // 当数据源变化时，重置所有字段选择
      if (key === 'dataSource') {
        newConfig.viewId = undefined      // 重置为"全部数据"
        newConfig.xField = undefined       // 清空横轴
        newConfig.yField = undefined       // 清空纵轴
        newConfig.sizeField = undefined    // 清空气泡大小
        newConfig.nameField = undefined    // 清空气泡名称
        delete newConfig.xFieldType
        delete newConfig.yFieldType
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
          background: state === 'fullscreen' ? 'transparent' : '#ffffff'
        }}>
          <BubbleChart
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
            background: '#ffffff',
            borderRadius: '8px',
            minHeight: 0  // 防止 flex 布局出现不必要滚动
          }}>
            <BubbleChart
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
          borderLeft: '1px solid #e0e0e0',  // 左侧边框分隔预览区域
          // background: '#fafafa',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* 配置内容：可滚动区域 */}
          <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>

            {/* 数据源选择：必须先选择数据源，才会显示其他字段 */}
            <div style={{ marginBottom: '20px' }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>数据源</Text>
              <Select
                value={config.dataSource}
                onChange={(value) => handleConfigChange('dataSource', value)}
                placeholder="请选择工作表"
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
                <Text strong style={{ display: 'block', marginBottom: 8 }}>数据范围</Text>
                <Select
                  value={config.viewId}
                  onChange={(value) => handleConfigChange('viewId', value)}
                  placeholder="全部数据"
                  style={{ width: '100%' }}
                  loading={viewsLoading}
                  filter
                >
                  <Select.Option value={undefined}>全部数据</Select.Option>
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
                  label="横轴"
                  value={config.xField}
                  onChange={(value) => handleConfigChange('xField', value)}
                  fields={getCombinedFieldsWithType()}
                  loading={fieldsLoading}
                  placeholder="选择字段"
                />


                {/* 纵轴：必选，支持数字字段和单选字段（类目） */}
                <FieldSelect
                  label="纵轴"
                  value={config.yField}
                  onChange={(value) => handleConfigChange('yField', value)}
                  fields={getCombinedFieldsWithType()}
                  loading={fieldsLoading}
                  placeholder="选择字段"
                />


                {/* 气泡大小：可选，仅支持数值类型（包括数值公式） */}
                <FieldSelect
                  label="气泡大小"
                  value={config.sizeField}
                  onChange={(value) => handleConfigChange('sizeField', value)}
                  fields={numericFields.filter(f => f.type !== 3 || f.isNumericFormula)} // 3 is FieldType.Formula. Using literal or import if available. Better to use property check.
                  loading={fieldsLoading}
                  placeholder="选择数值字段"
                  showClear={true}
                />

                {/* 气泡名称：选填，必须为文本字段 */}
                <FieldSelect
                  label="气泡名称"
                  value={config.nameField}
                  onChange={(value) => handleConfigChange('nameField', value)}
                  fields={textFields}
                  loading={fieldsLoading}
                  placeholder="选择文本字段"
                  showClear={true}
                  tooltip="如果为空，则显示所有数据；如果不为空，则只显示该字段不为空的数据"
                />

                {/* 多彩模式和名称常显复选框 */}
                <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '24px' }}>
                  <Checkbox
                    checked={config.enableMultiColor || false}
                    onChange={(e: any) => handleConfigChange('enableMultiColor', e.target.checked)}
                  >
                    <Text>多彩气泡</Text>
                  </Checkbox>

                  {config.nameField && (
                    <Checkbox
                      checked={config.showLabel || false}
                      onChange={(e: any) => handleConfigChange('showLabel', e.target.checked)}
                    >
                      <Text>名称常显</Text>
                    </Checkbox>
                  )}
                </div>
              </>
            )}
          </div>

          {/* 底部按钮区域：固定在底部 */}
          <div style={{ height: '40px', padding: '15px 20px', borderTop: '1px solid #e0e0e0', background: '#ffffff' }}>
            <Button
              type="primary"
              theme="solid"
              style={{ width: '100%' }}  // 按钮占满宽度
              loading={dataLoading}
              disabled={!config.dataSource || !config.xField || !config.yField}  // 必填项未选择时禁用
              onClick={handleSave}
            >
              保存并查看
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
      borderTop: isConfig ? '1px solid #e0e0e0' : 'none', // 配置模式下添加顶部边框
      boxSizing: 'border-box' // 确保边框包含在高度内，防止溢出
    }}>
      {renderContent()}
    </div>
  )
}

export default App
