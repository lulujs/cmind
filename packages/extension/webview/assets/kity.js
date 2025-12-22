/* Kity - Simplified SVG Graphics Library */
/* Minimal implementation for KityMinder support */

(function(global) {
    'use strict';
    
    // Simple Kity implementation
    var Kity = {
        version: '2.0.0-simplified',
        
        // Basic SVG utilities
        createSVGElement: function(tagName) {
            return document.createElementNS('http://www.w3.org/2000/svg', tagName);
        },
        
        // Basic SVG creation utilities
        createSVG: function(tag, attributes) {
            var element = document.createElementNS('http://www.w3.org/2000/svg', tag);
            if (attributes) {
                for (var attr in attributes) {
                    element.setAttribute(attr, attributes[attr]);
                }
            }
            return element;
        },
        
        // Color utilities
        Color: {
            parse: function(color) {
                return color;
            },
            
            rgb: function(r, g, b) {
                return 'rgb(' + r + ',' + g + ',' + b + ')';
            },
            
            rgba: function(r, g, b, a) {
                return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
            }
        },
        
        // Basic geometry
        Point: function(x, y) {
            this.x = x || 0;
            this.y = y || 0;
        },
        
        Rect: function(x, y, width, height) {
            this.x = x || 0;
            this.y = y || 0;
            this.width = width || 0;
            this.height = height || 0;
        },
        
        // Event system
        EventHandler: {
            on: function(event, handler) {
                // Simplified event handling
                if (!this._events) this._events = {};
                if (!this._events[event]) this._events[event] = [];
                this._events[event].push(handler);
            },
            
            off: function(event, handler) {
                if (!this._events || !this._events[event]) return;
                var index = this._events[event].indexOf(handler);
                if (index > -1) {
                    this._events[event].splice(index, 1);
                }
            },
            
            fire: function(event, data) {
                if (!this._events || !this._events[event]) return;
                this._events[event].forEach(function(handler) {
                    handler(data);
                });
            }
        },
        
        // Utility functions
        Utils: {
            extend: function(target, source) {
                for (var key in source) {
                    if (source.hasOwnProperty(key)) {
                        target[key] = source[key];
                    }
                }
                return target;
            },
            
            each: function(obj, callback) {
                if (Array.isArray(obj)) {
                    for (var i = 0; i < obj.length; i++) {
                        callback(obj[i], i);
                    }
                } else {
                    for (var key in obj) {
                        if (obj.hasOwnProperty(key)) {
                            callback(obj[key], key);
                        }
                    }
                }
            }
        }
    };
    
    // Export to global scope
    global.kity = Kity;
    global.Kity = Kity;
    
})(typeof window !== 'undefined' ? window : this);