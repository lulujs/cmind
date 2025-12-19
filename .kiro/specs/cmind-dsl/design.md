# Design Document

## Overview

CMind DSL 是一种基于缩进的人类可读语言，用于描述思维导图结构。该语言设计目标是：

1. **易读易写** - 使用简洁的缩进语法，类似 Markdown
2. **完整表达** - 支持 KityMinder 的核心功能（节点、层级、属性）
3. **双向转换** - 可解析为 AST，也可从 AST 生成回 DSL 或 KityMinder JSON

### 语法示例

```cmind
@template(right)
@theme(fresh-blue)

# Topic
  - a
    - c @bold @italic
  - b @progress(2)
    - c @priority(1)
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      CMind DSL Text                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Langium Parser                           │
│  (packages/language/src/cmind.langium)                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                         AST                                 │
│  (packages/language/src/generated/ast.ts)                   │
└─────────────────────────────────────────────────────────────┘
                    │                   │
                    ▼                   ▼
┌───────────────────────────┐  ┌───────────────────────────────┐
│     Pretty Printer        │  │     KityMinder Generator      │
│  (AST → CMind DSL Text)   │  │  (AST → KityMinder JSON)      │
└───────────────────────────┘  └───────────────────────────────┘
```

## Components and Interfaces

### 1. Grammar Definition (cmind.langium)

定义 CMind DSL 的语法规则：

```langium
grammar Cmind

entry MindMap:
    (metadata+=Metadata)*
    root=RootNode;

Metadata:
    '@template' '(' value=ID ')' |
    '@theme' '(' value=ID ')';

RootNode:
    '#' text=TEXT
    (children+=ChildNode)*;

ChildNode:
    INDENT '-' text=TEXT (attributes+=Attribute)*
    (children+=ChildNode)*;

Attribute:
    '@priority' '(' value=INT ')' |
    '@progress' '(' value=INT ')' |
    '@bold' |
    '@italic';
```

### 2. Validator (cmind-validator.ts)

验证规则：
- 优先级值必须在 1-9 范围内
- 进度值必须在 1-9 范围内
- 文档只能有一个根节点

### 3. KityMinder Generator (generator.ts)

将 AST 转换为 KityMinder JSON 格式：

```typescript
interface KityMinderGenerator {
    generate(ast: MindMap): KityMinderJson;
}

interface KityMinderJson {
    root: KityMinderNode;
    template: string;
    theme: string;
    version: string;
}

interface KityMinderNode {
    data: {
        id: string;
        created: number;
        text: string;
        priority?: string;
        progress?: number;
        'font-weight'?: string;
        'font-style'?: string;
    };
    children: KityMinderNode[];
}
```

### 4. Pretty Printer (printer.ts)

将 AST 转换回 CMind DSL 文本：

```typescript
interface PrettyPrinter {
    print(ast: MindMap): string;
}
```

## Data Models

### AST Node Types

```typescript
interface MindMap {
    metadata: Metadata[];
    root: RootNode;
}

interface Metadata {
    type: 'template' | 'theme';
    value: string;
}

interface RootNode {
    text: string;
    children: ChildNode[];
}

interface ChildNode {
    text: string;
    attributes: Attribute[];
    children: ChildNode[];
}

interface Attribute {
    type: 'priority' | 'progress' | 'bold' | 'italic';
    value?: number;  // for priority and progress
}
```

### KityMinder JSON Schema

```typescript
interface KityMinderDocument {
    root: KityMinderNode;
    template: string;  // default: "right"
    theme: string;     // default: "fresh-blue"
    version: string;   // "1.4.43"
}

interface KityMinderNode {
    data: NodeData;
    children: KityMinderNode[];
}

interface NodeData {
    id: string;
    created: number;
    text: string;
    priority?: string;
    progress?: number;
    'font-weight'?: 'bold';
    'font-style'?: 'italic';
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Root Node Parsing
*For any* valid title string, when parsed as `# <title>`, the resulting AST SHALL contain a root node with text equal to that title string.
**Validates: Requirements 1.1**

### Property 2: Tree Structure Preservation
*For any* valid CMind document with nested nodes, the parsed AST SHALL preserve the parent-child relationships as defined by indentation levels.
**Validates: Requirements 2.1, 2.2, 2.3**

### Property 3: Attribute Parsing Completeness
*For any* node with attributes (@priority, @progress, @bold, @italic), the parsed AST SHALL contain all specified attributes with their correct values.
**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

### Property 4: Comments Are Ignored
*For any* CMind document, adding or removing comments SHALL NOT change the resulting AST structure.
**Validates: Requirements 4.1, 4.2**

### Property 5: KityMinder JSON Structure
*For any* valid AST, the generated KityMinder JSON SHALL contain all required fields (root, template, theme, version) and each node SHALL have data with id, created, and text fields.
**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

### Property 6: Round-Trip Consistency (CRITICAL)
*For any* valid CMind AST, pretty-printing then parsing SHALL produce an AST that is semantically equivalent to the original.
**Validates: Requirements 6.1, 6.2, 6.3**

### Property 7: Metadata Parsing
*For any* document with @template and @theme declarations, the parsed AST SHALL contain the correct metadata values.
**Validates: Requirements 7.1, 7.2**

## Error Handling

| Error Type | Condition | Message |
|------------|-----------|---------|
| Missing Root | No `#` declaration | "Document must have a root node starting with #" |
| Multiple Roots | More than one `#` | "Document can only have one root node" |
| Invalid Priority | priority < 1 or > 9 | "Priority must be between 1 and 9" |
| Invalid Progress | progress < 1 or > 9 | "Progress must be between 1 and 9" |
| Invalid Indentation | Inconsistent spacing | "Inconsistent indentation detected" |

## Testing Strategy

### Property-Based Testing Library

使用 **fast-check** 作为 TypeScript 的属性测试库。

### Unit Tests

- 解析简单文档（单个根节点）
- 解析带子节点的文档
- 解析带属性的节点
- 验证错误情况（无根节点、多根节点、无效属性值）
- JSON 生成基本结构
- Pretty printer 基本输出

### Property-Based Tests

每个属性测试配置运行 100 次迭代。

1. **Property 1 Test**: 生成随机标题字符串，验证解析后的根节点文本匹配
2. **Property 2 Test**: 生成随机树结构，验证 AST 层级关系正确
3. **Property 3 Test**: 生成随机属性组合，验证所有属性被正确解析
4. **Property 4 Test**: 生成随机文档，添加随机注释，验证 AST 不变
5. **Property 5 Test**: 生成随机 AST，验证 JSON 输出结构完整
6. **Property 6 Test**: 生成随机 AST，验证 print → parse 往返一致性
7. **Property 7 Test**: 生成随机 template/theme 值，验证元数据解析正确

每个属性测试必须使用以下格式标注：
```typescript
// **Feature: cmind-dsl, Property N: <property_text>**
```
