/** 根组件，挂载 React Router */
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { useThemeSync } from "./hooks/useThemeSync";
import "./styles/globals.css";
import "./styles/layout.css";

/**
 * 挂载路由树，并同步系统或用户选择的主题到页面根节点。
 */
function App() {
  useThemeSync();
  return <RouterProvider router={router} />;
}

export default App;
