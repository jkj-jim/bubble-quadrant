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
 * - fields: 字段列表（id 和 name）
 * - loading: 加载状态
 * - placeholder: 占位文本
 */
const FieldSelect: React.FC<{
  label: string
  value?: string
  onChange: (value: string | number | any[] | Record<string, any> | undefined) => void
  fields: Array<{ id: string; name:string }>
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
          {field.name}
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

  // 刷新计数器：用于保存配置后手动触发图表刷新
  // 因为 useData hook 监听 config 变化，改变 refreshKey 会促使重新计算数据
  const [refreshKey, setRefreshKey] = useState(0)

  // 根据选中的数据源表，获取数字字段和文本字段列表
  const { numericFields, textFields, loading: fieldsLoading } = useFields(config.dataSource)

  // 根据当前配置获取和处理气泡图数据
  const { data, loading: dataLoading } = useData(config, state, refreshKey)

  /**
   * useEffect: 组件挂载时加载已保存的配置（初始化）
   *
   * 触发时机：组件首次挂载时
   * 执行逻辑：
   * - 如果不是 create 状态（即不是新建），从飞书服务器获取已保存的配置
   * - 如果获取到配置，更新 config state
   *
   * 重要说明：必须使用 state !== 'create' 而不是 !isConfig
   * 原因：当从 view 切换到 config 时，isConfig 为 true，但我们需要加载配置
   * 若使用 !isConfig 会导致配置无法加载（已在 FEISHU_DASHBOARD_TIPS.md 中记录此坑）
   */
  useEffect(() => {
    const loadInitialConfig = async () => {
      if (state !== 'create') {
        try {
          const savedConfig = await dashboard.getConfig()
          if (savedConfig.customConfig) {
            setConfig(savedConfig.customConfig as BubbleChartConfig)
          }
        } catch (error) {
          console.error('[App] ❌ 加载初始配置失败:', error)
        }
      }
    }
    loadInitialConfig()
  }, [])

  /**
   * useEffect: 监听数据变化（用于 view/fullscreen 状态）
   *
   * 触发时机：state 从 create 变为 view/fullscreen 时
   * 执行逻辑：
   * - 仅在 view 或 fullscreen 状态下监听 onDataChange 事件
   * - 当数据变化时，重新获取最新配置并更新 config state
   * - 通过 config state 的变化触发 useData hook 重新计算数据
   *
   * 设计背景：
   * - 解决 config → view 切换后数据不同步的问题
   * - 采用权威配置模式：onDataChange → getConfig → setConfig
   * - 彻底消除竞态条件，保证数据流向单一、可预测
   */
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    if (state === 'view' || state === 'fullscreen') {
      unsubscribe = dashboard.onDataChange(async () => {
        try {
          const savedConfig = await dashboard.getConfig()
          if (savedConfig.customConfig) {
            setConfig(savedConfig.customConfig as BubbleChartConfig)
          }
        } catch (error) {
          console.error('[App] ❌ onDataChange 回调中加载配置失败:', error)
        }
      })
    }

    // 清理函数：组件卸载时取消事件监听
    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [state])

  /**
   * handleConfigChange - 处理配置字段变化
   *
   * 功能：统一处理所有配置字段的变更
   * 逻辑：
   * - 接收字段名和新值
   * - 如果是字符串值，更新到 config state 中
   * - 非字符串值设为 undefined（确保类型安全）
   *
   * 使用场景：所有字段选择器（数据源、横轴、纵轴、大小、名称）的选择变化
   */
  const handleConfigChange = (
    key: keyof BubbleChartConfig,
    value: string | number | any[] | Record<string, any> | undefined
  ) => {
    setConfig(prev => ({ ...prev, [key]: typeof value === 'string' ? value : undefined }))
  }

  /**
   * handleSave - 保存配置
   *
   * 功能：
   * 1. 校验必要字段（数据源、横轴、纵轴）
   * 2. 构建符合飞书 SDK 要求的 dataConditions
   * 3. 调用 dashboard.saveConfig() 保存配置到服务器
   * 4. 触发 refreshKey 变化，更新预览图表
   *
   * dataConditions 结构：
   * - tableId: 数据源表 ID
   * - groups: 分组字段（可选，用于气泡名称）
   * - series: 系列字段配置（包含聚合方式，如 SUM）
   *
   * 注意：需要 @ts-ignore 因为 TypeScript 对 dataConditions 的类型推导存在限制
   */
  const handleSave = async () => {
    const latestConfig = config
    if (!latestConfig.dataSource || !latestConfig.xField || !latestConfig.yField) {
      return
    }

    const { dataSource, xField, yField, sizeField, nameField } = latestConfig
    const series: ISeries[] = [{ fieldId: xField, rollup: Rollup.SUM }, { fieldId: yField, rollup: Rollup.SUM }]
    if (sizeField) {
      series.push({ fieldId: sizeField, rollup: Rollup.SUM })
    }

    const dataConditions = {
      tableId: dataSource,
      groups: nameField ? [{ fieldId: nameField }] : [],
      series: series,
    }

    try {
      await dashboard.saveConfig({
        // @ts-ignore - TypeScript 类型推导限制
        dataConditions: dataConditions,
        customConfig: latestConfig
      })
      setRefreshKey(k => k + 1)

    } catch (error) {
      console.error('[App] ❌ 保存配置失败:', error)
    }
  }

  /**
   * renderContent - 根据当前状态渲染不同内容
   *
   * 渲染逻辑分为两类：
   *
   * 1. 查看状态（view/fullscreen）：
   *    - 全屏显示气泡图
   *    - 背景色：fullscreen 状态为透明，view 状态为白色
   *    - 从 savedConfig 中获取字段名传递给 BubbleChart
   *    - 显示加载状态
   *
   * 2. 配置状态（config/create）：
   *    - 左侧：图表预览区域（实时预览配置效果）
   *    -    - 宽度自适应（flex: 1）
   *    -    - 内边距：0px（使图表填满预览区域）
   *    -    - 白色背景，圆角边框
   *    - 右侧：配置面板（340px 宽）
   *    -    - 字段选择器（数据源、横轴、纵轴、大小、名称）
   *    -    - 保存按钮（校验必填项后保存）
   *    -    - 灰色背景，左侧边框分隔
   *
   * 样式设计：
   * - 使用 flex 布局，左右区域自适应
   * - 固定右侧面板宽度（340px），左侧预览区域自适应剩余空间
   * - 最小高度设为 0，防止 flex 布局出现不必要滚动
   * - 保存按钮固定在底部
   */
  const renderContent = () => {
    if (!isConfig) {
      return (
        <div style={{
          width: '100%',
          height: '100%',
          background: state === 'fullscreen' ? 'transparent' : '#ffffff'
        }}>
          <BubbleChart
            data={data}
            xFieldName={config.xField ? numericFields.find(f => f.id === config.xField)?.name : undefined}
            yFieldName={config.yField ? numericFields.find(f => f.id === config.yField)?.name : undefined}
            sizeFieldName={config.sizeField ? numericFields.find(f => f.id === config.sizeField)?.name : undefined}
            loading={dataLoading}
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
              xFieldName={config.xField ? numericFields.find(f => f.id === config.xField)?.name : undefined}
              yFieldName={config.yField ? numericFields.find(f => f.id === config.yField)?.name : undefined}
              sizeFieldName={config.sizeField ? numericFields.find(f => f.id === config.sizeField)?.name : undefined}
              loading={dataLoading}
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
                {/* 横轴：必选，必须为数字字段 */}
                <FieldSelect
                  label="横轴（必选）"
                  value={config.xField}
                  onChange={(value) => handleConfigChange('xField', value)}
                  fields={numericFields}
                  loading={fieldsLoading}
                  placeholder="选择字段"
                />

                {/* 纵轴：必选，必须为数字字段 */}
                <FieldSelect
                  label="纵轴（必选）"
                  value={config.yField}
                  onChange={(value) => handleConfigChange('yField', value)}
                  fields={numericFields}
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
