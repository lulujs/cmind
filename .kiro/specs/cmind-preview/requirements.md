# Requirements Document

## Introduction

This document specifies the requirements for adding KityMinder WebUI real-time preview functionality to the CMind VSCode extension. The extension will provide a live preview panel that displays mind maps as users edit CMind DSL files, similar to Markdown preview functionality in VSCode.

## Glossary

- **CMind_Extension**: The VSCode extension that provides language support for CMind DSL files
- **Preview_Panel**: A webview panel that displays the rendered mind map visualization
- **KityMinder_WebUI**: The web-based mind mapping interface used for visualization
- **Memory_Cache**: In-memory storage for converted KityMinder JSON data
- **Live_Preview**: Real-time updating preview that reflects changes as users type
- **Conversion_Cache**: Service that manages in-memory conversion results

## Requirements

### Requirement 1: Preview Panel Management

**User Story:** As a developer, I want to open a preview panel for CMind files with tab-based navigation, so that I can visualize my mind maps while editing and easily switch between multiple previews.

#### Acceptance Criteria

1. WHEN a user opens a CMind file, THE CMind_Extension SHALL provide a "Open Preview" command
2. WHEN the preview command is executed, THE Preview_Panel SHALL open in the bottom panel area with a dedicated tab
3. WHEN multiple CMind files have previews open, THE Preview_Panel SHALL display tabs for each file allowing easy switching
4. WHEN a user clicks on a preview tab, THE Preview_Panel SHALL switch to show that file's mind map
5. WHEN a CMind file is closed, THE Preview_Panel SHALL remove the corresponding tab
6. WHEN all CMind files with previews are closed, THE Preview_Panel SHALL hide automatically
7. WHEN a preview tab is active, THE Preview_Panel SHALL highlight the corresponding tab to show current focus

### Requirement 2: Real-time Content Synchronization

**User Story:** As a user, I want the preview to update automatically as I edit CMind files, so that I can see changes immediately without manual refresh.

#### Acceptance Criteria

1. WHEN a user types in a CMind file, THE Preview_Panel SHALL update the visualization within 500ms
2. WHEN the CMind file has syntax errors, THE Preview_Panel SHALL display an error message with location details
3. WHEN the user switches between different CMind files, THE Preview_Panel SHALL update to show the active file's content
4. WHEN the preview panel loses focus, THE Preview_Panel SHALL continue updating when the source file changes

### Requirement 3: Memory-based Conversion

**User Story:** As a user, I want the preview to work without creating temporary files, so that my workspace stays clean and performance is optimized.

#### Acceptance Criteria

1. WHEN converting CMind content for preview, THE Conversion_Cache SHALL store results in memory only
2. WHEN the same content is requested again, THE Conversion_Cache SHALL return cached results without re-conversion
3. WHEN a CMind file is closed, THE Conversion_Cache SHALL remove cached data for that file
4. WHEN memory usage exceeds limits, THE Conversion_Cache SHALL evict least recently used entries

### Requirement 4: WebUI Integration

**User Story:** As a user, I want the preview to use KityMinder's full feature set, so that I can see exactly how my mind map will appear.

#### Acceptance Criteria

1. WHEN displaying a mind map, THE Preview_Panel SHALL use the KityMinder WebUI components
2. WHEN the mind map contains themes or templates, THE Preview_Panel SHALL render them correctly
3. WHEN the mind map has interactive elements, THE Preview_Panel SHALL support basic navigation (zoom, pan)
4. WHEN the preview panel is resized, THE KityMinder_WebUI SHALL adjust the layout accordingly

### Requirement 5: Error Handling and Feedback

**User Story:** As a user, I want clear feedback when there are issues with my CMind syntax, so that I can fix problems quickly.

#### Acceptance Criteria

1. WHEN the CMind file has syntax errors, THE Preview_Panel SHALL display the error message and line number
2. WHEN conversion fails, THE Preview_Panel SHALL show a user-friendly error message
3. WHEN the preview is loading, THE Preview_Panel SHALL show a loading indicator
4. WHEN the CMind file is empty, THE Preview_Panel SHALL display a helpful placeholder message

### Requirement 6: Performance and Resource Management

**User Story:** As a user, I want the preview to be responsive and not impact editor performance, so that I can work efficiently.

#### Acceptance Criteria

1. WHEN multiple CMind files are open, THE Memory_Cache SHALL limit total memory usage to 50MB
2. WHEN the user stops typing, THE Preview_Panel SHALL debounce updates to avoid excessive re-rendering
3. WHEN the preview panel is not visible, THE CMind_Extension SHALL pause automatic updates
4. WHEN the extension is deactivated, THE Memory_Cache SHALL clean up all cached data

### Requirement 7: User Interface Integration

**User Story:** As a user, I want the preview functionality to integrate seamlessly with VSCode's interface, so that it feels like a native feature.

#### Acceptance Criteria

1. WHEN the preview panel is open, THE CMind_Extension SHALL add it to VSCode's panel management system
2. WHEN the user right-clicks on a CMind file, THE Context_Menu SHALL include "Open Preview" option
3. WHEN the preview panel is active, THE CMind_Extension SHALL provide commands to toggle sync and refresh
4. WHEN the user uses keyboard shortcuts, THE Preview_Panel SHALL support standard VSCode preview shortcuts (Ctrl+Shift+V)