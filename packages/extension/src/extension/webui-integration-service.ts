import * as vscode from "vscode";
import { KityMinderData } from "./memory-cache-service.js";

/**
 * Service for integrating KityMinder WebUI components with VSCode webviews
 * Handles webview content creation, message communication, and theme management
 */
export class WebUIIntegrationService {
  private readonly webviews: Map<string, vscode.Webview> = new Map();
  private currentTheme: string = "default";
  private interactionEnabled: boolean = true;

  constructor(context: vscode.ExtensionContext) {
    // Context not needed for inline HTML approach
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

    // Create the HTML content with inline styles and scripts
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;">
    <title>CMind Preview</title>
    
    <style>
        /* VSCode Theme Integration */
        :root {
            --vscode-foreground: var(--vscode-editor-foreground, #cccccc);
            --vscode-background: var(--vscode-editor-background, #1e1e1e);
            --vscode-border: var(--vscode-panel-border, #2d2d30);
            --vscode-button-background: var(--vscode-button-background, #0e639c);
            --vscode-button-foreground: var(--vscode-button-foreground, #ffffff);
            --vscode-button-hover: var(--vscode-button-hoverBackground, #1177bb);
            --vscode-error-foreground: var(--vscode-errorForeground, #f48771);
            --vscode-warning-foreground: var(--vscode-warningForeground, #ffcc02);
            --vscode-success-foreground: var(--vscode-terminal-ansiGreen, #16c60c);
        }

        * { box-sizing: border-box; }
        html, body {
            margin: 0; padding: 0; height: 100%; overflow: hidden;
            font-family: var(--vscode-font-family, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--vscode-foreground);
            background-color: var(--vscode-background);
        }
        #preview-container { width: 100%; height: 100vh; position: relative; display: flex; flex-direction: column; }
        .state-container { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 2rem; text-align: center; }
        .state-container.hidden { display: none; }
        #loading-state { color: var(--vscode-foreground); }
        .loading-spinner {
            width: 40px; height: 40px; border: 3px solid var(--vscode-border);
            border-top: 3px solid var(--vscode-button-background); border-radius: 50%;
            animation: spin 1s linear infinite; margin-bottom: 1rem;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        #error-state { color: var(--vscode-error-foreground); }
        .error-icon { font-size: 3rem; margin-bottom: 1rem; }
        .error-details {
            background-color: var(--vscode-border); border-radius: 4px; padding: 1rem; margin: 1rem 0;
            font-family: var(--vscode-editor-font-family, 'Consolas', 'Courier New', monospace);
            font-size: 0.9rem; text-align: left; white-space: pre-wrap; max-width: 600px; overflow-x: auto;
        }
        .retry-button {
            background-color: var(--vscode-button-background); color: var(--vscode-button-foreground);
            border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; font-size: 0.9rem; margin-top: 1rem;
        }
        .retry-button:hover { background-color: var(--vscode-button-hover); }
        #empty-state { color: var(--vscode-foreground); }
        .empty-icon { font-size: 3rem; margin-bottom: 1rem; opacity: 0.7; }
        .example-hint { background-color: var(--vscode-border); border-radius: 4px; padding: 1rem; margin-top: 1rem; max-width: 400px; }
        .example-hint code {
            font-family: var(--vscode-editor-font-family, 'Consolas', 'Courier New', monospace);
            font-size: 0.9rem; line-height: 1.4; color: var(--vscode-success-foreground);
        }
        #minder-container { width: 100%; height: 100%; position: relative; overflow: hidden; }
        #minder-container.hidden { display: none; }
        #minder-canvas { width: 100%; height: 100%; background-color: var(--vscode-background); }
        .controls-panel {
            position: absolute; background-color: var(--vscode-border); border-radius: 6px; padding: 0.5rem;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); z-index: 1000;
        }
        #navigation-controls { top: 1rem; right: 1rem; display: flex; gap: 0.25rem; }
        .control-button {
            background-color: var(--vscode-button-background); color: var(--vscode-button-foreground);
            border: none; width: 32px; height: 32px; border-radius: 4px; cursor: pointer; font-size: 1rem; font-weight: bold;
            display: flex; align-items: center; justify-content: center; transition: background-color 0.2s;
        }
        .control-button:hover { background-color: var(--vscode-button-hover); }
        .control-button:active { transform: scale(0.95); }
        .theme-panel { bottom: 1rem; right: 1rem; }
        .theme-select {
            background-color: var(--vscode-background); color: var(--vscode-foreground);
            border: 1px solid var(--vscode-border); border-radius: 4px; padding: 0.5rem;
            font-size: 0.9rem; cursor: pointer; min-width: 120px;
        }
        .theme-select:focus { outline: 1px solid var(--vscode-button-background); outline-offset: -1px; }
    </style>
</head>
<body>
    <div id="preview-container">
        <!-- Loading State -->
        <div id="loading-state" class="state-container">
            <div class="loading-spinner"></div>
            <p>Loading preview...</p>
        </div>
        
        <!-- Error State -->
        <div id="error-state" class="state-container hidden">
            <div class="error-icon">⚠️</div>
            <h3>Preview Error</h3>
            <p id="error-message">An error occurred while generating the preview.</p>
            <div id="error-details" class="error-details hidden"></div>
            <button id="retry-button" class="retry-button">Retry</button>
        </div>
        
        <!-- Empty State -->
        <div id="empty-state" class="state-container hidden">
            <div class="empty-icon">📝</div>
            <h3>Empty CMind File</h3>
            <p>Start typing in your CMind file to see the preview here.</p>
            <div class="example-hint">
                <p>Example:</p>
                <code># Root Topic<br>  - Child 1<br>  - Child 2</code>
            </div>
        </div>
        
        <!-- KityMinder Container -->
        <div id="minder-container" class="hidden">
            <div id="minder-canvas"></div>
            
            <!-- Navigation Controls -->
            <div id="navigation-controls" class="controls-panel" style="display: ${this.interactionEnabled ? "flex" : "none"}">
                <button id="zoom-in" class="control-button" title="Zoom In">+</button>
                <button id="zoom-out" class="control-button" title="Zoom Out">-</button>
                <button id="zoom-fit" class="control-button" title="Fit to Screen">⌂</button>
                <button id="center-view" class="control-button" title="Center View">⊙</button>
            </div>
            
            <!-- Theme Selector -->
            <div id="theme-selector" class="controls-panel theme-panel" style="display: ${this.interactionEnabled ? "block" : "none"}">
                <select id="theme-select" class="theme-select">
                    <option value="default" ${currentTheme === "default" ? "selected" : ""}>Default</option>
                    <option value="fresh-blue" ${currentTheme === "fresh-blue" ? "selected" : ""}>Fresh Blue</option>
                    <option value="fresh-green" ${currentTheme === "fresh-green" ? "selected" : ""}>Fresh Green</option>
                    <option value="fresh-red" ${currentTheme === "fresh-red" ? "selected" : ""}>Fresh Red</option>
                    <option value="fresh-pink" ${currentTheme === "fresh-pink" ? "selected" : ""}>Fresh Pink</option>
                    <option value="fresh-purple" ${currentTheme === "fresh-purple" ? "selected" : ""}>Fresh Purple</option>
                </select>
            </div>
        </div>
    </div>
    
    <script>
        /* CMind Preview WebView Script - Inline Version */
        (function() {
            'use strict';
            
            const vscode = acquireVsCodeApi();
            let currentMinder = null;
            let currentTheme = 'default';
            let isInteractionEnabled = true;
            let retryCount = 0;
            const maxRetries = 3;
            
            const elements = {};
            
            document.addEventListener('DOMContentLoaded', function() {
                initializeElements();
                setupEventListeners();
                setupMessageHandling();
                
                sendMessage({ type: 'ready', timestamp: Date.now() });
                console.log('CMind Preview initialized');
            });
            
            function initializeElements() {
                elements.loadingState = document.getElementById('loading-state');
                elements.errorState = document.getElementById('error-state');
                elements.emptyState = document.getElementById('empty-state');
                elements.minderContainer = document.getElementById('minder-container');
                elements.minderCanvas = document.getElementById('minder-canvas');
                elements.errorMessage = document.getElementById('error-message');
                elements.errorDetails = document.getElementById('error-details');
                elements.retryButton = document.getElementById('retry-button');
                elements.themeSelect = document.getElementById('theme-select');
                elements.zoomInButton = document.getElementById('zoom-in');
                elements.zoomOutButton = document.getElementById('zoom-out');
                elements.zoomFitButton = document.getElementById('zoom-fit');
                elements.centerViewButton = document.getElementById('center-view');
            }
            
            function setupEventListeners() {
                if (elements.retryButton) {
                    elements.retryButton.addEventListener('click', retryPreview);
                }
                
                if (elements.themeSelect) {
                    elements.themeSelect.addEventListener('change', function() {
                        const newTheme = this.value;
                        changeTheme(newTheme);
                        sendMessage({ type: 'themeChanged', theme: newTheme });
                    });
                }
                
                if (elements.zoomInButton) elements.zoomInButton.addEventListener('click', zoomIn);
                if (elements.zoomOutButton) elements.zoomOutButton.addEventListener('click', zoomOut);
                if (elements.zoomFitButton) elements.zoomFitButton.addEventListener('click', fitToView);
                if (elements.centerViewButton) elements.centerViewButton.addEventListener('click', centerView);
                
                window.addEventListener('resize', function() {
                    if (currentMinder) {
                        clearTimeout(window.resizeTimeout);
                        window.resizeTimeout = setTimeout(function() {
                            if (currentMinder.fitView) currentMinder.fitView();
                        }, 250);
                    }
                });
            }
            
            function setupMessageHandling() {
                window.addEventListener('message', function(event) {
                    try {
                        handleMessage(event.data);
                    } catch (error) {
                        console.error('Error handling message:', error);
                        showError('Message handling error', error.message);
                    }
                });
            }
            
            function handleMessage(message) {
                console.log('Received message:', message.type);
                
                switch (message.type) {
                    case 'updateContent':
                        updatePreviewContent(message.data, message.theme);
                        break;
                    case 'showError':
                        showError(message.title, message.message, message.details);
                        break;
                    case 'showEmpty':
                        showEmptyState();
                        break;
                    case 'showLoading':
                        showLoadingState();
                        break;
                    case 'updateTheme':
                        changeTheme(message.theme);
                        break;
                    case 'enableInteraction':
                        setInteractionEnabled(message.enabled);
                        break;
                    case 'fitToView':
                        fitToView();
                        break;
                    default:
                        console.warn('Unknown message type:', message.type);
                }
            }
            
            function updatePreviewContent(data, theme) {
                try {
                    retryCount = 0;
                    console.log('updatePreviewContent called with data:', data, 'theme:', theme);
                    
                    if (!data || !data.root) {
                        console.log('No data or root, showing empty state');
                        showEmptyState();
                        return;
                    }
                    
                    if (theme && theme !== currentTheme) {
                        currentTheme = theme;
                        if (elements.themeSelect) {
                            elements.themeSelect.value = theme;
                        }
                    }
                    
                    renderSimpleMindMap(data, currentTheme);
                    showMinderState();
                    
                    sendMessage({ type: 'contentUpdated', success: true, timestamp: Date.now() });
                    
                } catch (error) {
                    console.error('Error updating preview content:', error);
                    showError('Preview Update Error', 'Failed to update preview content', error.message);
                    sendMessage({ type: 'contentUpdated', success: false, error: error.message, timestamp: Date.now() });
                }
            }
            
            function renderSimpleMindMap(data, theme) {
                if (!elements.minderCanvas) return;
                
                elements.minderCanvas.innerHTML = '';
                
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('width', '100%');
                svg.setAttribute('height', '100%');
                svg.style.display = 'block';
                
                const themes = {
                    'default': { bg: '#f5f5f5', root: '#5b9bd5', node: '#70ad47', text: '#333', line: '#5b9bd5', rootText: '#fff', nodeText: '#333' },
                    'fresh-blue': { bg: '#f8f9fa', root: '#1976d2', node: '#42a5f5', text: '#1565c0', line: '#90caf9', rootText: '#fff', nodeText: '#333' },
                    'fresh-green': { bg: '#f1f8e9', root: '#388e3c', node: '#66bb6a', text: '#2e7d32', line: '#a5d6a7', rootText: '#fff', nodeText: '#333' },
                    'fresh-red': { bg: '#ffebee', root: '#d32f2f', node: '#ef5350', text: '#c62828', line: '#ffcdd2', rootText: '#fff', nodeText: '#333' },
                    'fresh-pink': { bg: '#fce4ec', root: '#c2185b', node: '#ec407a', text: '#ad1457', line: '#f8bbd9', rootText: '#fff', nodeText: '#333' },
                    'fresh-purple': { bg: '#f3e5f5', root: '#7b1fa2', node: '#ab47bc', text: '#6a1b9a', line: '#ce93d8', rootText: '#fff', nodeText: '#333' }
                };
                
                const currentThemeColors = themes[theme] || themes['default'];
                svg.style.background = currentThemeColors.bg;
                
                const rect = elements.minderCanvas.getBoundingClientRect();
                const startX = 100;
                const startY = rect.height / 2 || 300;
                
                // 计算树的总高度以便垂直居中
                const treeHeight = calculateTreeHeight(data.root);
                const adjustedStartY = startY;
                
                renderNode(svg, data.root, startX, adjustedStartY, 0, currentThemeColors, { yOffset: 0 });
                elements.minderCanvas.appendChild(svg);
                
                currentMinder = {
                    svg: svg, data: data, theme: theme, zoomLevel: 1, panX: 0, panY: 0,
                    useTheme: function(newTheme) { renderSimpleMindMap(this.data, newTheme); },
                    zoom: function(level) {
                        if (typeof level === 'number') {
                            this.zoomLevel = Math.max(0.1, Math.min(5, level));
                            this.updateTransform();
                        }
                        return this.zoomLevel;
                    },
                    pan: function(x, y) {
                        if (typeof x === 'number' && typeof y === 'number') {
                            this.panX = x; this.panY = y; this.updateTransform();
                        }
                        return { x: this.panX, y: this.panY };
                    },
                    updateTransform: function() {
                        if (this.svg) {
                            const transform = 'translate(' + this.panX + ',' + this.panY + ') scale(' + this.zoomLevel + ')';
                            this.svg.setAttribute('transform', transform);
                        }
                    },
                    fitView: function() { this.zoomLevel = 1; this.panX = 0; this.panY = 0; this.updateTransform(); }
                };
            }
            
            function calculateTreeHeight(node) {
                if (!node.children || node.children.length === 0) return 60;
                var totalHeight = 0;
                for (var i = 0; i < node.children.length; i++) {
                    totalHeight += calculateTreeHeight(node.children[i]);
                }
                return totalHeight;
            }
            
            function renderNode(svg, node, x, y, level, colors, state) {
                const nodeData = node.data || {};
                const text = nodeData.text || 'Node';
                const children = node.children || [];
                
                const fontSize = level === 0 ? 16 : 14;
                const padding = level === 0 ? 16 : 10;
                const textWidth = text.length * fontSize * 0.6;
                const nodeWidth = Math.max(textWidth + padding * 2, level === 0 ? 160 : 100);
                const nodeHeight = level === 0 ? 50 : 36;
                
                const horizontalSpacing = 180;
                const verticalSpacing = 60;
                
                // 绘制节点
                const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('x', x);
                rect.setAttribute('y', y - nodeHeight / 2);
                rect.setAttribute('width', nodeWidth);
                rect.setAttribute('height', nodeHeight);
                rect.setAttribute('rx', level === 0 ? 8 : 4);
                
                if (level === 0) {
                    rect.setAttribute('fill', colors.root);
                    rect.setAttribute('stroke', colors.root);
                    rect.setAttribute('stroke-width', 2);
                } else {
                    rect.setAttribute('fill', 'transparent');
                    rect.setAttribute('stroke', colors.line);
                    rect.setAttribute('stroke-width', 1.5);
                }
                
                const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                textElement.setAttribute('x', x + nodeWidth / 2);
                textElement.setAttribute('y', y + fontSize / 3);
                textElement.setAttribute('text-anchor', 'middle');
                textElement.setAttribute('font-family', 'Arial, sans-serif');
                textElement.setAttribute('font-size', fontSize);
                textElement.setAttribute('fill', level === 0 ? colors.rootText : colors.nodeText);
                textElement.setAttribute('font-weight', level === 0 ? 'bold' : 'normal');
                textElement.textContent = text;
                
                nodeGroup.appendChild(rect);
                nodeGroup.appendChild(textElement);
                svg.appendChild(nodeGroup);
                
                // 绘制子节点
                if (children.length > 0) {
                    const nodeRightX = x + nodeWidth;
                    const childX = nodeRightX + horizontalSpacing;
                    
                    // 计算子树总高度
                    var childHeights = [];
                    var totalHeight = 0;
                    for (var i = 0; i < children.length; i++) {
                        var height = calculateTreeHeight(children[i]);
                        childHeights.push(height);
                        totalHeight += height;
                    }
                    
                    // 起始Y坐标
                    var currentY = y - totalHeight / 2;
                    
                    for (var i = 0; i < children.length; i++) {
                        var childY = currentY + childHeights[i] / 2;
                        
                        // 绘制连接线 - 使用折线
                        var midX = nodeRightX + horizontalSpacing / 2;
                        
                        // 主干线（从父节点右侧到中点）
                        var line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                        line1.setAttribute('x1', nodeRightX);
                        line1.setAttribute('y1', y);
                        line1.setAttribute('x2', midX);
                        line1.setAttribute('y2', y);
                        line1.setAttribute('stroke', colors.line);
                        line1.setAttribute('stroke-width', 1.5);
                        svg.appendChild(line1);
                        
                        // 垂直线（从中点到子节点高度）
                        var line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                        line2.setAttribute('x1', midX);
                        line2.setAttribute('y1', y);
                        line2.setAttribute('x2', midX);
                        line2.setAttribute('y2', childY);
                        line2.setAttribute('stroke', colors.line);
                        line2.setAttribute('stroke-width', 1.5);
                        svg.appendChild(line2);
                        
                        // 水平线（从中点到子节点）
                        var line3 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                        line3.setAttribute('x1', midX);
                        line3.setAttribute('y1', childY);
                        line3.setAttribute('x2', childX);
                        line3.setAttribute('y2', childY);
                        line3.setAttribute('stroke', colors.line);
                        line3.setAttribute('stroke-width', 1.5);
                        svg.appendChild(line3);
                        
                        // 递归渲染子节点
                        renderNode(svg, children[i], childX, childY, level + 1, colors, state);
                        
                        currentY += childHeights[i];
                    }
                }
            }
            
            function showLoadingState() {
                hideAllStates();
                if (elements.loadingState) elements.loadingState.classList.remove('hidden');
            }
            
            function showErrorState() {
                hideAllStates();
                if (elements.errorState) elements.errorState.classList.remove('hidden');
            }
            
            function showEmptyState() {
                hideAllStates();
                if (elements.emptyState) elements.emptyState.classList.remove('hidden');
            }
            
            function showMinderState() {
                hideAllStates();
                if (elements.minderContainer) elements.minderContainer.classList.remove('hidden');
            }
            
            function hideAllStates() {
                const states = [elements.loadingState, elements.errorState, elements.emptyState, elements.minderContainer];
                states.forEach(function(element) {
                    if (element) element.classList.add('hidden');
                });
            }
            
            function showError(title, message, details) {
                if (elements.errorMessage) {
                    elements.errorMessage.textContent = message || 'An unknown error occurred';
                }
                
                if (elements.errorDetails && details) {
                    elements.errorDetails.textContent = details;
                    elements.errorDetails.classList.remove('hidden');
                } else if (elements.errorDetails) {
                    elements.errorDetails.classList.add('hidden');
                }
                
                showErrorState();
                sendMessage({ type: 'error', title: title, message: message, details: details, timestamp: Date.now() });
            }
            
            function retryPreview() {
                if (retryCount >= maxRetries) {
                    showError('Maximum Retries Exceeded', 'Unable to load preview after multiple attempts');
                    return;
                }
                
                retryCount++;
                showLoadingState();
                sendMessage({ type: 'retry', attempt: retryCount, timestamp: Date.now() });
            }
            
            function changeTheme(theme) {
                currentTheme = theme;
                if (currentMinder) currentMinder.useTheme(theme);
                if (elements.themeSelect && elements.themeSelect.value !== theme) {
                    elements.themeSelect.value = theme;
                }
            }
            
            function setInteractionEnabled(enabled) {
                isInteractionEnabled = enabled;
                const controls = document.querySelectorAll('.controls-panel');
                controls.forEach(function(control) {
                    control.style.display = enabled ? 'block' : 'none';
                });
            }
            
            function zoomIn() {
                if (currentMinder && isInteractionEnabled) {
                    const currentZoom = currentMinder.zoom();
                    currentMinder.zoom(Math.min(currentZoom * 1.2, 5));
                }
            }
            
            function zoomOut() {
                if (currentMinder && isInteractionEnabled) {
                    const currentZoom = currentMinder.zoom();
                    currentMinder.zoom(Math.max(currentZoom / 1.2, 0.1));
                }
            }
            
            function fitToView() {
                if (currentMinder && isInteractionEnabled) {
                    currentMinder.fitView();
                }
            }
            
            function centerView() {
                if (currentMinder && isInteractionEnabled) {
                    currentMinder.pan(0, 0);
                    currentMinder.zoom(1);
                }
            }
            
            function sendMessage(message) {
                try {
                    vscode.postMessage(message);
                } catch (error) {
                    console.error('Failed to send message to extension:', error);
                }
            }
            
            window.addEventListener('error', function(event) {
                console.error('Uncaught error in webview:', event.error);
                showError('Webview Error', 'An unexpected error occurred in the preview', event.error ? event.error.message : 'Unknown error');
            });
            
            window.addEventListener('unhandledrejection', function(event) {
                console.error('Unhandled promise rejection in webview:', event.reason);
                showError('Promise Rejection', 'An unhandled promise rejection occurred', event.reason ? event.reason.message : 'Unknown rejection');
            });
            
        })();
    </script>
    
    ${
      data
        ? `<script>
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
        : ""
    }
</body>
</html>`;

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
