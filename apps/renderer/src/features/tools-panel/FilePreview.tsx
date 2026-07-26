/** 预览 Tab：复用 FileEditorPane，文案偏只读 */
import { FileEditorPane } from './FileEditorPane';

/** 文件预览入口 */
export function FilePreview() {
  return <FileEditorPane emptyHint="选择文件进行预览" />;
}
