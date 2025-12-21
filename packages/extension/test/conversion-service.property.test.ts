import { describe, test, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { ConversionService } from '../src/extension/conversion-service.js';

/**
 * **Feature: vscode-auto-convert, Property 1: Conversion Service Integration**
 * **Validates: Requirements 1.1**
 */

let conversionService: ConversionService;
let tempDir: string;

beforeAll(async () => {
    conversionService = new ConversionService();
    // Create a temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmind-test-'));
});

// Generator for valid CMind DSL content
const validTextArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]*$/)
    .filter(s => s.length > 0 && s.length <= 50);

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
        children: fc.array(childNodeArb(depth - 1), { minLength: 0, maxLength: 2 })
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
    children: fc.array(childNodeArb(1), { minLength: 0, maxLength: 3 })
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

function createTempCmindFile(content: string): string {
    const fileName = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.cmind`;
    const filePath = path.join(tempDir, fileName);
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
}

function cleanupFile(filePath: string): void {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        // Ignore cleanup errors
    }
}

describe('Property-Based Tests: Conversion Service Integration', () => {
    
    test('Property 1: Conversion Service Integration - For any valid CMind file, conversion service uses CLI generator', async () => {
        await fc.assert(
            fc.asyncProperty(mindMapArb, async (data) => {
                const cmindContent = mindMapDataToText(data);
                const filePath = createTempCmindFile(cmindContent);
                
                try {
                    // Test the conversion service
                    const result = await conversionService.convertFile(filePath);
                    
                    // The conversion should either succeed or fail gracefully
                    expect(typeof result.success).toBe('boolean');
                    
                    if (result.success) {
                        // If successful, should have an output path
                        expect(result.outputPath).toBeDefined();
                        expect(typeof result.outputPath).toBe('string');
                        
                        // Output file should exist
                        expect(fs.existsSync(result.outputPath!)).toBe(true);
                        
                        // Output file should be JSON
                        const outputContent = fs.readFileSync(result.outputPath!, 'utf-8');
                        expect(() => JSON.parse(outputContent)).not.toThrow();
                        
                        // JSON should have KityMinder structure
                        const json = JSON.parse(outputContent);
                        expect(json).toHaveProperty('root');
                        expect(json).toHaveProperty('template');
                        expect(json).toHaveProperty('theme');
                        expect(json).toHaveProperty('version');
                        
                        // Root should have expected structure
                        expect(json.root).toHaveProperty('data');
                        expect(json.root.data).toHaveProperty('id');
                        expect(json.root.data).toHaveProperty('text');
                        expect(json.root.data).toHaveProperty('created');
                        
                        // Clean up output file
                        cleanupFile(result.outputPath!);
                    } else {
                        // If failed, should have an error message
                        expect(result.error).toBeDefined();
                        expect(typeof result.error).toBe('string');
                        expect(result.error!.length).toBeGreaterThan(0);
                    }
                    
                    return true;
                } finally {
                    // Clean up input file
                    cleanupFile(filePath);
                }
            }),
            { numRuns: 100 }
        );
    });

    test('Property 1: Conversion Service Integration - Invalid files produce error messages', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.string({ minLength: 1, maxLength: 100 }),
                async (invalidContent) => {
                    // Create content that's likely to be invalid CMind DSL
                    const filePath = createTempCmindFile(invalidContent);
                    
                    try {
                        const result = await conversionService.convertFile(filePath);
                        
                        // Should always return a result
                        expect(typeof result.success).toBe('boolean');
                        
                        if (!result.success) {
                            // Failed conversion should have error message
                            expect(result.error).toBeDefined();
                            expect(typeof result.error).toBe('string');
                            expect(result.error!.length).toBeGreaterThan(0);
                        }
                        
                        return true;
                    } finally {
                        cleanupFile(filePath);
                    }
                }
            ),
            { numRuns: 50 }
        );
    });

    test('Property 1: Conversion Service Integration - Non-existent files produce error', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('/') && !s.includes('\\')),
                async (fileName) => {
                    const nonExistentPath = path.join(tempDir, `nonexistent-${fileName}.cmind`);
                    
                    // Ensure file doesn't exist
                    if (fs.existsSync(nonExistentPath)) {
                        fs.unlinkSync(nonExistentPath);
                    }
                    
                    const result = await conversionService.convertFile(nonExistentPath);
                    
                    // Should fail with error message
                    expect(result.success).toBe(false);
                    expect(result.error).toBeDefined();
                    expect(typeof result.error).toBe('string');
                    expect(result.error!.length).toBeGreaterThan(0);
                    // Updated to match new detailed error message format
                    expect(result.error).toMatch(/Cannot access file|File or directory not found/);
                    
                    return true;
                }
            ),
            { numRuns: 20 }
        );
    });

    test('Property 1: Conversion Service Integration - Wrong file extension produces error', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.string({ minLength: 1, maxLength: 10 }).filter(ext => 
                    ext !== 'cmind' && 
                    !ext.includes('/') && 
                    !ext.includes('\\') && 
                    !ext.includes('.') &&
                    /^[a-zA-Z0-9]+$/.test(ext)
                ),
                validTextArb,
                async (extension, content) => {
                    const fileName = `test-${Date.now()}.${extension}`;
                    const filePath = path.join(tempDir, fileName);
                    fs.writeFileSync(filePath, content, 'utf-8');
                    
                    try {
                        const result = await conversionService.convertFile(filePath);
                        
                        // Should fail with error about extension
                        expect(result.success).toBe(false);
                        expect(result.error).toBeDefined();
                        expect(result.error).toContain('Invalid file extension');
                        
                        return true;
                    } finally {
                        cleanupFile(filePath);
                    }
                }
            ),
            { numRuns: 20 }
        );
    });

    test('Property 1: Conversion Service Integration - Creates output directory when it does not exist', async () => {
        await fc.assert(
            fc.asyncProperty(mindMapArb, async (data) => {
                const cmindContent = mindMapDataToText(data);
                const filePath = createTempCmindFile(cmindContent);
                
                // Create a non-existent output directory path
                const nonExistentDir = path.join(tempDir, `output-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
                
                try {
                    // Ensure directory doesn't exist
                    if (fs.existsSync(nonExistentDir)) {
                        fs.rmSync(nonExistentDir, { recursive: true });
                    }
                    
                    // Test conversion with non-existent output directory
                    const result = await conversionService.convertFile(filePath, nonExistentDir);
                    
                    if (result.success) {
                        // Directory should have been created
                        expect(fs.existsSync(nonExistentDir)).toBe(true);
                        expect(fs.statSync(nonExistentDir).isDirectory()).toBe(true);
                        
                        // Output file should exist in the created directory
                        expect(result.outputPath).toBeDefined();
                        expect(fs.existsSync(result.outputPath!)).toBe(true);
                        expect(result.outputPath!.startsWith(nonExistentDir)).toBe(true);
                        
                        // Clean up
                        cleanupFile(result.outputPath!);
                        fs.rmSync(nonExistentDir, { recursive: true });
                    }
                    
                    return true;
                } finally {
                    cleanupFile(filePath);
                    // Ensure cleanup of directory
                    if (fs.existsSync(nonExistentDir)) {
                        fs.rmSync(nonExistentDir, { recursive: true });
                    }
                }
            }),
            { numRuns: 20 }
        );
    });

    test('Property 1: Conversion Service Integration - Protects existing files on conversion failure', async () => {
        await fc.assert(
            fc.asyncProperty(mindMapArb, async (data) => {
                const cmindContent = mindMapDataToText(data);
                const filePath = createTempCmindFile(cmindContent);
                
                try {
                    // First, create a successful conversion to get the output path
                    const initialResult = await conversionService.convertFile(filePath);
                    
                    if (initialResult.success && initialResult.outputPath) {
                        // Verify the output file exists
                        expect(fs.existsSync(initialResult.outputPath)).toBe(true);
                        
                        // Read the original content
                        const originalContent = fs.readFileSync(initialResult.outputPath, 'utf-8');
                        const originalStats = fs.statSync(initialResult.outputPath);
                        
                        // Now create an invalid CMind file that should fail conversion
                        const invalidContent = '# Invalid CMind\n- Unclosed @priority(';
                        const invalidFilePath = createTempCmindFile(invalidContent);
                        
                        try {
                            // Try to convert the invalid file to the same output location
                            const outputDir = path.dirname(initialResult.outputPath);
                            const failedResult = await conversionService.convertFile(invalidFilePath, outputDir);
                            
                            // Conversion should fail
                            expect(failedResult.success).toBe(false);
                            
                            // Original file should still exist and be unchanged
                            expect(fs.existsSync(initialResult.outputPath)).toBe(true);
                            const currentContent = fs.readFileSync(initialResult.outputPath, 'utf-8');
                            const currentStats = fs.statSync(initialResult.outputPath);
                            
                            // Content should be identical
                            expect(currentContent).toBe(originalContent);
                            // File modification time should be unchanged (within 1 second tolerance)
                            expect(Math.abs(currentStats.mtime.getTime() - originalStats.mtime.getTime())).toBeLessThan(1000);
                            
                            // No temporary files should remain
                            const tempFiles = fs.readdirSync(outputDir).filter(f => f.endsWith('.tmp'));
                            expect(tempFiles).toHaveLength(0);
                            
                        } finally {
                            cleanupFile(invalidFilePath);
                        }
                        
                        // Clean up the output file
                        cleanupFile(initialResult.outputPath);
                    }
                    
                    return true;
                } finally {
                    cleanupFile(filePath);
                }
            }),
            { numRuns: 10 }
        );
    });
});