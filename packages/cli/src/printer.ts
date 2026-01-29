import type {
  MindMap,
  RootNode,
  ChildNode,
  Attribute,
  Metadata,
} from "cmind-language";
import {
  isProgressAttribute,
  isItalicAttribute,
  isIdAttribute,
  isTemplateMetadata,
  isThemeMetadata,
} from "cmind-language";

/**
 * Pretty prints a CMind AST back to DSL text format
 */
export function print(model: MindMap): string {
  const lines: string[] = [];

  printMetadata(model.metadata, lines);
  printRootNode(model.root, lines);

  return lines.join("\n");
}

/**
 * Prints metadata declarations (@template, @theme)
 */
function printMetadata(metadata: Metadata[], lines: string[]): void {
  for (const meta of metadata) {
    if (isTemplateMetadata(meta)) {
      lines.push(`@template(${meta.value})`);
    } else if (isThemeMetadata(meta)) {
      lines.push(`@theme(${meta.value})`);
    }
  }

  if (metadata.length > 0) {
    lines.push("");
  }
}

/**
 * Prints the root node with # prefix
 */
function printRootNode(root: RootNode, lines: string[]): void {
  const idSuffix = root.idAttr ? ` @id(${root.idAttr.value})` : "";
  lines.push(`# ${root.text.trim()}${idSuffix}`);

  for (const child of root.children) {
    printChildNode(child, lines, 1);
  }
}

/**
 * Prints a child node with - prefix and proper indentation
 */
function printChildNode(node: ChildNode, lines: string[], depth: number): void {
  const indent = "  ".repeat(depth);
  const attributeStr = printAttributes(node.attributes);
  const suffix = attributeStr ? ` ${attributeStr}` : "";

  lines.push(`${indent}- ${node.text.trim()}${suffix}`);

  for (const child of node.children) {
    printChildNode(child, lines, depth + 1);
  }
}

/**
 * Prints attributes in consistent order: @id, @progress, @italic
 */
function printAttributes(attributes: Attribute[]): string {
  const parts: string[] = [];

  const id = attributes.find(isIdAttribute);
  const progress = attributes.find(isProgressAttribute);
  const italic = attributes.find(isItalicAttribute);

  if (id) {
    parts.push(`@id(${id.value})`);
  }
  if (progress) {
    parts.push(`@progress(${progress.value})`);
  }
  if (italic) {
    parts.push("@italic");
  }

  return parts.join(" ");
}
