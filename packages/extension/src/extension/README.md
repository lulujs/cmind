# WebUI Integration Service 重构说明

## 概述

将 `webui-integration-service.ts` 中的 HTML 模板代码拆分到独立的 HTML 文件中，通过文件引入的方式使用。

## 文件结构

```
packages/extension/src/extension/
├── webui-integration-service.ts  # 主服务类
└── webview-template.html         # HTML 模板文件
```

## 主要改动

### 1. HTML 模板文件 (`webview-template.html`)

- 包含完整的 HTML 结构、CSS 样式和 JavaScript 代码
- 使用占位符 `{{INTERACTION_ENABLED}}` 和 `{{INITIAL_DATA_SCRIPT}}` 用于动态内容替换

### 2. TypeScript 服务类 (`webui-integration-service.ts`)

**新增功能：**
- 添加 `fs` 和 `path` 模块导入
- 添加 `htmlTemplate` 私有属性用于缓存模板内容
- 添加 `loadHtmlTemplate()` 方法从文件系统加载 HTML 模板
- 修改构造函数接收 `context` 参数并调用 `loadHtmlTemplate()`

**修改功能：**
- `createWebviewContent()` 方法现在使用模板替换而不是内联 HTML
- 使用 `replace()` 方法替换模板中的占位符

### 3. 构建配置 (`esbuild.mjs`)

**新增插件：**
- 添加 `copy-html-plugin` 插件
- 在构建时自动将 `webview-template.html` 复制到 `out/extension/` 目录

## 优势

1. **代码分离**：HTML/CSS/JS 与 TypeScript 代码分离，提高可维护性
2. **更好的编辑体验**：HTML 文件可以获得完整的语法高亮和智能提示
3. **易于修改**：修改 UI 时不需要处理字符串转义和模板字符串
4. **构建自动化**：esbuild 插件自动处理文件复制，无需手动操作

## 使用方式

服务类的使用方式保持不变：

```typescript
const service = new WebUIIntegrationService(context);
const html = service.createWebviewContent(data, filePath, webview, theme);
```

## 构建

运行构建命令时，HTML 模板会自动复制到输出目录：

```bash
npm run build
```

或者使用 watch 模式：

```bash
npm run watch
```
