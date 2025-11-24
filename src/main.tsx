import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider, Spin } from '@douyinfe/semi-ui'
import { bitable } from '@lark-base-open/js-sdk'
import zh_CN from '@douyinfe/semi-ui/lib/es/locale/source/zh_CN';
import en_US from '@douyinfe/semi-ui/lib/es/locale/source/en_US';
import ja_JP from '@douyinfe/semi-ui/lib/es/locale/source/ja_JP';
import i18n from 'i18next';
import { initI18n } from './i18n'
import './index.css'
import App from './App.tsx'

const getSemiLocale = () => {
  const lang = i18n.language;
  if (lang === 'zh') return zh_CN;
  if (lang === 'jp') return ja_JP;
  return en_US;
}

function LoadApp() {
  const [load, setLoad] = useState(false);

  useEffect(() => {
    bitable.bridge.getLanguage().then((lang) => {
      initI18n(lang);
      setLoad(true);
    }).catch((e) => {
      console.error('getLanguage error', e);
      // Fallback
      initI18n(navigator.language);
      setLoad(true);
    });
  }, [])

  if (load) {
    return (
      <ConfigProvider locale={getSemiLocale()}>
        <App />
      </ConfigProvider>
    )
  }

  // Return transparent spin or nothing to avoid white flash
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <Spin />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LoadApp />
  </React.StrictMode>,
)
