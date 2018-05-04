"use strict";

var $ = require("../core/renderer"),
    windowUtils = require("../core/utils/window"),
    window = windowUtils.getWindow(),
    domAdapter = require("../core/dom_adapter"),
    eventsEngine = require("../events/core/events_engine"),
    registerComponent = require("../core/component_registrator"),
    stringUtils = require("../core/utils/string"),
    extend = require("../core/utils/extend").extend,
    translator = require("../animation/translator"),
    positionUtils = require("../animation/position"),
    noop = require("../core/utils/common").noop,
    typeUtils = require("../core/utils/type"),
    mathUtils = require("../core/utils/math"),
    eventUtils = require("../events/utils"),
    Popup = require("./popup");

var POPOVER_CLASS = "dx-popover",
    POPOVER_WRAPPER_CLASS = "dx-popover-wrapper",
    POPOVER_ARROW_CLASS = "dx-popover-arrow",
    POPOVER_WITHOUT_TITLE_CLASS = "dx-popover-without-title",

    POSITION_FLIP_MAP = {
        "left": "right",
        "top": "bottom",
        "right": "left",
        "bottom": "top",
        "center": "center"
    },

    WEIGHT_OF_SIDES = {
        "left": -1,
        "top": -1,
        "center": 0,
        "right": 1,
        "bottom": 1
    },

    POSITION_ALIASES = {
        // NOTE: public API
        "top": { my: "bottom center", at: "top center", collision: "fit flip" },
        "bottom": { my: "top center", at: "bottom center", collision: "fit flip" },
        "right": { my: "left center", at: "right center", collision: "flip fit" },
        "left": { my: "right center", at: "left center", collision: "flip fit" }
    },

    SIDE_BORDER_WIDTH_STYLES = {
        "left": "borderLeftWidth",
        "top": "borderTopWidth",
        "right": "borderRightWidth",
        "bottom": "borderBottomWidth"
    },

    getEventName = function(that, optionName) {
        var optionValue = that.option(optionName);

        return getEventNameByOption(optionValue);
    },
    getEventNameByOption = function(optionValue) {
        return typeUtils.isObject(optionValue) ? optionValue.name : optionValue;
    },
    getEventDelay = function(that, optionName) {
        var optionValue = that.option(optionName);

        return typeUtils.isObject(optionValue) && optionValue.delay;
    },
    attachEvent = function(that, name) {
        var delay,
            action,
            handler,
            eventName,
            target = that.option("target"),
            event = getEventName(that, name + "Event");

        if(!event || that.option("disabled")) {
            return;
        }

        eventName = eventUtils.addNamespace(event, that.NAME);
        action = that._createAction((function() {
            delay = getEventDelay(that, name + "Event");
            this._clearEventTimeout(name === "hide");
            if(delay) {
                this._timeouts[name] = setTimeout(function() {
                    that[name]();
                }, delay);
            } else {
                that[name]();
            }
        }).bind(that), { validatingTargetName: "target" });

        handler = function(e) {
            action({ event: e, target: $(e.currentTarget) });
        };

        if(target.jquery || target.nodeType || typeUtils.isWindow(target)) {
            that["_" + name + "EventHandler"] = undefined;
            eventsEngine.on(target, eventName, handler);
        } else {
            that["_" + name + "EventHandler"] = handler;
            eventsEngine.on(domAdapter.getDocument(), eventName, target, handler);
        }
    },
    detachEvent = function(that, target, name, event) {
        var eventName = event || getEventName(that, name + "Event");

        if(!eventName) {
            return;
        }

        eventName = eventUtils.addNamespace(eventName, that.NAME);

        if(that["_" + name + "EventHandler"]) {
            eventsEngine.off(domAdapter.getDocument(), eventName, target, that["_" + name + "EventHandler"]);
        } else {
            eventsEngine.off($(target), eventName);
        }
    };

/**
 * @name dxPopover
 * @publicName dxPopover
 * @inherits dxPopup
 * @module ui/popover
 * @export default
 */

var Popover = Popup.inherit({
    _getDefaultOptions: function() {
        return extend(this.callBase(), {
            /**
            * @name dxPopoverOptions.target
            * @publicName target
            * @type string|Node|jQuery
            */
            target: window,

            /**
            * @name dxPopoverOptions.shading
            * @type boolean
            * @publicName shading
            * @default false
            * @inheritdoc
            */
            shading: false,

            /**
            * @name dxPopoverOptions.position
            * @publicName position
            * @type Enums.Position|positionConfig
            * @default 'bottom'
            */
            position: 'bottom',

            /**
            * @name dxPopoverOptions.closeOnOutsideClick
            * @publicName closeOnOutsideClick
            * @default true
            * @inheritdoc
            */
            closeOnOutsideClick: true,

            /**
            * @name dxPopoverOptions.animation
            * @publicName animation
            * @type object
            * @default { show: { type: "fade", from: 0, to: 1 }, hide: { type: "fade", to: 0 } }
            */
            animation: {
                /**
                * @name dxPopoverOptions.animation.show
                * @publicName show
                * @type animationConfig
                * @default { type: "fade", from: 0, to: 1 }
                */
                show: {
                    type: "fade",
                    from: 0,
                    to: 1
                },
                /**
                * @name dxPopoverOptions.animation.hide
                * @publicName hide
                * @type animationConfig
                * @default { type: "fade", to: 0 }
                */
                hide: {
                    type: "fade",
                    to: 0
                }
            },

            /**
            * @name dxPopoverOptions.showtitle
            * @publicName showTitle
            * @type boolean
            * @default false
            */
            showTitle: false,

            /**
             * @name dxPopoverOptions.width
             * @publicName width
             * @type number|string|function
             * @default "auto"
             * @type_function_return number|string
             */
            width: "auto",

            /**
             * @name dxPopoverOptions.height
             * @publicName height
             * @type number|string|function
             * @default "auto"
             * @type_function_return number|string
             */
            height: "auto",

            /**
             * @name dxPopoverOptions.dragEnabled
             * @publicName dragEnabled
             * @hidden
             * @inheritdoc
             */
            dragEnabled: false,

            /**
            * @name dxPopoverOptions.resizeEnabled
            * @publicName resizeEnabled
            * @hidden
            * @inheritdoc
            */
            resizeEnabled: false,

            /**
            * @name dxPopoverOptions.onResizeStart
            * @publicName onResizeStart
            * @extends Action
            * @action
            * @hidden
            * @inheritdoc
            */

            /**
            * @name dxPopoverOptions.onResize
            * @publicName onResize
            * @extends Action
            * @action
            * @hidden
            * @inheritdoc
            */

            /**
            * @name dxPopoverOptions.onResizeEnd
            * @publicName onResizeEnd
            * @extends Action
            * @action
            * @hidden
            * @inheritdoc
            */

            /**
            * @name dxPopoverOptions.fullScreen
            * @publicName fullScreen
            * @hidden
            * @inheritdoc
            */

            /**
            * @name dxPopoverOptions.showEvent
            * @publicName showEvent
            * @type Object|string
            * @default undefined
            */
            /**
            * @name dxPopoverOptions.showEvent.name
            * @publicName name
            * @type string
            * @default undefined
            */
            /**
            * @name dxPopoverOptions.showEvent.delay
            * @publicName delay
            * @type number
            * @default undefined
            */

            /**
            * @name dxPopoverOptions.hideEvent
            * @publicName hideEvent
            * @type Object|string
            * @default undefined
            */
            /**
            * @name dxPopoverOptions.hideEvent.name
            * @publicName name
            * @type string
            * @default undefined
            */
            /**
            * @name dxPopoverOptions.hideEvent.delay
            * @publicName delay
            * @type number
            * @default undefined
            */

            fullScreen: false,
            closeOnTargetScroll: true,
            arrowPosition: "",
            arrowOffset: 0,
            boundaryOffset: { h: 10, v: 10 }

            /**
            * @name dxPopoverOptions.focusStateEnabled
            * @publicName focusStateEnabled
            * @hidden
            * @inheritdoc
            */

            /**
            * @name dxPopoverOptions.accessKey
            * @publicName accessKey
            * @hidden
            * @inheritdoc
            */

            /**
            * @name dxPopoverOptions.tabIndex
            * @publicName tabIndex
            * @hidden
            * @inheritdoc
            */
        });
    },

    _defaultOptionsRules: function() {
        return [
            {
                device: { platform: "ios" },
                options: {
                    arrowPosition: {
                        boundaryOffset: { h: 20, v: -10 },
                        collision: "fit"
                    }
                }
            }, {
                device: function() {
                    return !windowUtils.hasWindow();
                },
                options: {
                    animation: null
                }
            }
        ];
    },

    _init: function() {
        this.callBase();

        this._renderArrow();
        this._timeouts = {};

        this.$element().addClass(POPOVER_CLASS);
        this._wrapper().addClass(POPOVER_WRAPPER_CLASS);
    },

    _render: function() {
        this.callBase.apply(this, arguments);
        this._detachEvents(this.option("target"));
        this._attachEvents();
    },

    _detachEvents: function(target) {
        detachEvent(this, target, "show");
        detachEvent(this, target, "hide");
    },

    _attachEvents: function() {
        attachEvent(this, "show");
        attachEvent(this, "hide");
    },

    _renderArrow: function() {
        this._$arrow = $("<div>")
            .addClass(POPOVER_ARROW_CLASS)
            .prependTo(this.overlayContent());
    },

    _documentDownHandler: function(e) {
        if(this._isOutsideClick(e)) {
            return this.callBase(e);
        }
        return true;
    },

    _isOutsideClick: function(e) {
        return !$(e.target).closest(this.option("target")).length;
    },

    _animate: function(animation) {
        if(animation && animation.to && typeof animation.to === "object") {
            extend(animation.to, {
                position: this._getContainerPosition()
            });
        }

        this.callBase.apply(this, arguments);
    },

    _stopAnimation: function() {
        this.callBase.apply(this, arguments);
    },

    _renderTitle: function() {
        this._wrapper().toggleClass(POPOVER_WITHOUT_TITLE_CLASS, !this.option("showTitle"));
        this.callBase();
    },

    _renderPosition: function() {
        this.callBase();
        this._renderOverlayPosition();
    },

    _renderOverlayBoundaryOffset: noop,

    _renderOverlayPosition: function() {
        this._resetOverlayPosition();
        this._updateContentSize();

        var contentPosition = this._getContainerPosition();
        var resultLocation = positionUtils.setup(this._$content, contentPosition);

        var positionSide = this._getSideByLocation(resultLocation);

        this._togglePositionClass("dx-position-" + positionSide);
        this._toggleFlippedClass(resultLocation.h.flip, resultLocation.v.flip);

        this._renderArrowPosition(positionSide);
    },

    _resetOverlayPosition: function() {
        this._setContentHeight(true);
        this._togglePositionClass("dx-position-" + this._positionSide);

        translator.move(this._$content, { left: 0, top: 0 });

        this._$arrow.css({
            top: 'auto', right: 'auto', bottom: 'auto', left: 'auto'
        });
    },

    _updateContentSize: function() {
        if(!this._$popupContent) {
            return;
        }

        var containerLocation = positionUtils.calculate(this._$content, this._getContainerPosition());

        if((containerLocation.h.oversize > 0) && this._isHorizontalSide() && !containerLocation.h.fit) {
            var newContainerWidth = this._$content.width() - containerLocation.h.oversize;

            this._$content.width(newContainerWidth);
        }

        if((containerLocation.v.oversize > 0) && this._isVerticalSide() && !containerLocation.v.fit) {
            var newOverlayContentHeight = this._$content.height() - containerLocation.v.oversize,
                newPopupContentHeight = this._$popupContent.height() - containerLocation.v.oversize;

            this._$content.height(newOverlayContentHeight);
            this._$popupContent.height(newPopupContentHeight);
        }
    },

    _getContainerPosition: function() {
        var offset = stringUtils.pairToObject(this._position.offset || "");
        var hOffset = offset.h;
        var vOffset = offset.v;

        var isPopoverInside = this._isPopoverInside();
        var sign = (isPopoverInside ? -1 : 1) * WEIGHT_OF_SIDES[this._positionSide];
        var arrowSizeCorrection = this._getContentBorderWidth(this._positionSide);
        if(this._isVerticalSide()) {
            vOffset += sign * (this._$arrow.height() - arrowSizeCorrection);
        } else if(this._isHorizontalSide()) {
            hOffset += sign * (this._$arrow.width() - arrowSizeCorrection);
        }

        return extend({}, this._position, { offset: hOffset + " " + vOffset });
    },

    _getContentBorderWidth: function(side) {
        var borderWidth = this._$content.css(SIDE_BORDER_WIDTH_STYLES[side]);
        return parseInt(borderWidth) || 0;
    },

    _getSideByLocation: function(location) {
        var isFlippedByVertical = location.v.flip;
        var isFlippedByHorizontal = location.h.flip;

        return (this._isVerticalSide() && isFlippedByVertical || this._isHorizontalSide() && isFlippedByHorizontal || this._isPopoverInside())
            ? POSITION_FLIP_MAP[this._positionSide]
            : this._positionSide;
    },

    _togglePositionClass: function(positionClass) {
        this._$wrapper
            .removeClass("dx-position-left dx-position-right dx-position-top dx-position-bottom")
            .addClass(positionClass);
    },

    _toggleFlippedClass: function(isFlippedHorizontal, isFlippedVertical) {
        this._$wrapper
            .toggleClass("dx-popover-flipped-horizontal", isFlippedHorizontal)
            .toggleClass("dx-popover-flipped-vertical", isFlippedVertical);
    },

    _renderArrowPosition: function(side) {
        this._$arrow.css(POSITION_FLIP_MAP[side], -(this._isVerticalSide(side) ? this._$arrow.height() : this._$arrow.width()));

        var axis = this._isVerticalSide(side) ? "left" : "top";
        var sizeProperty = this._isVerticalSide(side) ? "outerWidth" : "outerHeight";
        var $target = $(this._position.of);

        var targetOffset = positionUtils.offset($target) || { top: 0, left: 0 };
        var contentOffset = positionUtils.offset(this._$content);

        var arrowSize = this._$arrow[sizeProperty]();
        var contentLocation = contentOffset[axis];
        var contentSize = this._$content[sizeProperty]();
        var targetLocation = targetOffset[axis];
        var targetSize = $target.get(0).preventDefault ? 0 : $target[sizeProperty]();

        var min = Math.max(contentLocation, targetLocation);
        var max = Math.min(contentLocation + contentSize, targetLocation + targetSize);
        var arrowLocation;
        if(this.option("arrowPosition") === "start") {
            arrowLocation = min - contentLocation;
        } else if(this.option("arrowPosition") === "end") {
            arrowLocation = max - contentLocation - arrowSize;
        } else {
            arrowLocation = (min + max) / 2 - contentLocation - arrowSize / 2;
        }

        var borderWidth = this._getContentBorderWidth(side);
        var finalArrowLocation = mathUtils.fitIntoRange(arrowLocation - borderWidth + this.option("arrowOffset"), borderWidth, contentSize - arrowSize - borderWidth * 2);
        this._$arrow.css(axis, finalArrowLocation);
    },

    _isPopoverInside: function() {
        var position = this._transformStringPosition(this.option("position"), POSITION_ALIASES);

        var my = positionUtils.setup.normalizeAlign(position.my);
        var at = positionUtils.setup.normalizeAlign(position.at);

        return my.h === at.h && my.v === at.v;
    },

    _setContentHeight: function(fullUpdate) {
        if(fullUpdate) {
            this.callBase();
        }
    },

    _renderShadingPosition: function() {
        if(this.option("shading")) {
            this._$wrapper.css({ top: 0, left: 0 });
        }
    },

    _renderShadingDimensions: function() {
        if(this.option("shading")) {
            this._$wrapper.css({
                width: "100%",
                height: "100%"
            });
        }
    },

    _normalizePosition: function() {
        var position = extend({}, this._transformStringPosition(this.option("position"), POSITION_ALIASES));

        if(!position.of) {
            position.of = this.option("target");
        }

        if(!position.collision) {
            position.collision = "flip";
        }

        if(!position.boundaryOffset) {
            position.boundaryOffset = this.option("boundaryOffset");
        }

        this._positionSide = this._getDisplaySide(position);

        this._position = position;
    },

    _getDisplaySide: function(position) {
        var my = positionUtils.setup.normalizeAlign(position.my),
            at = positionUtils.setup.normalizeAlign(position.at);

        var weightSign = WEIGHT_OF_SIDES[my.h] === WEIGHT_OF_SIDES[at.h] && WEIGHT_OF_SIDES[my.v] === WEIGHT_OF_SIDES[at.v] ? -1 : 1,
            horizontalWeight = Math.abs(WEIGHT_OF_SIDES[my.h] - weightSign * WEIGHT_OF_SIDES[at.h]),
            verticalWeight = Math.abs(WEIGHT_OF_SIDES[my.v] - weightSign * WEIGHT_OF_SIDES[at.v]);

        return horizontalWeight > verticalWeight ? at.h : at.v;
    },

    _isVerticalSide: function(side) {
        side = side || this._positionSide;
        return side === "top" || side === "bottom";
    },

    _isHorizontalSide: function(side) {
        side = side || this._positionSide;
        return side === "left" || side === "right";
    },

    _clearEventTimeout: function(visibility) {
        clearTimeout(this._timeouts[visibility ? "show" : "hide"]);
    },

    _clean: function() {
        this._detachEvents(this.option("target"));
        this.callBase.apply(this, arguments);
    },

    _optionChanged: function(args) {
        switch(args.name) {
            case "showTitle":
            case "title":
            case "titleTemplate":
                this.callBase(args);
                this._renderGeometry();
                break;
            case "boundaryOffset":
            case "arrowPosition":
            case "arrowOffset":
                this._renderGeometry();
                break;
            case "fullScreen":
                if(args.value) {
                    this.option("fullScreen", false);
                }
                break;
            case "target":
                args.previousValue && this._detachEvents(args.previousValue);
                this.callBase(args);
                break;
            case "showEvent":
            case "hideEvent":
                var name = args.name.substring(0, 4),
                    event = getEventNameByOption(args.previousValue);

                this.hide();
                detachEvent(this, this.option("target"), name, event);
                attachEvent(this, name);
                break;
            case "visible":
                this._clearEventTimeout(args.value);
                this.callBase(args);
                break;
            default:
                this.callBase(args);
        }
    },

    /**
    * @name dxPopoverMethods.show
    * @publicName show(target)
    * @param1 target:string|Node|jQuery
    * @return Promise<void>
    */
    show: function(target) {
        if(target) {
            this.option("target", target);
        }

        return this.callBase();
    }

    /**
    * @name dxPopoverMethods.registerKeyHandler
    * @publicName registerKeyHandler(key, handler)
    * @hidden
    * @inheritdoc
    */

    /**
    * @name dxPopoverMethods.focus
    * @publicName focus()
    * @hidden
    * @inheritdoc
    */

});

registerComponent("dxPopover", Popover);

module.exports = Popover;
