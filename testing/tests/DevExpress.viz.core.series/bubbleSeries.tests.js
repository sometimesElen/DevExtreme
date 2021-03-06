"use strict";

var $ = require("jquery"),
    vizMocks = require("../../helpers/vizMocks.js"),
    pointModule = require("viz/series/points/base_point"),
    Series = require("viz/series/base_series").Series;

/* global insertMockFactory, MockAxis */
require("../../helpers/chartMocks.js");


require("viz/chart");

var createSeries = function(options, renderSettings) {
    renderSettings = renderSettings || {};
    var renderer = renderSettings.renderer = renderSettings.renderer || new vizMocks.Renderer();

    options = $.extend(true, {
        widgetType: "chart",
        containerBackgroundColor: "containerColor",
        visible: true,
        label: {
            visible: true,
            border: {},
            connector: {},
            font: {}
        },
        border: {
            visible: true
        },
        point: {
            hoverStyle: {},
            selectionStyle: {}
        },
        valueErrorBar: {},
        hoverStyle: { hatching: "h-hatching" },
        selectionStyle: { hatching: "s-hatching" },
        hoverMode: "excludePoints",
        selectionMode: "excludePoints"
    }, options);

    renderSettings = $.extend({
        labelsGroup: renderer.g(),
        seriesGroup: renderer.g(),
    }, renderSettings);

    renderer.stub("g").reset();
    return new Series(renderSettings, options);
};

var createPoint = function() {
    var stub = sinon.createStubInstance(pointModule.Point);
    stub.argument = 1;
    stub.hasValue.returns(true);
    stub.isInVisibleArea.returns(true);

    stub._options = {};//see T243839
    return stub;
};

var mockPoints = [createPoint(), createPoint(), createPoint(), createPoint(), createPoint(), createPoint(), createPoint(), createPoint(), createPoint(), createPoint()];

var environment = {
    beforeEach: function() {
        insertMockFactory();
        var mockPointIndex = 0;
        this.renderer = new vizMocks.Renderer();
        this.seriesGroup = this.renderer.g();
        this.data = [{ arg: 1, val: 10, size: 1 }, { arg: 2, val: 20, size: 1 }, { arg: 3, val: 30, size: 1 }, { arg: 4, val: 40, size: 1 }];

        this.createPoint = sinon.stub(pointModule, "Point", function() {
            var stub = mockPoints[mockPointIndex++];
            stub.argument = 1;
            stub.hasValue.returns(true);
            stub.isInVisibleArea.returns(true);
            stub.draw.reset();
            stub.animate.reset();
            return stub;
        });
    },
    afterEach: function() {
        this.createPoint.restore();
    }
};

var checkTwoGroups = function(assert, series) {
    var parentGroup = series._group,
        renderer = series._renderer,
        labelsGroup = series._extGroups.labelsGroup;
    assert.ok(parentGroup, "series created without group");

    assert.equal(renderer.stub("g").callCount, 3);
    assert.equal(renderer.stub("g").getCall(0).returnValue.stub("attr").firstCall.args[0]["class"], "dxc-series");
    assert.equal(renderer.stub("g").getCall(1).returnValue.stub("attr").firstCall.args[0]["class"], "dxc-markers");
    assert.equal(renderer.stub("g").getCall(2).returnValue.stub("attr").firstCall.args[0]["class"], "dxc-labels");

    assert.equal(series._markersGroup.stub("append").lastCall.args[0], parentGroup);
    assert.equal(series._labelsGroup.stub("append").lastCall.args[0], labelsGroup);
};

QUnit.module("Creation", environment);

QUnit.test("Creation bubble point", function(assert) {
    var series = createSeries({ type: "bubble", sizeField: "size", label: { visible: false } }),
        data = [{ arg: 1, val: 3, size: 5 }],
        points;
    series.updateData(data);

    points = series.getPoints();
    assert.ok(points, "Points should be created");
    assert.equal(points.length, 1, "Series should have one point");

    assert.equal(this.createPoint.firstCall.args[0], series, "Series should be correct");
    assert.equal(this.createPoint.firstCall.args[1].argument, 1, "Argument should be correct");
    assert.equal(this.createPoint.firstCall.args[1].value, 3, "Value should be correct");
    assert.equal(this.createPoint.firstCall.args[1].size, 5, "Size should be correct");
});

QUnit.test("Creation with errorBars", function(assert) {
    var series = createSeries({ type: "bubble", sizeField: "size", errorBars: { lowErrorValueField: "lowErrorField", highErrorValueField: "highErrorField" } }),
        data = [{ arg: 1, val: 3, size: 5, lowErrorField: 0, highErrorField: 4 }],
        points;

    series.updateData(data);

    points = series.getPoints();
    assert.ok(points, "Points should be created");
    assert.equal(points.length, 1, "Series should have one point");
    assert.equal(this.createPoint.firstCall.args[0], series, "Series should be correct");
    assert.equal(this.createPoint.firstCall.args[1].argument, 1, "Argument should be correct");
    assert.equal(this.createPoint.firstCall.args[1].value, 3, "Value should be correct");
    assert.equal(this.createPoint.firstCall.args[1].size, 5, "Size should be correct");
    assert.strictEqual(this.createPoint.firstCall.args[1].lowError, undefined, "lowError not passed");
    assert.strictEqual(this.createPoint.firstCall.args[1].highError, undefined, "highError not passed");
});

QUnit.module("Bubble series. Draw", {
    beforeEach: environment.beforeEach,
    afterEach: environment.afterEach,
    createSeries: function(options) {
        return createSeries(options, {
            renderer: this.renderer,
            argumentAxis: new MockAxis({ renderer: this.renderer }),
            valueAxis: new MockAxis({ renderer: this.renderer })
        });
    }
});

var checkGroups = checkTwoGroups,
    seriesType = "bubble";

QUnit.test("Update template field", function(assert) {
    var series = createSeries({
        type: seriesType,
        name: "bubbleSeries",
        valueField: "valueField",
        sizeField: "sizeField",
        tagField: "tagField",
        point: { visible: false },
        label: { visible: false }

    }, { renderer: this.renderer });
    //act
    series.updateTemplateFieldNames();
    //assert
    assert.equal(series._options.valueField, "valueFieldbubbleSeries");
    assert.equal(series._options.sizeField, "sizeFieldbubbleSeries");
    assert.equal(series._options.tagField, "tagFieldbubbleSeries");
});

QUnit.test("Update template field. Default values", function(assert) {
    var series = createSeries({
        type: seriesType,
        name: "bubbleSeries",
        point: { visible: false },
        label: { visible: false }

    }, { renderer: this.renderer });
    //act
    series.updateTemplateFieldNames();
    //assert
    assert.equal(series._options.valueField, "valbubbleSeries");
    assert.equal(series._options.sizeField, "sizebubbleSeries");
    assert.equal(series._options.tagField, "tagbubbleSeries");
});

QUnit.test("Draw without data", function(assert) {
    var series = this.createSeries({
        type: seriesType,
        point: { visible: false }

    });
    //act
    series.draw(false);
    //assert

    checkGroups(assert, series);

});

QUnit.test("Draw simple data without animation", function(assert) {
    var series = this.createSeries({
        type: seriesType,
        point: { visible: false }

    });
    series.updateData(this.data);
    $.each(series._points, function(i, pt) {
        pt.x = pt.argument;
        pt.y = pt.value;
    });
    //act
    series.draw(false);
    //assert
    checkGroups(assert, series);

    $.each(series._points, function(i, p) {
        assert.equal(p.animate.callCount, 0, i + " point draw without animate");
    });
});

QUnit.test("Draw simple data with animation", function(assert) {
    var series = this.createSeries({
            type: seriesType,
            point: { visible: false }
        }),
        complete;
    series.updateData(this.data);
    $.each(series._points, function(i, pt) {
        pt.x = pt.argument;
        pt.y = pt.value;
    });
    //act
    series.draw(true);
    //assert
    checkGroups(assert, series);

    assert.equal(series._labelsGroup._stored_settings.opacity, 0.001);
    $.each(series._points, function(i, p) {
        assert.equal(p.animate.callCount, 1, i + " point draw with animate");
        assert.equal(p.animate.firstCall.args.length, 2, "call with params");
        if(i !== series._points.length - 1) {
            assert.equal(p.animate.firstCall.args[0], undefined);
        } else {
            complete = p.animate.firstCall.args[0];
            assert.ok(complete, "complete function");
        }
        assert.deepEqual(p.animate.firstCall.args[1], { r: undefined, translateX: 1, translateY: undefined });
    });
    complete();
    assert.equal(series._labelsGroup.stub("animate").lastCall.args[0].opacity, 1);
    assert.deepEqual(series._labelsGroup.stub("animate").lastCall.args[1], { duration: 400 });
});

QUnit.module("Bubble. Points animation", {
    beforeEach: function() {
        environment.beforeEach.call(this);

        this.series = createSeries({
            type: seriesType,
            point: { visible: true }
        }, {
            renderer: this.renderer,
            argumentAxis: new MockAxis({ renderer: this.renderer }),
            valueAxis: new MockAxis({ renderer: this.renderer })
        });
        this.series.updateData(this.data);
    },
    afterEach: environment.afterEach
});

QUnit.test("Draw without animation", function(assert) {
    var series = this.series;
    //act
    series.draw(false);
    //assert
    $.each(series._points, function(i, p) {
        assert.ok(p.draw.calledOnce);
        assert.equal(p.draw.firstCall.args[0], series._renderer, "renderer pass to point " + i);
        assert.equal(p.draw.firstCall.args[1].markers, series._markersGroup, "markers group pass to point " + i);
        assert.equal(p.draw.firstCall.args[2], false, "animation should be disabled " + i);
    });
});

QUnit.test("Draw with animation", function(assert) {
    var series = this.series;
    //act
    series.draw(true);
    //assert
    $.each(series._points, function(i, p) {
        assert.ok(p.draw.calledOnce);
        assert.equal(p.draw.firstCall.args[0], series._renderer, "renderer pass to point " + i);
        assert.equal(p.draw.firstCall.args[1].markers, series._markersGroup, "markers group pass to point " + i);
        assert.equal(p.draw.firstCall.args[2], true, "animation should be enabled " + i);
    });
});

QUnit.test("Draw aggregated points with animation", function(assert) {
    var series = createSeries({
            type: seriesType,
            useAggregation: true
        }, {

            argumentAxis: new MockAxis({ renderer: this.renderer }),
            valueAxis: new MockAxis({ renderer: this.renderer })
        }),
        aggregatedPoints = [this.createPoint(), this.createPoint()];
    series.updateData(this.data);
    series.resamplePoints = function() {
        this._points = aggregatedPoints;
        this._lastPointIndex = this._points.length;
    };
    //act
    series.resamplePoints();
    //act
    series.draw(true);
    series.drawTrackers();
    //assert
    assert.ok(series._originalPoints.length);
    $.each(series._originalPoints, function(i, p) {
        assert.ok(!p.draw.callCount);
        assert.ok(!p.animate.callCount);
    });

    assert.ok(series._drawnPoints.length);
    $.each(series._drawnPoints, function(i, p) {
        assert.ok(p.draw.calledOnce);
        assert.ok(p.animate.calledOnce);
        assert.equal(p.draw.firstCall.args[0], series._renderer, "renderer pass to point " + i);
        assert.equal(p.draw.firstCall.args[1].markers, series._markersGroup, "markers group pass to point " + i);
        assert.equal(p.draw.firstCall.args[2], true, "animation should be enabled " + i);
    });
});

QUnit.module("Bubble. Point styles", {
    beforeEach: function() {
        environment.beforeEach.call(this);

        this.data = [{ arg: "arg1", val: "val1", tag: "tag1", size: "size1" }, { arg: "arg2", val: "val2", tag: "tag2", size: "size2" }];
        this.options = {
            type: seriesType,
            color: "n-color",
            size: "n-size",
            opacity: "n-opacity",
            border: {
                visible: true,
                color: "n-b-color",
                width: "n-b-width"
            },
            hoverStyle: {
                color: "h-color",
                size: "h-size",
                opacity: "h-opacity",
                border: {
                    visible: true,
                    color: "h-b-color",
                    width: "h-b-width"
                }
            },
            selectionStyle: {
                color: "s-color",
                size: "s-size",
                opacity: "s-opacity",
                border: {
                    visible: true,
                    color: "s-b-color",
                    width: "s-b-width"
                }
            }
        };
    },
    afterEach: environment.afterEach
});

QUnit.test("Style in point", function(assert) {
    var series = createSeries(this.options);
    series.updateData(this.data);

    assert.deepEqual(this.createPoint.firstCall.args[2].styles, {
        hover: {
            fill: "h-color",
            stroke: "h-b-color",
            opacity: "h-opacity",
            "stroke-width": "h-b-width",
            dashStyle: "solid",
            hatching: "h-hatching"
        },
        normal: {
            opacity: "n-opacity",
            r: undefined,
            "stroke-width": "n-b-width"
        },
        selection: {
            fill: "s-color",
            stroke: "s-b-color",
            opacity: "s-opacity",
            "stroke-width": "s-b-width",
            dashStyle: "solid",
            hatching: "s-hatching"
        }
    });
});

QUnit.test("Style in point group", function(assert) {
    var series = createSeries(this.options, {
        argumentAxis: new MockAxis({ renderer: this.renderer }),
        valueAxis: new MockAxis({ renderer: this.renderer })
    });
    series.updateData(this.data);
    series.draw(false);

    assert.deepEqual(series._markersGroup._stored_settings, {
        "class": "dxc-markers",
        fill: "n-color",
        stroke: "n-b-color",
        "stroke-width": "n-b-width",
        dashStyle: "solid"
    });
});

QUnit.test("All options defined", function(assert) {
    this.options.border.dashStyle = "n-b-dashStyle";
    this.options.hoverStyle.border.dashStyle = "h-b-dashStyle";
    this.options.selectionStyle.border.dashStyle = "s-b-dashStyle";
    var series = createSeries(this.options);
    series.updateData(this.data);

    assert.deepEqual((series._getPointOptions().styles), {
        hover: {
            fill: "h-color",
            stroke: "h-b-color",
            opacity: "h-opacity",
            "stroke-width": "h-b-width",
            dashStyle: "h-b-dashStyle",
            hatching: "h-hatching"
        },
        normal: {
            fill: "n-color",
            opacity: "n-opacity",
            stroke: "n-b-color",
            "stroke-width": "n-b-width",
            dashStyle: "n-b-dashStyle",
            hatching: undefined
        },
        selection: {
            fill: "s-color",
            stroke: "s-b-color",
            opacity: "s-opacity",
            "stroke-width": "s-b-width",
            dashStyle: "s-b-dashStyle",
            hatching: "s-hatching"
        }
    });
});

QUnit.module("Bubble. Customize point", {
    beforeEach: function() {
        environment.beforeEach.call(this);
        this.data = [{ arg: "arg1", val: "val1", tag: "tag1", size: "size1" }, { arg: "arg2", val: "val2", tag: "tag2", size: "size2" }];
    },
    afterEach: environment.afterEach
});

QUnit.test("customizePoint object", function(assert) {
    var spy = sinon.spy(),
        series = createSeries({
            type: seriesType,
            customizePoint: spy,
            name: "seriesName"
        });
    series.updateData(this.data);

    assert.ok(series);
    assert.equal(spy.callCount, 2);

    assert.deepEqual(spy.firstCall.args, [{ argument: "arg1", value: "val1", size: "size1", seriesName: "seriesName", tag: "tag1", index: 0, series: series }]);
    assert.deepEqual(spy.firstCall.thisValue, { argument: "arg1", value: "val1", size: "size1", seriesName: "seriesName", tag: "tag1", index: 0, series: series });

    assert.deepEqual(spy.secondCall.args, [{ argument: "arg2", value: "val2", seriesName: "seriesName", size: "size2", tag: "tag2", index: 1, series: series }]);
    assert.deepEqual(spy.secondCall.thisValue, { argument: "arg2", value: "val2", seriesName: "seriesName", size: "size2", tag: "tag2", index: 1, series: series });
});

QUnit.test("customize point color. all", function(assert) {
    var series = createSeries({
        type: seriesType,
        customizePoint: function() {
            return {
                color: "n-color",
                size: "n-size",
                opacity: "n-opacity",
                border: {
                    visible: true,
                    color: "n-b-color",
                    width: "n-b-width",
                    dashStyle: "n-b-dashStyle"
                },
                hoverStyle: {
                    color: "h-color",
                    size: "h-size",
                    opacity: "h-opacity",
                    border: {
                        visible: true,
                        color: "h-b-color",
                        width: "h-b-width",
                        dashStyle: "h-b-dashStyle"
                    }
                },
                selectionStyle: {
                    color: "s-color",
                    size: "s-size",
                    opacity: "s-opacity",
                    border: {
                        visible: true,
                        color: "s-b-color",
                        width: "s-b-width",
                        dashStyle: "s-b-dashStyle"
                    }
                }

            };
        }
    });
    series.updateData(this.data);

    assert.deepEqual(series.getAllPoints()[0].updateOptions.lastCall.args[0].styles, {
        usePointCustomOptions: true,
        useLabelCustomOptions: undefined,
        hover: {
            fill: "h-color",
            stroke: "h-b-color",
            "stroke-width": "h-b-width",
            opacity: "h-opacity",
            dashStyle: "h-b-dashStyle",
            hatching: "h-hatching"
        },
        normal: {
            fill: "n-color",
            opacity: "n-opacity",
            stroke: "n-b-color",
            "stroke-width": "n-b-width",
            dashStyle: "n-b-dashStyle",
            hatching: undefined
        },
        selection: {
            fill: "s-color",
            opacity: "s-opacity",
            stroke: "s-b-color",
            "stroke-width": "s-b-width",
            dashStyle: "s-b-dashStyle",
            hatching: "s-hatching"
        }
    });
});

QUnit.module("Bubble. API", {
    beforeEach: function() {
        environment.beforeEach.call(this);
        this.data = [{ arg: "arg1", val: "val1", tag: "tag1" }, { arg: "arg2", val: "val2", tag: "tag2" }];
    },
    afterEach: environment.afterEach
});

QUnit.test("getValueFields default", function(assert) {
    var series = createSeries({
        type: seriesType
    });

    assert.deepEqual(series.getValueFields(), ["val"]);
});

QUnit.test("getValueFields", function(assert) {
    var series = createSeries({
        type: seriesType,
        valueField: "customValueField",
        sizeField: "customSizeField"
    });

    assert.deepEqual(series.getValueFields(), ["customValueField"]);
});

QUnit.test("getSizeField default", function(assert) {
    var series = createSeries({
        type: seriesType
    });

    assert.strictEqual(series.getSizeField(), "size");
});

QUnit.test("getSizeField", function(assert) {
    var series = createSeries({
        type: seriesType,
        valueField: "customValueField",
        sizeField: "customSizeField"
    });

    assert.strictEqual(series.getSizeField(), "customSizeField");
});

QUnit.test("getArgumentField default", function(assert) {
    var series = createSeries({
        type: seriesType
    });

    assert.deepEqual(series.getArgumentField(), "arg");
});

QUnit.test("getArgumentField", function(assert) {
    var series = createSeries({
        type: seriesType,
        argumentField: "customArgumentField"
    });

    assert.deepEqual(series.getArgumentField(), "customArgumentField");
});

QUnit.test("areErrorBarsVisible", function(assert) {
    assert.ok(!createSeries({
        type: seriesType,
        valueErrorBar: {
            type: "fixed",
            displayMode: "all"
        }
    }).areErrorBarsVisible(), "fixed, displayMode all");

    assert.ok(!createSeries({
        type: seriesType,
        valueErrorBar: {
            type: "percent",
            displayMode: "all"
        }
    }).areErrorBarsVisible(), "percent, displayMode all");

    assert.ok(!createSeries({
        type: seriesType,
        valueErrorBar: {
            type: "stdError",
            displayMode: "all"
        }
    }).areErrorBarsVisible(), "stdError, displayMode all");

    assert.ok(!createSeries({
        type: seriesType,
        valueErrorBar: {
            type: "stdDeviation",
            displayMode: "all"
        }
    }).areErrorBarsVisible(), "stdDeviation, displayMode all");

    assert.ok(!createSeries({
        type: seriesType,
        valueErrorBar: {
            type: "Variance",
            displayMode: "all"
        }
    }).areErrorBarsVisible(), "Variance, displayMode all");

    assert.ok(!createSeries({
        type: seriesType,
        valueErrorBar: {
            type: "unknown",
            displayMode: "all"
        }
    }).areErrorBarsVisible(), "unknown, displayMode all");

    assert.ok(!createSeries({
        type: seriesType,
        valueErrorBar: {
            type: "unknown",
            lowValueField: "field",
            displayMode: "all"
        }
    }).areErrorBarsVisible(), "unknown, displayMode all, lowValueField defined");

    assert.ok(!createSeries({
        type: seriesType,
        valueErrorBar: {
            type: "unknown",
            highValueField: "field",
            displayMode: "all"
        }
    }).areErrorBarsVisible(), "unknown, displayMode all, highValueField defined");

    assert.ok(!createSeries({
        type: seriesType,
        valueErrorBar: {
            type: "fixed",
            displayMode: "none"
        }
    }).areErrorBarsVisible(), "fixed, displayMode none");

    assert.ok(!createSeries({
        type: seriesType,
        valueErrorBar: {
            type: "fixed",
            displayMode: "all"
        }
    }).updateDataType({ valueAxisType: "discrete" }).areErrorBarsVisible(), "fixed, displayMode all");

    assert.ok(!createSeries({
        type: seriesType,
        valueErrorBar: {
            type: "fixed",
            displayMode: "all"
        }
    }).updateDataType({ valueAxisType: "logarithmic" }).areErrorBarsVisible(), "fixed, displayMode all");

    assert.ok(!createSeries({
        type: seriesType,
        valueErrorBar: {
            type: "fixed",
            displayMode: "all"
        }
    }).updateDataType({ valueType: "datetime" }).areErrorBarsVisible(), "fixed, displayMode all");

});

QUnit.module("Null points", {
    beforeEach: function() {
        environment.beforeEach.call(this);
        this.options = {
            type: "bubble"
        };
    },
    afterEach: environment.afterEach
});

QUnit.test("Argument is undefined", function(assert) {
    var data = [{ arg: undefined, val: 1, size: 1 }],
        series = createSeries(this.options);

    series.updateData(data);

    assert.equal(series._points.length, 0);
});

QUnit.test("Argument is null", function(assert) {
    var data = [{ arg: null, val: 1, size: 1 }],
        series = createSeries(this.options);

    series.updateData(data);

    assert.equal(series._points.length, 0);
});

QUnit.test("Value is undefined", function(assert) {
    var data = [{ arg: 1, val: undefined, size: 1 }],
        series = createSeries(this.options);

    series.updateData(data);

    assert.equal(series._points.length, 0);
});

QUnit.test("Value is null", function(assert) {
    var data = [{ arg: 1, val: null, size: 1 }],
        series = createSeries(this.options);

    series.updateData(data);

    assert.equal(series._points.length, 1);
});

QUnit.test("size is undefined", function(assert) {
    var data = [{ arg: 1, val: 1, size: undefined }],
        series = createSeries(this.options);

    series.updateData(data);

    assert.equal(series._points.length, 0);
});

QUnit.test("size is null", function(assert) {
    var data = [{ arg: 1, val: 1, size: null }],
        series = createSeries(this.options);

    series.updateData(data);

    assert.equal(series._points.length, 0);
});

QUnit.module("Bubble. Update animation", {
    beforeEach: function() {
        environment.beforeEach.call(this);
        this.data = [{ arg: "arg1", val: "val1", size: "size1", tag: "tag1" }, { arg: "arg2", val: "val2", size: "size2", tag: "tag2" }];
    },
    afterEach: environment.afterEach,
    createSeries: function() {
        return createSeries({
            type: "bubble"
        }, {
            argumentAxis: new MockAxis({ renderer: this.renderer }),
            valueAxis: new MockAxis({ renderer: this.renderer })
        });
    }
});

QUnit.test("Update. Check label clearing", function(assert) {
    var series = this.createSeries(),
        newOptions = $.extend(true, {}, series.getOptions(), { type: "line" });

    series.updateData(this.data);
    series.draw(false);
    series.updateOptions(newOptions);

    var clearingSpy = sinon.spy(series, "_oldClearingAnimation"),
        labelSpy = sinon.spy(series._labelsGroup, "animate");
    series.draw(true);

    assert.ok(clearingSpy.calledOnce);

    assert.ok(labelSpy.calledOnce);
    assert.equal(labelSpy.lastCall.args.length, 3);
    assert.deepEqual(labelSpy.lastCall.args[0], { opacity: 0.001 });
    assert.deepEqual(labelSpy.lastCall.args[1], { duration: 400, partitionDuration: 0.5 });
    assert.ok(labelSpy.lastCall.args[2]);
});

QUnit.test("Update. Check point animating when old point count = new point count", function(assert) {
    var series = this.createSeries(),
        newOptions = $.extend(true, {}, series.getOptions(), { type: "line" });

    series.updateData(this.data);
    series.draw(false);
    series.updateOptions(newOptions);

    series.draw(true);
    series._labelsGroup.stub("animate").lastCall.args[2]();

    $.each(series._drawnPoints, function(i, point) {
        assert.equal(point.animate.callCount, 1);
        assert.deepEqual(point.animate.lastCall.args[1], { r: 0 });
        assert.equal(point.animate.lastCall.args[2], 0.5);
        if(i === series._drawnPoints.length - 1) {
            assert.ok(point.animate.lastCall.args[0]);
        } else {
            assert.strictEqual(point.animate.lastCall.args[0], undefined);
        }
    });
});

QUnit.test("Update. Check point animating when old point count < new point count", function(assert) {
    var series = this.createSeries(),
        newOptions = $.extend(true, {}, series.getOptions(), { type: "line" }),
        newData = [{ arg: "arg1", val: "val1", size: "size1", tag: "tag1" },
        { arg: "arg2", val: "val2", size: "size2", tag: "tag2" },
    { arg: "arg3", val: "val3", size: "size3", tag: "tag3" }];

    series.updateData(this.data);
    series.draw(false);
    series.updateOptions(newOptions);
    series.updateData(newData);

    series.draw(true);
    series._labelsGroup.stub("animate").lastCall.args[2]();

    $.each(series._drawnPoints, function(i, point) {
        assert.equal(point.animate.callCount, 1);
        assert.deepEqual(point.animate.lastCall.args[1], { r: 0 });
        assert.equal(point.animate.lastCall.args[2], 0.5);
        if(i === series._drawnPoints.length - 1) {
            assert.ok(point.animate.lastCall.args[0]);
        } else {
            assert.strictEqual(point.animate.lastCall.args[0], undefined);
        }
    });
});

QUnit.test("Update. Check point animating when old point count > new point count", function(assert) {
    var series = this.createSeries(),
        newOptions = $.extend(true, {}, series.getOptions(), { type: "line" }),
        newData = [{ arg: "arg1", val: "val1", size: "size1", tag: "tag1" }];

    series.updateData(this.data);
    series.draw(false);
    series.updateOptions(newOptions);
    series.updateData(newData);

    series.draw(true);
    series._labelsGroup.stub("animate").lastCall.args[2]();

    $.each(series._drawnPoints, function(i, point) {
        assert.equal(point.animate.callCount, 1);
        assert.deepEqual(point.animate.lastCall.args[1], { r: 0 });
        assert.equal(point.animate.lastCall.args[2], 0.5);
        if(i === series._drawnPoints.length - 1) {
            assert.ok(point.animate.lastCall.args[0]);
        } else {
            assert.strictEqual(point.animate.lastCall.args[0], undefined);
        }
    });
});

QUnit.test("Update. Check draw calling", function(assert) {
    var series = this.createSeries(),
        newOptions = $.extend(true, {}, series.getOptions(), { type: "line" });

    series.updateData(this.data);
    series.draw(false);
    series.updateOptions(newOptions);

    var drawSpy = sinon.spy(series, "_draw");
    series.draw(true);
    series._labelsGroup.stub("animate").lastCall.args[2]();
    series._points[series._points.length - 1].animate.lastCall.args[0]();

    assert.ok(drawSpy.calledOnce);
});

QUnit.module("Series visibility", environment);

QUnit.test("Hide visible series", function(assert) {
    var series = createSeries({
        type: "bubble",
        visible: true,
        visibilityChanged: sinon.spy(),
        point: { visible: true }
    });
    series.updateData([{ arg: 1, val: 10, size: 1 }, { arg: 2, val: 20, size: 1 }, { arg: 3, val: 30, size: 1 }, { arg: 4, val: 40, size: 1 }]);
    series.hide();

    var points = series.getPoints();
    //see T243839
    $.each(points, function(_, point) {
        assert.ok(point._options.visible === false);
    });
});

QUnit.test("Show invisible series", function(assert) {
    var series = createSeries({
        type: "bubble",
        visible: false,
        visibilityChanged: sinon.spy(),
        point: { visible: false }
    });
    series.updateData([{ arg: 1, val: 10, size: 1 }, { arg: 2, val: 20, size: 1 }, { arg: 3, val: 30, size: 1 }, { arg: 4, val: 40, size: 1 }]);

    series.show();

    var points = series.getPoints();
    //see T243839
    $.each(points, function(_, point) {
        assert.ok(point._options.visible === true);
    });
});
