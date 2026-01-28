import type {
  MindMap,
  RootNode,
  ChildNode,
  Attribute,
  Metadata,
} from "cmind-language";
import {
  isPriorityAttribute,
  isProgressAttribute,
  isBoldAttribute,
  isItalicAttribute,
  isIdAttribute,
  isTemplateMetadata,
  isThemeMetadata,
} from "cmind-language";
import * as fs from "node:fs";
import * as path from "node:path";
import { extractDestinationAndName } from "./util.js";

// KityMinder JSON interfaces
export interface KityMinderJson {
  root: KityMinderNode;
  template: string;
  theme: string;
  version: string;
}

export interface KityMinderNode {
  data: KityMinderNodeData;
  children: KityMinderNode[];
}

export interface KityMinderNodeData {
  id: string;
  created: number;
  text: string;
  priority?: string;
  progress?: number;
  "font-weight"?: "bold";
  "font-style"?: "italic";
  icons?: string[];
}

// Internal structure for flattened nodes with indentation info
interface FlatNode {
  text: string;
  attributes: Attribute[];
  indentLevel: number;
  explicitId?: string;
}

// Default values
const DEFAULT_TEMPLATE = "right";
const DEFAULT_THEME = "fresh-blue";
const KITYMINDER_VERSION = "1.4.43";

/**
 * Generates a random ID similar to KityMinder format
 */
export function generateId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generates a timestamp in milliseconds
 */
export function generateTimestamp(): number {
  return Date.now();
}

/**
 * Extracts template value from metadata array
 */
function getTemplate(metadata: Metadata[]): string {
  for (const meta of metadata) {
    if (isTemplateMetadata(meta)) {
      return meta.value;
    }
  }
  return DEFAULT_TEMPLATE;
}

/**
 * Extracts theme value from metadata array
 */
function getTheme(metadata: Metadata[]): string {
  for (const meta of metadata) {
    if (isThemeMetadata(meta)) {
      return meta.value;
    }
  }
  return DEFAULT_THEME;
}

/**
 * Extracts the explicit ID from attributes if present
 */
function getExplicitId(attributes: Attribute[]): string | undefined {
  for (const attr of attributes) {
    if (isIdAttribute(attr)) {
      return attr.value;
    }
  }
  return undefined;
}

/**
 * Maps AST attributes to KityMinder node data fields
 */
function mapAttributes(attributes: Attribute[]): Partial<KityMinderNodeData> {
  const result: Partial<KityMinderNodeData> = {};

  for (const attr of attributes) {
    if (isPriorityAttribute(attr)) {
      result.priority = String(attr.value);
    } else if (isProgressAttribute(attr)) {
      result.progress = attr.value;
    } else if (isBoldAttribute(attr)) {
      result["font-weight"] = "bold";
    } else if (isItalicAttribute(attr)) {
      result["font-style"] = "italic";
    }
    // Note: IdAttribute is handled separately, not stored in data
  }

  return result;
}

/**
 * Gets the indentation level of a ChildNode by examining its CST position
 */
function getIndentLevel(node: ChildNode): number {
  const cstNode = node.$cstNode;
  if (!cstNode) {
    return 1; // Default to level 1 if no CST info
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

  // Extract leading whitespace and calculate indent level
  const leadingWhitespace = line.match(/^[\t ]*/)?.[0] || "";
  // Count spaces (2 spaces = 1 level) or tabs (1 tab = 1 level)
  const spaces = (leadingWhitespace.match(/ /g) || []).length;
  const tabs = (leadingWhitespace.match(/\t/g) || []).length;

  // Calculate indent level: 2 spaces or 1 tab = 1 level
  return Math.floor(spaces / 2) + tabs;
}

/**
 * Recursively flattens all ChildNodes from the AST into a flat list with indentation info
 */
function flattenChildNodes(nodes: ChildNode[]): FlatNode[] {
  const result: FlatNode[] = [];

  function collectNodes(nodeList: ChildNode[]): void {
    for (const node of nodeList) {
      result.push({
        text: node.text,
        attributes: node.attributes,
        indentLevel: getIndentLevel(node),
        explicitId: getExplicitId(node.attributes),
      });
      // Recursively collect nested children (they're incorrectly nested by Langium)
      if (node.children && node.children.length > 0) {
        collectNodes(node.children);
      }
    }
  }

  collectNodes(nodes);
  return result;
}

/**
 * Converts a FlatNode to KityMinder node format
 */
function convertFlatNode(flatNode: FlatNode): KityMinderNode {
  const attributeData = mapAttributes(flatNode.attributes);

  return {
    data: {
      id: flatNode.explicitId || generateId(),
      created: generateTimestamp(),
      text: flatNode.text.trim(),
      ...attributeData,
    },
    children: [],
  };
}

/**
 * Builds a proper tree structure from flat nodes based on indentation levels
 */
function buildTreeFromFlatNodes(flatNodes: FlatNode[]): KityMinderNode[] {
  if (flatNodes.length === 0) {
    return [];
  }

  const result: KityMinderNode[] = [];
  // Stack to track parent nodes at each level: [level, node]
  const stack: Array<{ level: number; node: KityMinderNode }> = [];

  for (const flatNode of flatNodes) {
    const kmNode = convertFlatNode(flatNode);
    const level = flatNode.indentLevel;

    // Pop stack until we find a parent with lower indent level
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    if (stack.length === 0) {
      // This is a top-level child (direct child of root)
      result.push(kmNode);
    } else {
      // Add as child of the current parent
      stack[stack.length - 1].node.children.push(kmNode);
    }

    // Push current node onto stack
    stack.push({ level, node: kmNode });
  }

  return result;
}

/**
 * Converts a RootNode to KityMinder node format
 * Uses CST position information to correctly determine tree structure
 */
function convertRootNode(root: RootNode): KityMinderNode {
  // Flatten all child nodes and rebuild tree based on indentation
  const flatNodes = flattenChildNodes(root.children);
  const children = buildTreeFromFlatNodes(flatNodes);

  // Get explicit ID from root node if present
  const rootId = root.idAttr?.value || generateId();

  // Handle star attribute - convert to icons array
  const icons: string[] = [];
  if (root.starAttr) {
    // Convert star value (01-08) to icon name (star01-star08)
    const starValue = String(root.starAttr.value).padStart(2, "0");
    icons.push(`star${starValue}`);
  }

  return {
    data: {
      id: rootId,
      created: generateTimestamp(),
      text: root.text.trim(),
      ...(icons.length > 0 && { icons }),
    },
    children,
  };
}

/**
 * Generates KityMinder JSON from a parsed MindMap AST
 */
export function generateKityMinderJson(model: MindMap): KityMinderJson {
  return {
    root: convertRootNode(model.root),
    template: getTemplate(model.metadata),
    theme: getTheme(model.metadata),
    version: KITYMINDER_VERSION,
  };
}

/**
 * Generates KityMinder JSON file from a CMind DSL file
 */
export function generateKityMinderFile(
  model: MindMap,
  filePath: string,
  destination: string | undefined,
): string {
  const data = extractDestinationAndName(filePath, destination);
  const generatedFilePath = `${path.join(data.destination, data.name)}.km`;

  const json = generateKityMinderJson(model);
  const content = JSON.stringify(json, null, 4);

  if (!fs.existsSync(data.destination)) {
    fs.mkdirSync(data.destination, { recursive: true });
  }
  fs.writeFileSync(generatedFilePath, content);
  return generatedFilePath;
}
