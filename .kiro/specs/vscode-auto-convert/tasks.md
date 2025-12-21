# Implementation Plan: VSCode Auto-Convert Feature

## Overview

This implementation plan converts the VSCode auto-convert feature design into a series of coding tasks. The implementation will extend the existing CMind VSCode extension with automatic conversion and context menu functionality, integrating the existing CLI conversion capabilities.

## Tasks

- [x] 1. Set up extension configuration and package.json updates
  - Add new commands and configuration settings to package.json
  - Define contribution points for context menus and settings
  - Update extension activation events
  - _Requirements: 3.1, 4.1, 4.2, 4.4_

- [x] 2. Implement core conversion service
  - [x] 2.1 Create ConversionService class with CLI integration
    - Implement file conversion using existing CLI generator
    - Handle file system operations and error management
    - Provide async conversion with proper error handling
    - _Requirements: 1.1, 1.2, 1.4_

  - [x] 2.2 Write property test for conversion service
    - **Property 1: Conversion Service Integration**
    - **Validates: Requirements 1.1**

  - [ ]* 2.3 Write property test for output file naming
    - **Property 2: Output File Naming**
    - **Validates: Requirements 1.2**

  - [ ]* 2.4 Write property test for output file location
    - **Property 4: Output File Location**
    - **Validates: Requirements 1.4**

- [x] 3. Implement configuration management
  - [x] 3.1 Create ConfigurationManager class
    - Implement settings access for auto-convert, output directory, and notifications
    - Provide type-safe configuration interface
    - Handle configuration validation
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 3.2 Write unit tests for configuration manager
    - Test settings access and validation
    - Test default value handling
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 4. Checkpoint - Ensure core services work
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement command handler for context menu
  - [x] 5.1 Create CommandHandler class
    - Register "Convert to KityMinder JSON" command
    - Handle command execution and user feedback
    - Integrate with conversion service
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ]* 5.2 Write property test for command triggering
    - **Property 10: Context Menu Command Triggering**
    - **Validates: Requirements 3.2**

  - [ ]* 5.3 Write property test for success notification with path
    - **Property 11: Success Notification with Path**
    - **Validates: Requirements 3.3**

- [x] 6. Implement file watcher for auto-conversion
  - [x] 6.1 Create FileWatcher class
    - Listen to onDidSaveTextDocument events
    - Filter for .cmind files and trigger conversion
    - Respect user settings for auto-conversion
    - _Requirements: 2.1, 2.2, 2.4_

  - [ ]* 6.2 Write property test for save event triggering
    - **Property 5: Save Event Triggering**
    - **Validates: Requirements 2.1**

  - [ ]* 6.3 Write property test for disabled auto-conversion
    - **Property 8: Disabled Auto-Conversion**
    - **Validates: Requirements 2.4**

- [x] 7. Implement error handling and notifications
  - [x] 7.1 Add comprehensive error handling
    - Implement error message display for conversion failures
    - Handle syntax errors with location details
    - Handle file system errors gracefully
    - _Requirements: 1.3, 2.5, 5.1, 5.2_

  - [x] 7.2 Add notification system
    - Implement success and error notifications
    - Respect user notification preferences
    - Include relevant details in notifications
    - _Requirements: 2.3, 2.5, 3.3_

  - [ ]* 7.3 Write property test for error handling
    - **Property 3: Error Message Display**
    - **Validates: Requirements 1.3**

  - [ ]* 7.4 Write property test for syntax error reporting
    - **Property 14: Syntax Error Reporting**
    - **Validates: Requirements 5.1**

- [x] 8. Implement advanced features
  - [x] 8.1 Add automatic directory creation
    - Create output directories when they don't exist
    - Handle directory creation errors
    - _Requirements: 5.3_

  - [x] 8.2 Add file protection on failure
    - Ensure failed conversions don't overwrite existing files
    - Implement safe file writing with temporary files
    - _Requirements: 5.4_

  - [ ]* 8.3 Write property test for directory creation
    - **Property 16: Automatic Directory Creation**
    - **Validates: Requirements 5.3**

  - [ ]* 8.4 Write property test for file protection
    - **Property 17: File Protection on Failure**
    - **Validates: Requirements 5.4**

- [x] 9. Integration and wiring
  - [x] 9.1 Update main extension file
    - Integrate all services into the main extension activation
    - Register commands, watchers, and event handlers
    - Ensure proper cleanup on deactivation
    - _Requirements: All requirements_

  - [x] 9.2 Add context menu filtering
    - Ensure convert option only shows for .cmind files
    - Implement proper context menu conditions
    - _Requirements: 3.4_

  - [ ]* 9.3 Write property test for menu visibility
    - **Property 12: File Type Menu Visibility**
    - **Validates: Requirements 3.4**

- [ ] 10. Final testing and validation
  - [ ]* 10.1 Write integration tests
    - Test complete workflow from save to conversion
    - Test context menu to conversion workflow
    - Test error scenarios end-to-end
    - _Requirements: All requirements_

  - [ ]* 10.2 Write property tests for notification system
    - **Property 7: Success Notification**
    - **Property 9: Error Notification**
    - **Validates: Requirements 2.3, 2.5**

- [ ] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The implementation builds on the existing CLI conversion functionality
- TypeScript is used throughout for type safety and VSCode extension compatibility