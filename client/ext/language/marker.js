/**
 * Cloud9 Language Foundation
 *
 * @copyright 2011, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
define(function(require, exports, module) {

var Range = require("ace/range").Range;
var Anchor = require('ace/anchor').Anchor;

module.exports = {
    disabledMarkerTypes: {},
    
    hook: function(language, worker) {
        var _self = this;
        worker.on("markers", function(event) {
            _self.addMarkers(event, language.editor);
        });
    },
    
    removeMarkers: function(session) {
        var markers = session.getMarkers(false);
        for (var id in markers) {
            // All language analysis' markers are prefixed with language_highlight
            if (markers[id].clazz.indexOf('language_highlight_') === 0) {
                session.removeMarker(id);
            }
        }
        for (var i = 0; i < session.markerAnchors.length; i++) {
            session.markerAnchors[i].detach();
        }
        session.markerAnchors = [];
    },
    
    addMarkers: function(event, editor) {
        var _self = this;
        var annos = event.data;
        var mySession = editor.session;
        if (!mySession.markerAnchors) mySession.markerAnchors = [];
        this.removeMarkers(editor.session);
        mySession.languageAnnos = [];
        annos.forEach(function(anno) {
            // Certain annotations can temporarily be disabled
            if (_self.disabledMarkerTypes[anno.type])
                return;
            // Using anchors here, to automaticaly move markers as text around the marker is updated
            var anchor = new Anchor(mySession.getDocument(), anno.pos.sl, anno.pos.sc || 0);
            mySession.markerAnchors.push(anchor);
            var markerId;
            var colDiff = anno.pos.ec - anno.pos.sc;
            var rowDiff = anno.pos.el - anno.pos.sl;
            var gutterAnno = {
                guttertext: anno.message,
                type: anno.type === 'error' ? 'error' : 'warning',
                text: anno.message
                // row will be filled in updateFloat()
            };

            function updateFloat(single) {
                if (markerId)
                    mySession.removeMarker(markerId);
                gutterAnno.row = anchor.row;
                if (anno.pos.sc !== undefined && anno.pos.ec !== undefined) {
                    var range = Range.fromPoints(anchor.getPosition(), {
                        row: anchor.row + rowDiff,
                        column: anchor.column + colDiff
                    });
                    markerId = mySession.addMarker(range, "language_highlight_" + (anno.type ? anno.type : "default"));
                }
                if (single) mySession.setAnnotations(mySession.languageAnnos);
            }
            updateFloat();
            anchor.on("change", function() {
                updateFloat(true);
            });
            if (anno.message) mySession.languageAnnos.push(gutterAnno);
        });
        mySession.setAnnotations(mySession.languageAnnos);
    },
    
    /**
     * Temporarily disable certain types of markers (e.g. when refactoring)
     */
    disableMarkerType: function(type) {
        this.disabledMarkerTypes[type] = true;
        var session = ceEditor.$editor.session;
        var markers = session.getMarkers(false);
        for (var id in markers) {
            // All language analysis' markers are prefixed with language_highlight
            if (markers[id].clazz === 'language_highlight_' + type)
                session.removeMarker(id);
        }
    },
    
    enableMarkerType: function(type) {
        this.disabledMarkerTypes[type] = false;
    },
    
    /**
     * Called when text in editor is updated
     * This attempts to predict how the worker is going to adapt markers based on the given edit
     * it does so instanteously, rather than with a 500ms delay, thereby avoid ugly box bouncing etc.
     */
    onChange: function(session, event) {
        var range = event.data.range;
        var isInserting = event.data.action.substring(0, 6) !== "remove";
        var text = event.data.text;
        var adaptingId = text && text.search(/[^a-zA-Z0-9\$_]/) === -1;
        if (!isInserting) { // Removing some text
            var markers = session.getMarkers(false);
            // Run through markers
            var foundOne = false;
            for (var id in markers) {
                var marker = markers[id];
                if (marker.clazz.indexOf('language_highlight_') === 0) {
                    if (range.contains(marker.range.start.row, marker.range.start.column)) {
                        session.removeMarker(id);
                        foundOne = true;
                    }
                    else if (adaptingId && marker.range.contains(range.start.row, range.start.column)) {
                        foundOne = true;
                        var deltaLength = text.length;
                        marker.range.end.column -= deltaLength;
                    }
                }
            }
            if (!foundOne) {
                // Didn't find any markers, therefore there will not be any anchors or annotations either
                return;
            }
            // Run through anchors
            for (var i = 0; i < session.markerAnchors.length; i++) {
                var anchor = session.markerAnchors[i];
                if (range.contains(anchor.row, anchor.column)) {
                    anchor.detach();
                }
            }
            // Run through annotations
            for (var i = 0; i < session.languageAnnos.length; i++) {
                var anno = session.languageAnnos[i];
                if (range.contains(anno.row, 1)) {
                    session.languageAnnos.splice(i, 1);
                    i--;
                }
            }
            session.setAnnotations(session.languageAnnos);
        }
        else { // Inserting some text
            var markers = session.getMarkers(false);
            // Only if inserting an identifier
            if (!adaptingId) return;
            // Run through markers
            var foundOne = false;
            for (var id in markers) {
                var marker = markers[id];
                if (marker.clazz.indexOf('language_highlight_') === 0) {
                    if (marker.range.contains(range.start.row, range.start.column)) {
                        foundOne = true;
                        var deltaLength = text.length;
                        marker.range.end.column += deltaLength;
                    }
                }
            }
        }
        if (foundOne)
            session._dispatchEvent("changeBackMarker");
    }
};

// Monkeypatching ACE's JS mode to disable worker
// this will be handled by C9's worker
var JavaScriptMode = require('ace/mode/javascript').Mode;

JavaScriptMode.prototype.createWorker = function() {
    return null;
};

});