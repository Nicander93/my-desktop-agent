import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ChatPage } from '@/pages/ChatPage';
import { SettingsPage } from '@/pages/SettingsPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <ChatPage />
      },
      {
        path: 'settings',
        element: <SettingsPage />
      },
      {
        path: 'search',
        element: <div className="p-6 text-gray-500">搜索功能开发中...</div>
      },
      {
        path: 'plugins',
        element: <div className="p-6 text-gray-500">插件功能开发中...</div>
      },
      {
        path: 'automation',
        element: <div className="p-6 text-gray-500">自动化功能开发中...</div>
      }
    ]
  }
]);