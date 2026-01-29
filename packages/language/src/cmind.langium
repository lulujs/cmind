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
    IdAttribute | ProgressAttribute | ItalicAttribute | NumberAttribute | StarIconAttribute | FlagAttribute;

StarAttribute:
    '@star' '(' value=NUM_02_08 ')';

IdAttribute:
    '@id' '(' value=TEXT ')';

ProgressAttribute:
    '@progress' ('(' value=NUM_02_08 ')')?;

ItalicAttribute:
    italic?='@italic';

NumberAttribute:
    '@number' ('(' value=NUM_01_07 ')')?;

StarIconAttribute:
    '@star' ('(' value=NUM_02_08 ')')?;

FlagAttribute:
    '@flag' ('(' value=NUM_02_08 ')')?;

// Terminal rules
// NUM_02_08 for both star and progress attributes - must be 01-08 (must be defined before INT to avoid conflicts)
terminal NUM_02_08: /0[1-8]/;
// NUM_01_07 for number attribute - must be 01-07 (must be defined before INT to avoid conflicts)
terminal NUM_01_07: /0[1-7]/;
// INT for numeric attributes
terminal INT returns number: /[0-9]+/;
hidden terminal WS: /[ \t]+/;
hidden terminal NL: /[\r\n]+/;
// TEXT captures text content - letters, digits, spaces, hyphens, underscores, and Unicode characters (including Chinese)
// Used for both node text and metadata values, and also for @id values
terminal TEXT: /[\p{L}\p{N}][\p{L}\p{N} \t_\-]*/u;

// Comment rules
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
