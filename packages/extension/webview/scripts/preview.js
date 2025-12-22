/* CMind Preview WebView Script */
/* Handles communication between VSCode extension and webview */

(function() {
    'use strict';
    
    // VSCode API
    const vscode = acquireVsCodeApi();
    
    // State management
    let currentMinder = null;
    let currentTheme = 'default';
    let isInteractionEnabled = true;
    let retryCount = 0;
    const maxRetries = 3;
    
    // DOM elements
    const elements = {
        loadingState: null,
        errorState: null,
        emptyState: null,
        minderContainer: null,
        minderCanvas: null,
        errorMessage: null,
        errorDetails: null,
        retryButton: null,
        themeSelect: null,
        zoomInButton: null,
        zoomOutButton: null,
        zoomFitButton: null,
        centerViewButton: null
    };
    
    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        initializeElements();
        setupEventListeners();
        setupMessageHandling();
        
        // Request initial content
        sendMessage({
            type: 'ready',
            timestamp: Date.now()
        });
        
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
        // Retry button
        if (elements.retryButton) {
            elements.retryButton.addEventListener('click', function() {
                retryPreview();
            });
        }
        
        // Theme selector
        if (elements.themeSelect) {
            elements.themeSelect.addEventListener('change', function() {
                const newTheme = this.value;
                changeTheme(newTheme);
                
                // Notify extension of theme change
                sendMessage({
                    type: 'themeChanged',
                    theme: newTheme
                });
            });
        }
        
        // Navigation controls
        if (elements.zoomInButton) {
            elements.zoomInButton.addEventListener('click', function() {
                zoomIn();
            });
        }
        
        if (elements.zoomOutButton) {
            elements.zoomOutButton.addEventListener('click', function() {
                zoomOut();
            });
        }
        
        if (elements.zoomFitButton) {
            elements.zoomFitButton.addEventListener('click', function() {
                fitToView();
            });
        }
        
        if (elements.centerViewButton) {
            elements.centerViewButton.addEventListener('click', function() {
                centerView();
            });
        }
        
        // Window resize handling
        window.addEventListener('resize', function() {
            if (currentMinder) {
                // Debounce resize handling
                clearTimeout(window.resizeTimeout);
                window.resizeTimeout = setTimeout(function() {
                    currentMinder.fitView();
                }, 250);
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', function(event) {
            if (!isInteractionEnabled) return;
            
            // Zoom shortcuts
            if (event.ctrlKey || event.metaKey) {
                switch (event.key) {
                    case '=':
                    case '+':
                        event.preventDefault();
                        zoomIn();
                        break;
                    case '-':
                        event.preventDefault();
                        zoomOut();
                        break;
                    case '0':
                        event.preventDefault();
                        fitToView();
                        break;
                }
            }
        });
    }
    
    function setupMessageHandling() {
        window.addEventListener('message', function(event) {
            const message = event.data;
            
            try {
                handleMessage(message);
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
                
            case 'updateConfig':
                updateConfiguration(message.config);
                break;
                
            case 'enableInteraction':
                setInteractionEnabled(message.enabled);
                break;
                
            case 'setZoom':
                if (currentMinder && isInteractionEnabled) {
                    currentMinder.zoom(message.zoomLevel);
                }
                break;
                
            case 'fitToView':
                fitToView();
                break;
                
            case 'centerView':
                centerView();
                break;
                
            case 'resetView':
                if (currentMinder && isInteractionEnabled) {
                    currentMinder.pan(0, 0);
                    currentMinder.zoom(1);
                }
                break;
                
            default:
                console.warn('Unknown message type:', message.type);
        }
    }
    
    function updatePreviewContent(data, theme) {
        try {
            retryCount = 0; // Reset retry count on successful update
            
            console.log('updatePreviewContent called with data:', data, 'theme:', theme);
            
            if (!data || !data.root) {
                console.log('No data or root, showing empty state');
                showEmptyState();
                return;
            }
            
            // Update theme if provided
            if (theme && theme !== currentTheme) {
                currentTheme = theme;
                if (elements.themeSelect) {
                    elements.themeSelect.value = theme;
                }
            }
            
            // Use simple SVG rendering instead of KityMinder
            renderSimpleMindMap(data, currentTheme);
            
            // Show the minder container
            showMinderState();
            
            // Notify extension of successful update
            sendMessage({
                type: 'contentUpdated',
                success: true,
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('Error updating preview content:', error);
            showError('Preview Update Error', 'Failed to update preview content', error.message);
            
            // Notify extension of error
            sendMessage({
                type: 'contentUpdated',
                success: false,
                error: error.message,
                timestamp: Date.now()
            });
        }
    }
    
    function renderSimpleMindMap(data, theme) {
        if (!elements.minderCanvas) return;
        
        // Clear previous content
        elements.minderCanvas.innerHTML = '';
        
        // Create SVG
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.style.display = 'block';
        
        // Theme colors
        const themes = {
            'default': { bg: '#ffffff', root: '#4285f4', node: '#34a853', text: '#333', line: '#ccc' },
            'fresh-blue': { bg: '#f8f9fa', root: '#1976d2', node: '#42a5f5', text: '#1565c0', line: '#90caf9' },
            'fresh-green': { bg: '#f1f8e9', root: '#388e3c', node: '#66bb6a', text: '#2e7d32', line: '#a5d6a7' },
            'fresh-red': { bg: '#ffebee', root: '#d32f2f', node: '#ef5350', text: '#c62828', line: '#ffcdd2' },
            'fresh-pink': { bg: '#fce4ec', root: '#c2185b', node: '#ec407a', text: '#ad1457', line: '#f8bbd9' },
            'fresh-purple': { bg: '#f3e5f5', root: '#7b1fa2', node: '#ab47bc', text: '#6a1b9a', line: '#ce93d8' }
        };
        
        const currentThemeColors = themes[theme] || themes['default'];
        svg.style.background = currentThemeColors.bg;
        
        // Get container dimensions
        const rect = elements.minderCanvas.getBoundingClientRect();
        const centerX = rect.width / 2 || 400;
        const centerY = rect.height / 2 || 300;
        
        // Render nodes
        renderNode(svg, data.root, centerX, centerY, 0, 0, currentThemeColors);
        
        elements.minderCanvas.appendChild(svg);
        
        // Store current data for zoom/pan operations
        currentMinder = {
            svg: svg,
            data: data,
            theme: theme,
            zoomLevel: 1,
            panX: 0,
            panY: 0,
            useTheme: function(newTheme) {
                renderSimpleMindMap(this.data, newTheme);
            },
            zoom: function(level) {
                if (typeof level === 'number') {
                    this.zoomLevel = Math.max(0.1, Math.min(5, level));
                    this.updateTransform();
                }
                return this.zoomLevel;
            },
            pan: function(x, y) {
                if (typeof x === 'number' && typeof y === 'number') {
                    this.panX = x;
                    this.panY = y;
                    this.updateTransform();
                }
                return { x: this.panX, y: this.panY };
            },
            updateTransform: function() {
                if (this.svg) {
                    const transform = 'translate(' + this.panX + ',' + this.panY + ') scale(' + this.zoomLevel + ')';
                    this.svg.setAttribute('transform', transform);
                }
            },
            fitView: function() {
                this.zoomLevel = 1;
                this.panX = 0;
                this.panY = 0;
                this.updateTransform();
            }
        };
    }
    
    function renderNode(svg, node, x, y, level, angle, colors) {
        const nodeData = node.data || {};
        const text = nodeData.text || 'Node';
        const children = node.children || [];
        
        // Calculate node size
        const fontSize = level === 0 ? 18 : 14;
        const padding = level === 0 ? 20 : 12;
        const textWidth = text.length * fontSize * 0.6;
        const nodeWidth = Math.max(textWidth + padding * 2, 80);
        const nodeHeight = fontSize + padding;
        
        // Create node group
        const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        
        // Create node rectangle
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x - nodeWidth / 2);
        rect.setAttribute('y', y - nodeHeight / 2);
        rect.setAttribute('width', nodeWidth);
        rect.setAttribute('height', nodeHeight);
        rect.setAttribute('rx', 8);
        rect.setAttribute('fill', level === 0 ? colors.root : colors.node);
        rect.setAttribute('stroke', colors.line);
        rect.setAttribute('stroke-width', 2);
        
        // Create text element
        const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        textElement.setAttribute('x', x);
        textElement.setAttribute('y', y + fontSize / 3);
        textElement.setAttribute('text-anchor', 'middle');
        textElement.setAttribute('font-family', 'Arial, sans-serif');
        textElement.setAttribute('font-size', fontSize);
        textElement.setAttribute('fill', '#ffffff');
        textElement.setAttribute('font-weight', level === 0 ? 'bold' : 'normal');
        textElement.textContent = text;
        
        nodeGroup.appendChild(rect);
        nodeGroup.appendChild(textElement);
        svg.appendChild(nodeGroup);
        
        // Render children
        if (children.length > 0) {
            const angleStep = children.length > 1 ? (Math.PI * 2) / children.length : 0;
            const radius = level === 0 ? 150 : 100;
            
            for (let i = 0; i < children.length; i++) {
                const childAngle = level === 0 ? 
                    (i * angleStep - Math.PI / 2) : 
                    (angle + (i - children.length / 2) * 0.5);
                
                const childX = x + Math.cos(childAngle) * radius;
                const childY = y + Math.sin(childAngle) * radius;
                
                // Draw connection line
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', x);
                line.setAttribute('y1', y);
                line.setAttribute('x2', childX);
                line.setAttribute('y2', childY);
                line.setAttribute('stroke', colors.line);
                line.setAttribute('stroke-width', 2);
                svg.appendChild(line);
                
                // Render child node
                renderNode(svg, children[i], childX, childY, level + 1, childAngle, colors);
            }
        }
    }
    
    function showLoadingState() {
        hideAllStates();
        if (elements.loadingState) {
            elements.loadingState.classList.remove('hidden');
        }
    }
    
    function showErrorState() {
        hideAllStates();
        if (elements.errorState) {
            elements.errorState.classList.remove('hidden');
        }
    }
    
    function showEmptyState() {
        hideAllStates();
        if (elements.emptyState) {
            elements.emptyState.classList.remove('hidden');
        }
    }
    
    function showMinderState() {
        hideAllStates();
        if (elements.minderContainer) {
            elements.minderContainer.classList.remove('hidden');
        }
    }
    
    function hideAllStates() {
        const states = [elements.loadingState, elements.errorState, elements.emptyState, elements.minderContainer];
        states.forEach(function(element) {
            if (element) {
                element.classList.add('hidden');
            }
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
        
        // Report error to extension
        sendMessage({
            type: 'error',
            title: title,
            message: message,
            details: details,
            timestamp: Date.now()
        });
    }
    
    function retryPreview() {
        if (retryCount >= maxRetries) {
            showError('Maximum Retries Exceeded', 'Unable to load preview after multiple attempts');
            return;
        }
        
        retryCount++;
        showLoadingState();
        
        // Request content refresh from extension
        sendMessage({
            type: 'retry',
            attempt: retryCount,
            timestamp: Date.now()
        });
    }
    
    function changeTheme(theme) {
        currentTheme = theme;
        
        if (currentMinder) {
            currentMinder.useTheme(theme);
        }
        
        if (elements.themeSelect && elements.themeSelect.value !== theme) {
            elements.themeSelect.value = theme;
        }
    }
    
    function updateConfiguration(config) {
        if (config.theme && config.theme !== currentTheme) {
            changeTheme(config.theme);
        }
        
        if (typeof config.enableInteraction === 'boolean') {
            setInteractionEnabled(config.enableInteraction);
        }
    }
    
    function setInteractionEnabled(enabled) {
        isInteractionEnabled = enabled;
        
        // Update control visibility
        const controls = document.querySelectorAll('.controls-panel');
        controls.forEach(function(control) {
            control.style.display = enabled ? 'block' : 'none';
        });
    }
    
    // Navigation functions
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
    
    // Communication helper
    function sendMessage(message) {
        try {
            vscode.postMessage(message);
        } catch (error) {
            console.error('Failed to send message to extension:', error);
        }
    }
    
    // Error handling for uncaught errors
    window.addEventListener('error', function(event) {
        console.error('Uncaught error in webview:', event.error);
        showError('Webview Error', 'An unexpected error occurred in the preview', event.error ? event.error.message : 'Unknown error');
    });
    
    window.addEventListener('unhandledrejection', function(event) {
        console.error('Unhandled promise rejection in webview:', event.reason);
        showError('Promise Rejection', 'An unhandled promise rejection occurred', event.reason ? event.reason.message : 'Unknown rejection');
    });
    
})();