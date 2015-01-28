'use strict';

var EventEmitter = require('eventman');
var inherits = require('inherits');
var amgui = require('../amgui');

function KeyLine (opt) {

    EventEmitter.call(this);

    this._keys = [];
    this._height = amgui.LINE_HEIGHT;
    this._hidden = false;

    this.keyLooks = {
        line: {
            color: '#eee'
        },
        circle: {}
    };

    this._onDblClick = this._onDblClick.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);

    this._render = amgui.delayWithRAF(this._render, this);
    
    this._createDomElem();

    amgui.callOnAdded(this.domElem, this._render.bind(this));

    am.timeline.on(['changeTimescale', 'changeTape'], this._render, this);

    var dropdownBinding = amgui.bindDropdown({
        deTarget: this._canvas,
        asContextMenu: true,
        onOpening: function (e) {

            var key = this.getKeyUnderPos(e.x),
                dropdown = key && key.getDropdown();

            if (dropdown) {

                dropdownBinding.setDropdown(dropdown);
            }
            else {
                return false;
            }
        }.bind(this),
    });
}

inherits(KeyLine, EventEmitter);
var p = KeyLine.prototype;
module.exports = KeyLine;








Object.defineProperties(p, {

    keyCount: {

        get: function () {

            return this._keys.length;
        }
    },
    hidden: {
        set: function (v) {

            v = !!v;

            if (v === this._hidden) return;

            this._hidden = v;

            this.domElem.style.display = v ? 'none' : '';
        },
        get: function () {

            return this._hidden;
        }
    }
});







p.addKey = function (key) {
    
    this._keys.push(key);
    key.parentKeyLine = this;

    key.on('change', this._onChangeKey, this);
    key.on('select', this._onChangeKey, this);
    key.on('deselect', this._onChangeKey, this);
    key.on('needsRemove', this._onKeyNeedsRemove, this);
    key.on('needsRender', this._render, this);
    
    this._render();
    this.emit('change');
};

p.removeKey = function (key) {

    var idx = this._keys.indexOf(key);

    if (idx === -1) {
        return false;
    }

    this._keys.splice(idx, 1);
    key.parentKeyLine = undefined;
    
    key.off('change', this._onChangeKey, this);
    key.off('select', this._onChangeKey, this);
    key.off('deselect', this._onChangeKey, this);
    key.off('needsRemove', this._onKeyNeedsRemove, this);
    key.off('needsRender', this._render, this);

    key.dispose();

    this._render();
    this.emit('change');

    return true;
};

p.forEachKeys = function (fn, thisArg) {

    this._keys.forEach(fn, thisArg);
};

p.getKeyByTime = function (time) {

    return this._keys.find(key => key.time === time);
};

p.getPrevKey = function (time) {

    var retKey;
    
    this._keys.forEach(function(key) {

        if (key.time < time && (!retKey || retKey.time < key.time)) {

            retKey = key;
        }
    });

    return retKey;
};

p.getNextKey = function (time) {

    var retKey;
    
    this._keys.forEach(function(key) {

        if (key.time > time && (!retKey || retKey.time > key.time)) {

            retKey = key;
        }
    });

    return retKey;
};

p.getClosestKey = function (time) {

    var retKey, retDist;
    
    this._keys.forEach(function(key) {

        var dist = Math.abs(time - key.time);

        if (!retKey || retDist > dist) {

            retDist = dist;
            retKey = key;
        }
    });

    return retKey;
};

p.getKeyUnderPos = function (x) {

    var time = am.timeline.screenXToTime(x),
        key = this.getClosestKey(time);

    if (key && (Math.abs(time - key.time) * am.timeline.timescale) < 4) {

        return key;
    }
};

p.getKeyTimes = function () {

    return _.pluck(this._keys, 'time');
};









p._render = function () {

    if (this._skipRender || this.hidden) return;

    var canvas = this._canvas,
        ctx = this._ctx;

    canvas.width = am.timeline.width;
    canvas.height = this._height;

    _.sortBy(this._keys, 'time').forEach(key => key.renderToLine(ctx));
};








p._onChangeKey = function (key) {

    this._render();
    this.emit('change');
};

p._onKeyNeedsRemove = function (key) {

    this.removeKey(key);
};

p._onDblClick = function (e) {

    var time = am.timeline.screenXToTime(e.screenX),
        key = this.getNextKey(time);

    if (key) {
        am.timeline.inlineEaseEditor.show({key});
    }
};

p._onMouseDown = function (e) {

    var key = this.getKeyUnderPos(e.screenX);

    if (key) {
        key.grab(e);
    }
};












p._createDomElem = function createKeyline(opt) {

    this.domElem = document.createElement('div');
    this.domElem.style.width = '100%';
    this.domElem.style.position = 'relative';
    this.domElem.setAttribute('debug-keyline', 1);
    this.domElem.style.overflow = 'hidden';


    //TODO remove _deLine if it's doesn't needed;
    this._deLine = document.createElement('div');
    this._deLine.style.position = 'relative';
    this._deLine.style.width = '100%';
    this._deLine.style.height = this._height + 'px';
    this.domElem.appendChild(this._deLine);
    amgui.createSeparator({parent: this._deLine});

    this._canvas = document.createElement('canvas');
    this._canvas.style.position = 'absolute';
    this._deLine.appendChild(this._canvas);
    this._ctx = this._canvas.getContext('2d');
    
    this._canvas.addEventListener('dblclick', this._onDblClick);
    this._canvas.addEventListener('mousedown', this._onMouseDown);
};

p.dispose = function () {
    //TODO
};