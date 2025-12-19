import { describe, test, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import type { MindMap, ChildNode, Attribute, Metadata } from '../src/generated/ast.js';
import {
    isPriorityAttribute,
    isProgressAttribute,
    isBoldAttribute,
    isItalicAttribute,
    isTemplateMetadata,
    isThemeMetadata,
} from '../src/generated/ast.js';
import { createCmindServices } from '../src/index.js';
import { print } from 'cmind-cli/src/printer.js';

/**
 * **Feature: cmind-dsl, Property 6: Round-Trip Consistency (CRITICAL)**
 */

let services: ReturnType<typeof createCmindServices>;
let parse: ReturnType<typeof parseHelper<MindMap>>;

beforeAll(async () => {
    services = createCmindServices(EmptyFileSystem);
    parse = parseHelper<MindMap>(services.Cmind);
});

const validTextArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]*$/)
    .filter(s => s.length > 0 && s.length <= 20);

const validIdArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]*$/)
    .filter(s => s.length >= 1 && s.length <= 20);

const validValueArb = fc.integer({ min: 1, max: 9 });

interface AttributeData {
    type: 'priority' | 'progress' | 'bold' | 'italic';
    value?: number;
}

const attributeArb: fc.Arbitrary<AttributeData> = fc.oneof(
    fc.constant<AttributeData>({ type: 'bold' }),
    fc.constant<AttributeData>({ type: 'italic' }),
    validValueArb.map(n => ({ type: 'priority' as const, value: n })),
    validValueArb.map(n => ({ type: 'progress' as const, value: n }))
);

const uniqueAttributesArb = fc.array(attributeArb, { minLength: 0, maxLength: 4 })
    .map(attrs => {
        const seen = new Set<string>();
        return attrs.filter(a => {
            if (seen.has(a.type)) return false;
            seen.add(a.type);
            return true;
        });
    });

interface ChildNodeData {
    text: string;
    attributes: AttributeData[];
    children: ChildNodeData[];
}

const leafChildNodeArb: fc.Arbitrary<ChildNodeData> = fc.record({
    text: validTextArb,
    attributes: uniqueAttributesArb,
    children: fc.constant<ChildNodeData[]>([])
});

const childNodeArb = (depth: number): fc.Arbitrary<ChildNodeData> => {
    if (depth <= 0) {
        return leafChildNodeArb;
    }
    return fc.record({
        text: validTextArb,
        attributes: uniqueAttributesArb,
        children: fc.array(childNodeArb(depth - 1), { minLength: 0, maxLength: 3 })
    });
};

interface MetadataData {
    template?: string;
    theme?: string;
}

const metadataArb: fc.Arbitrary<MetadataData> = fc.record({
    template: fc.option(validIdArb, { nil: undefined }),
    theme: fc.option(validIdArb, { nil: undefined })
});

interface MindMapData {
    metadata: MetadataData;
    rootText: string;
    children: ChildNodeData[];
}

const mindMapArb: fc.Arbitrary<MindMapData> = fc.record({
    metadata: metadataArb,
    rootText: validTextArb,
    children: fc.array(childNodeArb(2), { minLength: 0, maxLength: 4 })
});

function mindMapDataToText(data: MindMapData): string {
    const lines: string[] = [];
    
    if (data.metadata.template) {
        lines.push(`@template(${data.metadata.template})`);
    }
    if (data.metadata.theme) {
        lines.push(`@theme(${data.metadata.theme})`);
    }
    if (data.metadata.template || data.metadata.theme) {
        lines.push('');
    }
    
    lines.push(`# ${data.rootText}`);
    
    for (const child of data.children) {
        childNodeDataToText(child, lines, 1);
    }
    
    return lines.join('\n');
}

function childNodeDataToText(node: ChildNodeData, lines: string[], depth: number): void {
    const indent = '  '.repeat(depth);
    const attrStr = attributesToString(node.attributes);
    const suffix = attrStr ? ` ${attrStr}` : '';
    lines.push(`${indent}- ${node.text}${suffix}`);
    
    for (const child of node.children) {
        childNodeDataToText(child, lines, depth + 1);
    }
}

function attributesToString(attrs: AttributeData[]): string {
    const sorted = [...attrs].sort((a, b) => {
        const order = ['priority', 'progress', 'bold', 'italic'];
        return order.indexOf(a.type) - order.indexOf(b.type);
    });
    
    return sorted.map(a => {
        switch (a.type) {
            case 'priority': return `@priority(${a.value})`;
            case 'progress': return `@progress(${a.value})`;
            case 'bold': return '@bold';
            case 'italic': return '@italic';
        }
    }).join(' ');
}

function extractMindMapData(ast: MindMap): MindMapData {
    return {
        metadata: extractMetadata(ast.metadata),
        rootText: ast.root.text.trim(),
        children: ast.root.children.map(extractChildNodeData)
    };
}

function extractMetadata(metadata: Metadata[]): MetadataData {
    const result: MetadataData = {};
    for (const m of metadata) {
        if (isTemplateMetadata(m)) {
            result.template = m.value;
        } else if (isThemeMetadata(m)) {
            result.theme = m.value;
        }
    }
    return result;
}

function extractChildNodeData(node: ChildNode): ChildNodeData {
    return {
        text: node.text.trim(),
        attributes: node.attributes.map(extractAttributeData),
        children: node.children.map(extractChildNodeData)
    };
}

function extractAttributeData(attr: Attribute): AttributeData {
    if (isPriorityAttribute(attr)) {
        return { type: 'priority', value: attr.value };
    } else if (isProgressAttribute(attr)) {
        return { type: 'progress', value: attr.value };
    } else if (isBoldAttribute(attr)) {
        return { type: 'bold' };
    } else if (isItalicAttribute(attr)) {
        return { type: 'italic' };
    }
    throw new Error('Unknown attribute type');
}

function areMindMapsEquivalent(a: MindMapData, b: MindMapData): boolean {
    if (a.metadata.template !== b.metadata.template) return false;
    if (a.metadata.theme !== b.metadata.theme) return false;
    if (a.rootText !== b.rootText) return false;
    return areChildrenEquivalent(a.children, b.children);
}

function areChildrenEquivalent(a: ChildNodeData[], b: ChildNodeData[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (!areChildNodesEquivalent(a[i], b[i])) return false;
    }
    return true;
}

function areChildNodesEquivalent(a: ChildNodeData, b: ChildNodeData): boolean {
    if (a.text !== b.text) return false;
    if (!areAttributesEquivalent(a.attributes, b.attributes)) return false;
    return areChildrenEquivalent(a.children, b.children);
}

function areAttributesEquivalent(a: AttributeData[], b: AttributeData[]): boolean {
    if (a.length !== b.length) return false;
    const sortByType = (attrs: AttributeData[]) => 
        [...attrs].sort((x, y) => x.type.localeCompare(y.type));
    const sortedA = sortByType(a);
    const sortedB = sortByType(b);
    for (let i = 0; i < sortedA.length; i++) {
        if (sortedA[i].type !== sortedB[i].type) return false;
        if (sortedA[i].value !== sortedB[i].value) return false;
    }
    return true;
}

describe('Property-Based Tests: Round-Trip Consistency', () => {
    
    test('Property 6: Round-Trip Consistency - parse(print(ast)) ≡ ast', async () => {
        await fc.assert(
            fc.asyncProperty(mindMapArb, async (data) => {
                const originalText = mindMapDataToText(data);
                
                const document1 = await parse(originalText);
                if (document1.parseResult.parserErrors.length > 0) {
                    console.log('Parse error on original:', originalText);
                    console.log('Errors:', document1.parseResult.parserErrors);
                    return true;
                }
                
                const ast1 = document1.parseResult.value;
                const printedText = print(ast1);
                const document2 = await parse(printedText);
                
                expect(document2.parseResult.parserErrors.length).toBe(0);
                
                const ast2 = document2.parseResult.value;
                const data1 = extractMindMapData(ast1);
                const data2 = extractMindMapData(ast2);
                
                const equivalent = areMindMapsEquivalent(data1, data2);
                
                if (!equivalent) {
                    console.log('Original text:', originalText);
                    console.log('Printed text:', printedText);
                    console.log('Data1:', JSON.stringify(data1, null, 2));
                    console.log('Data2:', JSON.stringify(data2, null, 2));
                }
                
                expect(equivalent).toBe(true);
                return true;
            }),
            { numRuns: 100 }
        );
    });

    test('Property 6: Round-Trip preserves metadata', async () => {
        await fc.assert(
            fc.asyncProperty(
                validIdArb,
                validIdArb,
                validTextArb,
                async (template, theme, rootText) => {
                    const originalText = `@template(${template})\n@theme(${theme})\n\n# ${rootText}`;
                    
                    const document1 = await parse(originalText);
                    if (document1.parseResult.parserErrors.length > 0) {
                        return true;
                    }
                    
                    const ast1 = document1.parseResult.value;
                    const printedText = print(ast1);
                    const document2 = await parse(printedText);
                    
                    expect(document2.parseResult.parserErrors.length).toBe(0);
                    
                    const ast2 = document2.parseResult.value;
                    const meta1 = extractMetadata(ast1.metadata);
                    const meta2 = extractMetadata(ast2.metadata);
                    
                    expect(meta1.template).toBe(meta2.template);
                    expect(meta1.theme).toBe(meta2.theme);
                    
                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    test('Property 6: Round-Trip preserves tree structure', async () => {
        await fc.assert(
            fc.asyncProperty(mindMapArb, async (data) => {
                const originalText = mindMapDataToText(data);
                
                const document1 = await parse(originalText);
                if (document1.parseResult.parserErrors.length > 0) {
                    return true;
                }
                
                const ast1 = document1.parseResult.value;
                const printedText = print(ast1);
                const document2 = await parse(printedText);
                
                expect(document2.parseResult.parserErrors.length).toBe(0);
                
                const ast2 = document2.parseResult.value;
                
                const countNodes = (children: ChildNode[]): number => {
                    let count = children.length;
                    for (const child of children) {
                        count += countNodes(child.children);
                    }
                    return count;
                };
                
                const count1 = countNodes(ast1.root.children);
                const count2 = countNodes(ast2.root.children);
                
                expect(count1).toBe(count2);
                
                return true;
            }),
            { numRuns: 100 }
        );
    });

    test('Property 6: Round-Trip preserves attributes', async () => {
        await fc.assert(
            fc.asyncProperty(
                validTextArb,
                validValueArb,
                validValueArb,
                async (text, priority, progress) => {
                    const originalText = `# Root\n  - ${text} @priority(${priority}) @progress(${progress}) @bold @italic`;
                    
                    const document1 = await parse(originalText);
                    if (document1.parseResult.parserErrors.length > 0) {
                        return true;
                    }
                    
                    const ast1 = document1.parseResult.value;
                    const printedText = print(ast1);
                    const document2 = await parse(printedText);
                    
                    expect(document2.parseResult.parserErrors.length).toBe(0);
                    
                    const ast2 = document2.parseResult.value;
                    
                    const attrs1 = ast1.root.children[0]?.attributes.map(extractAttributeData) ?? [];
                    const attrs2 = ast2.root.children[0]?.attributes.map(extractAttributeData) ?? [];
                    
                    expect(areAttributesEquivalent(attrs1, attrs2)).toBe(true);
                    
                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });
});
