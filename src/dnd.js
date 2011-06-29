var utils = require("../lib/uki-core/utils");
var env = require("../lib/uki-core/env");
var dom = require("../lib/uki-core/dom");
var evt = require("../lib/uki-core/event");
var gesture = require("../lib/uki-core/gesture");

var retriggering = false;
var dnd = {};

// common properties
uki.extend(gesture, {
  dragDelta: 5,
  initNativeDnD: function() {
    // moz needs the drag image to be appended to document
    // so create an offscreen container to hold drag images.
    // note that it can't have overflow:hidden, since drag image will be cutted to container
    var container = dom.createElement('div', 'position: absolute;left:-999em;');
    doc.body.appendChild(container);
    dnd.dragImageContainer = container;
    dnd.initNativeDnD = fun.FT;
    return true;
  },
  dragImageContainer: null,
  dataTransfer: null,
  target: null,
  dragOver: null
});


function viewToDom (view) {
  if (uki.isFunction(view.dom)) {
    if (view.parent()) { return element.dom(); }
    var container = uki.createElement('div', 'width:1px;height:1px;position:absolute;left:-999em;top:0');
    doc.body.appendChild(container);
    element.attachTo(container);
    return container;
  }
  return element;
}

var dataTransferProps = ['dropEffect', 'effectAllowed', 'types', 'files'];

var DataTransferWrapper = fun.newClass({
  init: function(dataTransfer) {
    this.dataTransfer = dataTransfer;
    for (var i = dataTransferProps.length - 1; i >= 0; i--){
      this[ dataTransferProps[i] ] = dataTransfer[ dataTransferProps[i] ];
    };
  },

  setData: function(format, data) {
    return this.dataTransfer.setData(format, data);
  },

  clearData: function(format) {
    return this.dataTransfer.clearData(format);
  },

  getData: function(format) {
    return this.dataTransfer.getData(format);
  },

  setDragImage: function(image, x, y) {
    dnd.initNativeDnD();
    image = viewToDom(image);
    var clone = image.cloneNode(true),
    style = clone.style;
    style.left = style.right = style.top = style.bottom = '';
    style.position = 'static';
    dnd.dragImageContainer.appendChild(clone);
    setTimeout(function() {
      dnd.dragImageContainer.removeChild(clone);
    }, 1);
    return this.dataTransfer.setDragImage(clone, x, y);
  }
});

// w3c spec based dataTransfer implementation
uki.dom.DataTransfer = uki.newClass(new function() {
    this.init = function() {
        uki.extend(this, {
            dropEffect: 'none',
            effectAllowed: 'none',
            types: [],
            files: [],
            dragImage: new Image(),
            imagePosition: new Point(),
            data: {}
        });
    };

    this.setData = function(format, data) {
        this.data[format] = data;
        if (uki.inArray(format, this.types) == -1) this.types.push(format);
    };

    this.clearData = function(format) {
        if (format) {
            delete this.data[format];
            this.types = uki.grep(this.types, function(x) { return x != format; });
        } else {
            this.data = {};
            this.types = [];
        }
    };

    this.getData = function(format) {
        return this.data[format];
    };

    this.setDragImage = function(image, x, y) {
        this._dragImage = this._initDragImage(image);
        this._imagePosition = new Point(x || 0, y || 0);
    };

    this.update = function(e) {
        if (!this._dragImage) return;
        this._dragImage.style.left = e.pageX - this._imagePosition.x + 'px';
        this._dragImage.style.top = e.pageY -  this._imagePosition.y + 'px';
    };

    this.cleanup = function() {
        this._dragImage && this._dragImage.parentNode.removeChild(this._dragImage);
        this._dragImage = undefined;
    };

    this._initDragImage = function(image) {
        image = viewToDom(image);
        var clone = image.cloneNode(true),
            style = clone.style;

        style.left = style.right = style.top = style.bottom = '';
        style.position = 'absolute';
        style.left = '-999em';
        style.zIndex = '9999';
        doc.body.appendChild(clone);
        return clone;
    };
});


var bindW3CDrag = {
    setup: function() {
        if (this.__w3cdragbound) {
            this.__w3cdragbound++;
        } else {
            this.__w3cdragbound = 1;
    		uki.dom.bind( this, 'draggesture', drag );
        }
    },
    teardown: function() {
        this.__w3cdragbound--;
        if (!this.__draggesturebound) uki.dom.unbind( this, 'draggesture', drag );
    }
};

uki.extend(uki.dom.special, {
    dragstart: {
        setup: function() {
            this.addEventListener('dragstart', nativeDragWrapper, false);
        },
        teardown: function() {
            this.removeEventListener('dragstart', nativeDragWrapper, false);
        }
    }
})


function nativeDragWrapper (e) {
    e = new uki.dom.Event(e);
    var dataTransfer = e.dataTransfer;
    e.dataTransfer = new uki.dom.DataTransferWrapper(dataTransfer);
    uki.dom.handler.apply(this, arguments);
    dataTransfer.effectAllowed = e.dataTransfer.effectAllowed;
    dataTransfer.dropEffect = e.dataTransfer.dropEffect;
}

function startW3Cdrag (element) {
    uki.dom.bind( element, 'draggestureend', dragend );
}

function stopW3Cdrag (element) {
    if (!dnd.dataTransfer) return;
    dnd.dataTransfer.cleanup();
    dnd.dragOver = dnd.dataTransfer = dnd.target = null;
    uki.dom.unbind( element, 'draggestureend', dragend );
}

function dragenter (e) {
    if (!dnd.dataTransfer || e.domEvent.__dragEntered || !retriggering) return;
    e = new uki.dom.Event(e);
    e.domEvent.__dragEntered = true;
    if (dnd.dragOver == this) return;
    dnd.dragOver = this;
    e.type = 'dragenter';
    uki.dom.handler.apply(this, arguments);
}

function drag (e) {
    if (retriggering) {
        if (!e.domEvent.__dragEntered && dnd.dragOver) {
            e = new uki.dom.Event(e);
            e.type = 'dragleave';
            uki.dom.handler.apply(dnd.dragOver, arguments);
            dnd.dragOver = null;
        }
        return;
    };

    if (dnd.dataTransfer) { // dragging
        e.type = 'drag';
        e.target = dnd.target;
    } else if (e.dragOffset.x > dnd.dragDelta || e.dragOffset.y > dnd.dragDelta) { // start drag
        var target = e.target,
            parent = this.parentNode;
        try {
            while (target && target != parent && !target.getAttribute('draggable')) target = target.parentNode;
        } catch (ex) { target = null; }
        if (target && target.getAttribute('draggable')) {
            dnd.target = e.target = target;
            e.type = 'dragstart';
            dnd.dataTransfer = e.dataTransfer = new uki.dom.DataTransfer(e.domEvent.dataTransfer);
            startW3Cdrag(this);
        } else {
            return;
        }
    } else {
        return;
    }
    e = new uki.dom.Event(e);
    uki.dom.handler.apply(this, arguments);
    if (e.isDefaultPrevented()) {
        stopW3Cdrag(this);
    } else {
        retriggerMouseEvent(e);
    }

}

var props = 'detail screenX screenY clientX clientY ctrlKey altKey shiftKey metaKey button'.split(' ');

function retriggerMouseEvent (e) {
    var imageStyle = dnd.dataTransfer._dragImage.style,
        type = e.domEvent.type, target;
    e.stopPropagation();
    e.preventDefault();
    imageStyle.left = '-999em';
    target = doc.elementFromPoint(e.pageX, e.pageY);
    dnd.dataTransfer.update(e);

    try {
        var newEvent;
        retriggering = true;
        try {
            if (doc.createEventObject) {
                newEvent = doc.createEventObject();
            	for ( var i = props.length, prop; i; ){
            		prop = uki.dom.props[ --i ];
            		newEvent[ prop ] = e.domEvent[ prop ];
            	}
                target.fireEvent('on' + type, newEvent)
            } else {
                newEvent = doc.createEvent('MouseEvents');
                newEvent.initMouseEvent(
                    type,
                    true,
                    true,
                    doc.defaultView,
                    e.detail,
                    e.screenX,
                    e.screenY,
                    e.clientX,
                    e.clientY,
                    e.ctrlKey,
                    e.altKey,
                    e.shiftKey,
                    e.metaKey,
                    e.button,
                    null
                );
                target.dispatchEvent(newEvent)
            }
        } catch (e) {}
        retriggering = false;
    } catch (e) {}
}

function dragend (e) {
    if (retriggering) return;
    if (dnd.dataTransfer) { // drag started
        e.type = 'dragend';
        e.target = dnd.target;
        e.dataTransfer = dnd.dataTransfer;
        uki.dom.handler.apply(this, arguments);
        retriggerMouseEvent(e);
        stopW3Cdrag(this);
    }
}
