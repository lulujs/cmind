import type { MindMap, ChildNode } from './generated/ast.js';
import { isIdAttribute } from './generated/ast.js';

/**
 * Extracts numeric suffix from an ID string with "node" prefix.
 * Returns undefined if the ID doesn't match the pattern `node` followed by digits.
 * 
 * @param id - The ID string to extract the number from
 * @returns The numeric value or undefined if pattern doesn't match
 */
export function extractNodeNumber(id: string): number | undefined {
    const match = id.match(/^node(\d+)$/);
    if (match) {
        return parseInt(match[1], 10);
    }
    return undefined;
}

/**
 * Formats a number as a node ID with proper zero-padding.
 * Numbers < 1000 are padded to 3 digits (e.g., 001, 042, 999)
 * Numbers >= 1000 are not padded (e.g., 1000, 1234)
 * 
 * @param num - The number to format (must be positive)
 * @returns Formatted node ID string
 */
export function formatNodeId(num: number): string {
    if (num < 1000) {
        return `node${num.toString().padStart(3, '0')}`;
    }
    return `node${num}`;
}

/**
 * Calculates the next available node ID based on existing IDs.
 * Returns "node001" if no valid numeric IDs exist.
 * Non-numeric IDs (e.g., nodeA, root001) are ignored in the calculation.
 * 
 * @param existingIds - Array of existing ID strings
 * @returns The next sequential ID string
 */
export function calculateNextId(existingIds: string[]): string {
    let maxNum = 0;
    
    for (const id of existingIds) {
        const num = extractNodeNumber(id);
        if (num !== undefined && num > maxNum) {
            maxNum = num;
        }
    }
    
    return formatNodeId(maxNum + 1);
}

/**
 * Collects all @id attribute values from a MindMap AST.
 * Traverses the root node and all child nodes recursively.
 * 
 * @param mindMap - The MindMap AST to collect IDs from
 * @returns Array of ID value strings
 */
export function collectExistingIds(mindMap: MindMap): string[] {
    const ids: string[] = [];
    
    // Collect ID from root node if present
    if (mindMap.root?.idAttr) {
        ids.push(mindMap.root.idAttr.value);
    }
    
    // Recursively collect IDs from all child nodes
    function collectFromChildren(children: ChildNode[]): void {
        for (const child of children) {
            // Check attributes for IdAttribute
            for (const attr of child.attributes) {
                if (isIdAttribute(attr)) {
                    ids.push(attr.value);
                }
            }
            // Recurse into nested children
            if (child.children.length > 0) {
                collectFromChildren(child.children);
            }
        }
    }
    
    if (mindMap.root?.children) {
        collectFromChildren(mindMap.root.children);
    }
    
    return ids;
}
