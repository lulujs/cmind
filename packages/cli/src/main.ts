import type { MindMap } from 'cmind-language';
import { createCmindServices, CmindLanguageMetaData } from 'cmind-language';
import chalk from 'chalk';
import { Command } from 'commander';
import { extractAstNode } from './util.js';
import { generateKityMinderFile } from './generator.js';
import { print } from './printer.js';
import { NodeFileSystem } from 'langium/node';
import * as url from 'node:url';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
const packagePath = path.resolve(__dirname, '..', 'package.json');
const packageContent = await fs.readFile(packagePath, 'utf-8');

export type GenerateOptions = {
    destination?: string;
};

/**
 * Parse command action - outputs AST as JSON
 * _Requirements: 1.1, 2.1_
 */
export const parseAction = async (fileName: string): Promise<void> => {
    const services = createCmindServices(NodeFileSystem).Cmind;
    const model = await extractAstNode<MindMap>(fileName, services);
    
    // Output AST as JSON (excluding internal Langium properties)
    const astJson = serializeAst(model);
    console.log(JSON.stringify(astJson, null, 2));
};

/**
 * Generate command action - outputs KityMinder JSON file
 * _Requirements: 5.1_
 */
export const generateAction = async (fileName: string, opts: GenerateOptions): Promise<void> => {
    const services = createCmindServices(NodeFileSystem).Cmind;
    const model = await extractAstNode<MindMap>(fileName, services);
    const generatedFilePath = generateKityMinderFile(model, fileName, opts.destination);
    console.log(chalk.green(`KityMinder JSON generated successfully: ${generatedFilePath}`));
};

/**
 * Print command action - pretty-prints AST back to CMind DSL
 * _Requirements: 6.1_
 */
export const printAction = async (fileName: string): Promise<void> => {
    const services = createCmindServices(NodeFileSystem).Cmind;
    const model = await extractAstNode<MindMap>(fileName, services);
    const output = print(model);
    console.log(output);
};

/**
 * Serializes AST to a clean JSON structure (without Langium internal properties)
 */
function serializeAst(model: MindMap): object {
    return {
        metadata: model.metadata.map(serializeMetadata),
        root: serializeRootNode(model.root),
    };
}

function serializeMetadata(meta: MindMap['metadata'][number]): object {
    return {
        $type: meta.$type,
        value: meta.value,
    };
}

function serializeRootNode(root: MindMap['root']): object {
    return {
        $type: root.$type,
        text: root.text,
        children: root.children.map(serializeChildNode),
    };
}

function serializeChildNode(node: MindMap['root']['children'][number]): object {
    return {
        $type: node.$type,
        text: node.text,
        attributes: node.attributes.map(serializeAttribute),
        children: node.children.map(serializeChildNode),
    };
}

function serializeAttribute(attr: MindMap['root']['children'][number]['attributes'][number]): object {
    const result: Record<string, unknown> = { $type: attr.$type };
    if ('value' in attr) {
        result.value = attr.value;
    }
    if ('bold' in attr) {
        result.bold = attr.bold;
    }
    if ('italic' in attr) {
        result.italic = attr.italic;
    }
    return result;
}

export default function (): void {
    const program = new Command();

    program.version(JSON.parse(packageContent).version);

    const fileExtensions = CmindLanguageMetaData.fileExtensions.join(', ');

    program
        .command('parse')
        .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
        .description('parses a CMind DSL file and outputs the AST as JSON')
        .action(parseAction);

    program
        .command('generate')
        .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
        .option('-d, --destination <dir>', 'destination directory of generating')
        .description('generates KityMinder JSON from a CMind DSL source file')
        .action(generateAction);

    program
        .command('print')
        .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
        .description('pretty-prints a CMind DSL file back to formatted DSL text')
        .action(printAction);

    program.parse(process.argv);
}
