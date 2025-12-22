# Design Document: CMind Preview Feature

## Overview

The CMind Preview feature adds real-time mind map visualization to the CMind VSCode extension. This feature provides a live preview panel that displays KityMinder-rendered mind maps as users edit CMind DSL files, similar to Markdown preview functionality. The design emphasizes performance through memory-based caching and seamless integration with VSCode's interface.

## Architecture

The preview system follows a modular architecture with clear separation of concerns:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   VSCode UI     │    │  Preview Panel   │    │  KityMinder     │
│   Integration   │◄──►│   Management     │◄──►│   WebUI         │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Command        │    │  Content         │    │  Memory Cache   │
│  Handler        │◄──►│  Synchronizer    │◄──►│  Service        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  VSCode Events  │    │  Conversion      │    │  Error          │
│  & Lifecycle    │    │  Service         │    │  Handler        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Components and Interfaces

### 1. Preview Panel Manager

**Purpose:** Manages the preview panel lifecycle and tab-based navigation

**Interface:**
```typescript
interface PreviewPanelManager {
    createPreviewPanel(): Promise<vscode.WebviewPanel>;
    showPreview(filePath: string): Promise<void>;
    updatePreviewContent(filePath: string, content: string): Promise<void>;
    closePreview(filePath: string): void;
    switchToTab(filePath: string): void;
    isPreviewOpen(filePath: string): boolean;
}
```

**Implementation:**
- Creates and manages webview panels in VSCode's bottom panel area
- Maintains tab state for multiple open previews
- Handles panel visibility and focus management
- Integrates with VSCode's panel management system

### 2. Content Synchronizer

**Purpose:** Synchronizes editor content changes with preview updates

**Interface:**
```typescript
interface ContentSynchronizer {
    startWatching(context: vscode.ExtensionContext): void;
    onContentChanged(document: vscode.TextDocument): Promise<void>;
    debounceUpdate(filePath: string, content: string): void;
    pauseUpdates(filePath: string): void;
    resumeUpdates(filePath: string): void;
}
```

**Implementation:**
- Listens to `onDidChangeTextDocument` events
- Implements debouncing (500ms) to prevent excessive updates
- Manages update pausing when preview is not visible
- Handles editor focus changes and file switching

### 3. Memory Cache Service

**Purpose:** Provides in-memory caching for converted KityMinder JSON

**Interface:**
```typescript
interface MemoryCacheService {
    get(filePath: string, contentHash: string): KityMinderData | null;
    set(filePath: string, contentHash: string, data: KityMinderData): void;
    remove(filePath: string): void;
    clear(): void;
    getMemoryUsage(): number;
    evictLRU(): void;
}
```

**Implementation:**
- Uses Map-based storage with content hashing for cache keys
- Implements LRU eviction policy with 50MB memory limit
- Provides automatic cleanup on file close and extension deactivation
- Tracks memory usage and cache hit/miss statistics

### 4. WebUI Integration Service

**Purpose:** Manages KityMinder WebUI embedding and interaction

**Interface:**
```typescript
interface WebUIIntegrationService {
    createWebviewContent(data: KityMinderData): string;
    handleWebviewMessage(message: any): Promise<void>;
    updateTheme(theme: string): void;
    enableInteraction(enabled: boolean): void;
}
```

**Implementation:**
- Embeds KityMinder WebUI components in VSCode webview
- Handles theme and template rendering
- Manages interactive features (zoom, pan, navigation)
- Provides responsive layout adjustments

### 5. Command Handler

**Purpose:** Handles VSCode commands and context menu integration

**Interface:**
```typescript
interface PreviewCommandHandler {
    registerCommands(context: vscode.ExtensionContext): void;
    executeOpenPreview(uri?: vscode.Uri): Promise<void>;
    executeToggleSync(): void;
    executeRefreshPreview(): void;
}
```

**Implementation:**
- Registers "Open Preview" command and keyboard shortcuts
- Handles context menu integration for CMind files
- Provides toggle sync and refresh functionality
- Manages command availability based on context

## Data Models

### Preview State

```typescript
interface PreviewState {
    filePath: string;
    isActive: boolean;
    lastUpdate: Date;
    contentHash: string;
    errorState?: PreviewError;
}
```

### Cache Entry

```typescript
interface CacheEntry {
    data: KityMinderData;
    contentHash: string;
    lastAccessed: Date;
    memorySize: number;
}
```

### Preview Configuration

```typescript
interface PreviewConfiguration {
    autoUpdate: boolean;
    updateDelay: number;
    maxMemoryUsage: number;
    enableInteraction: boolean;
    theme: string;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, I identified several properties that can be consolidated:

- Properties related to tab management (1.3, 1.4, 1.5, 1.7) can be combined into comprehensive tab behavior properties
- Properties related to error handling (2.2, 5.1, 5.2) can be consolidated into error display properties  
- Properties related to caching (3.1, 3.2, 3.3, 3.4) form a cohesive cache behavior property set
- Properties related to performance (6.1, 6.2, 6.3) can be combined into performance optimization properties

### Core Properties

**Property 1: Tab Management Consistency**
*For any* set of open CMind files with previews, the preview panel should maintain exactly one tab per file, with the active tab corresponding to the currently focused editor
**Validates: Requirements 1.3, 1.4, 1.5, 1.7**

**Property 2: Real-time Update Responsiveness**
*For any* content change in a CMind file, the preview should update within 500ms and reflect the exact current editor content
**Validates: Requirements 2.1, 2.3**

**Property 3: Background Update Continuity**
*For any* CMind file with an open preview, content changes should trigger preview updates regardless of panel focus state
**Validates: Requirements 2.4**

**Property 4: Error Display Completeness**
*For any* CMind file with syntax errors, the preview should display both the error message and the specific location where the error occurred
**Validates: Requirements 2.2, 5.1, 5.2**

**Property 5: Memory-only Conversion**
*For any* preview conversion operation, no temporary files should be created on the file system, and all data should remain in memory
**Validates: Requirements 3.1**

**Property 6: Cache Efficiency**
*For any* repeated request for the same content, the cache should return results without re-conversion, and cache entries should be removed when files are closed
**Validates: Requirements 3.2, 3.3**

**Property 7: LRU Cache Eviction**
*For any* cache that exceeds the 50MB memory limit, the least recently used entries should be evicted first until memory usage is within limits
**Validates: Requirements 3.4, 6.1**

**Property 8: Theme and Template Rendering**
*For any* mind map containing themes or templates, the preview should render all visual elements correctly according to KityMinder specifications
**Validates: Requirements 4.2**

**Property 9: Responsive Layout Adjustment**
*For any* preview panel resize operation, the KityMinder WebUI should adjust its layout to fit the new dimensions without content loss
**Validates: Requirements 4.4**

**Property 10: Update Debouncing**
*For any* rapid sequence of content changes, preview updates should be debounced to prevent excessive re-rendering while maintaining responsiveness
**Validates: Requirements 6.2**

**Property 11: Performance Optimization**
*For any* hidden preview panel, automatic updates should be paused to conserve resources, and resumed when the panel becomes visible
**Validates: Requirements 6.3**

## Error Handling

### Error Categories

1. **Syntax Errors:** Invalid CMind DSL syntax with line/column information
2. **Conversion Errors:** Failures in the CMind to KityMinder JSON conversion process
3. **Memory Errors:** Cache overflow or memory allocation failures
4. **WebUI Errors:** KityMinder rendering or interaction failures
5. **VSCode Integration Errors:** Panel creation or command registration failures

### Error Response Strategy

- Display user-friendly error messages in the preview panel
- Provide detailed error information including line numbers and suggestions
- Maintain preview panel stability even when individual conversions fail
- Log detailed errors to VSCode output channel for debugging
- Implement graceful degradation when WebUI features are unavailable

### Error Recovery

```typescript
interface ErrorRecovery {
    retryConversion(filePath: string, maxRetries: number): Promise<void>;
    fallbackToTextDisplay(error: ConversionError): void;
    clearErrorState(filePath: string): void;
    reportError(error: Error, context: string): void;
}
```

## Testing Strategy

### Dual Testing Approach

The testing strategy combines unit tests for specific scenarios with property-based tests for comprehensive coverage:

**Unit Tests:**
- Specific examples of preview panel creation and management
- Error handling scenarios with known syntax errors
- Integration points with VSCode APIs
- Edge cases like empty files and malformed content

**Property-Based Tests:**
- Universal properties that hold across all valid inputs
- Cache behavior with randomized content and access patterns
- Performance characteristics under various load conditions
- UI responsiveness across different content sizes and complexity

**Property Test Configuration:**
- Minimum 100 iterations per property test
- Each test tagged with: **Feature: cmind-preview, Property {number}: {property_text}**
- Tests run against randomized CMind content, file operations, and UI interactions

**Testing Framework:**
- Use Jest for unit testing with VSCode extension testing utilities
- Use fast-check for property-based testing with custom generators
- Mock VSCode APIs for isolated component testing
- Integration tests using VSCode extension test runner

### Test Data Generation

```typescript
interface TestDataGenerators {
    generateCMindContent(complexity: 'simple' | 'complex' | 'invalid'): string;
    generateFileOperations(count: number): FileOperation[];
    generateCacheScenarios(memoryLimit: number): CacheScenario[];
    generateUIInteractions(): UIInteraction[];
}
```

The testing approach ensures both correctness of individual components and system-wide properties, providing confidence in the preview feature's reliability and performance.