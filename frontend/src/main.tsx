import React from 'react';
import ReactDOM from 'react-dom/client';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { App } from './App';
import './index.css';

// Lịch (Calendar) hiển thị thứ, tháng bằng tiếng Việt; tuần bắt đầu từ thứ Hai.
dayjs.locale('vi');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
