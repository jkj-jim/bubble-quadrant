import { useState, useEffect } from 'react'
import { Button, Typography, Select } from '@douyinfe/semi-ui'
import { dashboard, Rollup, type ISeries } from '@lark-base-open/js-sdk'
import { useDashboard, useTables, useFields, type BubbleChartConfig } from './hooks/useDashboard'
import { useData3 as useData } from './hooks/useData3'
import { BubbleChart } from './components/BubbleChart'

const { Title, Text } = Typography

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

function App() {
  const { state, isConfig } = useDashboard()

  const { tables, loading: tablesLoading } = useTables()
  const [config, setConfig] = useState<BubbleChartConfig>({})
  const [refreshKey, setRefreshKey] = useState(0)

  const { numericFields, textFields, loading: fieldsLoading } = useFields(config.dataSource)

  const { data, loading: dataLoading } = useData(config, state, refreshKey)

  useEffect(() => {
    const loadInitialConfig = async () => {
      if (state !== 'create') {
        try {
          const savedConfig = await dashboard.getConfig()
          if (savedConfig.customConfig) {
            setConfig(savedConfig.customConfig as BubbleChartConfig)
          }
        } catch (error) {
          console.error('[App] ❌ Failed to load initial config:', error)
        }
      }
    }
    loadInitialConfig()
  }, [])

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
          console.error('[App] ❌ onDataChange: 获取配置失败:', error)
        }
      })
    }

    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [state])


  const handleConfigChange = (
    key: keyof BubbleChartConfig,
    value: string | number | any[] | Record<string, any> | undefined
  ) => {
    setConfig(prev => ({ ...prev, [key]: typeof value === 'string' ? value : undefined }))
  }

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
        // @ts-ignore
        dataConditions: dataConditions,
        customConfig: latestConfig
      })
      setRefreshKey(k => k + 1)

    } catch (error) {
      console.error('[App] ❌ Failed to save config:', error)
    }
  }

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
            loading={dataLoading}
          />
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', height: '100%' }}>
        <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <Title heading={4}>图表预览</Title>
          <div style={{
            flex: 1,
            background: '#ffffff',
            borderRadius: '8px',
            marginTop: '20px',
            border: '1px solid #f0f0f0',
            minHeight: 0
          }}>
            <BubbleChart
              data={data}
              xFieldName={config.xField ? numericFields.find(f => f.id === config.xField)?.name : undefined}
              yFieldName={config.yField ? numericFields.find(f => f.id === config.yField)?.name : undefined}
              loading={dataLoading}
            />
          </div>
        </div>
        <div style={{
          width: '340px',
          borderLeft: '1px solid #e0e0e0',
          background: '#fafafa',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
            <Title heading={4}>配置面板</Title>
            <Text type="secondary" style={{ display: 'block', marginTop: 10, marginBottom: 20 }}>
              请选择数据源和字段
            </Text>

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

            {config.dataSource && (
              <>
                <FieldSelect
                  label="横轴字段（必须包含数字）"
                  value={config.xField}
                  onChange={(value) => handleConfigChange('xField', value)}
                  fields={numericFields}
                  loading={fieldsLoading}
                />
                <FieldSelect
                  label="纵轴字段（必须包含数字）"
                  value={config.yField}
                  onChange={(value) => handleConfigChange('yField', value)}
                  fields={numericFields}
                  loading={fieldsLoading}
                />
                <FieldSelect
                  label="气泡大小字段（可选，数字）"
                  value={config.sizeField}
                  onChange={(value) => handleConfigChange('sizeField', value)}
                  fields={numericFields}
                  loading={fieldsLoading}
                  placeholder="选择字段（可选）"
                />
                <FieldSelect
                  label="气泡名称字段（可选，文本）"
                  value={config.nameField}
                  onChange={(value) => handleConfigChange('nameField', value)}
                  fields={textFields}
                  loading={fieldsLoading}
                  placeholder="选择字段（可选）"
                />
              </>
            )}
          </div>
          <div style={{ height: '70px', padding: '16px 20px', borderTop: '1px solid #e0e0e0', background: '#ffffff' }}>
            <Button
              type="primary"
              theme="solid"
              style={{ width: '100%' }}
              loading={dataLoading}
              disabled={!config.dataSource || !config.xField || !config.yField}
              onClick={handleSave}
            >
              保存并查看
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      width: '100%',
      height: '100vh',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {renderContent()}
    </div>
  )
}

export default App
