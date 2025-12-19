import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import {
    extractNodeNumber,
    formatNodeId,
    calculateNextId,
} from '../src/id-calculator.js';

/**
 * **Feature: id-auto-completion, Property 1: ID Calculation Correctness**
 * 
 * *For any* list of existing ID strings, the `calculateNextId` function SHALL return 
 * a properly formatted ID string where:
 * - The numeric value is exactly one greater than the maximum numeric suffix found 
 *   in IDs matching the `node` + digits pattern
 * - If no valid numeric IDs exist, the result is `node001`
 * - Non-numeric IDs (e.g., `nodeA`, `root001`) are ignored in the calculation
 * 
 * **Validates: Requirements 1.2, 1.3, 1.4, 2.1, 2.3, 4.1, 4.2**
 */

// Generator for valid node IDs (node followed by digits)
const validNodeIdArb = fc.integer({ min: 1, max: 9999 })
    .map(n => `node${n}`);

// Generator for valid node IDs with zero-padding variations
const validNodeIdWithPaddingArb = fc.integer({ min: 1, max: 999 })
    .chain(n => fc.constantFrom(
        `node${n}`,
        `node${n.toString().padStart(2, '0')}`,
        `node${n.toString().padStart(3, '0')}`
    ));

// Generator for invalid node IDs (non-numeric suffixes or different prefixes)
const invalidNodeIdArb = fc.oneof(
    // Non-numeric suffix
    fc.stringMatching(/^node[a-zA-Z]+$/).filter(s => s.length > 4 && s.length <= 20),
    // Different prefix with numeric suffix
    fc.tuple(
        fc.stringMatching(/^[a-zA-Z]+$/).filter(s => s.length > 0 && s.length <= 10 && s !== 'node'),
        fc.integer({ min: 1, max: 999 })
    ).map(([prefix, num]) => `${prefix}${num.toString().padStart(3, '0')}`),
    // Empty or whitespace
    fc.constant(''),
    // Just "node" without number
    fc.constant('node')
);

// Generator for mixed ID lists (valid and invalid)
const mixedIdListArb = fc.tuple(
    fc.array(validNodeIdArb, { minLength: 0, maxLength: 10 }),
    fc.array(invalidNodeIdArb, { minLength: 0, maxLength: 5 })
).map(([valid, invalid]) => {
    const combined = [...valid, ...invalid];
    // Shuffle the array
    for (let i = combined.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [combined[i], combined[j]] = [combined[j], combined[i]];
    }
    return combined;
});

describe('Property-Based Tests: ID Calculator', () => {
    
    test('Property 1: ID Calculation Correctness - next ID is max + 1', async () => {
        await fc.assert(
            fc.property(
                fc.array(validNodeIdArb, { minLength: 1, maxLength: 20 }),
                (ids) => {
                    const result = calculateNextId(ids);
                    
                    // Extract the max number from input IDs
                    const maxNum = Math.max(...ids.map(id => extractNodeNumber(id) ?? 0));
                    
                    // The result should be max + 1
                    const resultNum = extractNodeNumber(result);
                    expect(resultNum).toBe(maxNum + 1);
                    
                    // The result should be properly formatted
                    expect(result).toBe(formatNodeId(maxNum + 1));
                    
                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    test('Property 1: ID Calculation Correctness - empty list returns node001', async () => {
        await fc.assert(
            fc.property(
                fc.constant([] as string[]),
                (ids) => {
                    const result = calculateNextId(ids);
                    expect(result).toBe('node001');
                    return true;
                }
            ),
            { numRuns: 10 }
        );
    });

    test('Property 1: ID Calculation Correctness - invalid IDs are ignored', async () => {
        await fc.assert(
            fc.property(
                fc.array(invalidNodeIdArb, { minLength: 1, maxLength: 10 }),
                (invalidIds) => {
                    const result = calculateNextId(invalidIds);
                    
                    // When all IDs are invalid, should return node001
                    expect(result).toBe('node001');
                    
                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    test('Property 1: ID Calculation Correctness - mixed valid/invalid IDs', async () => {
        await fc.assert(
            fc.property(
                mixedIdListArb,
                (ids) => {
                    const result = calculateNextId(ids);
                    
                    // Extract valid numbers only
                    const validNums = ids
                        .map(id => extractNodeNumber(id))
                        .filter((n): n is number => n !== undefined);
                    
                    const expectedMax = validNums.length > 0 ? Math.max(...validNums) : 0;
                    const expectedResult = formatNodeId(expectedMax + 1);
                    
                    expect(result).toBe(expectedResult);
                    
                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    test('Property 1: ID Calculation Correctness - handles different padding formats', async () => {
        await fc.assert(
            fc.property(
                fc.array(validNodeIdWithPaddingArb, { minLength: 1, maxLength: 15 }),
                (ids) => {
                    const result = calculateNextId(ids);
                    
                    // Extract max number regardless of padding
                    const maxNum = Math.max(...ids.map(id => extractNodeNumber(id) ?? 0));
                    
                    // Result should be max + 1 with proper formatting
                    const resultNum = extractNodeNumber(result);
                    expect(resultNum).toBe(maxNum + 1);
                    
                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    test('Property 1: ID Calculation Correctness - result is always valid format', async () => {
        await fc.assert(
            fc.property(
                mixedIdListArb,
                (ids) => {
                    const result = calculateNextId(ids);
                    
                    // Result should always match the node + digits pattern
                    expect(result).toMatch(/^node\d+$/);
                    
                    // Result should be extractable
                    const num = extractNodeNumber(result);
                    expect(num).toBeDefined();
                    expect(num).toBeGreaterThan(0);
                    
                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    test('Property 1: ID Calculation Correctness - deterministic (pure function)', async () => {
        await fc.assert(
            fc.property(
                mixedIdListArb,
                (ids) => {
                    // Call the function multiple times with the same input
                    const result1 = calculateNextId(ids);
                    const result2 = calculateNextId(ids);
                    const result3 = calculateNextId([...ids]); // Copy of array
                    
                    // All results should be identical
                    expect(result1).toBe(result2);
                    expect(result2).toBe(result3);
                    
                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });
});

/**
 * **Feature: id-auto-completion, Property 2: ID Formatting Consistency**
 * 
 * *For any* positive integer n, the `formatNodeId` function SHALL return:
 * - `node` + 3-digit zero-padded number when n < 1000 (e.g., `node001`, `node042`, `node999`)
 * - `node` + unpadded number when n >= 1000 (e.g., `node1000`, `node1234`)
 * 
 * **Validates: Requirements 1.3, 2.2**
 */
describe('Property-Based Tests: ID Formatting', () => {

    test('Property 2: ID Formatting Consistency - numbers < 1000 are zero-padded to 3 digits', async () => {
        await fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 999 }),
                (n) => {
                    const result = formatNodeId(n);
                    
                    // Should start with "node"
                    expect(result.startsWith('node')).toBe(true);
                    
                    // Extract the numeric part
                    const numericPart = result.slice(4);
                    
                    // Should be exactly 3 digits (zero-padded)
                    expect(numericPart.length).toBe(3);
                    
                    // Should parse back to the original number
                    expect(parseInt(numericPart, 10)).toBe(n);
                    
                    // Should match expected format
                    expect(result).toBe(`node${n.toString().padStart(3, '0')}`);
                    
                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    test('Property 2: ID Formatting Consistency - numbers >= 1000 are not padded', async () => {
        await fc.assert(
            fc.property(
                fc.integer({ min: 1000, max: 99999 }),
                (n) => {
                    const result = formatNodeId(n);
                    
                    // Should start with "node"
                    expect(result.startsWith('node')).toBe(true);
                    
                    // Extract the numeric part
                    const numericPart = result.slice(4);
                    
                    // Should NOT have leading zeros (not padded)
                    expect(numericPart[0]).not.toBe('0');
                    
                    // Should parse back to the original number
                    expect(parseInt(numericPart, 10)).toBe(n);
                    
                    // Should match expected format (no padding)
                    expect(result).toBe(`node${n}`);
                    
                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    test('Property 2: ID Formatting Consistency - round-trip with extractNodeNumber', async () => {
        await fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 99999 }),
                (n) => {
                    const formatted = formatNodeId(n);
                    const extracted = extractNodeNumber(formatted);
                    
                    // Round-trip should preserve the number
                    expect(extracted).toBe(n);
                    
                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    test('Property 2: ID Formatting Consistency - output always matches valid pattern', async () => {
        await fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 99999 }),
                (n) => {
                    const result = formatNodeId(n);
                    
                    // Should always match the node + digits pattern
                    expect(result).toMatch(/^node\d+$/);
                    
                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });
});
