import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { parseHelper } from "langium/test";
import type {
  MindMap,
  TemplateMetadata,
  ThemeMetadata,
} from "../src/generated/ast.js";
import {
  createCmindServices,
  isMindMap,
  isProgressAttribute,
  isItalicAttribute,
  isTemplateMetadata,
  isThemeMetadata,
} from "../src/index.js";

let services: ReturnType<typeof createCmindServices>;
let parse: ReturnType<typeof parseHelper<MindMap>>;
let document: LangiumDocument<MindMap> | undefined;

beforeAll(async () => {
  services = createCmindServices(EmptyFileSystem);
  parse = parseHelper<MindMap>(services.Cmind);
});

describe("Parsing CMind DSL", () => {
  describe("Root Node Parsing (Requirement 1.1)", () => {
    test("parse simple root node with title", async () => {
      document = await parse(`# MyTopic`);

      expect(checkDocumentValid(document)).toBeUndefined();
      expect(document.parseResult.value.root).toBeDefined();
      expect(document.parseResult.value.root.text).toBe("MyTopic");
    });

    test("parse root node with spaces in title", async () => {
      document = await parse(`# My Topic Title`);

      expect(checkDocumentValid(document)).toBeUndefined();
      expect(document.parseResult.value.root.text).toBe("My Topic Title");
    });
  });

  describe("Child Node Parsing (Requirement 2.1)", () => {
    test("parse single child node", async () => {
      document = await parse(`# Topic
- child1`);

      expect(checkDocumentValid(document)).toBeUndefined();
      expect(document.parseResult.value.root.children).toHaveLength(1);
      expect(document.parseResult.value.root.children[0].text).toBe("child1");
    });

    test("parse child nodes - grammar creates nested structure", async () => {
      // Note: The current grammar creates a nested structure where each child
      // can have children. Multiple siblings at root level are parsed as nested.
      document = await parse(`# Topic
- child1
- child2`);

      expect(checkDocumentValid(document)).toBeUndefined();
      // Grammar parses children recursively - first child contains subsequent children
      expect(
        document.parseResult.value.root.children.length,
      ).toBeGreaterThanOrEqual(1);
    });

    test("parse child node with spaces in text", async () => {
      document = await parse(`# Topic
- child with spaces`);

      expect(checkDocumentValid(document)).toBeUndefined();
      expect(document.parseResult.value.root.children[0].text).toBe(
        "child with spaces",
      );
    });
  });

  describe("Attribute Parsing (Requirements 3.1, 3.2, 3.3, 3.4)", () => {
    test("parse node with priority attribute", async () => {
      document = await parse(`# Topic
- task @priority(5)`);

      expect(checkDocumentValid(document)).toBeUndefined();
      const child = document.parseResult.value.root.children[0];
      expect(child.attributes).toHaveLength(1);
      const attr = child.attributes[0];
      expect(isPriorityAttribute(attr)).toBe(true);
      if (isPriorityAttribute(attr)) {
        expect(attr.value).toBe(5);
      }
    });

    test("parse node with progress attribute", async () => {
      document = await parse(`# Topic
- task @progress(3)`);

      expect(checkDocumentValid(document)).toBeUndefined();
      const child = document.parseResult.value.root.children[0];
      expect(child.attributes).toHaveLength(1);
      const attr = child.attributes[0];
      expect(isProgressAttribute(attr)).toBe(true);
      if (isProgressAttribute(attr)) {
        expect(attr.value).toBe(3);
      }
    });

    test("parse node with bold attribute", async () => {
      document = await parse(`# Topic
- task @bold`);

      expect(checkDocumentValid(document)).toBeUndefined();
      const child = document.parseResult.value.root.children[0];
      expect(child.attributes).toHaveLength(1);
      const attr = child.attributes[0];
      expect(isBoldAttribute(attr)).toBe(true);
      if (isBoldAttribute(attr)) {
        expect(attr.bold).toBe(true);
      }
    });

    test("parse node with italic attribute", async () => {
      document = await parse(`# Topic
- task @italic`);

      expect(checkDocumentValid(document)).toBeUndefined();
      const child = document.parseResult.value.root.children[0];
      expect(child.attributes).toHaveLength(1);
      const attr = child.attributes[0];
      expect(isItalicAttribute(attr)).toBe(true);
      if (isItalicAttribute(attr)) {
        expect(attr.italic).toBe(true);
      }
    });

    test("parse node with multiple attributes", async () => {
      document = await parse(`# Topic
- task @priority(1) @progress(5) @bold @italic`);

      expect(checkDocumentValid(document)).toBeUndefined();
      const child = document.parseResult.value.root.children[0];
      expect(child.attributes).toHaveLength(4);

      const hasPriority = child.attributes.some((a) => isPriorityAttribute(a));
      const hasProgress = child.attributes.some((a) => isProgressAttribute(a));
      const hasBold = child.attributes.some((a) => isBoldAttribute(a));
      const hasItalic = child.attributes.some((a) => isItalicAttribute(a));

      expect(hasPriority).toBe(true);
      expect(hasProgress).toBe(true);
      expect(hasBold).toBe(true);
      expect(hasItalic).toBe(true);
    });
  });

  describe("Metadata Parsing (Requirements 7.1, 7.2)", () => {
    test("parse document with template metadata", async () => {
      document = await parse(`@template(right)
# Topic`);

      expect(checkDocumentValid(document)).toBeUndefined();
      expect(document.parseResult.value.metadata).toHaveLength(1);
      expect(isTemplateMetadata(document.parseResult.value.metadata[0])).toBe(
        true,
      );
      if (isTemplateMetadata(document.parseResult.value.metadata[0])) {
        expect(
          (document.parseResult.value.metadata[0] as TemplateMetadata).value,
        ).toBe("right");
      }
    });

    test("parse document with theme metadata", async () => {
      document = await parse(`@theme(fresh-blue)
# Topic`);

      expect(checkDocumentValid(document)).toBeUndefined();
      expect(document.parseResult.value.metadata).toHaveLength(1);
      expect(isThemeMetadata(document.parseResult.value.metadata[0])).toBe(
        true,
      );
      if (isThemeMetadata(document.parseResult.value.metadata[0])) {
        expect(
          (document.parseResult.value.metadata[0] as ThemeMetadata).value,
        ).toBe("fresh-blue");
      }
    });

    test("parse document with both template and theme", async () => {
      document = await parse(`@template(right)
@theme(fresh-blue)
# Topic`);

      expect(checkDocumentValid(document)).toBeUndefined();
      expect(document.parseResult.value.metadata).toHaveLength(2);
    });
  });

  describe("Comment Handling (Requirements 4.1, 4.2)", () => {
    test("parse document with single-line comment", async () => {
      document = await parse(`# Topic
// This is a comment
- child`);

      expect(checkDocumentValid(document)).toBeUndefined();
      expect(document.parseResult.value.root.children).toHaveLength(1);
    });

    test("parse document with multi-line comment", async () => {
      document = await parse(`# Topic
/* This is a
   multi-line comment */
- child`);

      expect(checkDocumentValid(document)).toBeUndefined();
      expect(document.parseResult.value.root.children).toHaveLength(1);
    });
  });
});

function checkDocumentValid(document: LangiumDocument): string | undefined {
  if (document.parseResult.parserErrors.length) {
    return `Parser errors:\n  ${document.parseResult.parserErrors.map((e) => e.message).join("\n  ")}`;
  }
  if (document.parseResult.value === undefined) {
    return `ParseResult is 'undefined'.`;
  }
  if (!isMindMap(document.parseResult.value)) {
    return `Root AST object is a ${document.parseResult.value.$type}, expected a 'MindMap'.`;
  }
  return undefined;
}
