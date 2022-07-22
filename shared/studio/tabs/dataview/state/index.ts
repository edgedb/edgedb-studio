import {computed, observable, action, when, reaction, autorun} from "mobx";
import {
  model,
  Model,
  modelAction,
  modelFlow,
  prop,
  _async,
  _await,
  findParent,
  objectMap,
  idProp,
} from "mobx-keystone";

import {VariableSizeGrid as Grid} from "react-window";

import {NavigateFunction} from "react-router";

import {Text} from "@codemirror/state";

import {_ICodec} from "edgedb";
import {ObjectCodec} from "edgedb/dist/codecs/object";

import {EdgeDBSet} from "../../../utils/decodeRawBuffer";

import {ObservableLRU} from "./lru";

import {
  SchemaLink,
  SchemaProperty,
  SchemaType,
} from "@edgedb/common/schemaData";
import {resolveObjectTypeUnion} from "@edgedb/common/schemaData/utils";

import {InspectorState, resultGetterCtx} from "@edgedb/inspector/v2/state";

import {dbCtx, connCtx} from "../../../state";
import {DataEditingManager, UpdateLinkChangeKind} from "./edits";

const fetchBlockSize = 100;

type ParentObject = {
  editMode: boolean;
  objectTypeId: string;
  objectTypeName: string;
  subtypeName?: string;
  id: string | number;
  fieldName: string;
  linkId: string;
  isMultiLink: boolean;
  isComputedLink: boolean;
};

@model("DataView")
export class DataView extends Model({
  inspectorStack: prop<DataInspector[]>(() => []),

  edits: prop(() => new DataEditingManager({})),
}) {
  @computed
  get objectTypes() {
    const objects = dbCtx.get(this)!.schemaData?.objects;
    return objects
      ? [...objects.values()].filter(
          (obj) =>
            !obj.builtin && !obj.unionOf && !obj.insectionOf && !obj.from_alias
        )
      : [];
  }

  onAttachedToRootStore() {
    when(
      () => this.objectTypes.length !== 0,
      () => {
        const id = this.objectTypes[0].id;
        if (!this.inspectorStack.length && id) {
          this.selectObject(id);
        }
      }
    );
  }

  @modelAction
  selectObject(objectTypeId: string) {
    this.inspectorStack = [new DataInspector({objectTypeId})];
  }

  @modelAction
  openNestedView(objectTypeId: string, parentObject: ParentObject) {
    this.inspectorStack.push(new DataInspector({objectTypeId, parentObject}));
  }

  @modelAction
  closeLastNestedView() {
    this.inspectorStack.pop();
  }

  @modelAction
  closeAllNestedViews() {
    this.inspectorStack = this.inspectorStack.slice(0, 1);
  }

  refreshAllViews() {
    for (const view of [...this.inspectorStack].reverse()) {
      view._refreshData(true);
    }
  }

  @modelAction
  updateFromPath(path: string): string | null {
    const [rootObjectTypeName, ...nestedParts] = path.split("/");
    if (rootObjectTypeName !== this.inspectorStack[0].objectType?.name) {
      const objTypeId = this.objectTypes.find(
        (obj) => obj.name === rootObjectTypeName
      )?.id;
      if (objTypeId) {
        this.selectObject(objTypeId);
      } else {
        this.selectObject(this.objectTypes[0].id);
        return this.objectTypes[0].name;
      }
    }
    let i = 0;
    let parentSchemaObject = dbCtx
      .get(this)!
      .schemaData!.objectsByName.get(rootObjectTypeName)!;
    const depth = Math.floor(nestedParts.length / 2);
    while (i < depth) {
      let objId: string | number = nestedParts[i * 2];
      let pointerName = nestedParts[i * 2 + 1];
      let subtypeName: undefined | string = undefined;

      if (!/^[0-9a-fA-F]{32}$/.test(objId.replace(/-/g, ""))) {
        objId = parseInt(objId);
      }
      if (pointerName.startsWith("[")) {
        [subtypeName, pointerName] = pointerName.slice(1).split("]");
      }

      const stackItem = this.inspectorStack[i + 1];
      const pointer = parentSchemaObject.pointers?.find(
        (p) => p.name === pointerName
      );

      if (
        !pointer ||
        (typeof objId === "number" && !this.edits.insertEdits.has(objId))
      ) {
        this.inspectorStack = this.inspectorStack.slice(0, i + 1);
        return [rootObjectTypeName, ...nestedParts.slice(0, i * 2)].join("/");
      } else {
        if (
          objId !== stackItem?.parentObject!.id ||
          pointerName !== stackItem?.parentObject!.fieldName
        ) {
          this.inspectorStack[i + 1] = new DataInspector({
            objectTypeId: pointer.target!.id,
            parentObject: {
              editMode: false,
              objectTypeId: parentSchemaObject.id,
              objectTypeName: parentSchemaObject.name,
              subtypeName,
              id: objId,
              fieldName: pointer.name,
              linkId: `${objId}__${pointer.name}`,
              isMultiLink:
                pointer.type === "Link"
                  ? pointer.cardinality === "Many"
                  : false,
              isComputedLink: !!pointer.expr,
            },
          });
        }
        parentSchemaObject = pointer.target as any;
      }
      i++;
    }
    if (this.inspectorStack.length > i + 1) {
      this.inspectorStack = this.inspectorStack.slice(0, i + 1);
    }
    return null;
  }
}

export enum RowKind {
  data,
  expanded,
}
export type DataRowData = {kind: RowKind.data; index: number};
export type ExpandedRowData = {
  kind: RowKind.expanded;
  index: number;
  dataRowIndex: number;
  state: ExpandedInspector;
};

export enum ObjectFieldType {
  property,
  link,
}

export type ObjectField = {
  subtypeName?: string;
  name: string;
  queryName: string;
  typeid: string;
  typename: string;
  required: boolean;
  computedExpr: string | null;
  readonly: boolean;
  multi: boolean;
} & (
  | {
      type: ObjectFieldType.property;
      default: string | null;
      schemaType: SchemaType;
    }
  | {
      type: ObjectFieldType.link;
    }
);

interface SortBy {
  fieldIndex: number;
  direction: "ASC" | "DESC";
}

@model("DataInspector")
export class DataInspector extends Model({
  $modelId: idProp,
  objectTypeId: prop<string>(),
  parentObject: prop<ParentObject | null>(null),

  scrollPos: prop<[number, number]>(() => [0, 0]).withSetter(),

  sortBy: prop<SortBy | null>(null),
  fieldWidths: prop<number[]>(() => []),
  expandedInspectors: prop(() => objectMap<ExpandedInspector>()),

  filter: prop<string>(""),
  filterError: prop<string>(""),
  filterPanelOpen: prop<boolean>(false).withSetter(),
}) {
  gridRef: Grid | null = null;
  fieldWidthsUpdated = false;

  @observable.ref
  filterEditStr = Text.of(["filter "]);

  @observable.ref
  fields: ObjectField[] | null = null;

  @action
  setFilterEditStr(filterStr: Text) {
    this.filterEditStr = filterStr;
  }

  onAttachedToRootStore() {
    if (!this.fields) {
      this._updateFields();
    }

    this._updateRowCount();

    const updateFieldDisposer = reaction(
      () => this.objectType,
      () => {
        this._updateFields();
        this._refreshData();
      }
    );
    const refreshDataDisposer = reaction(
      () => connCtx.get(this)!.sessionGlobals,
      () => this._refreshData(true)
    );

    return () => {
      updateFieldDisposer();
      refreshDataDisposer();
    };
  }

  @computed
  get objectType() {
    return dbCtx.get(this)!.schemaData!.objects.get(this.objectTypeId);
  }

  openNestedView(
    basePath: string,
    navigate: NavigateFunction,
    objectId: string | number,
    subtypeName: string,
    field: ObjectField,
    editMode: boolean = false
  ) {
    const dataView = findParent<DataView>(
      this,
      (parent) => parent instanceof DataView
    )!;

    navigate(
      `${basePath}/${objectId}/${field.subtypeName ?? ""}${field.name}`
    );
    dataView.openNestedView(field.typeid, {
      editMode,
      objectTypeId: this.objectTypeId,
      objectTypeName: this.objectType!.name,
      subtypeName,
      id: objectId,
      fieldName: field.name,
      linkId: `${objectId}__${field.name}`,
      isMultiLink: field.type === ObjectFieldType.link ? field.multi : false,
      isComputedLink: !!field.computedExpr,
    });
  }

  @modelAction
  toggleEditLinkMode() {
    if (this.parentObject) {
      this.parentObject.editMode = !this.parentObject.editMode;
      this._refreshData(true);
    }
  }

  // fields

  @modelAction
  _updateFields() {
    const obj = this.objectType;

    if (!obj) {
      throw new Error(`Cannot find schema object id: ${this.objectTypeId}`);
    }

    function createField(
      pointer: SchemaProperty | SchemaLink,
      subtypeName?: string,
      queryNamePrefix: string = ""
    ): ObjectField {
      const type =
        pointer.type === "Property"
          ? ObjectFieldType.property
          : ObjectFieldType.link;

      const baseField = {
        subtypeName,
        name: pointer.name,
        queryName: queryNamePrefix + pointer.name,
        typeid: pointer.target!.id,
        typename: pointer.target!.name,
        required: pointer.required,
        multi: pointer.cardinality === "Many",
        computedExpr: pointer.expr,
        readonly: pointer.readonly,
      };

      if (type === ObjectFieldType.property) {
        return {
          type,
          ...baseField,
          schemaType: pointer.target!,
          default: pointer.default?.replace(/^select/i, "").trim() ?? null,
        };
      }

      return {
        type,
        ...baseField,
      };
    }

    const baseFields = [
      ...Object.values(obj.properties),
      ...Object.values(obj.links),
    ].map((pointer) => createField(pointer));

    const baseFieldNames = new Set(baseFields.map((field) => field.name));

    const subTypes = obj.unionOf
      ? new Set(
          resolveObjectTypeUnion(obj).flatMap((type) => [
            type,
            ...type.descendents,
          ])
        )
      : obj.descendents;

    const subtypeFields = [...subTypes]
      .filter((subType) => !subType.abstract && !subType.from_alias)
      .flatMap((subtypeObj) => {
        const queryNamePrefix = `__${subtypeObj.name.replace(/:/g, "")}_`;

        return [
          ...Object.values(subtypeObj.properties),
          ...Object.values(subtypeObj.links),
        ]
          .filter((pointer) => !baseFieldNames.has(pointer.name))
          .map((pointer) =>
            createField(pointer, subtypeObj.name, queryNamePrefix)
          );
      });

    this.fields = [...baseFields, ...subtypeFields];
    this.fieldWidths = Array(this.fields.length).fill(180);
    this.gridRef?.resetAfterColumnIndex(0);
  }

  @computed
  get hasSubtypeFields() {
    return !!this.fields?.some((field) => field.subtypeName);
  }

  @computed
  get insertTypeNames() {
    const objectType = dbCtx
      .get(this)!
      .schemaData?.objects.get(this.objectTypeId);

    if (!objectType) {
      return [];
    }

    return resolveObjectTypeUnion(objectType)
      .flatMap((type) => [type, ...type.descendents])
      .filter((type) => !type.abstract && !type.from_alias)
      .map((type) => type.name);
  }

  @computed
  get insertedRows() {
    const dataView = findParent<DataView>(
      this,
      (parent) => parent instanceof DataView
    )!;

    if (this.parentObject?.editMode === false) {
      return [
        ...(dataView.edits.linkEdits.get(this.parentObject.linkId)?.inserts ??
          []),
      ];
    }

    const typeNames = new Set(this.insertTypeNames);

    return [...(dataView.edits.insertEdits.values() ?? [])].filter((row) =>
      typeNames.has(row.objectTypeName)
    );
  }

  @computed
  get subtypeFieldRanges() {
    const ranges = new Map<string, {left: number; width: number}>();

    let left = 0;
    let i = 0;
    for (const field of this.fields ?? []) {
      const fieldWidth = this.fieldWidths[i++];
      if (field.subtypeName) {
        if (!ranges.has(field.subtypeName)) {
          ranges.set(field.subtypeName, {left, width: fieldWidth});
        } else {
          ranges.get(field.subtypeName)!.width += fieldWidth;
        }
      }
      left += fieldWidth;
    }

    return ranges;
  }

  // offset handling

  @observable
  visibleIndexes: [number, number] = [0, 0];

  @observable
  rowCount = 0;

  _pendingOffsets: number[] = [];

  @observable
  visibleOffsets: number[] = [];

  @observable
  hoverRowIndex: number | null = null;

  @action
  setHoverRowIndex(index: number | null) {
    this.hoverRowIndex = index;
  }

  @computed
  get gridRowCount() {
    return (
      this.rowCount +
      this.expandedRows.reduce(
        (sum, row) => sum + row.inspector.rowsCount,
        0
      ) +
      this.insertedRows.length
    );
  }

  @action
  setVisibleRowIndexes(startIndex: number, endIndex: number) {
    const startRow = this.getRowData(startIndex);
    const endRow = this.getRowData(endIndex);

    this.visibleIndexes = [startIndex, endIndex];

    const startDataIndex =
      startRow.kind === RowKind.expanded
        ? startRow.dataRowIndex + 1
        : startRow.index;
    const endDataIndex =
      endRow.kind === RowKind.expanded ? endRow.dataRowIndex : endRow.index;

    if (endDataIndex < startDataIndex) {
      this.visibleOffsets = [];
      return;
    }

    const startOffset = Math.floor(startDataIndex / fetchBlockSize);
    const endOffset = Math.ceil(endDataIndex / fetchBlockSize) || 1;

    const offsets = Array(endOffset - startOffset)
      .fill(0)
      .map((_, i) => i + startOffset);

    this.visibleOffsets = offsets;
    this._pendingOffsets = offsets.filter((offset) => !this.data.has(offset));

    this._fetchData();
  }

  getRowData(rowIndex: number): DataRowData | ExpandedRowData {
    let index = rowIndex;
    for (const expandedRow of this.expandedRows) {
      if (index <= expandedRow.dataRowIndex) {
        break;
      }

      const expandedLength = expandedRow.inspector.rowsCount;

      if (index <= expandedRow.dataRowIndex + expandedLength) {
        return {
          kind: RowKind.expanded,
          index: index - expandedRow.dataRowIndex - 1,
          dataRowIndex: expandedRow.dataRowIndex,
          state: expandedRow.inspector,
        };
      }

      index -= expandedLength;
    }

    return {
      kind: RowKind.data,
      index,
    };
  }

  getData(dataRowIndex: number): any | undefined {
    const blockOffset = Math.floor(dataRowIndex / fetchBlockSize);

    return this.data.get(blockOffset)?.[
      dataRowIndex - blockOffset * fetchBlockSize
    ];
  }

  @modelFlow
  _updateRowCount = _async(function* (this: DataInspector) {
    const conn = connCtx.get(this)!;
    const dbState = dbCtx.get(this)!;

    const {query, params} = this.getBaseObjectsQuery();
    dbState.setLoadingTab(DataView, true);
    try {
      const data = yield* _await(
        conn.query(
          `SELECT count((${query}${
            this.filter ? ` FILTER ${this.filter}` : ""
          }))`,
          params
        )
      );

      if (data.result) {
        this.rowCount = parseInt(data.result[0], 10);
      }
    } finally {
      dbState.setLoadingTab(DataView, false);
    }
  });

  // expanded rows

  @observable
  expandedRows: {
    dataRowIndex: number;
    inspector: ExpandedInspector;
  }[] = [];

  @computed
  get expandedDataRowIndexes() {
    return new Set(this.expandedRows.map((row) => row.dataRowIndex));
  }

  @action
  toggleRowExpanded(dataRowIndex: number) {
    const existingRowIndex = this.expandedRows.findIndex(
      (row) => row.dataRowIndex === dataRowIndex
    );

    if (existingRowIndex !== -1) {
      this.expandedInspectors.delete(
        this.expandedRows[existingRowIndex].inspector.objectId
      );
      this.expandedRows.splice(existingRowIndex, 1);
    } else {
      const data = this.getData(dataRowIndex);

      if (data) {
        const inspector = new ExpandedInspector({
          objectId: data.id,
          objectTypeName: data.__tname__,
        });
        this.expandedInspectors.set(data.id, inspector);

        this.expandedRows = [
          ...this.expandedRows,
          {
            dataRowIndex,
            inspector,
          },
        ].sort((a, b) => a.dataRowIndex - b.dataRowIndex);
      }
    }
  }

  // data fetching

  data = new ObservableLRU<number, EdgeDBSet>(20);

  dataCodecs: _ICodec[] | null = null;

  @observable
  fetchingData = false;

  discardLastFetch = false;

  @modelFlow
  _fetchData = _async(function* (this: DataInspector) {
    const offset = this._pendingOffsets[0];

    if (this.fetchingData || offset === undefined) {
      return;
    }

    const dbState = dbCtx.get(this)!;

    this.fetchingData = true;
    dbState.setLoadingTab(DataView, true);

    let fetchNextOffset = false;

    try {
      const conn = connCtx.get(this)!;
      const dataQuery = this.dataQuery;

      // console.log(dataQuery);

      if (dataQuery) {
        // console.log(`fetching ${offset}`);
        const data = yield* _await(
          conn.query(dataQuery.query, {
            offset: offset * fetchBlockSize,
            ...dataQuery.params,
          })
        );

        // console.log(offset, data.duration);

        if (!this.discardLastFetch) {
          if (data.result) {
            // console.log(`data ${offset}, length ${data.result.length}`);

            this._setData(offset, data.result);
          }

          this._pendingOffsets = this._pendingOffsets.filter(
            (po) => po !== offset
          );
        } else {
          this.discardLastFetch = false;
        }

        fetchNextOffset = true;
      }
    } finally {
      this.fetchingData = false;
      dbState.setLoadingTab(DataView, false);
    }

    if (fetchNextOffset) {
      this._fetchData();
    }
  });

  @modelAction
  _setData(offset: number, data: EdgeDBSet) {
    this.data.set(offset, data);

    if (!this.dataCodecs) {
      const codec = data._codec as ObjectCodec;
      const codecs = codec.getSubcodecs();
      const codecNames = codec.getFields().map((f) => f.name);
      this.dataCodecs =
        this.fields!.map(
          (field) => codecs[codecNames.indexOf(field.queryName)]
        ) ?? null;
    }

    const expandedRows: typeof DataInspector.prototype.expandedRows = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      if (this.expandedInspectors.has(row.id)) {
        expandedRows.push({
          dataRowIndex: offset * fetchBlockSize + i,
          inspector: this.expandedInspectors.get(row.id)!,
        });
      }
    }

    if (expandedRows.length) {
      this.expandedRows = [...this.expandedRows, ...expandedRows].sort(
        (a, b) => a.dataRowIndex - b.dataRowIndex
      );
    }
  }

  @modelAction
  _refreshData(updateCount: boolean = false) {
    this.data.clear();
    this.expandedRows = [];
    this.gridRef?.resetAfterRowIndex(0);
    this._pendingOffsets = [...this.visibleOffsets];

    if (this.fetchingData) {
      this.discardLastFetch = true;
    }

    if (updateCount) {
      this._updateRowCount();
    }
    this._fetchData();
  }

  // queries

  get _getObjectTypeQuery() {
    const typeUnionNames = resolveObjectTypeUnion(this.objectType!).map(
      (t) => t.name
    );

    return typeUnionNames.length > 1
      ? `{${typeUnionNames.join(", ")}}`
      : typeUnionNames[0];
  }

  get _baseObjectsQuery() {
    if (this.parentObject && typeof this.parentObject.id === "string") {
      return `(SELECT ${
        this.parentObject.subtypeName ?? this.parentObject.objectTypeName
      } FILTER .id = <uuid>'${this.parentObject.id}').${
        this.parentObject.fieldName
      }`;
    }

    const typeUnionNames = resolveObjectTypeUnion(this.objectType!).map(
      (t) => t.name
    );

    return this.parentObject
      ? `<${typeUnionNames.join(" | ")}>{}`
      : typeUnionNames.length > 1
      ? `{${typeUnionNames.join(", ")}}`
      : typeUnionNames[0];
  }

  getBaseObjectsQuery() {
    if (this.parentObject?.editMode) {
      if (typeof this.parentObject.id === "string") {
        return {
          query: `with linkedObjects := (${this._baseObjectsQuery}),
            objs := ${this._getObjectTypeQuery}
          select objs {
            __isLinked := objs in linkedObjects
          }`,
        };
      }

      return {
        query: `select (${this._getObjectTypeQuery}) {
        __isLinked := false
      }`,
      };
    } else {
      const dataView = findParent<DataView>(
        this,
        (parent) => parent instanceof DataView
      )!;

      const addedLinkIds = this.parentObject
        ? [
            ...(dataView.edits.linkEdits
              .get(this.parentObject.linkId)
              ?.changes.values() ?? []),
          ]
            .filter((change) => change.kind !== UpdateLinkChangeKind.Remove)
            .map((change) => change.id)
        : null;
      if (addedLinkIds?.length) {
        return {
          query: `select {
            (${this._baseObjectsQuery}),
            (select ${this._getObjectTypeQuery} filter .id in <uuid>array_unpack(<array<std::str>>$addedLinkIds))
          }`,
          params: {addedLinkIds},
        };
      } else {
        return {query: `select ${this._baseObjectsQuery}`};
      }
    }
  }

  @computed
  get dataQuery() {
    if (!this.fields) {
      return null;
    }

    const sortField = this.sortBy ? this.fields[this.sortBy.fieldIndex] : null;

    const inEditMode = this.parentObject?.editMode;

    const {query: baseObjectsQuery, params} = this.getBaseObjectsQuery();

    return {
      query: `WITH
    baseObjects := (${baseObjectsQuery}),
    rows := (SELECT baseObjects ${
      this.filter ? `FILTER ${this.filter}` : ""
    } ORDER BY ${inEditMode ? `.__isLinked DESC THEN` : ""}${
        sortField
          ? `${sortField.subtypeName ? `[IS ${sortField.subtypeName}]` : ""}.${
              sortField.name
            } ${this.sortBy!.direction} THEN`
          : ""
      } .id OFFSET <int32>$offset LIMIT ${fetchBlockSize})
    SELECT rows {
      id,
      ${inEditMode ? "__isLinked," : ""}
      ${this.fields
        .filter((field) => field.name !== "id")
        .map((field) => {
          const selectName = `${
            field.subtypeName ? `[IS ${field.subtypeName}]` : ""
          }.${field.name}`;

          if (field.type === ObjectFieldType.property) {
            return `${field.queryName} := ${
              field.typename === "std::str"
                ? `${selectName}[0:100]`
                : selectName
            }`;
          } else {
            return `__count_${field.queryName} := (for g in (
              group ${selectName}
              using typename := .__type__.name
              by typename
            ) union {
              typename := g.key.typename,
              count := <std::float64>count(g.elements)
            })`;
          }
        })
        .filter((line) => !!line)
        .join(",\n")}
    } `,
      params,
    };
  }

  // sorting

  @modelAction
  setSortBy(fieldIndex: number) {
    const currentDirection =
      this.sortBy?.fieldIndex === fieldIndex && this.sortBy.direction;
    const direction = currentDirection
      ? currentDirection === "ASC"
        ? "DESC"
        : null
      : "ASC";

    this.sortBy = direction
      ? {
          fieldIndex,
          direction,
        }
      : null;

    this._refreshData();
  }

  // filters

  @computed
  get filterEdited() {
    return (
      this.filterEditStr
        .toString()
        .replace(/^filter\s/i, "")
        .trim() !== this.filter
    );
  }

  @modelFlow
  applyFilter = _async(function* (this: DataInspector) {
    const filter = this.filterEditStr
      .toString()
      .replace(/^filter\s/i, "")
      .trim();

    if (!filter) {
      this.filterError = "";
      this.filter = "";

      this._refreshData(true);

      return;
    }

    const filterCheckQuery = `SELECT ${this._baseObjectsQuery} FILTER ${filter} ORDER BY .id`;

    const conn = connCtx.get(this)!;

    try {
      yield* _await(conn.parse(filterCheckQuery));
    } catch (err: any) {
      const errMessage = String(err.message);
      this.filterError = /unexpected 'ORDER'/i.test(errMessage)
        ? "Filter can only contain 'FILTER' clause"
        : errMessage;
      return;
    }

    this.filterError = "";
    this.filter = filter;

    this._refreshData(true);
  });

  @modelAction
  revertFilter() {
    this.filterEditStr = Text.of([`filter ${this.filter}`]);
    this.filterError = "";
  }

  @modelAction
  disableFilter() {
    this.filter = "";
    this.filterError = "";

    this._refreshData(true);
  }

  @modelAction
  clearFilter() {
    this.filterEditStr = Text.of(["filter "]);
    this.filterError = "";

    if (this.filter) {
      this.filter = "";
      this._refreshData(true);
    }
  }

  @modelAction
  setInitialFieldWidths(width: number) {
    this.fieldWidthsUpdated = true;
    this.fieldWidths = new Array(this.fields!.length).fill(width);
  }

  @modelAction
  setFieldWidth(fieldIndex: number, width: number) {
    this.fieldWidths[fieldIndex] = Math.max(width, 100);
  }
}

@model("ExpandedInspector")
class ExpandedInspector extends Model({
  objectId: prop<string>(),
  objectTypeName: prop<string>(),

  state: prop<InspectorState>(
    () => new InspectorState({autoExpandDepth: 3, countPrefix: "__count_"})
  ),
}) {
  onInit() {
    this.state.loadNestedData = this.loadNestedData.bind(this);

    resultGetterCtx.set(this, async () => {
      const conn = connCtx.get(this)!;
      const {result} = await conn.query(
        this.dataQuery,
        {
          objectId: this.objectId,
        },
        true
      );
      if (result) {
        return {data: result, codec: result._codec};
      }
    });
  }

  onAttachedToRootStore() {
    const dataInspector = findParent<DataInspector>(
      this,
      (parent) => parent instanceof DataInspector
    )!;

    return reaction(
      () => this.state._items.length,
      () => {
        dataInspector.gridRef?.resetAfterRowIndex(0);
      }
    );
  }

  async loadNestedData(
    parentObjectTypeName: string,
    parentObjectId: string,
    fieldName: string
  ) {
    const dbState = dbCtx.get(this)!;

    const parentObjectType = dbState.schemaData?.objectsByName.get(
      parentObjectTypeName
    );
    if (!parentObjectType) {
      throw new Error(
        `Could not find object type '${parentObjectTypeName}' in schema`
      );
    }

    const objectType = parentObjectType.links[fieldName].target!;

    const query = `with parentObj := (select ${parentObjectTypeName} filter .id = <uuid><str>$id)
      select parentObj.${fieldName} {
        ${[
          ...Object.values(objectType.properties).map((prop) => prop.name),
          ...Object.values(objectType.links).map(
            (link) => `${link.name} limit 0,
        __count_${link.name} := count(.${link.name})`
          ),
        ].join(",\n")}
      }`;

    const {result} = await dbState.connection.query(
      query,
      {
        id: parentObjectId,
      },
      true
    );

    if (!result) {
      throw new Error(`Failed to fetch nested data, query returned no data`);
    }

    return {data: result, codec: result._codec};
  }

  getItems() {
    const items = this.state.getItems();

    if (items.length) {
      return items.slice(1, -1);
    }

    return null;
  }

  toggleExpanded(index: number) {
    const item = this.state._items[index + 1];

    if (this.state.expanded?.has(item.id)) {
      this.state.collapseItem(index + 1);
    } else {
      this.state.expandItem(index + 1);
    }
  }

  @computed
  get rowsCount() {
    const itemsLength = this.state.getItems().length;
    return itemsLength ? itemsLength - 2 : 1;
  }

  @computed
  get linkFields() {
    const dataInspector = findParent<DataInspector>(
      this,
      (parent) => parent instanceof DataInspector
    )!;

    return new Set(
      dataInspector.fields
        ?.filter((field) => field.type === ObjectFieldType.link)
        .map((field) => field.name)
    );
  }

  @computed
  get dataQuery() {
    const schemaData = dbCtx.get(this)!.schemaData!;

    const objectType = schemaData.objectsByName.get(this.objectTypeName);

    if (!objectType) {
      throw new Error(
        `Could not find object type '${this.objectTypeName}' in schema`
      );
    }

    return `select ${this.objectTypeName} {
      ${[
        ...Object.values(objectType.properties).map((prop) => {
          return prop.name;
        }),
        ...Object.values(objectType.links).map((link) => {
          const linkSelect = `${link.name}: {
      ${[
        ...Object.values(link.target!.properties),
        ...Object.values(link.target!.links),
      ]
        .map((subField) =>
          subField.type === "Property"
            ? subField.name
            : `${subField.name} limit 0,
            __count_${subField.name} := count(.${subField.name})`
        )
        .join(",\n")}
    } limit 10`;
          return `${linkSelect},
    __count_${link.name} := count(.${link.name})`;
        }),
      ].join(",\n")}
    } filter .id = <uuid><str>$objectId`;
  }
}
