## 开始是混合轴状态

### config 弹窗中把数值轴的字段调整成另一个数值
[useData3] 开始获取数据 {dataSource: 'tblvIMv7TPL2soGh', state: 'config'}
useData3.ts:168 [useData3] 字段类型: {xFieldType: 'category', yFieldType: 'number'}
useData3.ts:230 [useData3] 数据处理完成，记录条数: 6
useData3.ts:149 [useData3] 开始获取数据 {dataSource: 'tblvIMv7TPL2soGh', state: 'config'}
useData3.ts:168 [useData3] 字段类型: {xFieldType: 'category', yFieldType: 'number'}
useData3.ts:230 [useData3] 数据处理完成，记录条数: 6

### 点击保存后，view 图表无变化，感觉像未刷新
[App] 开始保存配置
App.tsx:169 [App] 配置保存成功
useData3.ts:58 [useData3] 开始获取数据 {dataSource: 'tblvIMv7TPL2soGh', state: 'config'}
useData3.ts:74 [useData3] 字段类型: {xFieldType: 'category', yFieldType: 'number'}
useData3.ts:118 [useData3] 数据处理完成，记录条数: 6

### 手动刷新后
useData3.ts:149 [useData3] 开始获取数据 {dataSource: undefined, state: 'view'}
useData3.ts:162 [useData3] 配置不完整，清空数据
App.tsx:202 [App] state 变化，触发备用刷新机制，新 state: view
useData3.ts:149 [useData3] 开始获取数据 {dataSource: undefined, state: 'view'}
useData3.ts:162 [useData3] 配置不完整，清空数据
App.tsx:202 [App] state 变化，触发备用刷新机制，新 state: view
useData3.ts:149 [useData3] 开始获取数据 {dataSource: undefined, state: 'view'}
useData3.ts:162 [useData3] 配置不完整，清空数据
useData3.ts:149 [useData3] 开始获取数据 {dataSource: 'tblvIMv7TPL2soGh', state: 'view'}
useData3.ts:168 [useData3] 字段类型: {xFieldType: 'category', yFieldType: 'number'}
App.tsx:207 [App] 备用机制获取配置成功
useData3.ts:149 [useData3] 开始获取数据 {dataSource: 'tblvIMv7TPL2soGh', state: 'view'}
useData3.ts:168 [useData3] 字段类型: {xFieldType: 'category', yFieldType: 'number'}
useData3.ts:149 [useData3] 开始获取数据 {dataSource: 'tblvIMv7TPL2soGh', state: 'view'}
useData3.ts:168 [useData3] 字段类型: {xFieldType: 'category', yFieldType: 'number'}
App.tsx:207 [App] 备用机制获取配置成功
useData3.ts:149 [useData3] 开始获取数据 {dataSource: 'tblvIMv7TPL2soGh', state: 'view'}
useData3.ts:168 [useData3] 字段类型: {xFieldType: 'category', yFieldType: 'number'}
4useData3.ts:230 [useData3] 数据处理完成，记录条数: 6
useData3.ts:149 [useData3] 开始获取数据 {dataSource: 'tblvIMv7TPL2soGh', state: 'view'}
useData3.ts:168 [useData3] 字段类型: {xFieldType: 'category', yFieldType: 'number'}
useData3.ts:230 [useData3] 数据处理完成，记录条数: 6

## 开始是双数值轴

### 打开 config 弹窗
useData3.ts:149 [useData3] 开始获取数据 {dataSource: undefined, state: 'config'}
useData3.ts:162 [useData3] 配置不完整，清空数据
App.tsx:202 [App] state 变化，触发备用刷新机制，新 state: config
useData3.ts:149 [useData3] 开始获取数据 {dataSource: undefined, state: 'config'}
useData3.ts:162 [useData3] 配置不完整，清空数据
App.tsx:202 [App] state 变化，触发备用刷新机制，新 state: config
useData3.ts:149 [useData3] 开始获取数据 {dataSource: undefined, state: 'config'}
useData3.ts:162 [useData3] 配置不完整，清空数据
useData3.ts:149 [useData3] 开始获取数据 {dataSource: 'tblvIMv7TPL2soGh', state: 'config'}
useData3.ts:168 [useData3] 字段类型: {xFieldType: 'number', yFieldType: 'number'}
useData3.ts:230 [useData3] 数据处理完成，记录条数: 6
useData3.ts:149 [useData3] 开始获取数据 {dataSource: 'tblvIMv7TPL2soGh', state: 'config'}
useData3.ts:168 [useData3] 字段类型: {xFieldType: 'number', yFieldType: 'number'}
useData3.ts:230 [useData3] 数据处理完成，记录条数: 6

### config 弹窗中把数值轴的字段调整成一个单选字段
useData3.ts:149 [useData3] 开始获取数据 {dataSource: 'tblvIMv7TPL2soGh', state: 'config'}
useData3.ts:168 [useData3] 字段类型: {xFieldType: 'category', yFieldType: 'number'}
useData3.ts:230 [useData3] 数据处理完成，记录条数: 6
useData3.ts:149 [useData3] 开始获取数据 {dataSource: 'tblvIMv7TPL2soGh', state: 'config'}
useData3.ts:168 [useData3] 字段类型: {xFieldType: 'category', yFieldType: 'number'}
useData3.ts:230 [useData3] 数据处理完成，记录条数: 6

### 点击保存后，view 图表无变化，感觉像未刷新
App.tsx:142 [App] 开始保存配置
App.tsx:169 [App] 配置保存成功
useData3.ts:58 [useData3] 开始获取数据 {dataSource: 'tblvIMv7TPL2soGh', state: 'config'}
useData3.ts:74 [useData3] 字段类型: {xFieldType: 'category', yFieldType: 'number'}
useData3.ts:118 [useData3] 数据处理完成，记录条数: 6

### 手动刷新后
useData3.ts:149 [useData3] 开始获取数据 {dataSource: undefined, state: 'view'}
useData3.ts:162 [useData3] 配置不完整，清空数据
App.tsx:202 [App] state 变化，触发备用刷新机制，新 state: view
useData3.ts:149 [useData3] 开始获取数据 {dataSource: undefined, state: 'view'}
useData3.ts:162 [useData3] 配置不完整，清空数据
App.tsx:202 [App] state 变化，触发备用刷新机制，新 state: view
useData3.ts:149 [useData3] 开始获取数据 {dataSource: undefined, state: 'view'}
useData3.ts:162 [useData3] 配置不完整，清空数据
2App.tsx:207 [App] 备用机制获取配置成功
useData3.ts:149 [useData3] 开始获取数据 {dataSource: 'tblvIMv7TPL2soGh', state: 'view'}
useData3.ts:168 [useData3] 字段类型: {xFieldType: 'category', yFieldType: 'number'}
useData3.ts:230 [useData3] 数据处理完成，记录条数: 6
useData3.ts:149 [useData3] 开始获取数据 {dataSource: 'tblvIMv7TPL2soGh', state: 'view'}
useData3.ts:168 [useData3] 字段类型: {xFieldType: 'category', yFieldType: 'number'}
useData3.ts:230 [useData3] 数据处理完成，记录条数: 6