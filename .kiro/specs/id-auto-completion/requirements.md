# Requirements Document

## Introduction

本功能为 cmind DSL 编辑器增强 @id 属性的自动补全能力。当用户在节点名称后输入空格时，编辑器将自动提示 `@id(nodeXXX)` 格式的建议，其中 XXX 是基于当前文档中已存在的最大节点 ID 数字自增 1 后的值。这将大大提高用户编辑思维导图时的效率，避免手动输入重复或冲突的 ID。

## Glossary

- **Cmind Editor**: 基于 Langium 构建的 cmind DSL 语言服务器和 VS Code 扩展
- **IdAttribute**: cmind 语法中的 `@id(value)` 属性，用于为节点分配唯一标识符
- **ChildNode**: cmind 语法中以 `-` 开头的子节点
- **RootNode**: cmind 语法中以 `#` 开头的根节点
- **Completion Provider**: Langium 中负责提供代码补全建议的服务组件
- **Node ID Pattern**: 节点 ID 的格式模式，如 `node001`、`node002` 等

## Requirements

### Requirement 1

**User Story:** As a cmind user, I want the editor to suggest @id attributes automatically after I type a node name and space, so that I can quickly assign unique IDs without manual input.

#### Acceptance Criteria

1. WHEN a user types a space character after a node text (ChildNode or RootNode) THEN the Cmind Editor SHALL display a completion suggestion for `@id(nodeXXX)` where XXX is the next available ID number
2. WHEN the Cmind Editor calculates the next ID number THEN the Cmind Editor SHALL scan all existing @id attributes in the current document and find the maximum numeric suffix
3. WHEN the Cmind Editor finds existing IDs with pattern `nodeNNN` (where NNN is a number) THEN the Cmind Editor SHALL suggest the next ID as `node` followed by the maximum number plus one, zero-padded to 3 digits
4. WHEN the document contains no existing @id attributes with numeric pattern THEN the Cmind Editor SHALL suggest `@id(node001)` as the default starting ID
5. WHEN the user selects the @id completion suggestion THEN the Cmind Editor SHALL insert the complete `@id(nodeXXX)` text at the cursor position

### Requirement 2

**User Story:** As a cmind user, I want the ID suggestion to handle edge cases gracefully, so that I always get valid and useful suggestions.

#### Acceptance Criteria

1. WHEN existing IDs have different numeric lengths (e.g., node1, node01, node001) THEN the Cmind Editor SHALL consider all numeric values and suggest the next ID with consistent 3-digit zero-padding
2. WHEN the maximum existing ID number is 999 or greater THEN the Cmind Editor SHALL suggest the next ID without zero-padding (e.g., node1000)
3. WHEN existing IDs contain non-numeric suffixes (e.g., nodeA, root001) THEN the Cmind Editor SHALL ignore those IDs when calculating the next numeric ID
4. WHEN the @id completion is triggered THEN the Cmind Editor SHALL display the suggestion with appropriate label and documentation

### Requirement 3

**User Story:** As a cmind user, I want the @id completion to work alongside other attribute completions, so that I can choose from multiple options.

#### Acceptance Criteria

1. WHEN a user triggers completion after node text THEN the Cmind Editor SHALL display @id suggestion along with other available attribute suggestions (@priority, @progress, @bold, @italic)
2. WHEN displaying completion items THEN the Cmind Editor SHALL show the @id suggestion with a descriptive label indicating the auto-generated ID value

### Requirement 4

**User Story:** As a developer, I want the completion provider to be testable, so that I can verify the ID calculation logic works correctly.

#### Acceptance Criteria

1. WHEN the ID calculation function receives a list of existing IDs THEN the ID calculation function SHALL return the next sequential ID string
2. WHEN the ID calculation function is called THEN the ID calculation function SHALL produce consistent results for the same input (pure function)
3. WHEN the pretty printer formats a MindMap AST THEN the pretty printer SHALL produce valid cmind syntax that can be parsed back to an equivalent AST (round-trip property)
