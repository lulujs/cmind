/* KityMinder Core - Simplified Implementation */
/* A lightweight mindmap renderer for CMind preview */

(function(global) {
    'use strict';
    
    // Simple SVG-based mindmap renderer
    var KityMinder = {
        version: '1.0.0-simplified',
        
        // Main Minder class
        Minder: function(options) {
            this.options = options || {};
            this.root = null;
            this.theme = 'default';
            this.template = 'default';
            this.zoomLevel = 1;
            this.panX = 0;
            this.panY = 0;
            this.container = null;
            this.svg = null;
            this.data = null;
            
            // Initialize the minder
            this.init();
        }
    };
    
    // Theme configurations
    var themes = {
        'default': {
            background: '#ffffff',
            rootColor: '#4285f4',
            nodeColor: '#34a853',
            textColor: '#333333',
            lineColor: '#cccccc'
        },
        'fresh-blue': {
            background: '#f8f9fa',
            rootColor: '#1976d2',
            nodeColor: '#42a5f5',
            textColor: '#1565c0',
            lineColor: '#90caf9'
        },
        'fresh-green': {
            background: '#f1f8e9',
            rootColor: '#388e3c',
            nodeColor: '#66bb6a',
            textColor: '#2e7d32',
            lineColor: '#a5d6a7'
        },
        'fresh-red': {
            background: '#ffebee',
            rootColor: '#d32f2f',
            nodeColor: '#ef5350',
            textColor: '#c62828',
            lineColor: '#ffcdd2'
        },
        'fresh-pink': {
            background: '#fce4ec',
            rootColor: '#c2185b',
            nodeColor: '#ec407a',
            textColor: '#ad1457',
            lineColor: '#f8bbd9'
        },
        'fresh-purple': {
            background: '#f3e5f5',
            rootColor: '#7b1fa2',
            nodeColor: '#ab47bc',
            textColor: '#6a1b9a',
            lineColor: '#ce93d8'
        }
    };
    
    // Minder prototype methods
    KityMinder.Minder.prototype = {
        init: function() {
            if (this.options.renderTo) {
                this.container = typeof this.options.renderTo === 'string' 
                    ? document.getElementById(this.options.renderTo)
                    : this.options.renderTo;
                
                if (this.container) {
                    this.createSVG();
                }
            }
        },
        
        createSVG: function() {
            // Clear container
            this.container.innerHTML = '';
            
            // Create SVG element
            this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            this.svg.setAttribute('width', '100%');
            this.svg.setAttribute('height', '100%');
            this.svg.style.display = 'block';
            this.svg.style.background = themes[this.theme].background;
            
            // Create main group for transformations
            this.mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            this.svg.appendChild(this.mainGroup);
            
            this.container.appendChild(this.svg);
        },
        
        importData: function(data, format) {
            this.data = data;
            if (format === 'json' && data && data.root) {
                this.render(data.root);
            }
        },
        
        render: function(rootNode) {
            if (!this.mainGroup) return;
            
            // Clear previous content
            this.mainGroup.innerHTML = '';
            
            // Get container dimensions
            var rect = this.container.getBoundingClientRect();
            var centerX = rect.width / 2;
            var centerY = rect.height / 2;
            
            // Render the mindmap
            this.renderNode(rootNode, centerX, centerY, 0, 0);
            
            // Apply current zoom and pan
            this.updateTransform();
        },
        
        renderNode: function(node, x, y, level, angle) {
            var theme = themes[this.theme];
            var nodeData = node.data || {};
            var text = nodeData.text || 'Node';
            var children = node.children || [];
            
            // Calculate node size based on text
            var fontSize = level === 0 ? 18 : 14;
            var padding = level === 0 ? 20 : 12;
            var textWidth = text.length * fontSize * 0.6;
            var nodeWidth = Math.max(textWidth + padding * 2, 80);
            var nodeHeight = fontSize + padding;
            
            // Create node group
            var nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            
            // Create node rectangle
            var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', x - nodeWidth / 2);
            rect.setAttribute('y', y - nodeHeight / 2);
            rect.setAttribute('width', nodeWidth);
            rect.setAttribute('height', nodeHeight);
            rect.setAttribute('rx', 8);
            rect.setAttribute('fill', level === 0 ? theme.rootColor : theme.nodeColor);
            rect.setAttribute('stroke', theme.lineColor);
            rect.setAttribute('stroke-width', 2);
            
            // Create text element
            var textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
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
            this.mainGroup.appendChild(nodeGroup);
            
            // Render children
            if (children.length > 0) {
                var angleStep = children.length > 1 ? (Math.PI * 2) / children.length : 0;
                var radius = level === 0 ? 150 : 100;
                
                for (var i = 0; i < children.length; i++) {
                    var childAngle = level === 0 ? 
                        (i * angleStep - Math.PI / 2) : 
                        (angle + (i - children.length / 2) * 0.5);
                    
                    var childX = x + Math.cos(childAngle) * radius;
                    var childY = y + Math.sin(childAngle) * radius;
                    
                    // Draw connection line
                    var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    line.setAttribute('x1', x);
                    line.setAttribute('y1', y);
                    line.setAttribute('x2', childX);
                    line.setAttribute('y2', childY);
                    line.setAttribute('stroke', theme.lineColor);
                    line.setAttribute('stroke-width', 2);
                    this.mainGroup.appendChild(line);
                    
                    // Render child node
                    this.renderNode(children[i], childX, childY, level + 1, childAngle);
                }
            }
        },
        
        useTheme: function(themeName) {
            if (themes[themeName]) {
                this.theme = themeName;
                if (this.svg) {
                    this.svg.style.background = themes[themeName].background;
                }
                if (this.data) {
                    this.render(this.data.root);
                }
            }
        },
        
        zoom: function(level) {
            if (typeof level === 'number') {
                this.zoomLevel = Math.max(0.1, Math.min(5, level));
                this.updateTransform();
                return this.zoomLevel;
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
            if (this.mainGroup) {
                var transform = 'translate(' + this.panX + ',' + this.panY + ') scale(' + this.zoomLevel + ')';
                this.mainGroup.setAttribute('transform', transform);
            }
        },
        
        fitView: function() {
            // Reset zoom and pan to fit content
            this.zoomLevel = 1;
            this.panX = 0;
            this.panY = 0;
            this.updateTransform();
        }
    };
    
    // Export to global scope
    global.kityminder = KityMinder;
    
    // Also support direct access
    global.KityMinder = KityMinder;
    
})(typeof window !== 'undefined' ? window : this);
        
        importData: function(data, format) {
            format = format || 'json';
            
            if (format === 'json') {
                this.root = data;
                this.render();
                return this;
            }
            
            throw new Error('Unsupported format: ' + format);
        },
        
        exportData: function(format) {
            format = format || 'json';
            
            if (format === 'json') {
                return this.root;
            }
            
            throw new Error('Unsupported format: ' + format);
        },
        
        render: function() {
            if (!this.svg || !this.root) return;
            
            // Clear existing content
            this.svg.innerHTML = '';
            
            // Apply theme class
            this.svg.className.baseVal = 'km-receiver km-theme-' + this.theme;
            
            // Render the mind map
            this.renderNode(this.root, 0, 0, 0);
            
            // Auto-fit to view
            this.fitView();
        },
        
        renderNode: function(node, x, y, level) {
            if (!node) return;
            
            var nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            nodeGroup.setAttribute('class', 'km-node');
            nodeGroup.setAttribute('transform', 'translate(' + x + ',' + y + ')');
            
            // Create node rectangle
            var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            
            // Set text content
            text.textContent = node.data ? node.data.text : 'Node';
            text.setAttribute('x', 0);
            text.setAttribute('y', 0);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'central');
            
            // Calculate text dimensions (approximate)
            var textWidth = (text.textContent.length * 8) + 20;
            var textHeight = 30;
            
            // Set rectangle dimensions
            rect.setAttribute('x', -textWidth/2);
            rect.setAttribute('y', -textHeight/2);
            rect.setAttribute('width', textWidth);
            rect.setAttribute('height', textHeight);
            rect.setAttribute('rx', 5);
            
            nodeGroup.appendChild(rect);
            nodeGroup.appendChild(text);
            this.svg.appendChild(nodeGroup);
            
            // Render children
            if (node.children && node.children.length > 0) {
                var childY = y;
                var childSpacing = 60;
                var startY = y - ((node.children.length - 1) * childSpacing / 2);
                
                for (var i = 0; i < node.children.length; i++) {
                    var childX = x + 150;
                    childY = startY + (i * childSpacing);
                    
                    // Draw connection line
                    var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    line.setAttribute('class', 'km-connect');
                    line.setAttribute('x1', x + textWidth/2);
                    line.setAttribute('y1', y);
                    line.setAttribute('x2', childX - 75);
                    line.setAttribute('y2', childY);
                    this.svg.appendChild(line);
                    
                    // Render child node
                    this.renderNode(node.children[i], childX, childY, level + 1);
                }
            }
        },
        
        useTheme: function(theme) {
            this.theme = theme;
            if (this.svg) {
                this.svg.className.baseVal = 'km-receiver km-theme-' + this.theme;
            }
            return this;
        },
        
        useTemplate: function(template) {
            this.template = template;
            return this;
        },
        
        zoom: function(scale) {
            if (arguments.length === 0) {
                return this.zoom;
            }
            
            this.zoom = Math.max(0.1, Math.min(5, scale));
            this.updateTransform();
            return this;
        },
        
        pan: function(x, y) {
            if (arguments.length === 0) {
                return this.pan;
            }
            
            this.pan.x = x;
            this.pan.y = y;
            this.updateTransform();
            return this;
        },
        
        updateTransform: function() {
            if (this.svg) {
                var transform = 'translate(' + this.pan.x + ',' + this.pan.y + ') scale(' + this.zoom + ')';
                var g = this.svg.querySelector('g.km-transform') || this.createTransformGroup();
                g.setAttribute('transform', transform);
            }
        },
        
        createTransformGroup: function() {
            var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('class', 'km-transform');
            
            // Move existing content to transform group
            while (this.svg.firstChild) {
                g.appendChild(this.svg.firstChild);
            }
            
            this.svg.appendChild(g);
            return g;
        },
        
        fitView: function() {
            if (!this.svg) return;
            
            // Simple auto-fit implementation
            var bbox = this.svg.getBBox ? this.svg.getBBox() : { x: -200, y: -100, width: 400, height: 200 };
            var containerRect = this.container.getBoundingClientRect();
            
            var scaleX = containerRect.width / (bbox.width + 100);
            var scaleY = containerRect.height / (bbox.height + 100);
            var scale = Math.min(scaleX, scaleY, 1);
            
            var centerX = containerRect.width / 2 - (bbox.x + bbox.width / 2) * scale;
            var centerY = containerRect.height / 2 - (bbox.y + bbox.height / 2) * scale;
            
            this.zoom = scale;
            this.pan = { x: centerX, y: centerY };
            this.updateTransform();
        },
        
        // Event handling
        on: function(event, handler) {
            // Placeholder event handling
            return this;
        },
        
        off: function(event, handler) {
            // Placeholder event handling
            return this;
        },
        
        fire: function(event, data) {
            // Placeholder event handling
            return this;
        }
    };
    
    // Export to global scope
    global.kityminder = KityMinder;
    global.KityMinder = KityMinder;
    
})(typeof window !== 'undefined' ? window : this);