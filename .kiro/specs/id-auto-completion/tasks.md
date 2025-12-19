# Implementation Plan

- [-] 1. Implement ID Calculator Module
  - [x] 1.1 Create `id-calculator.ts` with core functions
    - Create `packages/language/src/id-calculator.ts`
    - Implement `extractNodeNumber(id: string): number | undefined`
    - Implement `formatNodeId(num: number): string`
    - Implement `calculateNextId(existingIds: string[]): string`
    - Implement `collectExistingIds(mindMap: MindMap): string[]`
    - Export functions from `packages/language/src/index.ts`
    - _Requirements: 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 4.1, 4.2_
  - [x] 1.2 Write property test for ID calculation
    - **Property 1: ID Calculation Correctness**
    - **Validates: Requirements 1.2, 1.3, 1.4, 2.1, 2.3, 4.1, 4.2**
  - [x] 1.3 Write property test for ID formatting
    - **Property 2: ID Formatting Consistency**
    - **Validates: Requirements 1.3, 2.2**
  - [ ]* 1.4 Write unit tests for edge cases
    - Test empty ID list returns `node001`
    - Test single ID `node001` returns `node002`
    - Test max ID `node999` returns `node1000`
    - Test mixed formats are handled correctly
    - _Requirements: 1.4, 2.1, 2.2_

- [ ] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement Completion Provider
  - [x] 3.1 Create `cmind-completion-provider.ts`
    - Create `packages/language/src/cmind-completion-provider.ts`
    - Extend `DefaultCompletionProvider` from Langium
    - Override completion method to add @id suggestion after node text
    - Use ID Calculator to generate next ID
    - Include descriptive label and documentation in completion item
    - _Requirements: 1.1, 1.5, 2.4, 3.1, 3.2_
  - [x] 3.2 Register CompletionProvider in module
    - Update `packages/language/src/cmind-module.ts`
    - Add `lsp.CompletionProvider` to CmindModule
    - Export CmindCompletionProvider from index.ts
    - _Requirements: 1.1, 3.1_

- [x] 4. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
