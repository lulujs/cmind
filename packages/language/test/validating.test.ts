import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { parseHelper } from "langium/test";
import type { Diagnostic } from "vscode-languageserver-types";
import type { MindMap } from "../src/generated/ast.js";
import { createCmindServices, isMindMap } from "../src/index.js";

let services: ReturnType<typeof createCmindServices>;
let parse: ReturnType<typeof parseHelper<MindMap>>;
let document: LangiumDocument<MindMap> | undefined;

beforeAll(async () => {
    services = createCmindServices(EmptyFileSystem);
    const doParse = parseHelper<MindMap>(services.Cmind);
    parse = (input: string) => doParse(input, { validation: true });
});

describe('Validating CMind DSL', () => {

    describe('Root Node Validation', () => {
        test('valid document with root node has no errors', async () => {
            document = await parse(`# MyTopic`);

            expect(
                checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
            ).toHaveLength(0);
        });

        test('document with root and children has no errors', async () => {
            document = await parse(`# Topic
- child1
- child2`);

            expect(
                checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
            ).toHaveLength(0);
        });
    });

    describe('Priority and Progress Range Validation', () => {
        test('valid priority value (1-9) has no errors', async () => {
            document = await parse(`# Topic
- task @priority(5)`);

            expect(
                checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
            ).toHaveLength(0);
        });

        test('priority value 0 reports error', async () => {
            document = await parse(`# Topic
- task @priority(0)`);

            const errors = document?.diagnostics?.filter(d => d.severity === 1) || [];
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some(e => e.message.includes('Priority must be between 1 and 9'))).toBe(true);
        });

        test('priority value 10 reports error', async () => {
            document = await parse(`# Topic
- task @priority(10)`);

            const errors = document?.diagnostics?.filter(d => d.severity === 1) || [];
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some(e => e.message.includes('Priority must be between 1 and 9'))).toBe(true);
        });

        test('valid progress value (1-9) has no errors', async () => {
            document = await parse(`# Topic
- task @progress(3)`);

            expect(
                checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
            ).toHaveLength(0);
        });

        test('progress value 0 reports error', async () => {
            document = await parse(`# Topic
- task @progress(0)`);

            const errors = document?.diagnostics?.filter(d => d.severity === 1) || [];
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some(e => e.message.includes('Progress must be between 1 and 9'))).toBe(true);
        });

        test('progress value 10 reports error', async () => {
            document = await parse(`# Topic
- task @progress(10)`);

            const errors = document?.diagnostics?.filter(d => d.severity === 1) || [];
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some(e => e.message.includes('Progress must be between 1 and 9'))).toBe(true);
        });
    });

    describe('Indentation Validation', () => {
        test('consistent spaces indentation has no warnings', async () => {
            document = await parse(`# Topic
- child1
- child2`);

            const warnings = document?.diagnostics?.filter(d => d.severity === 2) || [];
            expect(warnings.length).toBe(0);
        });

        test('mixed tabs and spaces reports warning', async () => {
            // Use tab followed by spaces for indentation
            document = await parse(`# Topic
\t - child1`);

            const warnings = document?.diagnostics?.filter(d => d.severity === 2) || [];
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings.some(w => w.message.includes('Inconsistent indentation'))).toBe(true);
        });
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

function diagnosticToString(d: Diagnostic) {
    return `[${d.range.start.line}:${d.range.start.character}..${d.range.end.line}:${d.range.end.character}]: ${d.message}`;
}
