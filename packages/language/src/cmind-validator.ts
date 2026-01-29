import type { ValidationAcceptor, ValidationChecks } from "langium";
import type {
  CmindAstType,
  MindMap,
  ProgressAttribute,
  ChildNode,
} from "./generated/ast.js";
import type { CmindServices } from "./cmind-module.js";

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: CmindServices) {
  const registry = services.validation.ValidationRegistry;
  const validator = services.validation.CmindValidator;
  const checks: ValidationChecks<CmindAstType> = {
    MindMap: validator.checkMindMap,
    ProgressAttribute: validator.checkProgressRange,
    ChildNode: validator.checkIndentation,
  };
  registry.register(checks, validator);
}

/**
 * Implementation of custom validations.
 */
export class CmindValidator {
  /**
   * Check MindMap for root node requirements.
   * Note: The grammar already enforces exactly one root node at parse time.
   * This validation provides additional semantic checks if needed.
   * Requirements: 1.2, 1.3
   */
  checkMindMap(mindMap: MindMap, accept: ValidationAcceptor): void {
    // The grammar enforces exactly one root node (root=RootNode)
    // Parser errors will be generated for missing or malformed root nodes
    // This check validates the root node exists and has valid text
    if (!mindMap.root) {
      accept("error", "Document must have a root node starting with #", {
        node: mindMap,
        property: "root",
      });
    } else if (!mindMap.root.text || mindMap.root.text.trim() === "") {
      accept("error", "Root node must have a non-empty title", {
        node: mindMap.root,
        property: "text",
      });
    }
  }

  /**
   * Validate progress attribute is between 2-8 when value is provided.
   * Requirements: 3.6
   */
  checkProgressRange(
    attr: ProgressAttribute,
    accept: ValidationAcceptor,
  ): void {
    if (attr.value && (parseInt(attr.value) < 2 || parseInt(attr.value) > 8)) {
      accept("error", "Progress value must be between 02 and 08", {
        node: attr,
        property: "value",
      });
    }
  }

  /**
   * Check for inconsistent indentation (mixing tabs and spaces).
   * Requirements: 2.4
   */
  checkIndentation(node: ChildNode, accept: ValidationAcceptor): void {
    const cstNode = node.$cstNode;
    if (!cstNode) {
      return;
    }

    // Get the text content from the document
    const document = cstNode.root;
    const text = document.text;

    // Find the line containing this node
    const startOffset = cstNode.offset;
    const lineStart = text.lastIndexOf("\n", startOffset - 1) + 1;
    const lineEnd = text.indexOf("\n", startOffset);
    const line = text.substring(
      lineStart,
      lineEnd === -1 ? text.length : lineEnd,
    );

    // Extract leading whitespace
    const leadingWhitespace = line.match(/^[\t ]*/)?.[0] || "";

    // Check for mixed tabs and spaces
    const hasTabs = leadingWhitespace.includes("\t");
    const hasSpaces = leadingWhitespace.includes(" ");

    if (hasTabs && hasSpaces) {
      accept(
        "warning",
        "Inconsistent indentation detected: mixing tabs and spaces",
        {
          node: node,
          property: "text",
        },
      );
    }
  }
}
