export interface Workspace {
  id: string;
  name: string;
  path: string;
  description: string;
  icon: string;
  color: string;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
}

export interface WorkspaceSettings {
  workspaceId: string;
  allowedPaths: string[];
  restrictedMode: boolean;
}
