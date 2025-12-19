# Requirements Document

## Introduction

CMind DSL 是一种人类可读的领域特定语言，用于描述思维导图结构。该语言采用简洁的缩进风格语法，可以被解析为 AST，并能生成回 KityMinder 兼容的 JSON 格式文件。

## Glossary

- **CMind**: 本项目的思维导图 DSL 语言名称
- **KityMinder**: 百度 FEX 团队开发的在线脑图编辑工具，使用 JSON 格式存储数据
- **Node**: 思维导图中的一个节点，包含文本内容和可选属性
- **Root Node**: 思维导图的根节点，使用 `#` 标记
- **Child Node**: 子节点，使用 `-` 标记，通过缩进表示层级关系
- **Attribute**: 节点的可选属性，使用 `@` 前缀标记
- **AST**: 抽象语法树，解析后的程序内部表示
- **Pretty Printer**: 将 AST 转换回 DSL 文本的组件

## Requirements

### Requirement 1

**User Story:** As a user, I want to define a mindmap root node with a title, so that I can create the starting point of my mindmap.

#### Acceptance Criteria

1. WHEN a user writes `# Title` at the beginning of a document THEN the CMind Parser SHALL create a root node with the specified title text
2. WHEN a document contains multiple `#` declarations THEN the CMind Parser SHALL report an error indicating only one root node is allowed
3. WHEN a document contains no `#` declaration THEN the CMind Parser SHALL report an error indicating a root node is required

### Requirement 2

**User Story:** As a user, I want to add child nodes using `-` markers with indentation, so that I can build hierarchical mindmap structures.

#### Acceptance Criteria

1. WHEN a user writes `- text` with proper indentation under a parent node THEN the CMind Parser SHALL create a child node linked to that parent
2. WHEN a user increases indentation level THEN the CMind Parser SHALL create the node as a child of the previous node at the lower indentation level
3. WHEN a user decreases indentation level THEN the CMind Parser SHALL create the node as a sibling of an ancestor node at the matching indentation level
4. WHEN indentation is inconsistent (mixing tabs and spaces incorrectly) THEN the CMind Parser SHALL report a validation warning

### Requirement 3

**User Story:** As a user, I want to add attributes to nodes using `@` syntax, so that I can specify priority, progress, and styling.

#### Acceptance Criteria

1. WHEN a user writes `@priority(N)` where N is 1-9 THEN the CMind Parser SHALL set the node's priority attribute to N
2. WHEN a user writes `@progress(N)` where N is 1-9 THEN the CMind Parser SHALL set the node's progress attribute to N
3. WHEN a user writes `@bold` THEN the CMind Parser SHALL set the node's font-weight to bold
4. WHEN a user writes `@italic` THEN the CMind Parser SHALL set the node's font-style to italic
5. WHEN a user writes multiple attributes on one node THEN the CMind Parser SHALL apply all attributes to that node
6. WHEN a user writes an invalid attribute value (e.g., priority out of range) THEN the CMind Parser SHALL report a validation error

### Requirement 4

**User Story:** As a user, I want to add comments to my mindmap source, so that I can document my thinking without affecting the output.

#### Acceptance Criteria

1. WHEN a user writes `//` followed by text THEN the CMind Parser SHALL ignore the rest of that line
2. WHEN a user writes `/* */` around text THEN the CMind Parser SHALL ignore the enclosed content

### Requirement 5

**User Story:** As a developer, I want to generate KityMinder JSON from the parsed AST, so that the mindmap can be used in KityMinder-compatible tools.

#### Acceptance Criteria

1. WHEN the CMind Generator processes a valid AST THEN the CMind Generator SHALL produce a JSON object with `root`, `template`, `theme`, and `version` fields
2. WHEN the CMind Generator processes a node THEN the CMind Generator SHALL generate `data` object with `id`, `created`, `text`, and any style attributes
3. WHEN the CMind Generator processes a node with children THEN the CMind Generator SHALL generate a `children` array containing the child nodes
4. WHEN the CMind Generator processes attributes THEN the CMind Generator SHALL map them to the corresponding KityMinder JSON fields (priority, progress, font-weight, font-style)

### Requirement 6

**User Story:** As a developer, I want a pretty printer that converts AST back to CMind DSL text, so that I can verify round-trip correctness.

#### Acceptance Criteria

1. WHEN the CMind Pretty Printer processes an AST THEN the CMind Pretty Printer SHALL produce valid CMind DSL text
2. WHEN the CMind Pretty Printer processes a node with attributes THEN the CMind Pretty Printer SHALL output attributes in a consistent order
3. WHEN parsing then pretty-printing a valid CMind document THEN the result SHALL be semantically equivalent to the original (round-trip property)

### Requirement 7

**User Story:** As a user, I want to specify document-level metadata, so that I can control the template and theme of the generated mindmap.

#### Acceptance Criteria

1. WHEN a user writes `@template(name)` at document level THEN the CMind Parser SHALL set the template metadata field
2. WHEN a user writes `@theme(name)` at document level THEN the CMind Parser SHALL set the theme metadata field
3. WHEN no template is specified THEN the CMind Generator SHALL use "right" as the default template
4. WHEN no theme is specified THEN the CMind Generator SHALL use "fresh-blue" as the default theme
