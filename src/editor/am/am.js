'use strict';

var amTools = require('./am.tools');
var amMenu = require('./am.menu');
var baseWorkspace = require('./baseWorkspace');

var EventEmitter = require('eventman');
var amgui = require('../amgui');
var Windooman = require('../windooman');
var HistoryTab = require('../historyTab');
var Warehouseman = require('../warehouseman');
var shortcuts = require('../shortcuts');
var Chronicler = require('../chronicler');
var DomPicker = require('../dom-picker');
var i18n = require('../i18n');
var Tour = require('../tour');
var Mouse = require('../mouse');
var ProjectMap = require('../project/ProjectMap');
var dialogWIP = require('../commonDialogs/dialogWIP');
var dialogFeedback = require('../commonDialogs/dialogFeedback');
var mineSave = require('../mineSave');
var modules = {
    css: require('../modules/css'),
    // js: require('./modules/javascript'),
    domTree: require('../modules/am-domtree'),
};
var externalStylesheets = [
    // require('./assets/fontello/css/amgui.css'),
    require('../am.css'),
];

var isInited = false, handlerBuff = [];


var am = window.am = module.exports = _.extend(new EventEmitter(), window.am, {

    trackTypes: {},

    _staticToolbarIcons: [],

    selectedDomElem: undefined,
    selectedTrack: undefined,

    registerTrackType: function (Track, type) {

        this.trackTypes[type] = Track;
    }
});
am.setMaxListeners(1234);

am.throwHandler = function (handler) {

    handlerBuff.push(handler);
};

am.open = function (save) {

    am.report({evtName: 'open', 'value': 1});

    if (!window.chrome) {
        
        reject();
        return alertUnsupportedBrowsers();
    }

    var promiseBody = (fulfill, reject) => {
        
        am._init();

        if (save) {

            if (typeof(save) === 'object') {

                useSave(save);
            }
            else if (typeof(save) === 'string') {
                
                if (save.indexOf('{') === -1) {

                    fetch(save)
                        .then(response => response.text(), reject)
                        .then(response => useSave(response), reject);
                }
                else {
                    useSave(save);
                }
            }
        }
        else {
            am.openNewProject();
        }

        function useSave(save) {

            if (typeof(save) === 'string') {

                try {
                    save = JSON.parse(save);
                }
                catch (e) {
                    save = mineSave(save);
                }
            }

            if (!save || !save.project) {
                throw Error('Can\'t use this save');
            }

            am.projectMap.focus(save.project);
            fulfill();
        }
    };

    if (false) {
        console.warn('am.open is in debug mode!')
        promiseBody(); //debug
        return
    }

    var promise = new Promise(promiseBody)
        .then(() => {
            am.report({evtName: 'open', 'value': 1});
        })
        .catch(err => {
            console.log(err.stack);
        });

    return promise;
};

am._init = function () {

    if (isInited) return;

    am.deRoot = document.body;

    createAmRoot();
    am.dePickLayer = createAmLayer();
    am.deHandlerCont = createAmLayer();
    am.deGuiCont = createAmLayer();
    am.deDialogCont = createAmLayer();

    amgui.deOverlayCont = am.deDialogCont;
    
    am.i18n = i18n;

    am.workspace = new Windooman();
    am.deGuiCont.appendChild(am.workspace.domElem);
    am.workspace.loadWorkspace('base', baseWorkspace);
    am.workspace.load('base');

    am.projectMap = new ProjectMap();

    am.mouse = new Mouse();

    am.storage = new Warehouseman();

    am.tour = new Tour();

    am.history = new Chronicler();
    shortcuts.on('undo', () => am.history.undo());
    shortcuts.on('redo', () => am.history.redo());
    
    am.historyTab = new HistoryTab();
    am.workspace.fillTab('History', am.historyTab.domElem);

    am.domPicker = new DomPicker();
    am.deHandlerCont.appendChild(am.domPicker.domElem);
    am.domPicker.on('pick', de => am.selectDomElem(de));

    inspectHandlerCont(am.deHandlerCont);
    amMenu(am);
    addToggleGui();
    amTools(am);
    createStatusLabel();
    
    am.dialogs = {
        WIP: dialogWIP,
        feedback: dialogFeedback,
    };

    Object.keys(modules).forEach( moduleName => {

        console.log('init', moduleName, 'module...');

        modules[moduleName].init(am);
    });

    am.projectMap.on('focus.timeline', timeline => {

        timeline.toolbar.addIcon(am._staticToolbarIcons);

        am.currTimeline = timeline;
    });
};

am.openNewProject = function () {

    am.projectMap.focus({
        name: 'new project',
        timelines: [{}],
    });
}

am.selectTrack = function (track) {

    if (!track) throw Error;
    if (am.selectedTrack === track) return;

    am.selectedTrack = track;
    am.emit('selectTrack', am.selectedTrack);
};

am.deselectTrack = function () {

    if (!am.selectedTrack) return;

    am.selectedTrack = undefined;
    am.emit('deselectTrack');
};

am.selectDomElem = function (de) {

    if (!de) throw Error;
    if (am.selectedDomElem === de) return;

    am.selectedDomElem = de;
    am.emit('selectDomElem', am.selectedDomElem);
};

am.deselectDomElem = function () {

    if (!am.selectedDomElem) return;

    am.selectedDomElem = undefined;
    am.emit('deselectDomElem');
};

am.isPickableDomElem = function (deTest) {
    //TODO use .compareDocumentPosition()
    if (!deTest) {
        return false;
    }

    return step(deTest);

    function step(de) {

        if (!de) {
            return false;
        }
        else if (de.nodeType === 9) {
            return false;
        }
        else if (de.hasAttribute('data-am-pick')) {
            return true;
        }
        else if (de.hasAttribute('data-am-nopick')) {
            return false;
        }
        else if (de === document.body) {
            return de !== deTest;
        }
        else if (de) {
            return step(de.parentNode);
        }
    }
};

am.toPickingMode = function (opt) {

    am.deGuiCont.style.display = 'none';
    am.deDialogCont.style.display = 'none';

    am.domPicker.on('add', function (e) {

        e.demand(-1).then(() => {

            if (opt.onPick) opt.onPick(e.target);

            close();
        });
    });

    shortcuts.on('esc', close);

    function close() {

        if (opt.onClose) opt.onClose();

        shortcuts.off('esc', close);
    }
}

am.report = function (opt) {

    if (am.isExtension()) {

        chrome.runtime.sendMessage({
                subject: 'track',
                evtName: opt.evtName,
                value: opt.value, 
            }, 
            function(response) {
                console.log(response.farewell);
            }
        );
    }
};

am.isExtension = function () {

    return location.protocol === 'chrome-extension:';
};











function inspectHandlerCont(deCont) {

    var config = {childList: true},
        observer = new MutationObserver(function(mutations) {
        
        observer.disconnect();
        
        _(deCont.children)
            .toArray()
            .sortBy('renderLevel')
            .forEach(de => deCont.appendChild(de));
    
        observer.observe(deCont, config);
    });

    observer.observe(deCont, config);
}

function addToggleGui() {

    var isHidden = false;   

    am._staticToolbarIcons.push({
        tooltip: 'show/hide editor',
        icon: 'resize-small',
        separator: 'first',
        onClick: hide,
    });

    var btnFull = amgui.createIconBtn({
        size: 24,
        icon: 'resize-full',
        tooltip: 'show editor',
        onClick: show,
    });

    shortcuts.on('show/hidePanels', toggle);

    function toggle() {

        if (isHidden) {
            show();
        }
        else {
            hide();
        }
    }

    function hide() {

        if (isHidden) return;
        isHidden = true;

        am.deGuiCont.style.display = 'none';
        
        document.body.appendChild(btnFull);

        var zIndex = getMaxZIndex();
        if (zIndex) {
            btnFull.style.zIndex = zIndex + 1000;
        }
    }

    function show() {

        if (!isHidden) return;
        isHidden = false;
            
        am.deGuiCont.style.display = 'block';
        btnFull.parentElement.removeChild(btnFull);
    }

    btnFull.style.top = '0px';
    btnFull.style.left = '0px';
    btnFull.style.position = 'fixed';
}




function getMaxZIndex() {

    var zIndex = 0, els, x, xLen, el, val;

    els = document.querySelectorAll('*');
    for (x = 0, xLen = els.length; x < xLen; x += 1) {
      el = els[x];
      if (window.getComputedStyle(el).getPropertyValue('position') !== 'static') {
        val = window.getComputedStyle(el).getPropertyValue('z-index');
        if (val) {
          val = +val;
          if (val > zIndex) {
            zIndex = val;
          }
        }
      }
    }
    return zIndex;    
}





















function createAmRoot() {

    // $('body').css('opacity', 0)
        // .mouseenter(function () {$('body').css('opacity', 1)})
        // .mouseleave(function () {$('body').css('opacity', .23)});
    
    var de = document.createElement('div');
    de.style.position = 'fixed';
    de.style.left = '0px';
    de.style.top = '0px';
    de.style.width = '100%';
    de.style.height = '100%';
    de.style.pointerEvents = 'none';
    de.style.userSelect = 'none';
    de.style.webktUserSelect = 'none';
    de.style.fontFamily = amgui.FONT_FAMILY;
    de.style.color = amgui.color.text;

    de.setAttribute('data-am-nopick', '');

    var zIndex = getMaxZIndex();
    if (zIndex) {
        de.style.zIndex = zIndex + 1000;
    }

    document.body.appendChild(de);

    var sr = de.createShadowRoot();
        
    sr.appendChild(amgui.getStyleSheet());

    externalStylesheets.forEach(function (css) {

        var style = document.createElement('style');
        style.innerHTML = css;
        sr.appendChild(style);
        // document.head.appendChild(style);
    });

    am.rootElem = de;
    am.rootShadow = sr;
    // return de;
}

function createAmLayer() {

    var de = document.createElement('div');
    de.style.position = 'fixed';
    de.style.width = '100%';
    de.style.height = '100%';
    de.setAttribute('data-am-nopick', '');
    am.rootShadow.appendChild(de);
    return de;
}





function createStatusLabel() {

    var deTitle = amgui.createLabel({
        text: 'Animachine (alpha)',
        parent: am.deDialogCont,
        position: 'fixed',
        fontSize: '18px'
    });

    deTitle.style.pointerEvents = 'none';
    deTitle.style.width = '100%';
    deTitle.style.textAlign = 'center';
    deTitle.style.opacity = '0.23';
    deTitle.style.fontWeight = 'bold';
}

function alertUnsupportedBrowsers() {

    var deSorry = document.createElement('div');
    deSorry.textContent = 'Sorry, this demo is currently only supported by chrome. ';
    amgui.createIcon({icon: 'emo-unhappy', parent: deSorry, display: 'inline'});
    deSorry.style.display = 'fixed';
    deSorry.style.margin = 'auto';
    deSorry.style.fontFamily = amgui.FONT_FAMILY;
    deSorry.style.fontSize = '21px';
    deSorry.style.color = amgui.color.text;
    deSorry.style.background = amgui.color.overlay;
    deSorry.style.top = 0;
    deSorry.style.right = 0;
    deSorry.style.bottom = 0;
    deSorry.style.left = 0;
    document.body.innerHTML = '';
    document.body.appendChild(deSorry);
}