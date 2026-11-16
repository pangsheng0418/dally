import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// 註冊離線 Service Worker
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      (reg) => {
        console.log('[離線快取] Service Worker 註冊成功:', reg.scope);
      },
      (err) => {
        console.warn('[離線快取] Service Worker 註冊失敗:', err);
      }
    );
  });
} else if ('serviceWorker' in navigator) {
  // 開發環境亦支援測試離線快取
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

