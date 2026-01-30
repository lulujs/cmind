import * as vscode from "vscode";

/**
 * Service for protecting read-only fields in CMind documents
 * Prevents modification of specific attributes like @star(01) in root nodes
 */
export class ReadOnlyProtectionService {
  private decorationType: vscode.TextEditorDecorationType;
  private diagnosticCollection: vscode.DiagnosticCollection;
  private documentSnapshots = new Map<string, string>();
  private isRestoring = false;

  // Define read-only patterns
  private readonly READ_ONLY_PATTERNS = [
    {
      pattern: /@star\(01\)/g,
      message: "Root node star attribute is read-only and cannot be modified",
      isRootNodeOnly: true,
    },
  ];

  constructor() {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: this.createLockIcon(),
      gutterIconSize: "contain",
      overviewRulerColor: "#ff6b6b",
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      backgroundColor: "rgba(255, 107, 107, 0.1)",
    });

    this.diagnosticCollection =
      vscode.languages.createDiagnosticCollection("cmind-readonly");
  }

  /**
   * Initialize the protection service
   */
  public initialize(context: vscode.ExtensionContext): void {
    // Store initial document snapshots
    const snapshotDisposable = vscode.workspace.onDidOpenTextDocument(
      this.storeDocumentSnapshot.bind(this),
    );

    // Monitor text document changes and restore if needed
    const changeDisposable = vscode.workspace.onDidChangeTextDocument(
      this.handleTextDocumentChange.bind(this),
    );

    // Monitor active editor changes to update decorations
    const editorDisposable = vscode.window.onDidChangeActiveTextEditor(
      this.updateDecorations.bind(this),
    );

    // Monitor text selection changes to show warnings
    const selectionDisposable = vscode.window.onDidChangeTextEditorSelection(
      this.handleSelectionChange.bind(this),
    );

    context.subscriptions.push(
      snapshotDisposable,
      changeDisposable,
      editorDisposable,
      selectionDisposable,
      this.decorationType,
      this.diagnosticCollection,
    );

    // Store snapshots for currently open documents
    vscode.workspace.textDocuments.forEach((doc) => {
      if (doc.languageId === "cmind") {
        this.storeDocumentSnapshot(doc);
      }
    });

    // Update decorations for current editor
    if (vscode.window.activeTextEditor) {
      this.updateDecorations(vscode.window.activeTextEditor);
    }
  }

  /**
   * Store a snapshot of the document content
   */
  private storeDocumentSnapshot(document: vscode.TextDocument): void {
    if (document.languageId === "cmind") {
      this.documentSnapshots.set(document.uri.toString(), document.getText());
    }
  }

  /**
   * Handle text document changes and restore if read-only content was modified
   */
  private async handleTextDocumentChange(
    event: vscode.TextDocumentChangeEvent,
  ): Promise<void> {
    if (event.document.languageId !== "cmind" || this.isRestoring) {
      return;
    }

    const document = event.document;
    const currentText = document.getText();
    const originalText = this.documentSnapshots.get(document.uri.toString());

    if (!originalText) {
      // No snapshot available, store current state
      this.storeDocumentSnapshot(document);
      return;
    }

    // Check if any read-only content was modified
    if (this.hasReadOnlyContentChanged(originalText, currentText)) {
      // Restore the original content
      await this.restoreDocument(document, originalText);
      this.showReadOnlyWarning();
      return;
    }

    // Update snapshot with the new valid content
    this.storeDocumentSnapshot(document);

    // Update decorations after any change
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document === document) {
      this.updateDecorations(editor);
    }
  }

  /**
   * Check if read-only content has been changed
   */
  private hasReadOnlyContentChanged(
    originalText: string,
    currentText: string,
  ): boolean {
    const originalRootLine = this.extractRootLine(originalText);
    const currentRootLine = this.extractRootLine(currentText);

    if (!originalRootLine || !currentRootLine) {
      return false;
    }

    // Check if any read-only patterns have changed
    for (const readOnlyPattern of this.READ_ONLY_PATTERNS) {
      if (readOnlyPattern.isRootNodeOnly) {
        const originalMatches = Array.from(
          originalRootLine.matchAll(readOnlyPattern.pattern),
        );
        const currentMatches = Array.from(
          currentRootLine.matchAll(readOnlyPattern.pattern),
        );

        // Check if the number of matches changed
        if (originalMatches.length !== currentMatches.length) {
          return true;
        }

        // Check if any match content changed
        for (let i = 0; i < originalMatches.length; i++) {
          if (originalMatches[i][0] !== currentMatches[i][0]) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Extract the root line from document text
   */
  private extractRootLine(text: string): string | null {
    const lines = text.split("\n");

    for (const line of lines) {
      const trimmedText = line.trim();

      // Skip empty lines and comments
      if (
        trimmedText === "" ||
        trimmedText.startsWith("//") ||
        trimmedText.startsWith("@template") ||
        trimmedText.startsWith("@theme")
      ) {
        continue;
      }

      // This should be the root node
      if (trimmedText.startsWith("#")) {
        return line;
      }
    }

    return null;
  }

  /**
   * Restore document to original content
   */
  private async restoreDocument(
    document: vscode.TextDocument,
    originalText: string,
  ): Promise<void> {
    this.isRestoring = true;

    try {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document === document) {
        const fullRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(document.getText().length),
        );

        await editor.edit((editBuilder) => {
          editBuilder.replace(fullRange, originalText);
        });
      }
    } finally {
      this.isRestoring = false;
    }
  }

  /**
   * Show read-only warning message
   */
  private showReadOnlyWarning(): void {
    vscode.window.showWarningMessage(
      "🔒 Cannot modify read-only field: @star(01) in root node",
      { modal: false },
    );

    vscode.window.setStatusBarMessage(
      "🔒 Read-only field: Cannot modify @star(01) in root node",
      3000,
    );
  }

  /**
   * Find the line index of the root node
   */
  private findRootNodeLine(document: vscode.TextDocument): number {
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const trimmedText = line.text.trim();

      // Skip empty lines and comments
      if (
        trimmedText === "" ||
        trimmedText.startsWith("//") ||
        trimmedText.startsWith("@template") ||
        trimmedText.startsWith("@theme")
      ) {
        continue;
      }

      // This should be the root node
      if (trimmedText.startsWith("#")) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Handle text selection changes to show contextual warnings
   */
  private handleSelectionChange(
    event: vscode.TextEditorSelectionChangeEvent,
  ): void {
    if (event.textEditor.document.languageId !== "cmind") {
      return;
    }

    const selection = event.selections[0];
    const document = event.textEditor.document;

    // Check if cursor is on a read-only field
    const isOnReadOnlyField = this.isPositionOnReadOnlyField(
      document,
      selection.start,
    );

    if (isOnReadOnlyField) {
      // Show hover message or status bar message
      vscode.window.setStatusBarMessage(
        "🔒 Read-only field: Cannot modify @star(01) in root node",
        3000,
      );
    }
  }

  /**
   * Check if a position is on a read-only field
   */
  private isPositionOnReadOnlyField(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): boolean {
    const rootLineIndex = this.findRootNodeLine(document);

    if (rootLineIndex === -1 || position.line !== rootLineIndex) {
      return false;
    }

    const line = document.lineAt(rootLineIndex);
    const lineText = line.text;

    for (const readOnlyPattern of this.READ_ONLY_PATTERNS) {
      if (readOnlyPattern.isRootNodeOnly) {
        const matches = Array.from(lineText.matchAll(readOnlyPattern.pattern));
        for (const match of matches) {
          const matchStart = match.index!;
          const matchEnd = matchStart + match[0].length;

          if (
            position.character >= matchStart &&
            position.character <= matchEnd
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Update decorations for read-only fields
   */
  private updateDecorations(editor?: vscode.TextEditor): void {
    if (!editor || editor.document.languageId !== "cmind") {
      return;
    }

    const document = editor.document;
    const decorations: vscode.DecorationOptions[] = [];
    const diagnostics: vscode.Diagnostic[] = [];

    const rootLineIndex = this.findRootNodeLine(document);

    if (rootLineIndex !== -1) {
      const rootLine = document.lineAt(rootLineIndex);
      const lineText = rootLine.text;

      for (const readOnlyPattern of this.READ_ONLY_PATTERNS) {
        if (readOnlyPattern.isRootNodeOnly) {
          const matches = Array.from(
            lineText.matchAll(readOnlyPattern.pattern),
          );

          for (const match of matches) {
            const matchStart = match.index!;
            const matchEnd = matchStart + match[0].length;

            const range = new vscode.Range(
              rootLineIndex,
              matchStart,
              rootLineIndex,
              matchEnd,
            );

            // Add decoration
            decorations.push({
              range,
              hoverMessage: `🔒 ${readOnlyPattern.message}`,
            });

            // Add diagnostic
            diagnostics.push(
              new vscode.Diagnostic(
                range,
                readOnlyPattern.message,
                vscode.DiagnosticSeverity.Information,
              ),
            );
          }
        }
      }
    }

    editor.setDecorations(this.decorationType, decorations);
    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  /**
   * Create a lock icon for the gutter
   */
  private createLockIcon(): vscode.Uri {
    // Create a simple SVG lock icon
    const svgContent = `
      <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
        <path fill="#ff6b6b" d="M4 7V5a4 4 0 0 1 8 0v2h1a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h1zm2-2a2 2 0 1 1 4 0v2H6V5zm2 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
      </svg>
    `;

    // Create a data URI for the SVG
    const dataUri = `data:image/svg+xml;base64,${Buffer.from(svgContent).toString("base64")}`;
    return vscode.Uri.parse(dataUri);
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    this.decorationType.dispose();
    this.diagnosticCollection.dispose();
  }
}
