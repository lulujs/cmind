import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { PreviewPanelManager, PreviewConfiguration } from '../src/extension/preview-panel-manager.js';

// Mock VSCode API
vi.mock('vscode', () => ({
    window: {
        createWebviewPanel: vi.fn(),
        onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() }))
    },
    workspace: {
        createFileSystemWatcher: vi.fn(() => ({
            onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
            onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
            dispose: vi.fn()
        }))
    },
    commands: {
        executeCommand: vi.fn()
    },
    ViewColumn: {
        Beside: 2
    },
    Uri: {
        file: vi.fn((path: string) => ({ fsPath: path }))
    }
}));

describe('PreviewPanelManager', () => {
    let previewPanelManager: PreviewPanelManager;
    let mockContext: vscode.ExtensionContext;
    let mockPanel: vscode.WebviewPanel;
    let configuration: PreviewConfiguration;

    beforeEach(() => {
        // Setup mock context
        mockContext = {
            extensionPath: '/mock/extension/path',
            workspaceState: {
                get: vi.fn(() => []),
                update: vi.fn()
            }
        } as any;

        // Setup mock panel
        mockPanel = {
            title: '',
            visible: true,
            active: true,
            viewColumn: vscode.ViewColumn.Beside,
            webview: {
                html: '',
                onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
                asWebviewUri: vi.fn((uri: any) => uri)
            },
            onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
            onDidChangeViewState: vi.fn(() => ({ dispose: vi.fn() })),
            dispose: vi.fn(),
            reveal: vi.fn(),
            iconPath: undefined
        } as any;

        // Setup configuration
        configuration = {
            autoUpdate: true,
            updateDelay: 500,
            maxMemoryUsage: 50,
            enableInteraction: true,
            theme: 'default'
        };

        // Mock createWebviewPanel to return our mock panel
        vi.mocked(vscode.window.createWebviewPanel).mockReturnValue(mockPanel);

        previewPanelManager = new PreviewPanelManager(configuration, mockContext);
    });

    afterEach(() => {
        previewPanelManager.dispose();
        vi.clearAllMocks();
    });

    describe('Panel Creation', () => {
        it('should create a preview panel for a CMind file', async () => {
            const filePath = '/test/file.cmind';
            
            const panel = await previewPanelManager.createPreviewPanel(filePath);
            
            expect(panel).toBe(mockPanel);
            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'cmindPreview',
                'Preview: file',
                expect.objectContaining({
                    viewColumn: vscode.ViewColumn.Beside,
                    preserveFocus: true
                }),
                expect.objectContaining({
                    enableScripts: true,
                    enableForms: false,
                    enableCommandUris: false,
                    retainContextWhenHidden: true
                })
            );
        });

        it('should track preview state when panel is created', async () => {
            const filePath = '/test/file.cmind';
            
            await previewPanelManager.createPreviewPanel(filePath);
            
            expect(previewPanelManager.isPreviewOpen(filePath)).toBe(true);
            expect(previewPanelManager.getActivePreviewPath()).toBe(filePath);
            
            const state = previewPanelManager.getPreviewState(filePath);
            expect(state).toBeDefined();
            expect(state?.filePath).toBe(filePath);
            expect(state?.isActive).toBe(true);
        });

        it('should set context when preview is active', async () => {
            const filePath = '/test/file.cmind';
            
            await previewPanelManager.createPreviewPanel(filePath);
            
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'setContext', 
                'cmindPreviewActive', 
                true
            );
        });
    });

    describe('Panel Management', () => {
        it('should show existing preview panel', async () => {
            const filePath = '/test/file.cmind';
            
            // Create panel first
            await previewPanelManager.createPreviewPanel(filePath);
            
            // Show existing panel
            await previewPanelManager.showPreview(filePath);
            
            expect(mockPanel.reveal).toHaveBeenCalledWith(vscode.ViewColumn.Beside, true);
        });

        it('should close preview and clean up state', async () => {
            const filePath = '/test/file.cmind';
            
            // Create panel first
            await previewPanelManager.createPreviewPanel(filePath);
            
            // Get the dispose handler that was registered
            const disposeHandler = vi.mocked(mockPanel.onDidDispose).mock.calls[0][0];
            
            // Close preview
            previewPanelManager.closePreview(filePath);
            
            // Simulate the dispose event
            disposeHandler();
            
            expect(mockPanel.dispose).toHaveBeenCalled();
            expect(previewPanelManager.isPreviewOpen(filePath)).toBe(false);
        });

        it('should switch to specified tab', async () => {
            const filePath = '/test/file.cmind';
            
            await previewPanelManager.createPreviewPanel(filePath);
            
            previewPanelManager.switchToTab(filePath);
            
            expect(mockPanel.reveal).toHaveBeenCalledWith(vscode.ViewColumn.Beside, true);
            expect(previewPanelManager.getActivePreviewPath()).toBe(filePath);
        });
    });

    describe('Content Updates', () => {
        it('should update preview content with KityMinder data', async () => {
            const filePath = '/test/file.cmind';
            const mockData = {
                root: { data: { text: 'Root' } },
                template: 'default',
                theme: 'fresh-blue',
                version: '1.0'
            };
            const contentHash = 'abc123';
            
            await previewPanelManager.createPreviewPanel(filePath);
            await previewPanelManager.updatePreviewContent(filePath, mockData, contentHash);
            
            expect(mockPanel.webview.html).toContain('CMind Preview');
            expect(mockPanel.webview.html).toContain('Loading preview...');
            
            const state = previewPanelManager.getPreviewState(filePath);
            expect(state?.contentHash).toBe(contentHash);
            expect(state?.errorState).toBeUndefined();
        });

        it('should update preview content with error information', async () => {
            const filePath = '/test/file.cmind';
            const mockError = {
                message: 'Syntax error',
                line: 5,
                column: 10,
                type: 'syntax' as const
            };
            const contentHash = 'def456';
            
            await previewPanelManager.createPreviewPanel(filePath);
            await previewPanelManager.updatePreviewContent(filePath, mockError, contentHash);
            
            expect(mockPanel.webview.html).toContain('Preview Error');
            expect(mockPanel.webview.html).toContain('Syntax error');
            expect(mockPanel.webview.html).toContain('Line 5, Column 10');
            
            const state = previewPanelManager.getPreviewState(filePath);
            expect(state?.contentHash).toBe(contentHash);
            expect(state?.errorState).toEqual(mockError);
        });
    });

    describe('Multiple Panels', () => {
        it('should manage multiple preview panels', async () => {
            const filePath1 = '/test/file1.cmind';
            const filePath2 = '/test/file2.cmind';
            
            await previewPanelManager.createPreviewPanel(filePath1);
            await previewPanelManager.createPreviewPanel(filePath2);
            
            expect(previewPanelManager.isPreviewOpen(filePath1)).toBe(true);
            expect(previewPanelManager.isPreviewOpen(filePath2)).toBe(true);
            
            const openPaths = previewPanelManager.getOpenPreviewPaths();
            expect(openPaths).toContain(filePath1);
            expect(openPaths).toContain(filePath2);
            expect(openPaths).toHaveLength(2);
        });

        it('should update active preview when switching tabs', async () => {
            const filePath1 = '/test/file1.cmind';
            const filePath2 = '/test/file2.cmind';
            
            await previewPanelManager.createPreviewPanel(filePath1);
            await previewPanelManager.createPreviewPanel(filePath2);
            
            // Switch to first tab
            previewPanelManager.switchToTab(filePath1);
            expect(previewPanelManager.getActivePreviewPath()).toBe(filePath1);
            
            // Switch to second tab
            previewPanelManager.switchToTab(filePath2);
            expect(previewPanelManager.getActivePreviewPath()).toBe(filePath2);
        });
    });

    describe('Lifecycle Management', () => {
        it('should persist and restore panel states', async () => {
            const filePath = '/test/file.cmind';
            
            await previewPanelManager.createPreviewPanel(filePath);
            
            // Check that workspace state update was called
            expect(mockContext.workspaceState.update).toHaveBeenCalledWith(
                'cmind.preview.lifecycleStates',
                expect.arrayContaining([
                    expect.objectContaining({
                        filePath,
                        isVisible: true,
                        viewColumn: vscode.ViewColumn.Beside
                    })
                ])
            );
        });

        it('should clean up all resources on dispose', () => {
            previewPanelManager.dispose();
            
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'setContext',
                'cmindPreviewActive',
                false
            );
        });
    });
});