# CMind VSCode Extension

CMind DSL language support for Visual Studio Code with automatic conversion to KityMinder KM format.

## Features

- **Syntax Highlighting**: Full syntax highlighting for CMind DSL files (.cmind)
- **Auto-Conversion**: Automatically convert CMind files to KityMinder KM when saved
- **Context Menu**: Right-click to manually convert CMind files to KityMinder KM
- **Configurable Settings**: Customize auto-conversion behavior and output directory
- **Error Handling**: Clear error messages for syntax errors and conversion failures

## Usage

### Automatic Conversion
1. Open or create a `.cmind` file
2. Write your mind map using CMind DSL syntax
3. Save the file - it will automatically convert to KityMinder KM format

### Manual Conversion
1. Right-click on a `.cmind` file in the editor or explorer
2. Select "Convert to KityMinder KM" from the context menu
3. The converted KM file will be created in the same directory

## Configuration

Access settings via `File > Preferences > Settings` and search for "CMind":

- `cmind.autoConvertOnSave`: Enable/disable automatic conversion on save (default: true)
- `cmind.outputDirectory`: Specify output directory for generated files (default: same as source)
- `cmind.showNotifications`: Show/hide conversion notifications (default: true)

## CMind DSL Syntax

CMind DSL allows you to create mind maps using a simple text-based syntax:

```cmind
# Root Topic
## Subtopic 1
### Detail 1
### Detail 2
## Subtopic 2
### Another Detail
```

## Requirements

- Visual Studio Code 1.67.0 or higher

## Release Notes

### 0.0.1
- Initial release
- Basic CMind DSL language support
- Automatic conversion to KityMinder KM format
- Context menu integration
- Configurable settings

## License

This extension is provided as-is for educational and development purposes.