"use strict";

var $ = require("../../core/renderer"),
    eventsEngine = require("../../events/core/events_engine"),
    gridCore = require("../data_grid/ui.data_grid.core"),
    typeUtils = require("../../core/utils/type"),
    each = require("../../core/utils/iterator").each,
    extend = require("../../core/utils/extend").extend,
    support = require("../../core/utils/support"),
    clickEvent = require("../../events/click"),
    messageLocalization = require("../../localization/message"),
    eventUtils = require("../../events/utils"),
    holdEvent = require("../../events/hold"),
    Selection = require("../selection/selection"),
    Deferred = require("../../core/utils/deferred").Deferred;

var EDITOR_CELL_CLASS = "dx-editor-cell",
    ROW_CLASS = "dx-row",
    ROW_SELECTION_CLASS = "dx-selection",
    SELECT_CHECKBOX_CLASS = "dx-select-checkbox",
    CHECKBOXES_HIDDEN_CLASS = "dx-select-checkboxes-hidden",
    COMMAND_SELECT_CLASS = "dx-command-select",
    SELECTION_DISABLED_CLASS = "dx-selection-disabled",
    DATA_ROW_CLASS = "dx-data-row";

var SHOW_CHECKBOXES_MODE = "selection.showCheckBoxesMode",
    SELECTION_MODE = "selection.mode";

var processLongTap = function(that, dxEvent) {
    var selectionController = that.getController("selection"),
        rowsView = that.getView("rowsView"),
        $row = $(dxEvent.target).closest("." + DATA_ROW_CLASS),
        rowIndex = rowsView.getRowIndex($row);

    if(rowIndex < 0) return;

    if((that.option(SHOW_CHECKBOXES_MODE) === "onLongTap")) {
        if(selectionController.isSelectionWithCheckboxes()) {
            selectionController.stopSelectionWithCheckboxes();
        } else {
            selectionController.startSelectionWithCheckboxes();
        }
    } else {
        if(that.option(SHOW_CHECKBOXES_MODE) === "onClick") {
            selectionController.startSelectionWithCheckboxes();
        }
        if(that.option(SHOW_CHECKBOXES_MODE) !== "always") {
            selectionController.changeItemSelection(rowIndex, { control: true });
        }
    }
};

exports.SelectionController = gridCore.Controller.inherit((function() {
    var isSeveralRowsSelected = function(that, selectionFilter) {
        var keyIndex = 0,
            store = that._dataController.store(),
            key = store && store.key(),
            isComplexKey = Array.isArray(key);

        if(!selectionFilter.length) {
            return false;
        }

        if(isComplexKey && Array.isArray(selectionFilter[0]) && selectionFilter[1] === "and") {
            for(var i = 0; i < selectionFilter.length; i++) {
                if(Array.isArray(selectionFilter[i])) {
                    if(selectionFilter[i][0] !== key[keyIndex] || selectionFilter[i][1] !== "=") {
                        return true;
                    }
                    keyIndex++;
                }
            }
            return false;
        }

        return key !== selectionFilter[0];
    };

    var selectionCellTemplate = (container, options) => {
        var rowsView = options.component.getView("rowsView");

        rowsView.renderSelectCheckBoxContainer($(container), options);
    };

    var selectionHeaderTemplate = (container, options) => {
        var column = options.column,
            $cellElement = $(container).parent(),
            columnHeadersView = options.component.getView("columnHeadersView");

        $cellElement.addClass(EDITOR_CELL_CLASS);
        columnHeadersView._renderSelectAllCheckBox($cellElement, column);
        columnHeadersView._attachSelectAllCheckBoxClickEvent($cellElement);
    };

    return {
        init: function() {
            var that = this,
                dataController = that.getController("data"),
                selectionOptions = that.option("selection") || {};

            that._dataController = dataController;

            that._selectionMode = that.option(SELECTION_MODE);

            that._isSelectionWithCheckboxes = false;

            that._selection = that._createSelection({
                selectedKeys: that.option("selectedRowKeys"),
                mode: that._selectionMode,
                deferred: selectionOptions.deferred,
                maxFilterLengthInRequest: selectionOptions.maxFilterLengthInRequest,
                selectionFilter: that.option("selectionFilter"),
                key: function() {
                    return dataController && dataController.key();
                },
                keyOf: function(item) {
                    return dataController && dataController.keyOf(item);
                },
                dataFields: function() {
                    return dataController.dataSource() && dataController.dataSource().select();
                },
                load: function(options) {
                    return dataController.dataSource() && dataController.dataSource().load(options) || new Deferred().resolve([]);
                },
                plainItems: function() {
                    return dataController.items();
                },
                isItemSelected: function(item) {
                    return item.selected;
                },
                isSelectableItem: function(item) {
                    return item && item.rowType === "data" && !item.inserted;
                },
                getItemData: function(item) {
                    return item && (item.oldData || item.data || item);
                },
                filter: function() {
                    return dataController.getCombinedFilter();
                },
                totalCount: function() {
                    return dataController.totalCount();
                },
                onSelectionChanged: that._updateSelectedItems.bind(this)
            });

            that._updateSelectColumn();
            that.createAction("onSelectionChanged", { excludeValidators: ["disabled", "readOnly"] });
        },

        _updateSelectColumn: function() {
            var columnsController = this.getController("columns"),
                isSelectColumnVisible = this.isSelectColumnVisible();

            columnsController.addCommandColumn({
                command: "select",
                visible: isSelectColumnVisible,
                visibleIndex: -1,
                dataType: "boolean",
                alignment: "center",
                cssClass: COMMAND_SELECT_CLASS,
                width: "auto",
                cellTemplate: selectionCellTemplate,
                headerCellTemplate: selectionHeaderTemplate
            });

            columnsController.columnOption("command:select", "visible", isSelectColumnVisible);
        },

        _createSelection: function(options) {
            return new Selection(options);
        },

        _fireSelectionChanged: function(options) {
            if(options) {
                this.executeAction("onSelectionChanged", options);
            }

            var argument = this.option("selection.deferred") ?
                { selectionFilter: this.option("selectionFilter") } :
                { selectedRowKeys: this.option("selectedRowKeys") };

            this.selectionChanged.fire(argument);
        },

        _updateCheckboxesState: function(options) {
            var isDeferredMode = options.isDeferredMode,
                selectionFilter = options.selectionFilter,
                selectedItemKeys = options.selectedItemKeys,
                removedItemKeys = options.removedItemKeys;

            if(this.option(SHOW_CHECKBOXES_MODE) === "onClick") {
                if(isDeferredMode ? selectionFilter && isSeveralRowsSelected(this, selectionFilter) : selectedItemKeys.length > 1) {
                    this.startSelectionWithCheckboxes();
                } else if(isDeferredMode ? selectionFilter && !selectionFilter.length : selectedItemKeys.length === 0 && removedItemKeys.length) {
                    this.stopSelectionWithCheckboxes();
                }
            }
        },

        _updateSelectedItems: function(args) {
            var that = this,
                selectionChangedOptions,
                isDeferredMode = that.option("selection.deferred"),
                selectionFilter = that._selection.selectionFilter(),
                dataController = that._dataController,
                items = dataController.items();

            if(!items) {
                return;
            }

            var isSelectionWithCheckboxes = that.isSelectionWithCheckboxes();
            var changedItemIndexes = that.getChangedItemIndexes(items);

            that._updateCheckboxesState({
                selectedItemKeys: args.selectedItemKeys,
                removedItemKeys: args.removedItemKeys,
                selectionFilter: selectionFilter,
                isDeferredMode: isDeferredMode
            });

            if(changedItemIndexes.length || (isSelectionWithCheckboxes !== that.isSelectionWithCheckboxes())) {
                dataController.updateItems({
                    changeType: "updateSelection",
                    itemIndexes: changedItemIndexes
                });
            }

            if(isDeferredMode) {
                that.option("selectionFilter", selectionFilter);
                selectionChangedOptions = {};
            } else if(args.addedItemKeys.length || args.removedItemKeys.length) {
                that._selectedItemsInternalChange = true;
                that.option("selectedRowKeys", args.selectedItemKeys.slice(0));
                that._selectedItemsInternalChange = false;
                selectionChangedOptions = {
                    selectedRowsData: args.selectedItems.slice(0),
                    selectedRowKeys: args.selectedItemKeys.slice(0),
                    currentSelectedRowKeys: args.addedItemKeys.slice(0),
                    currentDeselectedRowKeys: args.removedItemKeys.slice(0)
                };
            }

            that._fireSelectionChanged(selectionChangedOptions);
        },

        getChangedItemIndexes: function(items) {
            var that = this,
                itemIndexes = [],
                isDeferredSelection = this.option("selection.deferred");

            for(var i = 0, length = items.length; i < length; i++) {
                var row = items[i];
                var isItemSelected = that.isRowSelected(isDeferredSelection ? row.data : row.key);

                if(that._selection.isDataItem(row) && row.isSelected !== isItemSelected) {
                    itemIndexes.push(i);
                }
            }

            return itemIndexes;
        },

        callbackNames: function() {
            return ["selectionChanged"];
        },

        optionChanged: function(args) {
            var that = this;

            that.callBase(args);

            switch(args.name) {
                case "selection":
                    var oldSelectionMode = that._selectionMode;

                    that.init();

                    var selectionMode = that._selectionMode;
                    var selectedRowKeys = that.option("selectedRowKeys");

                    if(oldSelectionMode !== selectionMode) {
                        if(selectionMode === "single") {
                            if(selectedRowKeys.length > 1) {
                                selectedRowKeys = [selectedRowKeys[0]];
                            }
                        } else if(selectionMode !== "multiple") {
                            selectedRowKeys = [];
                        }
                    }

                    that.selectRows(selectedRowKeys).always(function() {
                        that._fireSelectionChanged();
                    });

                    that.getController("columns").updateColumns();
                    args.handled = true;
                    break;
                case "selectionFilter":
                    this._selection.selectionFilter(args.value);
                    args.handled = true;
                    break;
                case "selectedRowKeys":
                    if(Array.isArray(args.value) && !that._selectedItemsInternalChange && that.component.getDataSource()) {
                        that.selectRows(args.value);
                    }
                    args.handled = true;
                    break;
            }
        },

        publicMethods: function() {
            return ["selectRows", "deselectRows", "selectRowsByIndexes", "getSelectedRowKeys", "getSelectedRowsData", "clearSelection", "selectAll", "deselectAll", "startSelectionWithCheckboxes", "stopSelectionWithCheckboxes", "isRowSelected"];
        },

        /**
         * @name GridBaseMethods.isRowSelected(key)
         * @publicName isRowSelected(key)
         * @param1 key:any
         * @return boolean
         */
        /**
         * @name dxDataGridMethods.isRowSelected(data)
         * @publicName isRowSelected(data)
         * @param1 data:any
         * @return boolean
         */
        isRowSelected: function(arg) {
            return this._selection.isItemSelected(arg);
        },

        isSelectColumnVisible: function() {
            return this.option(SELECTION_MODE) === "multiple" && (this.option(SHOW_CHECKBOXES_MODE) === "always" || this.option(SHOW_CHECKBOXES_MODE) === "onClick" || this._isSelectionWithCheckboxes);
        },

        _isOnePageSelectAll: function() {
            return this.option("selection.selectAllMode") === "page";
        },

        isSelectAll: function() {
            return this._selection.getSelectAllState(this._isOnePageSelectAll());
        },

        /**
         * @name GridBaseMethods.selectAll
         * @publicName selectAll()
         * @return Promise<void>
         */
        selectAll: function() {
            if(this.option(SHOW_CHECKBOXES_MODE) === "onClick") {
                this.startSelectionWithCheckboxes();
            }

            return this._selection.selectAll(this._isOnePageSelectAll());
        },

        /**
         * @name GridBaseMethods.deselectAll
         * @publicName deselectAll()
         * @return Promise<void>
         */
        deselectAll: function() {
            return this._selection.deselectAll(this._isOnePageSelectAll());
        },

        /**
         * @name GridBaseMethods.clearSelection
         * @publicName clearSelection()
         */
        clearSelection: function() {
            return this.selectedItemKeys([]);
        },

        refresh: function() {
            var selectedRowKeys = this.option("selectedRowKeys") || [];

            if(!this.option("selection.deferred") && selectedRowKeys.length) {
                return this.selectedItemKeys(selectedRowKeys);
            }

            return new Deferred().resolve().promise();
        },

        selectedItemKeys: function(value, preserve, isDeselect, isSelectAll) {
            return this._selection.selectedItemKeys(value, preserve, isDeselect, isSelectAll);
        },

        /**
         * @name dxDataGridMethods.getSelectedRowKeys
         * @publicName getSelectedRowKeys()
         * @return Array<any> | Promise<any>
         */
        /**
         * @name dxTreeListMethods.getSelectedRowKeys
         * @publicName getSelectedRowKeys()
         * @return Array<any>
         */
        getSelectedRowKeys: function() {
            return this._selection.getSelectedItemKeys();
        },

        /**
         * @name GridBaseMethods.selectRows
         * @publicName selectRows(keys, preserve)
         * @param1 keys:Array<any>
         * @param2 preserve:boolean
         * @return Promise<any>
         */
        selectRows: function(keys, preserve) {
            return this.selectedItemKeys(keys, preserve);
        },
        /**
        * @name GridBaseMethods.deselectRows
        * @publicName deselectRows(keys)
        * @param1 keys:Array<any>
        * @return Promise<any>
        */
        deselectRows: function(keys) {
            return this.selectedItemKeys(keys, true, true);
        },

        /**
         * @name GridBaseMethods.selectRowsByIndexes
         * @publicName selectRowsByIndexes(indexes)
         * @param1 indexes:Array<number>
         * @return Promise<any>
         */
        selectRowsByIndexes: function(indexes) {
            var items = this._dataController.items(),
                keys = [];

            if(!Array.isArray(indexes)) {
                indexes = Array.prototype.slice.call(arguments, 0);
            }

            each(indexes, function() {
                var item = items[this];
                if(item && item.rowType === "data") {
                    keys.push(item.key);
                }
            });
            return this.selectRows(keys);
        },

        /**
         * @name dxDataGridMethods.getSelectedRowsData
         * @publicName getSelectedRowsData()
         * @return Array<any> | Promise<any>
         */
        /**
         * @name dxTreeListMethods.getSelectedRowsData
         * @publicName getSelectedRowsData()
         * @return Array<any>
         */
        getSelectedRowsData: function() {
            return this._selection.getSelectedItems();
        },

        changeItemSelection: function(itemIndex, keys) {
            keys = keys || {};
            if(this.isSelectionWithCheckboxes()) {
                keys.control = true;
            }
            return this._selection.changeItemSelection(itemIndex, keys);
        },

        focusedItemIndex: function(itemIndex) {
            var that = this;

            if(typeUtils.isDefined(itemIndex)) {
                that._selection._focusedItemIndex = itemIndex;
            } else {
                return that._selection._focusedItemIndex;
            }
        },

        isSelectionWithCheckboxes: function() {
            return this.option(SELECTION_MODE) === "multiple" && (this.option(SHOW_CHECKBOXES_MODE) === "always" || this._isSelectionWithCheckboxes);
        },

        /**
         * @name GridBaseMethods.startSelectionWithCheckboxes
         * @publicName startSelectionWithCheckboxes()
         * @hidden
         * @return boolean
         */
        startSelectionWithCheckboxes: function() {
            var that = this;

            if(that.option(SELECTION_MODE) === "multiple" && !that.isSelectionWithCheckboxes()) {
                that._isSelectionWithCheckboxes = true;
                that._updateSelectColumn();
                return true;
            }
            return false;
        },

        /**
         * @name GridBaseMethods.stopSelectionWithCheckboxes
         * @publicName stopSelectionWithCheckboxes()
         * @hidden
         * @return boolean
         */
        stopSelectionWithCheckboxes: function() {
            var that = this;

            if(that._isSelectionWithCheckboxes) {
                that._isSelectionWithCheckboxes = false;
                that._updateSelectColumn();
                return true;
            }
            return false;
        }
    };
})());

module.exports = {
    defaultOptions: function() {
        return {
        /**
         * @name GridBaseOptions.selection
         * @publicName selection
         * @type object
         */
        /**
         * @name dxDataGridOptions.selection
         * @publicName selection
         * @type object
         */
        /**
         * @name dxTreeListOptions.selection
         * @publicName selection
         * @type object
         */
            selection: {
                /**
                 * @name GridBaseOptions.selection.mode
                 * @publicName mode
                 * @type Enums.SelectionMode
                 * @default "none"
                 */
                mode: "none", // "single", "multiple"
                /**
                 * @name dxDataGridOptions.selection.showCheckBoxesMode
                 * @publicName showCheckBoxesMode
                 * @type Enums.GridSelectionShowCheckBoxesMode
                 * @default "onClick"
                 */
                showCheckBoxesMode: "onClick", // "onLongTap", "always", "none"
                /**
                 * @name GridBaseOptions.selection.allowSelectAll
                 * @publicName allowSelectAll
                 * @type boolean
                 * @default true
                 */
                allowSelectAll: true,
                /**
                 * @name dxDataGridOptions.selection.selectAllMode
                 * @publicName selectAllMode
                 * @type Enums.SelectAllMode
                 * @default "allPages"
                 */
                selectAllMode: "allPages",

                 /**
                 * @name dxDataGridOptions.selection.maxFilterLengthInRequest
                 * @publicName maxFilterLengthInRequest
                 * @type number
                 * @hidden
                 * @default 1500
                 */
                maxFilterLengthInRequest: 1500,
                 /**
                 * @name dxDataGridOptions.selection.deferred
                 * @publicName deferred
                 * @type boolean
                 * @default false
                 */
                deferred: false
            },
            /**
            * @name dxDataGridOptions.selectionFilter
            * @publicName selectionFilter
            * @type Filter expression
            * @default []
            * @fires dxDataGridOptions.onOptionChanged
            */
            selectionFilter: [],
            /**
             * @name GridBaseOptions.onSelectionChanged
             * @publicName onSelectionChanged
             * @type function(e)
             * @type_function_param1 e:object
             * @type_function_param1_field4 currentSelectedRowKeys:Array<any>
             * @type_function_param1_field5 currentDeselectedRowKeys:Array<any>
             * @type_function_param1_field6 selectedRowKeys:Array<any>
             * @type_function_param1_field7 selectedRowsData:Array<Object>
             * @extends Action
             * @action
             */
            /**
             * @name GridBaseOptions.selectedRowKeys
             * @publicName selectedRowKeys
             * @type Array<any>
             * @fires GridBaseOptions.onSelectionChanged
             */
            selectedRowKeys: []
        };
    },

    controllers: {
        selection: exports.SelectionController
    },

    extenders: {
        controllers: {
            data: {
                init: function() {
                    var selectionController = this.getController("selection"),
                        isDeferredMode = this.option("selection.deferred");

                    this.callBase.apply(this, arguments);

                    if(isDeferredMode) {
                        selectionController._updateCheckboxesState({
                            isDeferredMode: true,
                            selectionFilter: this.option("selectionFilter")
                        });
                    }
                },

                _loadDataSource: function() {
                    var that = this;

                    return that.callBase().done(function() {
                        that.getController("selection").refresh();
                    });
                },

                _processDataItem: function(item, options) {
                    var that = this,
                        selectionController = that.getController("selection"),
                        hasSelectColumn = selectionController.isSelectColumnVisible(),
                        isDeferredSelection = options.isDeferredSelection = options.isDeferredSelection === undefined ? this.option("selection.deferred") : options.isDeferredSelection,
                        dataItem = this.callBase.apply(this, arguments);

                    dataItem.isSelected = selectionController.isRowSelected(isDeferredSelection ? dataItem.data : dataItem.key);

                    if(hasSelectColumn && dataItem.values) {
                        for(var i = 0; i < options.visibleColumns.length; i++) {
                            if(options.visibleColumns[i].command === "select") {
                                dataItem.values[i] = dataItem.isSelected;
                                break;
                            }
                        }
                    }
                    return dataItem;
                },

                refresh: function() {
                    var that = this,
                        d = new Deferred();

                    this.callBase.apply(this, arguments).done(function() {
                        that.getController("selection").refresh().done(d.resolve).fail(d.reject);
                    }).fail(d.reject);

                    return d.promise();
                },

                _handleDataChanged: function(e) {
                    this.callBase.apply(this, arguments);

                    if(!e || e.changeType === "refresh") {
                        this.getController("selection").focusedItemIndex(-1);
                    }
                }
            },
            contextMenu: {
                _contextMenuPrepared: function(options) {
                    var dxEvent = options.event;

                    if(dxEvent.originalEvent && dxEvent.originalEvent.type !== "dxhold" || options.items && options.items.length > 0) return;

                    processLongTap(this, dxEvent);
                }
            }
        },

        views: {
            columnHeadersView: {
                init: function() {
                    var that = this;
                    that.callBase();
                    that.getController("selection").selectionChanged.add(that._updateSelectAllValue.bind(that));
                },
                _updateSelectAllValue: function() {
                    var that = this,
                        $element = that.element(),
                        $editor = $element && $element.find("." + SELECT_CHECKBOX_CLASS);

                    if($element && $editor.length && that.option("selection.mode") === "multiple") {
                        $editor.dxCheckBox("instance").option("value", that.getController("selection").isSelectAll());
                    }
                },
                _handleDataChanged: function(e) {
                    this.callBase(e);
                    if(!e || e.changeType === "refresh") {
                        this._updateSelectAllValue();
                    }
                },

                _renderSelectAllCheckBox: function($container, column) {
                    var that = this,
                        groupElement,
                        selectionController = that.getController("selection");

                    groupElement = $("<div>")
                        .appendTo($container)
                        .addClass(SELECT_CHECKBOX_CLASS);

                    that.setAria("label", messageLocalization.format("dxDataGrid-ariaSelectAll"), $container);

                    that.getController("editorFactory").createEditor(groupElement, extend({}, column, {
                        parentType: "headerRow",
                        dataType: "boolean",
                        value: selectionController.isSelectAll(),
                        editorOptions: {
                            visible: that.option("selection.allowSelectAll") || selectionController.isSelectAll() !== false
                        },
                        tabIndex: -1,
                        setValue: function(value, e) {
                            var allowSelectAll = that.option("selection.allowSelectAll");
                            e.component.option("visible", allowSelectAll || e.component.option("value") !== false);

                            if(!e.event || selectionController.isSelectAll() === value) {
                                return;
                            }

                            if(e.value && !allowSelectAll) {
                                e.component.option("value", false);
                            } else {
                                e.value ? selectionController.selectAll() : selectionController.deselectAll();
                            }

                            e.event.preventDefault();
                        }
                    }));

                    return groupElement;
                },

                _attachSelectAllCheckBoxClickEvent: function($element) {
                    eventsEngine.on($element, clickEvent.name, this.createAction(function(e) {
                        var event = e.event;

                        if(!$(event.target).closest("." + SELECT_CHECKBOX_CLASS).length) {
                            eventsEngine.trigger($(event.currentTarget).children(), clickEvent.name);
                        }
                        event.preventDefault();
                    }));
                }
            },

            rowsView: {
                renderSelectCheckBoxContainer: function($container, options) {
                    if(options.rowType === "data" && !options.row.inserted) {
                        $container.addClass(EDITOR_CELL_CLASS);
                        this._attachCheckBoxClickEvent($container);

                        this.setAria("label", messageLocalization.format("dxDataGrid-ariaSelectRow"), $container);
                        this._renderSelectCheckBox($container, options);
                    } else {
                        $container.get(0).innerHTML = "&nbsp;";
                    }
                },

                _renderSelectCheckBox: function(container, options) {
                    var groupElement = $("<div>")
                            .addClass(SELECT_CHECKBOX_CLASS)
                            .appendTo(container);

                    this.getController("editorFactory").createEditor(groupElement, extend({}, options.column, {
                        parentType: "dataRow",
                        dataType: "boolean",
                        value: options.value,
                        tabIndex: -1,
                        setValue: function(value, e) {
                            if(e && e.event && e.event.type === "keydown") {
                                eventsEngine.trigger(container, clickEvent.name, e);
                            }
                        },
                        row: options.row
                    }));

                    return groupElement;
                },

                _attachCheckBoxClickEvent: function($element) {
                    eventsEngine.on($element, clickEvent.name, this.createAction(function(e) {
                        var selectionController = this.getController("selection"),
                            event = e.event,
                            rowIndex = this.getRowIndex($(event.currentTarget).closest("." + ROW_CLASS));

                        if(rowIndex >= 0) {
                            selectionController.startSelectionWithCheckboxes();
                            selectionController.changeItemSelection(rowIndex, { shift: event.shiftKey });

                            if($(event.target).closest("." + SELECT_CHECKBOX_CLASS).length) {
                                this.getController("data").updateItems({
                                    changeType: "updateSelection",
                                    itemIndexes: [rowIndex]
                                });
                            }
                        }
                    }));
                },

                _update: function(change) {
                    var that = this,
                        tableElements = that.getTableElements();

                    if(change.changeType === "updateSelection") {
                        if(tableElements.length > 0) {
                            each(tableElements, function(_, tableElement) {
                                each(change.itemIndexes || [], function(_, index) {
                                    var $row,
                                        isSelected;

                                    // T108078
                                    if(change.items[index]) {
                                        $row = that._getRowElements($(tableElement)).eq(index);
                                        isSelected = change.items[index].isSelected;
                                        $row
                                            .toggleClass(ROW_SELECTION_CLASS, isSelected === undefined ? false : isSelected)
                                            .find("." + SELECT_CHECKBOX_CLASS).dxCheckBox("option", "value", isSelected);
                                        that.setAria("selected", isSelected, $row);
                                    }
                                });
                            });

                            that._updateCheckboxesClass();
                        }
                    } else {
                        that.callBase(change);
                    }
                },

                _createTable: function() {
                    var that = this,
                        selectionMode = that.option("selection.mode"),
                        $table = that.callBase.apply(that, arguments);


                    if(selectionMode !== "none") {
                        if(that.option(SHOW_CHECKBOXES_MODE) === "onLongTap" || !support.touch) {
                            // TODO Not working timeout by hold when it is larger than other timeouts by hold
                            eventsEngine.on($table, eventUtils.addNamespace(holdEvent.name, "dxDataGridRowsView"), "." + DATA_ROW_CLASS, that.createAction(function(e) {
                                processLongTap(that.component, e.event);

                                e.event.stopPropagation();
                            }));
                        }
                        eventsEngine.on($table, "mousedown selectstart", that.createAction(function(e) {
                            var event = e.event;

                            if(event.shiftKey) {
                                event.preventDefault();
                            }
                        }));
                    }

                    return $table;
                },

                _createRow: function(row) {
                    var $row = this.callBase(row),
                        isSelected;

                    if(row) {
                        isSelected = !!row.isSelected;
                        if(isSelected) {
                            $row.addClass(ROW_SELECTION_CLASS);
                        }
                        this.setAria("selected", isSelected, $row);
                    }

                    return $row;
                },

                _rowClick: function(e) {
                    var that = this,
                        dxEvent = e.event,
                        isSelectionDisabled = $(dxEvent.target).closest("." + SELECTION_DISABLED_CLASS).length;

                    if(!that.isClickableElement($(dxEvent.target))) {
                        if(!isSelectionDisabled && (that.option(SELECTION_MODE) !== "multiple" || that.option(SHOW_CHECKBOXES_MODE) !== "always")) {
                            if(that.getController("selection").changeItemSelection(e.rowIndex, {
                                control: dxEvent.ctrlKey || dxEvent.metaKey,
                                shift: dxEvent.shiftKey
                            })) {
                                dxEvent.preventDefault();
                                e.handled = true;
                            }
                        }
                        that.callBase(e);
                    }
                },

                isClickableElement: function($target) {
                    var isCommandSelect = $target.closest("." + COMMAND_SELECT_CLASS).length;

                    return !!isCommandSelect;
                },

                _renderCore: function(change) {
                    this.callBase(change);
                    this._updateCheckboxesClass();
                },

                _updateCheckboxesClass: function() {
                    var tableElements = this.getTableElements(),
                        selectionController = this.getController("selection"),
                        isCheckBoxesHidden = selectionController.isSelectColumnVisible() && !selectionController.isSelectionWithCheckboxes();

                    each(tableElements, function(_, tableElement) {
                        $(tableElement).toggleClass(CHECKBOXES_HIDDEN_CLASS, isCheckBoxesHidden);
                    });
                }
            }
        }
    }
};
