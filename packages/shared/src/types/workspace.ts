/** 工作区：绑定本地目录的项目容器 */
export interface Workspace {
  id: string;
  name: string;
  /** 本地目录绝对路径，Agent 的 cwd */
  path: string;
  description: string;
  icon: string;
  color: string;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
}

/** 工作区路径访问策略 */
export interface WorkspaceSettings {
  workspaceId: string;
  /** 除工作区目录外额外允许访问的路径 */
  allowedPaths: string[];
  /** 是否限制 Agent 只能访问工作区内路径 */
  restrictedMode: boolean;
}
