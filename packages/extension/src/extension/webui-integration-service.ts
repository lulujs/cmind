import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { KityMinderData } from "./memory-cache-service.js";
import { iconMap } from "./img/DocImageMapping.js";

/**
 * Service for integrating KityMinder WebUI components with VSCode webviews
 * Handles webview content creation, message communication, and theme management
 */
export class WebUIIntegrationService {
  private readonly webviews: Map<string, vscode.Webview> = new Map();
  private currentTheme: string = "default";
  private interactionEnabled: boolean = true;
  private htmlTemplate: string = "";

  constructor(private context: vscode.ExtensionContext) {
    // Load HTML template
    this.loadHtmlTemplate();
  }

  /**
   * Loads the HTML template from file
   */
  private loadHtmlTemplate(): void {
    try {
      const templatePath = path.join(
        this.context.extensionPath,
        "out",
        "extension",
        "webview-template.html",
      );
      this.htmlTemplate = fs.readFileSync(templatePath, "utf-8");
    } catch (error) {
      console.error("Failed to load HTML template:", error);
      // Fallback to empty template
      this.htmlTemplate =
        "<!DOCTYPE html><html><body>Error loading template</body></html>";
    }
  }

  /**
   * Creates webview content with embedded KityMinder WebUI
   * @param data KityMinder JSON data to display
   * @param filePath Path to the CMind file
   * @param webview The webview instance
   * @param theme Theme to apply
   * @returns HTML content for the webview
   */
  createWebviewContent(
    data?: KityMinderData,
    filePath?: string,
    webview?: vscode.Webview,
    theme?: string,
  ): string {
    const currentTheme = theme || this.currentTheme;

    // Register webview if provided
    if (filePath && webview) {
      this.webviews.set(filePath, webview);
    }

    // Replace placeholders in template
    let html = this.htmlTemplate
      .replace(
        "{{INTERACTION_ENABLED}}",
        this.interactionEnabled ? "flex" : "none",
      )
      .replace(
        "{{INITIAL_DATA_SCRIPT}}",
        data
          ? `<script>
        // Inject iconMap into global scope
        window.iconMap = ${JSON.stringify(iconMap)};
        
        window.addEventListener('DOMContentLoaded', function() {
            setTimeout(function() {
                window.postMessage({
                    type: 'updateContent',
                    data: ${JSON.stringify(data)},
                    theme: '${currentTheme}'
                }, '*');
            }, 100);
        });
    </script>`
          : `<script>
        // Inject iconMap into global scope even when no data
        window.iconMap = ${JSON.stringify(iconMap)};
    </script>`,
      );

    return html;
  }

  /**
   * Handles messages received from webview
   * @param message The message data
   * @param filePath The file path associated with the webview
   */
  async handleWebviewMessage(message: any, filePath: string): Promise<void> {
    try {
      switch (message.type) {
        case "ready":
          console.log(
            "Webview ready for",
            filePath,
            "timestamp:",
            message.timestamp,
          );
          break;

        case "themeChanged":
          await this.handleThemeChange(message.theme);
          break;

        case "retry":
          await this.handleRetryRequest(filePath, message.attempt);
          break;

        case "contentUpdated":
          await this.handleContentUpdateResult(message);
          break;

        case "error":
          await this.handleWebviewError(message);
          break;

        default:
          console.warn("Unknown webview message type:", message.type);
      }
    } catch (error) {
      console.error("Error handling webview message:", error);
      await this.sendErrorToWebview(
        filePath,
        "Message Handler Error",
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }

  /**
   * Updates the theme for all active webviews
   * @param theme New theme to apply
   */
  updateTheme(theme: string): void {
    this.currentTheme = theme;

    // Update all active webviews
    for (const [filePath, webview] of this.webviews) {
      try {
        webview.postMessage({
          type: "updateTheme",
          theme: theme,
        });
      } catch (error) {
        console.error(`Failed to update theme for ${filePath}:`, error);
      }
    }
  }

  /**
   * Enables or disables interactive features in webviews
   * @param enabled Whether interaction should be enabled
   */
  enableInteraction(enabled: boolean): void {
    this.interactionEnabled = enabled;

    // Update all active webviews
    for (const [filePath, webview] of this.webviews) {
      try {
        webview.postMessage({
          type: "enableInteraction",
          enabled: enabled,
        });
      } catch (error) {
        console.error(`Failed to update interaction for ${filePath}:`, error);
      }
    }
  }

  /**
   * Sends content update to a specific webview
   * @param filePath The file path associated with the webview
   * @param data KityMinder JSON data
   * @param theme Optional theme to apply
   */
  async sendContentUpdate(
    filePath: string,
    data: KityMinderData,
    theme?: string,
  ): Promise<void> {
    const webview = this.webviews.get(filePath);
    if (!webview) {
      throw new Error(`Webview not found for file: ${filePath}`);
    }

    try {
      await webview.postMessage({
        type: "updateContent",
        data: data,
        theme: theme || this.currentTheme,
      });
    } catch (error) {
      console.error("Failed to send content update to webview:", error);
      throw error;
    }
  }

  /**
   * Sends error message to webview
   * @param filePath The file path associated with the webview
   * @param title Error title
   * @param message Error message
   * @param details Optional error details
   */
  async sendErrorToWebview(
    filePath: string,
    title: string,
    message: string,
    details?: string,
  ): Promise<void> {
    const webview = this.webviews.get(filePath);
    if (!webview) {
      return;
    }

    try {
      await webview.postMessage({
        type: "showError",
        title: title,
        message: message,
        details: details,
      });
    } catch (error) {
      console.error("Failed to send error to webview:", error);
    }
  }

  /**
   * Sends empty state message to webview
   * @param filePath The file path associated with the webview
   */
  async sendEmptyState(filePath: string): Promise<void> {
    const webview = this.webviews.get(filePath);
    if (!webview) {
      return;
    }

    try {
      await webview.postMessage({
        type: "showEmpty",
      });
    } catch (error) {
      console.error("Failed to send empty state to webview:", error);
    }
  }

  /**
   * Sends loading state message to webview
   * @param filePath The file path associated with the webview
   */
  async sendLoadingState(filePath: string): Promise<void> {
    const webview = this.webviews.get(filePath);
    if (!webview) {
      return;
    }

    try {
      await webview.postMessage({
        type: "showLoading",
      });
    } catch (error) {
      console.error("Failed to send loading state to webview:", error);
    }
  }

  /**
   * Sets zoom level for a specific webview
   * @param filePath The file path associated with the webview
   * @param zoomLevel Zoom level (1.0 = 100%)
   */
  setZoomLevel(filePath: string, zoomLevel: number): void {
    const webview = this.webviews.get(filePath);
    if (!webview) {
      return;
    }

    try {
      webview.postMessage({
        type: "setZoom",
        zoomLevel: zoomLevel,
      });
    } catch (error) {
      console.error(`Failed to set zoom level for ${filePath}:`, error);
    }
  }

  /**
   * Fits the mind map to view for a specific webview
   * @param filePath The file path associated with the webview
   */
  fitToView(filePath: string): void {
    const webview = this.webviews.get(filePath);
    if (!webview) {
      return;
    }

    try {
      webview.postMessage({
        type: "fitToView",
      });
    } catch (error) {
      console.error(`Failed to fit to view for ${filePath}:`, error);
    }
  }

  /**
   * Centers the view for a specific webview
   * @param filePath The file path associated with the webview
   */
  centerView(filePath: string): void {
    const webview = this.webviews.get(filePath);
    if (!webview) {
      return;
    }

    try {
      webview.postMessage({
        type: "centerView",
      });
    } catch (error) {
      console.error(`Failed to center view for ${filePath}:`, error);
    }
  }

  /**
   * Resets the view for a specific webview
   * @param filePath The file path associated with the webview
   */
  resetView(filePath: string): void {
    const webview = this.webviews.get(filePath);
    if (!webview) {
      return;
    }

    try {
      webview.postMessage({
        type: "resetView",
      });
    } catch (error) {
      console.error(`Failed to reset view for ${filePath}:`, error);
    }
  }

  /**
   * Removes a webview from management
   * @param filePath The file path associated with the webview
   */
  removeWebview(filePath: string): void {
    this.webviews.delete(filePath);
  }

  /**
   * Disposes all resources
   */
  dispose(): void {
    // Clear all webview references
    this.webviews.clear();
  }

  private async handleThemeChange(theme: string): Promise<void> {
    this.currentTheme = theme;

    // Update configuration
    const config = vscode.workspace.getConfiguration("cmind.preview");
    await config.update("theme", theme, vscode.ConfigurationTarget.Global);

    console.log("Theme changed to:", theme);
  }

  private async handleRetryRequest(
    filePath: string,
    attempt: number,
  ): Promise<void> {
    console.log(`Retry request received for ${filePath}, attempt: ${attempt}`);

    // Send loading state while retrying
    await this.sendLoadingState(filePath);

    // Emit retry event that can be handled by the preview coordinator
    // This would typically trigger a content refresh
  }

  private async handleContentUpdateResult(message: any): Promise<void> {
    if (message.success) {
      console.log("Content update successful at:", new Date(message.timestamp));
    } else {
      console.error("Content update failed:", message.error);
    }
  }

  private async handleWebviewError(message: any): Promise<void> {
    console.error("Webview error:", {
      title: message.title,
      message: message.message,
      details: message.details,
      timestamp: new Date(message.timestamp),
    });

    // Could emit error events for logging or user notification
  }
}
