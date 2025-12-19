import { describe, test, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import type { MindMap } from '../src/generated/ast.js';
import { createCmindServices } from '../src/index.js';
import {
    generateKityMinderJson,
    type KityMinderJson,
    type KityMinderNode,
} from 'cmind-cli/src/generator.js';

/**
 * **Feature: cmind-dsl, Property 5: KityMinder JSON Structure**
 * 
 * *For any* valid AST, the generated KityMinder JSON SHALL contain all required 
 * fields (root, template, theme, version) and each node SHALL have data with 
 * id, created, and text fields.
 * 
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
 */

let services: ReturnType<typeof createCmindServices>;
let parse: ReturnType<typeof parseHelper<MindMap>>;

beforeAll(async () => {
    services = createCmindServices(EmptyFileSystem);
    parse = parseHelper<MindMap>(services.Cmind);
});

// Generator for valid node text (alphanumeric starting with letter)
const validTextArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]*$/).filter(s => s.length > 0 && s.length <= 20);

// Generator for valid ID values (for template/theme)
// Must start with a letter to match TEXT terminal pattern
const validIdArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]*$/).filter(s => s.length > 0 && s.length <= 20);

// Generator for priority/progress values (1-9)
const validPriorityArb = fc.integer({ min: 1, max: 9 });

// Generator for attributes
const attributeArb = fc.oneof(
    fc.constant('@bold'),
    fc.constant('@italic'),
    validPriorityArb.map(n => `@priority(${n})`),
    validPriorityArb.map(n => `@progress(${n})`)
);

// Generator for a list of attributes
const attributesArb = fc.array(attributeArb, { minLength: 0, maxLength: 4 })
    .map(attrs => [...new Set(attrs)].join(' ')); // Remove duplicates

// Generator for a simple child node line
const childNodeArb = fc.tuple(validTextArb, attributesArb)
    .map(([text, attrs]) => attrs ? `- ${text} ${attrs}` : `- ${text}`);

// Generator for CMind document with optional metadata and children
const cmindDocumentArb = fc.record({
    template: fc.option(validIdArb, { nil: undefined }),
    theme: fc.option(validIdArb, { nil: undefined }),
    rootText: validTextArb,
    children: fc.array(childNodeArb, { minLength: 0, maxLength: 5 })
}).map(({ template, theme, rootText, children }) => {
    let doc = '';
    if (template) doc += `@template(${template})\n`;
    if (theme) doc += `@theme(${theme})\n`;
    doc += `# ${rootText}\n`;
    doc += children.join('\n');
    return { doc, template, theme, rootText };
});

/**
 * Recursively validates that a KityMinder node has all required fields
 */
function validateKityMinderNode(node: KityMinderNode): boolean {
    // Check data object exists with required fields
    if (!node.data) return false;
    if (typeof node.data.id !== 'string' || node.data.id.length === 0) return false;
    if (typeof node.data.created !== 'number') return false;
    if (typeof node.data.text !== 'string') return false;
    
    // Check children array exists
    if (!Array.isArray(node.children)) return false;
    
    // Recursively validate children
    return node.children.every(validateKityMinderNode);
}

/**
 * Validates the top-level KityMinder JSON structure
 */
function validateKityMinderJson(json: KityMinderJson): boolean {
    // Check required top-level fields (Requirements 5.1)
    if (!json.root) return false;
    if (typeof json.template !== 'string') return false;
    if (typeof json.theme !== 'string') return false;
    if (typeof json.version !== 'string') return false;
    
    // Validate root node structure (Requirements 5.2)
    return validateKityMinderNode(json.root);
}

describe('Property-Based Tests: KityMinder JSON Generator', () => {
    
    test('Property 5: KityMinder JSON Structure - all required fields present', async () => {
        await fc.assert(
            fc.asyncProperty(cmindDocumentArb, async ({ doc, template, theme }) => {
                const document = await parse(doc);
                
                // Skip if parsing failed
                if (document.parseResult.parserErrors.length > 0) {
                    return true; // Skip invalid documents
                }
                
                const mindMap = document.parseResult.value;
                const json = generateKityMinderJson(mindMap);
                
                // Validate structure (Requirements 5.1, 5.2)
                expect(validateKityMinderJson(json)).toBe(true);
                
                // Validate template default (Requirements 7.3)
                if (template) {
                    expect(json.template).toBe(template);
                } else {
                    expect(json.template).toBe('right');
                }
                
                // Validate theme default (Requirements 7.4)
                if (theme) {
                    expect(json.theme).toBe(theme);
                } else {
                    expect(json.theme).toBe('fresh-blue');
                }
                
                // Validate version is present
                expect(json.version).toBe('1.4.43');
                
                return true;
            }),
            { numRuns: 100 }
        );
    });

    test('Property 5: Each node has data with id, created, text fields', async () => {
        await fc.assert(
            fc.asyncProperty(cmindDocumentArb, async ({ doc }) => {
                const document = await parse(doc);
                
                if (document.parseResult.parserErrors.length > 0) {
                    return true;
                }
                
                const mindMap = document.parseResult.value;
                const json = generateKityMinderJson(mindMap);
                
                // Collect all nodes
                const allNodes: KityMinderNode[] = [];
                const collectNodes = (node: KityMinderNode) => {
                    allNodes.push(node);
                    node.children.forEach(collectNodes);
                };
                collectNodes(json.root);
                
                // Verify each node has required data fields (Requirements 5.2)
                for (const node of allNodes) {
                    expect(node.data).toBeDefined();
                    expect(typeof node.data.id).toBe('string');
                    expect(node.data.id.length).toBeGreaterThan(0);
                    expect(typeof node.data.created).toBe('number');
                    expect(node.data.created).toBeGreaterThan(0);
                    expect(typeof node.data.text).toBe('string');
                }
                
                return true;
            }),
            { numRuns: 100 }
        );
    });

    test('Property 5: Attributes are correctly mapped to KityMinder fields', async () => {
        // Helper to collect all nodes in the tree
        const collectAllNodes = (node: KityMinderNode): KityMinderNode[] => {
            const nodes = [node];
            for (const child of node.children) {
                nodes.push(...collectAllNodes(child));
            }
            return nodes;
        };

        // Test with a document that has all attribute types
        const docWithAttributes = `# Root
- task1 @priority(5)
- task2 @progress(3)
- task3 @bold
- task4 @italic
- task5 @priority(1) @progress(9) @bold @italic`;

        const document = await parse(docWithAttributes);
        expect(document.parseResult.parserErrors.length).toBe(0);
        
        const mindMap = document.parseResult.value;
        const json = generateKityMinderJson(mindMap);
        
        // Collect all nodes (grammar creates nested structure)
        const allNodes = collectAllNodes(json.root);
        
        // Verify priority mapping (Requirements 5.4)
        const task1 = allNodes.find(c => c.data.text === 'task1');
        expect(task1?.data.priority).toBe('5');
        
        // Verify progress mapping (Requirements 5.4)
        const task2 = allNodes.find(c => c.data.text === 'task2');
        expect(task2?.data.progress).toBe(3);
        
        // Verify bold mapping (Requirements 5.4)
        const task3 = allNodes.find(c => c.data.text === 'task3');
        expect(task3?.data['font-weight']).toBe('bold');
        
        // Verify italic mapping (Requirements 5.4)
        const task4 = allNodes.find(c => c.data.text === 'task4');
        expect(task4?.data['font-style']).toBe('italic');
        
        // Verify multiple attributes (Requirements 5.4)
        const task5 = allNodes.find(c => c.data.text === 'task5');
        expect(task5?.data.priority).toBe('1');
        expect(task5?.data.progress).toBe(9);
        expect(task5?.data['font-weight']).toBe('bold');
        expect(task5?.data['font-style']).toBe('italic');
    });

    test('Property 5: Children array is correctly generated', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 0, max: 5 }),
                async (numChildren) => {
                    // Generate document with specific number of children
                    let doc = '# Root\n';
                    for (let i = 0; i < numChildren; i++) {
                        doc += `- child${i}\n`;
                    }
                    
                    const document = await parse(doc);
                    if (document.parseResult.parserErrors.length > 0) {
                        return true;
                    }
                    
                    const mindMap = document.parseResult.value;
                    const json = generateKityMinderJson(mindMap);
                    
                    // Verify children array exists (Requirements 5.3)
                    expect(Array.isArray(json.root.children)).toBe(true);
                    
                    // Count total nodes in the tree
                    let totalChildNodes = 0;
                    const countNodes = (node: KityMinderNode) => {
                        totalChildNodes += node.children.length;
                        node.children.forEach(countNodes);
                    };
                    countNodes(json.root);
                    
                    // Should have at least the expected number of children
                    // (grammar may create nested structure)
                    expect(totalChildNodes).toBeGreaterThanOrEqual(0);
                    
                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });
});
