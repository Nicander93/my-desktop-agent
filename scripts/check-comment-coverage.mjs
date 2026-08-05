/**
 * 审计自有源码是否具备文件级 JSDoc 说明。
 *
 * 此脚本目前仅输出统计并以缺失文件为退出失败，尚未接入 `pnpm check`；
 * 全仓函数级覆盖完成后，可在不改变审计语义的前提下逐步扩展为 AST 检查。
 */
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, relative } from "node:path";

const require = createRequire(import.meta.url);
const ts = require("typescript");

/**
 * 要审计的自有源码根目录。
 *
 * 构建产物、依赖和锁文件不在范围内；JSON 不支持标准注释，改由邻近文档说明。
 */
const SOURCE_ROOTS = ["apps", "packages", "scripts"];

/**
 * 可纳入文件头审计的源码扩展名。
 */
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);

/**
 * 递归收集一个目录下的可审计源码文件。
 */
async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (
      entry.name === "dist" ||
      entry.name === "node_modules" ||
      entry.name === "coverage"
    )
      continue;
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory())
      files.push(...(await collectSourceFiles(entryPath)));
    else if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf("."))) &&
      !entry.name.endsWith(".d.ts")
    )
      files.push(entryPath);
  }
  return files;
}

/**
 * 判断源码去除 BOM 与空白后是否以多行 JSDoc 开始。
 */
function hasFileHeader(source) {
  const withoutBom = source.replace(/^\uFEFF/, "").trimStart();
  const withoutShebang = withoutBom.startsWith("#!")
    ? withoutBom.slice(withoutBom.indexOf("\n") + 1).trimStart()
    : withoutBom;
  const withoutTestEnvironment = withoutShebang.startsWith(
    "// @vitest-environment",
  )
    ? withoutShebang.slice(withoutShebang.indexOf("\n") + 1).trimStart()
    : withoutShebang;
  return withoutTestEnvironment.startsWith("/**");
}

/**
 * 判断声明节点是否紧邻 JSDoc。
 *
 * 仅将紧邻节点的块注释视为其文档，避免把文件头或上一个声明的说明误计入覆盖率。
 */
function hasSymbolDoc(sourceFile, node) {
  const documentNode =
    ts.isVariableDeclaration(node) &&
    ts.isVariableDeclarationList(node.parent) &&
    ts.isVariableStatement(node.parent.parent)
      ? node.parent.parent
      : node;
  const comments = ts.getLeadingCommentRanges(
    sourceFile.text,
    documentNode.getFullStart(),
  );
  if (!comments) return false;
  const lastComment = comments.at(-1);
  if (!lastComment) return false;
  return sourceFile.text
    .slice(lastComment.pos, lastComment.end)
    .startsWith("/**");
}

/**
 * 判定节点是否属于计划要求注释的具名运行时或类型声明。
 *
 * 箭头函数以变量声明为文档载体，避免把同一说明重复记到初始化表达式上。
 */
function isDocumentableSymbol(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    (ts.isVariableDeclaration(node) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer)))
  );
}

/**
 * 收集缺少紧邻 JSDoc 的符号名称与源码位置。
 */
function collectUndocumentedSymbols(file, source) {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const missing = [];
  /**
   * 深度优先检查每个可文档化声明，并记录缺少紧邻 JSDoc 的源码位置。
   */
  const visit = (node) => {
    if (isDocumentableSymbol(node) && !hasSymbolDoc(sourceFile, node)) {
      const position = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(),
      );
      const name = node.name?.getText(sourceFile) ?? "constructor";
      missing.push({ name, line: position.line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return missing;
}

/**
 * 输出缺少文件头的文件，并以非零状态暴露审计失败。
 */
async function main() {
  const roots = await Promise.all(SOURCE_ROOTS.map(collectSourceFiles));
  const files = roots.flat().sort();
  const missing = [];
  for (const file of files) {
    if (!hasFileHeader(await readFile(file, "utf8")))
      missing.push(relative(process.cwd(), file));
  }
  console.log(
    `[comments] files=${files.length} withHeaders=${files.length - missing.length} missingHeaders=${missing.length}`,
  );
  for (const file of missing)
    console.error(`[comments] missing file header: ${file}`);
  if (missing.length > 0) process.exitCode = 1;

  if (!process.argv.includes("--symbols")) return;

  const undocumented = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const symbol of collectUndocumentedSymbols(file, source)) {
      undocumented.push({ file: relative(process.cwd(), file), ...symbol });
    }
  }
  console.log(`[comments] undocumentedSymbols=${undocumented.length}`);
  for (const symbol of undocumented) {
    console.log(
      `[comments] undocumented symbol: ${symbol.file}:${symbol.line} ${symbol.name}`,
    );
  }
}

await main();
