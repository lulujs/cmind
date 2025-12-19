import { type MaybePromise, type AstNode } from 'langium';
import {
    DefaultCompletionProvider,
    type CompletionAcceptor,
    type CompletionContext,
    type NextFeature
} from 'langium/lsp';
import { CompletionItemKind } from 'vscode-languageserver';
import { isChildNode, isRootNode, isMindMap, type MindMap } from './generated/ast.js';
import { calculateNextId, collectExistingIds } from './id-calculator.js';

/**
 * Attribute keyword definitions for auto-completion
 */
const ATTRIBUTE_KEYWORDS = [
    { keyword: '@id', snippet: '@id($1)', detail: 'Node identifier', hasParam: true },
    { keyword: '@priority', snippet: '@priority($1)', detail: 'Priority level (1-9)', hasParam: true },
    { keyword: '@progress', snippet: '@progress($1)', detail: 'Progress percentage (0-100)', hasParam: true },
    { keyword: '@bold', snippet: '@bold', detail: 'Bold text style', hasParam: false },
    { keyword: '@italic', snippet: '@italic', detail: 'Italic text style', hasParam: false },
];

/**
 * Custom completion provider for cmind DSL that adds @id auto-completion
 * and attribute keyword suggestions when typing '@'.
 */
export class CmindCompletionProvider extends DefaultCompletionProvider {

    /**
     * Configure completion options to trigger on '@' character.
     */
    override readonly completionOptions = {
        triggerCharacters: ['@', ' ']
    };

    /**
     * Override to add custom completions.
     * This method is called for each completion context to provide suggestions.
     */
    protected override completionFor(
        context: CompletionContext,
        next: NextFeature,
        acceptor: CompletionAcceptor
    ): MaybePromise<void> {
        // First, call the default completion behavior
        const result = super.completionFor(context, next, acceptor);
        
        // Check if we should add @id completion with auto-generated ID
        this.addIdCompletion(context, next, acceptor);
        
        // Check if we should add attribute keyword completions (when typing '@')
        this.addAttributeKeywordCompletions(context, acceptor);
        
        return result;
    }

    /**
     * Adds attribute keyword completions when user types '@'.
     * Suggests all available attribute keywords: @id, @priority, @progress, @bold, @italic
     */
    private addAttributeKeywordCompletions(
        context: CompletionContext,
        acceptor: CompletionAcceptor
    ): void {
        const textBefore = context.textDocument.getText({
            start: { line: context.position.line, character: 0 },
            end: context.position
        });

        // Check if the user just typed '@' or is typing after '@'
        const atMatch = textBefore.match(/@(\w*)$/);
        if (!atMatch) {
            return;
        }

        const partialKeyword = atMatch[1].toLowerCase();
        const node = context.node;

        // Determine if we're in a RootNode or ChildNode context
        const isInRootNode = isRootNode(node);
        const isInChildNode = isChildNode(node);

        if (!isInRootNode && !isInChildNode) {
            return;
        }

        // Get the MindMap for auto-generating @id
        const mindMap = this.findMindMap(node);
        const nextId = mindMap ? calculateNextId(collectExistingIds(mindMap)) : 'node001';

        for (const attr of ATTRIBUTE_KEYWORDS) {
            // RootNode only supports @id
            if (isInRootNode && attr.keyword !== '@id') {
                continue;
            }

            // Filter by partial keyword match
            const keywordName = attr.keyword.substring(1); // remove '@'
            if (partialKeyword && !keywordName.startsWith(partialKeyword)) {
                continue;
            }

            // Special handling for @id - use auto-generated ID
            if (attr.keyword === '@id') {
                acceptor(context, {
                    label: `@id(${nextId})`,
                    kind: CompletionItemKind.Property,
                    detail: 'Auto-generated node ID',
                    documentation: {
                        kind: 'markdown',
                        value: `Inserts \`@id(${nextId})\` - the next available node ID.`
                    },
                    insertText: `@id(${nextId})`,
                    sortText: '0_id',
                    filterText: '@id'
                });
            } else {
                acceptor(context, {
                    label: attr.keyword,
                    kind: CompletionItemKind.Property,
                    detail: attr.detail,
                    insertText: attr.snippet,
                    insertTextFormat: attr.hasParam ? 2 : 1, // 2 = Snippet, 1 = PlainText
                    sortText: `1_${keywordName}`,
                    filterText: attr.keyword
                });
            }
        }
    }

    /**
     * Adds @id completion suggestion when appropriate.
     * Triggers after node text for both RootNode and ChildNode.
     */
    private addIdCompletion(
        context: CompletionContext,
        next: NextFeature,
        acceptor: CompletionAcceptor
    ): void {
        const node = context.node;
        
        // Check if we're in a context where @id completion makes sense
        // This is after a node text, where attributes can be added
        if (!this.shouldOfferIdCompletion(node, next)) {
            return;
        }

        // Get the MindMap root to collect existing IDs
        const mindMap = this.findMindMap(node);
        if (!mindMap) {
            return;
        }

        // Calculate the next available ID
        const existingIds = collectExistingIds(mindMap);
        const nextId = calculateNextId(existingIds);

        // Add the completion item
        acceptor(context, {
            label: `@id(${nextId})`,
            kind: CompletionItemKind.Property,
            detail: 'Auto-generated node ID',
            documentation: {
                kind: 'markdown',
                value: `Inserts \`@id(${nextId})\` - the next available node ID based on existing IDs in the document.`
            },
            insertText: `@id(${nextId})`,
            sortText: '0_id' // Sort before other completions
        });
    }

    /**
     * Determines if @id completion should be offered based on the current context.
     * Returns true when we're in a position where attributes can be added to a node.
     */
    private shouldOfferIdCompletion(node: AstNode | undefined, next: NextFeature): boolean {
        if (!node) {
            return false;
        }

        // Check if we're completing attributes for a ChildNode
        if (isChildNode(node)) {
            // Check if the next feature is related to attributes
            if (next.type === 'Attribute' || 
                (next.property === 'attributes') ||
                (next.feature && 'name' in next.feature && next.feature.name === 'attributes')) {
                return true;
            }
        }

        // Check if we're completing idAttr for a RootNode
        if (isRootNode(node)) {
            // Check if the next feature is the idAttr
            if (next.property === 'idAttr' ||
                (next.feature && 'name' in next.feature && next.feature.name === 'idAttr')) {
                return true;
            }
        }

        return false;
    }

    /**
     * Traverses up the AST to find the MindMap root node.
     */
    private findMindMap(node: AstNode | undefined): MindMap | undefined {
        let current = node;
        while (current) {
            if (isMindMap(current)) {
                return current;
            }
            current = current.$container;
        }
        return undefined;
    }
}
