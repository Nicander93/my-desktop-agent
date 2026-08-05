/**
 * 创建工作区弹窗
 *
 * 选择本地目录后调用 workspace:create-from-path 写入数据库。
 */
import { useState } from "react";
import { FolderPlus, Folder } from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

/**
 * 创建工作区弹窗的受控打开状态与状态变更回调。
 */
interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 收集本地目录与可选元数据，并通过 store 创建与持久化工作区。
 */
export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: CreateWorkspaceDialogProps) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const { createWorkspaceFromPath } = useWorkspaceStore();

  /** 选目录后自动用文件夹名填充工作区名称 */
  /**
   * 调用主进程目录选择器，并在名称为空时以文件夹名作为初始名称。
   */
  const handleSelectDirectory = async () => {
    const result = await window.electronAPI?.dialog.selectDirectory({
      title: "选择工作目录",
    });
    if (result?.success && result.path) {
      setPath(result.path);
      if (!name) {
        const dirName = result.path.split(/[\\/]/).pop() || "";
        setName(dirName);
      }
    }
  };

  /**
   * 校验必填名称和路径后创建工作区，成功时关闭弹窗并清理表单。
   */
  const handleCreate = async () => {
    if (!name.trim() || !path) return;
    setIsCreating(true);
    try {
      const workspace = await createWorkspaceFromPath(
        name.trim(),
        path,
        description.trim() || undefined,
      );
      if (workspace) {
        onOpenChange(false);
        setName("");
        setPath("");
        setDescription("");
      }
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建新工作区</DialogTitle>
          <DialogDescription>
            选择一个本地目录作为工作区，所有对话将关联到该目录。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              工作区名称
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：我的项目"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              目录路径
            </label>
            <div className="flex gap-2">
              <Input
                value={path}
                readOnly
                placeholder="点击选择目录"
                className="flex-1"
              />
              <Button variant="outline" onClick={handleSelectDirectory}>
                <Folder size={16} className="mr-2" />
                浏览
              </Button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-2">
              描述（可选）
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简单描述这个工作区"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || !path || isCreating}
          >
            {isCreating ? "创建中..." : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
