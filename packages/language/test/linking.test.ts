import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { clearDocuments, parseHelper } from "langium/test";
import type { MindMap } from "../src/generated/ast.js";
import { createCmindServices, isMindMap } from "../src/index.js";

let services: ReturnType<typeof createCmindServices>;
let parse: ReturnType<typeof parseHelper<MindMap>>;
let document: LangiumDocument<MindMap> | undefined;

beforeAll(async () => {
    services = createCmindServices(EmptyFileSystem);
    parse = parseHelper<MindMap>(services.Cmind);
});

afterEach(async () => {
    document && clearDocuments(services.shared, [document]);
});

describe('Linking tests', () => {
    // CMind DSL does not have cross-references between nodes,
    // so linking tests are minimal. This test verifies the document
    // structure is properly linked internally.

    test('document structure is properly linked', async () => {
        document = await parse(`# Topic
- child1
- child2`);

        expect(checkDocumentValid(document)).toBeUndefined();
        
        // Verify root node is linked to MindMap
        const mindMap = document.parseResult.value;
        expect(mindMap.root).toBeDefined();
        expect(mindMap.root.$container).toBe(mindMap);
        
        // Verify children are linked to root
        const children = mindMap.root.children;
        expect(children.length).toBeGreaterThanOrEqual(1);
        expect(children[0].$container).toBe(mindMap.root);
    });
});

function checkDocumentValid(document: LangiumDocument): string | undefined {
    if (document.parseResult.parserErrors.length) {
        return `Parser errors:\n  ${document.parseResult.parserErrors.map(e => e.message).join('\n  ')}`;
    }
    if (document.parseResult.value === undefined) {
        return `ParseResult is 'undefined'.`;
    }
    if (!isMindMap(document.parseResult.value)) {
        return `Root AST object is a ${document.parseResult.value.$type}, expected a 'MindMap'.`;
    }
    return undefined;
}
