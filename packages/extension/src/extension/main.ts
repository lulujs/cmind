import type {
  LanguageClientOptions,
  ServerOptions,
} from "vscode-languageclient/node.js";
import * as vscode from "vscode";
import * as path from "node:path";
import { LanguageClient, TransportKind } from "vscode-languageclient/node.js";
import { ConversionService } from "./conversion-service.js";
import { CommandHandler } from "./command-handler.js";
import { FileWatcher } from "./file-watcher.js";
import { ConfigurationManager } from "./configuration-manager.js";
import { ContentSynchronizer } from "./content-synchronizer.js";
import { PreviewPanelManager } from "./preview-panel-manager.js";
import { MemoryCacheService } from "./memory-cache-service.js";
import { PreviewCoordinator } from "./preview-coordinator.js";
import { PreviewCommandHandler } from "./preview-command-handler.js";
import { ReadOnlyProtectionService } from "./readonly-protection-service.js";

let client: LanguageClient;
let conversionService: ConversionService;
let commandHandler: CommandHandler;
let fileWatcher: FileWatcher;
let configurationManager: ConfigurationManager;
let contentSynchronizer: ContentSynchronizer;
let previewPanelManager: PreviewPanelManager;
let memoryCacheService: MemoryCacheService;
let previewCoordinator: PreviewCoordinator;
let previewCommandHandler: PreviewCommandHandler;
let readOnlyProtectionService: ReadOnlyProtectionService;

// This function is called when the extension is activated.
export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  // Initialize configuration manager first
  configurationManager = new ConfigurationManager();

  // Initialize services with configuration manager
  conversionService = new ConversionService(configurationManager);
  commandHandler = new CommandHandler(conversionService);
  fileWatcher = new FileWatcher(conversionService);

  // Initialize content synchronizer for preview functionality
  contentSynchronizer = new ContentSynchronizer({
    updateDelay: configurationManager.getPreviewUpdateDelay(),
    autoUpdate: configurationManager.isPreviewAutoUpdateEnabled(),
  });

  // Initialize preview panel manager
  previewPanelManager = new PreviewPanelManager(
    {
      autoUpdate: configurationManager.isPreviewAutoUpdateEnabled(),
      updateDelay: configurationManager.getPreviewUpdateDelay(),
      maxMemoryUsage: configurationManager.getPreviewMaxMemoryUsage(),
      enableInteraction: configurationManager.isPreviewInteractionEnabled(),
      theme: configurationManager.getPreviewTheme(),
    },
    context,
  );

  // Initialize memory cache service
  memoryCacheService = new MemoryCacheService(
    configurationManager.getPreviewMaxMemoryUsage(),
  );

  // Initialize preview coordinator to connect all preview services
  previewCoordinator = new PreviewCoordinator(
    contentSynchronizer,
    previewPanelManager,
    conversionService,
    memoryCacheService,
  );

  // Initialize preview command handler
  previewCommandHandler = new PreviewCommandHandler(
    previewPanelManager,
    previewCoordinator,
    configurationManager,
  );

  // Initialize read-only protection service
  readOnlyProtectionService = new ReadOnlyProtectionService();
  readOnlyProtectionService.initialize(context);

  // Register commands and event handlers
  commandHandler.registerCommands(context);
  previewCommandHandler.registerCommands(context);

  // Start file watcher for auto-conversion
  fileWatcher.startWatching(context);

  // Start content synchronizer for preview updates
  contentSynchronizer.startWatching(context);

  // Set up configuration change handling for preview services
  setupConfigurationChangeHandling(context);

  // Set up file lifecycle event handling for preview services
  setupFileLifecycleHandling(context);

  // Start language client
  client = await startLanguageClient(context);
}

// This function is called when the extension is deactivated.
export function deactivate(): Thenable<void> | undefined {
  console.log("CMind extension deactivating - starting resource cleanup");

  try {
    // Clean up preview command handler
    if (previewCommandHandler) {
      console.log("Disposing preview command handler");
      previewCommandHandler.dispose();
    }

    // Clean up read-only protection service
    if (readOnlyProtectionService) {
      console.log("Disposing read-only protection service");
      readOnlyProtectionService.dispose();
    }

    // Clean up preview coordinator
    if (previewCoordinator) {
      console.log("Disposing preview coordinator");
      previewCoordinator.dispose();
    }

    // Clean up memory cache service - clear all cached data (Requirement 6.4)
    if (memoryCacheService) {
      console.log("Clearing memory cache service");
      memoryCacheService.clear();
    }

    // Clean up preview panel manager - dispose panels and event listeners
    if (previewPanelManager) {
      console.log("Disposing preview panel manager");
      previewPanelManager.dispose();
    }

    // Clean up content synchronizer - clear timers and event listeners
    if (contentSynchronizer) {
      console.log("Disposing content synchronizer");
      contentSynchronizer.dispose();
    }

    // Clean up conversion service
    if (conversionService) {
      console.log("Disposing conversion service");
      conversionService.dispose();
    }

    // Clean up file watcher
    if (fileWatcher) {
      console.log("Disposing file watcher");
      fileWatcher.dispose();
    }

    // Clean up configuration manager if it has dispose method
    if (
      configurationManager &&
      "dispose" in configurationManager &&
      typeof (configurationManager as any).dispose === "function"
    ) {
      console.log("Disposing configuration manager");
      (configurationManager as any).dispose();
    }

    // Stop language client
    if (client) {
      console.log("Stopping language client");
      return client.stop();
    }

    console.log("CMind extension deactivation completed successfully");
    return undefined;
  } catch (error) {
    console.error("Error during CMind extension deactivation:", error);

    // Still try to stop the language client even if other cleanup failed
    if (client) {
      return client.stop();
    }

    return undefined;
  }
}

async function startLanguageClient(
  context: vscode.ExtensionContext,
): Promise<LanguageClient> {
  const serverModule = context.asAbsolutePath(
    path.join("out", "language", "main.cjs"),
  );
  // The debug options for the server
  // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging.
  // By setting `process.env.DEBUG_BREAK` to a truthy value, the language server will wait until a debugger is attached.
  const debugOptions = {
    execArgv: [
      "--nolazy",
      `--inspect${process.env.DEBUG_BREAK ? "-brk" : ""}=${process.env.DEBUG_SOCKET || "6009"}`,
    ],
  };

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions,
    },
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "*", language: "cmind" }],
  };

  // Create the language client and start the client.
  const client = new LanguageClient(
    "cmind",
    "cmind",
    serverOptions,
    clientOptions,
  );

  // Start the client. This will also launch the server
  await client.start();
  return client;
}

/**
 * Sets up configuration change handling for preview services
 * Implements Requirements 6.1, 6.2: Handle configuration changes at runtime
 */
function setupConfigurationChangeHandling(
  context: vscode.ExtensionContext,
): void {
  // Listen for configuration changes
  const configChangeDisposable = configurationManager.onConfigurationChanged(
    (newConfig) => {
      console.log("Configuration changed, updating preview services");

      try {
        // Update content synchronizer settings
        if (contentSynchronizer) {
          contentSynchronizer.updateConfiguration({
            updateDelay: newConfig.preview.updateDelay,
            autoUpdate: newConfig.preview.autoUpdate,
          });
        }

        // Update preview panel manager settings
        if (previewPanelManager) {
          previewPanelManager.updateConfiguration({
            autoUpdate: newConfig.preview.autoUpdate,
            updateDelay: newConfig.preview.updateDelay,
            maxMemoryUsage: newConfig.preview.maxMemoryUsage,
            enableInteraction: newConfig.preview.enableInteraction,
            theme: newConfig.preview.theme,
          });
        }

        // Update memory cache service settings
        if (memoryCacheService) {
          memoryCacheService.updateMaxMemoryUsage(
            newConfig.preview.maxMemoryUsage,
          );
        }

        console.log("Preview services configuration updated successfully");
      } catch (error) {
        console.error("Error updating preview services configuration:", error);

        // Show user notification for configuration errors
        if (configurationManager.shouldShowNotifications()) {
          vscode.window.showWarningMessage(
            `Failed to update preview configuration: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      }
    },
  );

  context.subscriptions.push(configChangeDisposable);
}

/**
 * Sets up file lifecycle event handling for preview services
 * Implements Requirements 2.1, 2.3, 2.4, 3.3: Handle file lifecycle events
 */
function setupFileLifecycleHandling(context: vscode.ExtensionContext): void {
  // Handle file deletions - close associated previews
  const fileDeleteWatcher =
    vscode.workspace.createFileSystemWatcher("**/*.cmind");

  fileDeleteWatcher.onDidDelete((uri) => {
    const filePath = uri.fsPath;
    console.log(`CMind file deleted: ${filePath}`);

    try {
      // Close preview if open
      if (previewPanelManager && previewPanelManager.isPreviewOpen(filePath)) {
        previewPanelManager.closePreview(filePath);
      }

      // Remove from cache
      if (memoryCacheService) {
        memoryCacheService.remove(filePath);
      }

      // Notify command handler
      if (previewCommandHandler) {
        previewCommandHandler.handlePreviewClosed(filePath);
      }
    } catch (error) {
      console.error(`Error handling file deletion for ${filePath}:`, error);
    }
  });

  // Handle file renames - update preview paths
  fileDeleteWatcher.onDidCreate((uri) => {
    // This handles the "new" file in a rename operation
    // The old file will be handled by onDidDelete
    console.log(`CMind file created: ${uri.fsPath}`);
  });

  // Handle document close events - clean up preview state
  const documentCloseDisposable = vscode.workspace.onDidCloseTextDocument(
    (document) => {
      if (
        document.languageId === "cmind" ||
        document.fileName.endsWith(".cmind")
      ) {
        const filePath = document.uri.fsPath;
        console.log(`CMind document closed: ${filePath}`);

        try {
          // Note: We don't automatically close the preview when document is closed
          // as users might want to keep the preview open while switching between files
          // The preview will be closed when the user explicitly closes it or deletes the file

          // However, we can pause updates for closed documents to save resources
          if (contentSynchronizer) {
            contentSynchronizer.pauseUpdates(filePath);
          }
        } catch (error) {
          console.error(
            `Error handling document close for ${filePath}:`,
            error,
          );
        }
      }
    },
  );

  // Handle document open events - resume updates if preview exists
  const documentOpenDisposable = vscode.workspace.onDidOpenTextDocument(
    (document) => {
      if (
        document.languageId === "cmind" ||
        document.fileName.endsWith(".cmind")
      ) {
        const filePath = document.uri.fsPath;
        console.log(`CMind document opened: ${filePath}`);

        try {
          // Resume updates if preview is open for this file
          if (
            previewPanelManager &&
            previewPanelManager.isPreviewOpen(filePath)
          ) {
            if (contentSynchronizer) {
              contentSynchronizer.resumeUpdates(filePath);
            }
          }
        } catch (error) {
          console.error(`Error handling document open for ${filePath}:`, error);
        }
      }
    },
  );

  // Register disposables
  context.subscriptions.push(
    fileDeleteWatcher,
    documentCloseDisposable,
    documentOpenDisposable,
  );
}
