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
import { Button, Typography, Select } from '@douyinfe/semi-ui'
import { dashboard, Rollup, type ISeries } from '@lark-base-open/js-sdk'
import { useDashboard, useTables, useFields, type BubbleChartConfig } from './hooks/useDashboard'
import { useFieldOptions } from './hooks/useFieldOptions'
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
}> = ({ label, value, onChange, fields, loading, placeholder }) => (
  <div style={{ marginBottom: '20px' }}>
    <Text strong style={{ display: 'block', marginBottom: 8 }}>{label}：</Text>
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
  const { numericFields, textFields, categoryFields, loading: fieldsLoading } = useFields(config.dataSource)

  // 获取横轴字段的选项（如果是单选字段）
  // 重要：无论xFieldType是什么，都尝试获取选项。如果字段不是单选，useFieldOptions会返回空数组
  // 这样可以确保当字段从数值切换到单选时，选项能立即获取
  const { options: xFieldOptionsFromHook } = useFieldOptions(
    config.dataSource,
    config.xField,
    true  // 总是获取选项，让hook内部根据字段类型决定返回什么
  )

  // 获取纵轴字段的选项（如果是单选字段）
  const { options: yFieldOptionsFromHook } = useFieldOptions(
    config.dataSource,
    config.yField,
    true  // 总是获取选项
  )

  // 根据当前状态选择使用 config 中的选项（view 状态）还是 hook 返回的选项（config 状态）
  // 原因：view 状态下，config 中的选项是服务器保存的权威数据
  // config 状态下，hook 返回的选项是实时获取的最新数据
  const xFieldOptions = state === 'view' || state === 'fullscreen'
    ? config.xFieldOptions || xFieldOptionsFromHook
    : xFieldOptionsFromHook

  const yFieldOptions = state === 'view' || state === 'fullscreen'
    ? config.yFieldOptions || yFieldOptionsFromHook
    : yFieldOptionsFromHook

  // 根据当前配置获取和处理气泡图数据
  // 关键修复：移除 xFieldOptions, yFieldOptions 参数，让 useData 只依赖 config
  const { data, loading: dataLoading } = useData(config, state)


  /**
   * useEffect: 同步字段选项至 config state
   * 目的：确保 config 对象始终是单一数据源，尤其是在 config 预览模式下。
   * 逻辑：监听 useFieldOptions 返回的实时选项，当其变化时，更新到 config state 中。
   *      这修复了预览模式下，图表因拿不到选项数据而不显示的 bug。
   */
  useEffect(() => {
    const newOptions: Partial<BubbleChartConfig> = {}
    let needsUpdate = false

    if (config.xFieldType === 'category' && xFieldOptionsFromHook !== config.xFieldOptions) {
      newOptions.xFieldOptions = xFieldOptionsFromHook
      needsUpdate = true
    }
    if (config.yFieldType === 'category' && yFieldOptionsFromHook !== config.yFieldOptions) {
      newOptions.yFieldOptions = yFieldOptionsFromHook
      needsUpdate = true
    }

    if (needsUpdate) {
      setConfig(prev => ({ ...prev, ...newOptions }))
    }
  }, [xFieldOptionsFromHook, yFieldOptionsFromHook, config.xFieldType, config.yFieldType])


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
   * useEffect: 全局事件监听
   * 修复：确保在组件挂载后立刻开始监听，并为刷新逻辑添加防抖，防止重复执行
   */
  useEffect(() => {
    let lastUpdateTime = 0;
    const DEBOUNCE_TIME = 500; // ms

    // 定义通用的更新函数
    const updateConfig = async () => {
      const now = Date.now();
      if (now - lastUpdateTime < DEBOUNCE_TIME) {
        console.log('[App] 刷新事件过于频繁，已忽略');
        return;
      }
      lastUpdateTime = now;

      console.log('[App] 收到变更通知，准备刷新配置')
      try {
        // 无论当前本地 state 是什么，直接获取最新的权威配置
        const savedConfig = await dashboard.getConfig()
        if (savedConfig.customConfig) {
          console.log('[App] 获取到最新配置，更新状态')
          setConfig(savedConfig.customConfig as BubbleChartConfig)
        }
      } catch (error) {
        console.error('[App] 获取配置失败:', error)
      }
    }

    // 1. 监听配置变化 (最核心修复：解决混合轴切换不刷新的问题)
    const offConfigChange = dashboard.onConfigChange(() => {
      console.log('[App] onConfigChange 触发')
      updateConfig()
    })

    // 2. 监听数据变化 (感知表格内容修改)
    const offDataChange = dashboard.onDataChange(() => {
      console.log('[App] onDataChange 触发')
      updateConfig()
    })

    // 组件卸载时取消监听
    return () => {
      offConfigChange()
      offDataChange()
    }
  }, []) // 依赖数组为空，只在挂载时注册一次

  /**
   * handleConfigChange - 处理配置字段变化
   */
  const handleConfigChange = (
    key: keyof BubbleChartConfig,
    value: string | number | any[] | Record<string, any> | undefined
  ) => {
    const stringValue = typeof value === 'string' ? value : undefined

    setConfig(prev => {
      const newConfig = { ...prev, [key]: stringValue }

      // 当横轴字段变化时，检测字段类型
      if (key === 'xField' && stringValue) {
        const isCategory = categoryFields.some(f => f.id === stringValue)
        // console.log('[App] xField修改为:', stringValue, '类型:', isCategory ? '类目' : '数值')
        newConfig.xFieldType = isCategory ? 'category' : 'number'
      }

      // 当纵轴字段变化时，检测字段类型
      if (key === 'yField' && stringValue) {
        const isCategory = categoryFields.some(f => f.id === stringValue)
        // console.log('[App] yField修改为:', stringValue, '类型:', isCategory ? '类目' : '数值')
        newConfig.yFieldType = isCategory ? 'category' : 'number'
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

    // 优化：根据字段类型选择聚合方式
    // 类目轴用 COUNTA (计数)，数值轴用 SUM (求和)
    // 这样能确保飞书后端能感知到数据的有效变化
    const getRollupType = (fieldType?: 'number' | 'category') => {
      return fieldType === 'category' ? Rollup.COUNTA : Rollup.SUM
    }

    const series: ISeries[] = [
      { fieldId: xField, rollup: getRollupType(latestConfig.xFieldType) },
      { fieldId: yField, rollup: getRollupType(latestConfig.yFieldType) }
    ]

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
      xFieldOptions: latestConfig.xFieldType === 'category' ? xFieldOptions : undefined,
      yFieldOptions: latestConfig.yFieldType === 'category' ? yFieldOptions : undefined,
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
      const allFields = [...numericFields, ...categoryFields]
      return allFields.map(field => {
        const isCategory = categoryFields.some(f => f.id === field.id)
        return {
          id: field.id,
          name: field.name,
          typeLabel: isCategory ? `${field.name}（类目）` : `${field.name}（数值）`
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
            loading={dataLoading}
            xAxisType={config.xFieldType === 'category' ? 'category' : 'value'}
            yAxisType={config.yFieldType === 'category' ? 'category' : 'value'}
            xAxisData={config.xFieldType === 'category' ? xFieldOptions : undefined}
            yAxisData={config.yFieldType === 'category' ? yFieldOptions : undefined}
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
              loading={dataLoading}
              xAxisType={config.xFieldType === 'category' ? 'category' : 'value'}
              yAxisType={config.yFieldType === 'category' ? 'category' : 'value'}
              xAxisData={config.xFieldType === 'category' ? xFieldOptions : undefined}
              yAxisData={config.yFieldType === 'category' ? yFieldOptions : undefined}
            />
          </div>
        </div>

        {/* 右侧：配置面板 */}
        <div style={{
          width: '340px',  // 固定宽度，不会随窗口大小变化
          borderLeft: '1px solid #e0e0e0',  // 左侧边框分隔预览区域
          background: '#fafafa',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* 配置内容：可滚动区域 */}
          <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>

            {/* 数据源选择：必须先选择数据源，才会显示其他字段 */}
            <div style={{ marginBottom: '20px' }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>数据源：</Text>
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

            {/* 字段选择器：仅在选中数据源后显示 */}
            {config.dataSource && (
              <>
                {/* 横轴：必选，支持数字字段和单选字段（类目） */}
                <FieldSelect
                  label="横轴（必选）"
                  value={config.xField}
                  onChange={(value) => handleConfigChange('xField', value)}
                  fields={getCombinedFieldsWithType()}
                  loading={fieldsLoading}
                  placeholder="选择字段"
                />

                {/* 纵轴：必选，支持数字字段和单选字段（类目） */}
                <FieldSelect
                  label="纵轴（必选）"
                  value={config.yField}
                  onChange={(value) => handleConfigChange('yField', value)}
                  fields={getCombinedFieldsWithType()}
                  loading={fieldsLoading}
                  placeholder="选择字段"
                />

                {/* 气泡大小：选填，必须为数字字段 */}
                <FieldSelect
                  label="气泡大小（选填）"
                  value={config.sizeField}
                  onChange={(value) => handleConfigChange('sizeField', value)}
                  fields={numericFields}
                  loading={fieldsLoading}
                  placeholder="选择字段"
                />

                {/* 气泡名称：选填，必须为文本字段 */}
                <FieldSelect
                  label="气泡名称（选填）"
                  value={config.nameField}
                  onChange={(value) => handleConfigChange('nameField', value)}
                  fields={textFields}
                  loading={fieldsLoading}
                  placeholder="选择字段"
                />
              </>
            )}
          </div>

          {/* 底部按钮区域：固定在底部 */}
          <div style={{ height: '40px', padding: '16px 20px', borderTop: '1px solid #e0e0e0', background: '#ffffff' }}>
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
      position: 'relative'
    }}>
      {renderContent()}
    </div>
  )
}

export default App
