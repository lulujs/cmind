# Requirements Document

## Introduction

This document specifies the requirements for adding automatic conversion and context menu features to the CMind VSCode extension. The extension will support converting CMind DSL files to KityMinder JSON format either automatically on save or manually via a context menu command.

## Glossary

- **CMind_Extension**: The VSCode extension that provides language support for CMind DSL files
- **KityMinder_JSON**: The target JSON format used by KityMinder for mind map visualization
- **Conversion_Service**: The service that transforms CMind DSL files to KityMinder JSON format
- **Context_Menu**: The right-click menu in VSCode editor
- **Auto_Convert**: Automatic conversion triggered when a file is saved

## Requirements

### Requirement 1: File Conversion Service

**User Story:** As a developer, I want to convert CMind DSL files to KityMinder JSON format, so that I can visualize mind maps in KityMinder.

#### Acceptance Criteria

1. WHEN a CMind file is converted, THE Conversion_Service SHALL parse the file using the existing CLI generator
2. WHEN conversion succeeds, THE Conversion_Service SHALL write the KityMinder JSON to a file with the same name and `.json` extension
3. IF conversion fails, THEN THE Conversion_Service SHALL display an error message to the user
4. WHEN a KityMinder JSON file is generated, THE Conversion_Service SHALL place it in the same directory as the source file

### Requirement 2: Automatic Conversion on Save

**User Story:** As a user, I want CMind files to automatically convert to KityMinder JSON when I save them, so that I don't have to manually trigger conversion.

#### Acceptance Criteria

1. WHEN a user saves a CMind file, THE CMind_Extension SHALL trigger the Conversion_Service
2. WHEN auto-conversion is enabled, THE CMind_Extension SHALL convert the file in the background
3. WHEN conversion completes successfully, THE CMind_Extension SHALL display a success notification
4. WHERE auto-conversion is disabled in settings, THE CMind_Extension SHALL NOT trigger conversion on save
5. WHEN conversion fails, THE CMind_Extension SHALL display an error notification with details

### Requirement 3: Context Menu Command

**User Story:** As a user, I want to manually trigger conversion via a right-click menu, so that I have control over when conversion happens.

#### Acceptance Criteria

1. WHEN a user right-clicks in a CMind file editor, THE Context_Menu SHALL display a "Convert to KityMinder JSON" option
2. WHEN the user selects the convert option, THE CMind_Extension SHALL trigger the Conversion_Service
3. WHEN conversion completes, THE CMind_Extension SHALL display a success notification with the output file path
4. THE Context_Menu SHALL only show the convert option for files with `.cmind` extension

### Requirement 4: Configuration Settings

**User Story:** As a user, I want to configure conversion behavior, so that I can customize how the extension works.

#### Acceptance Criteria

1. THE CMind_Extension SHALL provide a setting to enable/disable auto-conversion on save
2. THE CMind_Extension SHALL provide a setting to specify the output directory for generated files
3. WHEN output directory is not specified, THE CMind_Extension SHALL use the same directory as the source file
4. THE CMind_Extension SHALL provide a setting to show/hide conversion notifications

### Requirement 5: Error Handling

**User Story:** As a user, I want clear error messages when conversion fails, so that I can fix issues in my CMind files.

#### Acceptance Criteria

1. WHEN a CMind file has syntax errors, THE Conversion_Service SHALL display the error location and message
2. WHEN file system operations fail, THE Conversion_Service SHALL display a descriptive error message
3. IF the output directory does not exist, THEN THE Conversion_Service SHALL create it automatically
4. WHEN conversion fails, THE CMind_Extension SHALL NOT overwrite existing output files
