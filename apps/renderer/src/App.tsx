/** 根组件，挂载 React Router */
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { useThemeSync } from './hooks/useThemeSync';
import './styles/globals.css';
import './styles/layout.css';

function App() {
  useThemeSync();
  return <RouterProvider router={router} />;
}

export default App;