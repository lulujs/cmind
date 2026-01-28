grammar Cmind

entry MindMap:
    (metadata+=Metadata)*
    root=RootNode;

Metadata:
    TemplateMetadata | ThemeMetadata;

TemplateMetadata:
    '@template' '(' value=TEXT ')';

ThemeMetadata:
    '@theme' '(' value=TEXT ')';

RootNode:
    '#' text=TEXT (starAttr=StarAttribute) (idAttr=IdAttribute)?
    (children+=ChildNode)*;

ChildNode:
    '-' text=TEXT (attributes+=Attribute)*
    (children+=ChildNode)*;

Attribute:
    IdAttribute | PriorityAttribute | ProgressAttribute | BoldAttribute | ItalicAttribute;

StarAttribute:
    '@star' '(' value=STAR_NUM ')';

IdAttribute:
    '@id' '(' value=TEXT ')';

PriorityAttribute:
    '@priority' '(' value=INT ')';

ProgressAttribute:
    '@progress' '(' value=INT ')';

BoldAttribute:
    bold?='@bold';

ItalicAttribute:
    italic?='@italic';

// Terminal rules
hidden terminal WS: /[ \t]+/;
hidden terminal NL: /[\r\n]+/;
// STAR_NUM for star attribute - must be 01-08 (must be defined before INT to avoid conflicts)
terminal STAR_NUM: /0[1-8]/;
// INT for numeric attributes
terminal INT returns number: /[0-9]+/;
// TEXT captures text content - letters, digits, spaces, hyphens, underscores, and Unicode characters (including Chinese)
// Used for both node text and metadata values, and also for @id values
terminal TEXT: /[\p{L}\p{N}][\p{L}\p{N} \t_\-]*/u;

// Comment rules
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
