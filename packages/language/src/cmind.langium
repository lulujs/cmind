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
    '@star' '(' value=NUM_VALUE ')';

IdAttribute:
    '@id' '(' value=TEXT ')';

ProgressAttribute:
    '@progress' ('(' value=NUM_VALUE ')')?;

ItalicAttribute:
    italic?='@italic';

NumberAttribute:
    '@number' ('(' value=NUM_VALUE ')')?;

StarIconAttribute:
    '@star' ('(' value=NUM_VALUE ')')?;

FlagAttribute:
    '@flag' ('(' value=NUM_VALUE ')')?;

// Terminal rules
// NUM_VALUE for all numeric values - will be validated semantically
terminal NUM_VALUE: /0[1-8]/;
hidden terminal WS: /[ \t]+/;
hidden terminal NL: /[\r\n]+/;
// TEXT captures text content - letters, digits, spaces, hyphens, underscores, and Unicode characters (including Chinese)
// Used for both node text and metadata values, and also for @id values
// Must start with a letter to avoid conflicts with NUM_* rules
terminal TEXT: /[\p{L}][\p{L}\p{N} \t_\-]*/u;

// Comment rules
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
