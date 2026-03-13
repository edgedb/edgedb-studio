import {computed, observable, action, reaction, runInAction} from "mobx";
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
  ModelCreationData,
} from "mobx-keystone";
import * as z from "zod";

import {NavigateFunction} from "../../../hooks/dbRoute";

import {Text} from "@codemirror/state";

import {CardinalityViolationError, _ICodec} from "@dbsof/platform/client";
import {ObjectCodec} from "@dbsof/platform/client";

import {ResultSet} from "../../../utils/decodeRawBuffer";

import {ObservableLRU} from "../../../state/utils/lru";

import {
  SchemaLink,
  SchemaProperty,
  SchemaType,
} from "@dbsof/common/schemaData";
import {resolveObjectTypeUnion} from "@dbsof/common/schemaData/utils";

import {InspectorState, resultGetterCtx} from "@dbsof/inspector/state";

import {dbCtx, connCtx} from "../../../state";
import {DataEditingManager, UpdateLinkChangeKind} from "./edits";
import {sessionStateCtx} from "../../../state/sessionState";
import {sortObjectTypes} from "../../../components/objectTypeSelect";

import {DataGridState} from "@dbsof/common/components/dataGrid/state";
import {deserialiseFieldConfig, serialiseFieldConfig} from "../fieldConfig";
import {
  storeLocalStorageCacheItem,
  getLocalStorageCacheItem,
} from "@dbsof/common/utils/localStorageCache";

const fetchBlockSize = 100;

type ParentObject = {
  editMode: boolean;
  objectTypeId: string;
  objectTypeName: string;
  subtypeName?: string;
  id: string | number;
  fieldName: string;
  escapedFieldName: string;
  linkId: string;
  isMultiLink: boolean;
  isComputedLink: boolean;
  readonly: boolean;
};

@model("DataView")
export class DataView extends Model({
  inspectorStack: prop<DataInspector[]>(() => []),

  edits: prop(() => new DataEditingManager({})),
}) {
  lastSelectedPath: string = "";

  @computed
  get objectTypes() {
    const objects = dbCtx.get(this)!.schemaData?.objects;
    return objects
      ? sortObjectTypes(
          [...objects.values()].filter(
            (obj) =>
              !obj.builtin &&
              !obj.unionOf &&
              !obj.insectionOf &&
              !obj.from_alias
          )
        )
      : [];
  }

  onAttachedToRootStore() {
    return reaction(
      () => dbCtx.get(this)!.schemaData,
      () => {
        this.edits.cleanupPendingEdits();
      }
    );
  }

  @modelAction
  selectObject(objectTypeId: string | undefined) {
    this.inspectorStack = objectTypeId
      ? [createDataInspectorState({objectTypeId})]
      : [];
  }

  @modelAction
  openNestedView(objectTypeId: string, parentObject: ParentObject) {
    this.inspectorStack.push(
      createDataInspectorState({objectTypeId, parentObject})
    );
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
  updateFromPath(path: string): string[] | null {
    this.lastSelectedPath = path;
    const [rootObjectTypeName, ...nestedParts] = path
      .split("/")
      .map(decodeURIComponent);
    if (rootObjectTypeName !== this.inspectorStack[0]?.objectType?.name) {
      const objTypeId = this.objectTypes.find(
        (obj) => obj.name === rootObjectTypeName
      )?.id;
      if (objTypeId) {
        this.selectObject(objTypeId);
      } else {
        this.selectObject(this.objectTypes[0]?.id);
        return [this.objectTypes[0]?.name ?? ""];
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
      const pointers = subtypeName
        ? (parentSchemaObject.unionOf ?? parentSchemaObject.descendents).find(
            (desc) => desc.name === subtypeName
          )?.pointers
        : parentSchemaObject.pointers;
      const pointer = pointers?.find((p) => p.name === pointerName);

      if (
        !pointer ||
        (typeof objId === "number" && !this.edits.insertEdits.has(objId))
      ) {
        this.inspectorStack = this.inspectorStack.slice(0, i + 1);
        return [rootObjectTypeName, ...nestedParts.slice(0, i * 2)];
      } else {
        if (
          objId !== stackItem?.parentObject!.id ||
          pointerName !== stackItem?.parentObject!.fieldName
        ) {
          this.inspectorStack[i + 1] = createDataInspectorState({
            objectTypeId: pointer.target!.id,
            parentObject: {
              editMode: false,
              objectTypeId: parentSchemaObject.id,
              objectTypeName: parentSchemaObject.name,
              subtypeName,
              id: objId,
              fieldName: pointer.name,
              escapedFieldName: pointer.escapedName,
              linkId: `${objId}__${pointer.name}`,
              isMultiLink:
                pointer.type === "Link"
                  ? pointer.cardinality === "Many"
                  : false,
              isComputedLink: !!pointer.expr,
              readonly: parentSchemaObject.readonly,
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
  indexes: number[];
  dataRowIndex: number;
  dataRowOffset: number;
  lastRow: boolean;
  state: ExpandedInspector;
};

export enum ObjectFieldType {
  property,
  link,
}

interface _BaseObjectField {
  id: string;
  subtypeName?: string;
  escapedSubtypeName?: string;
  name: string;
  escapedName: string;
  queryName: string;
  typeid: string;
  typename: string;
  escapedTypename: string;
  required: boolean;
  hasDefault: boolean;
  computedExpr: string | null;
  readonly: boolean;
  multi: boolean;
  secret: boolean;
}

export interface ObjectPropertyField extends _BaseObjectField {
  type: ObjectFieldType.property;
  default: string | null;
  schemaType: SchemaType;
}
export interface ObjectLinkField extends _BaseObjectField {
  type: ObjectFieldType.link;
  targetHasSelectAccessPolicy: boolean;
}

export type ObjectField = ObjectPropertyField | ObjectLinkField;

interface SortBy {
  fieldId: string;
  direction: "ASC" | "DESC";
}

function pointerTargetHasSelectAccessPolicy(pointer: SchemaLink) {
  return (
    pointer.expr == null &&
    !!pointer.target!.accessPolicies.some((ap) =>
      ap.access_kinds.includes("Select")
    )
  );
}

// convert + clean up old cached col widths
(function () {
  const data = Object.entries(localStorage)
    .map(([rawKey, val]) => {
      if (rawKey.startsWith("DataTableColWidths-")) {
        const key = rawKey.slice(19);
        try {
          localStorage.removeItem(rawKey);
          return [key, JSON.parse(val)];
        } catch {
          return null;
        }
      }
      return null;
    })
    .filter((entry) => entry != null);
  if (data.length) {
    localStorage.setItem("Cache-datatable-col-widths", JSON.stringify(data));
  }
})();

function createDataInspectorState(props: ModelCreationData<DataInspector>) {
  const state = new DataInspector(props);
  state.grid = new DataGridState(
    40,
    () => state.fields,
    () => [{id: "_indexCol"}, ...state.pinnedFields],
    () => state.gridRowCount,
    {
      ...deserialiseColWidths(props.objectTypeId),
      _indexCol: state.indexColWidth,
    },
    (colWidths) => {
      serialiseColWidths(props.objectTypeId, colWidths, state.allFields!);
    }
  );
  runInAction(
    () => (state.fieldConfig = deserialiseFieldConfig(props.objectTypeId))
  );

  return state;
}

const ColWidthsCacheName = "datatable-col-widths";
const CachedColWidthsType = z.record(z.number());

function serialiseColWidths(
  key: string,
  colWidths: Map<string, number>,
  fields?: Map<string, ObjectField>
) {
  storeLocalStorageCacheItem(
    ColWidthsCacheName,
    key,
    [...colWidths.entries()].reduce((widths, [id, width]) => {
      if (id !== "_indexCol" && (!fields || fields.has(id))) {
        widths[id] = width;
      }
      return widths;
    }, {} as {[id: string]: number}),
    200_000
  );
}
function deserialiseColWidths(key: string): {[id: string]: number} {
  return (
    getLocalStorageCacheItem(ColWidthsCacheName, key, CachedColWidthsType) ??
    {}
  );
}

type ErrorFilter = {filter: string; error: string};

export interface FieldConfig {
  order: string[];
  selected: Set<string>;
  pinned: Set<string>;
}

@model("DataInspector")
export class DataInspector extends Model({
  $modelId: idProp,
  objectTypeId: prop<string>(),
  parentObject: prop<ParentObject | null>(null),

  sortBy: prop<SortBy | null>(null),
  expandedInspectors: prop(() => objectMap<ExpandedInspector>()),

  // [stripped filter, original filter str]
  filter: prop<[string, string]>(() => ["", ""] as [string, string]),
  errorFilter: prop<ErrorFilter | null>(null),
  filterPanelOpen: prop<boolean>(false).withSetter(),
}) {
  grid: DataGridState = null!;

  @observable.ref
  filterEditStr = Text.of(["filter "]);

  @observable.ref
  allFields: Map<string, ObjectField> | null = null;

  @observable
  fieldConfig: FieldConfig | null = null;

  @action
  setFieldConfig(config: FieldConfig) {
    this.fieldConfig = config;
    serialiseFieldConfig(this.objectTypeId, config);
  }

  @computed
  get selectedFields() {
    const config = this.fieldConfig;
    return (
      (config?.order
        .map((id) => this.allFields?.get(id))
        .filter(
          (f) => f != null && this.fieldConfig?.selected.has(f.id)
        ) as ObjectField[]) ?? []
    );
  }

  @computed
  get fields() {
    return this.selectedFields.filter(
      (field) => !this.fieldConfig!.pinned.has(field.id)
    );
  }

  @computed
  get pinnedFields() {
    return this.selectedFields.filter((field) =>
      this.fieldConfig!.pinned.has(field.id)
    );
  }

  @computed
  get indexColWidth() {
    return (
      62 +
      Math.ceil((this.rowCount ?? this.loadedRowCount).toString().length * 7.8)
    );
  }

  @action
  setFilterEditStr(filterStr: Text) {
    this.filterEditStr = filterStr;
  }

  onAttachedToRootStore() {
    if (!this.allFields) {
      this._updateFields();
    }

    this._updateRowCount();

    const updateFieldDisposer = reaction(
      () => this.objectType,
      (objectType) => {
        if (objectType) {
          this._updateFields();
        }
      }
    );
    const refreshDataDisposer = reaction(
      () => sessionStateCtx.get(this)?.activeState,
      (state) => {
        if (state) {
          this.omittedLinks.clear();
          this._refreshData(true);
        }
      }
    );
    const refreshFieldsDataDisposer = reaction(
      () => new Set(this.selectedFields),
      () => {
        this.omittedLinks.clear();
        this._refreshData(false, true);
      },
      {
        equals: (a, b) => {
          if (a.size !== b.size) return false;
          for (const item of a) {
            if (!b.has(item)) return false;
          }
          return true;
        },
      }
    );
    const updateIndexColWidthDisposer = reaction(
      () => this.indexColWidth,
      (width) => this.grid.setColWidth("_indexCol", width)
    );

    return () => {
      this.abortFetching();

      updateFieldDisposer();
      refreshDataDisposer();
      refreshFieldsDataDisposer();
      updateIndexColWidthDisposer();
    };
  }

  @computed
  get objectType() {
    return dbCtx.get(this)?.schemaData!.objects.get(this.objectTypeId);
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
      `${basePath}/${objectId}/${
        field.subtypeName ? `[${field.subtypeName}]` : ""
      }${field.name}`
    );
    dataView.openNestedView(field.typeid, {
      editMode,
      objectTypeId: this.objectTypeId,
      objectTypeName: this.objectType!.name,
      subtypeName,
      id: objectId,
      fieldName: field.name,
      escapedFieldName: field.escapedName,
      linkId: `${objectId}__${field.name}`,
      isMultiLink: field.type === ObjectFieldType.link ? field.multi : false,
      isComputedLink: !!field.computedExpr,
      readonly: this.objectType!.readonly,
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

  @computed
  get subTypes() {
    const obj = this.objectType;
    if (!obj) {
      return [];
    }
    return obj.unionOf
      ? [
          ...new Set(
            resolveObjectTypeUnion(obj).flatMap((type) => [
              type,
              ...type.descendents,
            ])
          ),
        ]
      : obj.descendents;
  }

  @modelAction
  _updateFields() {
    const obj = this.objectType;

    if (!obj) {
      throw new Error(`Cannot find schema object id: ${this.objectTypeId}`);
    }

    let i = 0;
    function createField(
      pointer: SchemaProperty | SchemaLink,
      subtypeName?: string,
      escapedSubtypeName?: string,
      queryNamePrefix: string = ""
    ): ObjectField {
      const defaultVal =
        pointer.default ??
        (pointer.target?.schemaType === "Scalar" && pointer.target.isSequence
          ? "sequence_next()"
          : null);
      const baseField = {
        id: pointer.id,
        subtypeName,
        escapedSubtypeName,
        name: pointer.name,
        escapedName: pointer.escapedName,
        queryName:
          pointer.name === "id"
            ? "id"
            : queryNamePrefix +
              pointer.name.replace(/^[^A-Za-z_]|[^A-Za-z0-9_]/g, "") +
              `_${i++}`,
        typeid: pointer.target!.id,
        typename: pointer.target!.name,
        escapedTypename:
          "escapedName" in pointer.target!
            ? pointer.target!.escapedName
            : pointer.target!.name,
        required: pointer.required,
        hasDefault: defaultVal != null,
        multi: pointer.cardinality === "Many",
        computedExpr: pointer.expr,
        readonly: pointer.readonly,
        secret: pointer.secret,
      };

      if (pointer.type === "Property") {
        return {
          type: ObjectFieldType.property,
          ...baseField,
          schemaType: pointer.target!,
          default: defaultVal?.replace(/^select/i, "").trim() ?? null,
        };
      } else {
        return {
          type: ObjectFieldType.link,
          ...baseField,
          targetHasSelectAccessPolicy:
            pointerTargetHasSelectAccessPolicy(pointer),
        };
      }
    }

    const baseFields = [
      ...Object.values(obj.properties),
      ...Object.values(obj.links),
    ].map((pointer) => createField(pointer));

    const baseFieldNames = new Set(baseFields.map((field) => field.name));

    const subtypeFields = this.subTypes
      .filter((subType) => !subType.abstract && !subType.from_alias)
      .flatMap((subtypeObj) => {
        const queryNamePrefix = `__${subtypeObj.name.replace(/:/g, "")}_`;

        return [
          ...Object.values(subtypeObj.properties),
          ...Object.values(subtypeObj.links),
        ]
          .filter((pointer) => !baseFieldNames.has(pointer.name))
          .map((pointer) =>
            createField(
              pointer,
              subtypeObj.name,
              subtypeObj.escapedName,
              queryNamePrefix
            )
          );
      });

    const fields = [...baseFields, ...subtypeFields];
    this.allFields = new Map(fields.map((field) => [field.id, field]));
    const idField = fields.find((f) => f.name === "id");
    if (!this.fieldConfig) {
      this.fieldConfig = {
        order: fields
          .sort((a, b) => (a.name === "id" ? -1 : b.name === "id" ? 1 : 0))
          .map((f) => f.id),
        selected: new Set(baseFields.filter((f) => f.name !== "id").map((f) => f.id)),
        pinned: new Set(),
      };
    } else {
      const order = this.fieldConfig.order.filter((id) =>
        this.allFields!.has(id)
      );
      const newFieldIds = fields
        .filter((f) => !order.includes(f.id))
        .map((f) => f.id);
      order.push(...newFieldIds);
      const selected = new Set(
        [...this.fieldConfig.selected].filter(
          (id) => this.allFields!.has(id) && (!idField || id !== idField.id)
        )
      );
      const pinned = new Set(
        [...this.fieldConfig.pinned].filter(
          (id) => this.allFields!.has(id) && (!idField || id !== idField.id)
        )
      );
      for (const field of baseFields) {
        if (newFieldIds.includes(field.id)) {
          selected.add(field.id);
        }
      }
      this.setFieldConfig({order, selected, pinned});
    }
  }

  @observable
  omittedLinks = new Set<string>();

  @computed
  get insertTypeNames() {
    const objectType = this.objectType;

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

  // offset handling

  @observable
  rowCount: number | null = null;
  @observable
  loadedRowCount: number = 0;

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
      (this.rowCount ??
        (this.loadedRowCount > 0 ? this.loadedRowCount + 1 : fetchBlockSize)) +
      this.expandedRows.reduce(
        (sum, row) => sum + row.inspector.rowsCount,
        0
      ) +
      this.insertedRows.length
    );
  }

  @action
  updateVisibleOffsets(startIndex: number, endIndex: number) {
    const startRow = this.getRowData(startIndex);
    const endRow = this.getRowData(endIndex);

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

    if (
      !this.runningDataFetch ||
      !this._pendingOffsets.includes(this.runningDataFetch.offset)
    ) {
      this._fetchData();
    }
  }

  getRowData(rowIndex: number): DataRowData | ExpandedRowData {
    let index = rowIndex;
    for (const expandedRow of this.expandedRows) {
      if (index <= expandedRow.dataRowIndex) {
        break;
      }

      const expandedLength = expandedRow.inspector.rowsCount;
      const itemsLength = expandedRow.inspector.itemsLength;

      if (index <= expandedRow.dataRowIndex + expandedLength) {
        const startTop = (index - expandedRow.dataRowIndex - 1) * 40;
        let expandedIndex = Math.ceil(Math.max(0, startTop - 6) / 28);
        const indexes = [];
        while (
          expandedIndex < itemsLength &&
          6 + expandedIndex * 28 < startTop + 40
        ) {
          indexes.push(expandedIndex++);
        }
        return {
          kind: RowKind.expanded,
          indexes,
          dataRowIndex: expandedRow.dataRowIndex,
          dataRowOffset: index - expandedRow.dataRowIndex - 1,
          lastRow: index === expandedRow.dataRowIndex + expandedLength,
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

  _runningRowCount: AbortController | null = null;

  @modelFlow
  _updateRowCount = _async(function* (this: DataInspector) {
    const conn = connCtx.get(this)!;
    const dbState = dbCtx.get(this)!;

    const tableName = this.objectType?.name;
    if (!tableName) return;
    dbState.setLoadingTab(DataView, true);

    this._runningRowCount?.abort();
    this._runningRowCount = new AbortController();
    this.rowCount = null;

    const filterClause = this.filter[0]?.trim();
    const whereClause = filterClause ? `WHERE ${filterClause}` : "";

    try {
      const data = yield* _await(
        conn.query(
          `SELECT COUNT(*) FROM "${tableName}" ${whereClause}`,
          undefined,
          undefined,
          this._runningRowCount.signal
        )
      );
      this._runningRowCount = null;

      if (data.result) {
        this.rowCount = parseInt(data.result[0], 10);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // ignore aborted query error
      } else {
        this.dataFetchingError = err as Error;
        console.error(err);
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

  @observable
  expandedRowMobile: number = -1;

  @action
  setExpandedRowMobile(rowIndex: number) {
    this.expandedRowMobile = rowIndex;
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

  data = new ObservableLRU<number, ResultSet>(20);

  @observable.ref
  dataCodecs: Map<string, _ICodec> | null = null;

  @observable
  runningDataFetch: {abortController: AbortController; offset: number} | null =
    null;

  @computed
  get fetchingData() {
    return this.runningDataFetch != null;
  }

  @action
  abortFetching() {
    this.runningDataFetch?.abortController.abort();
    this.runningDataFetch = null;

    this._runningRowCount?.abort();
    this._runningRowCount = null;
  }

  @observable.ref
  dataFetchingError: Error | null = null;

  @observable.shallow
  fullyFetchedData = new Map<string, any>();

  fetchFullCellData(
    dataId: string | number,
    value: any,
    field: ObjectPropertyField
  ) {
    if (typeof dataId !== "string") {
      return value;
    }

    const cellId = `${dataId}__${field.name}`;

    if (this.fullyFetchedData.has(cellId)) {
      return this.fullyFetchedData.get(cellId);
    }

    const isTruncated =
      field.schemaType.name === "std::str" &&
      (field.multi
        ? Array.isArray(value) &&
          typeof value[0] === "string" &&
          value.some((val) => val.length === 100)
        : typeof value === "string" && value.length === 100);

    if (!isTruncated) {
      return value;
    }

    const tableName = this.objectType?.name;
    if (!tableName) {
      return value;
    }

    const query = `SELECT "${field.name}" FROM "${tableName}" WHERE id = :id`;

    const conn = connCtx.get(this)!;
    return conn.query(query, {id: dataId}).then(({result}) => {
      const val = field.multi ? result! : result![0];
      runInAction(() => {
        this.fullyFetchedData.set(cellId, val);
      });
      return val;
    });
  }

  @modelFlow
  _fetchData = _async(function* (this: DataInspector) {
    const offset = this._pendingOffsets[0];

    if (offset === undefined) {
      return;
    }

    this.runningDataFetch?.abortController.abort();

    const dbState = dbCtx.get(this);
    if (!dbState) {
      return;
    }

    this.runningDataFetch = {abortController: new AbortController(), offset};
    dbState.setLoadingTab(DataView, true);

    let fetchNextOffset = false;

    try {
      const conn = connCtx.get(this)!;
      const dataQuery = this.dataQuery;

      // console.log(dataQuery);

      if (dataQuery) {
        // console.log(`fetching ${offset}`);
        const data = yield* _await(
          conn.query(
            dataQuery.query,
            {
              offset: offset * fetchBlockSize,
              ...dataQuery.params,
            },
            undefined,
            this.runningDataFetch.abortController.signal
          )
        );

        this.runningDataFetch = null;
        this.dataFetchingError = null;

        // console.log(offset, data.duration);

        if (data.result) {
          // console.log(`data ${offset}, length ${data.result.length}`);
          this._setData(offset, data.result);
        }

        this._pendingOffsets = this._pendingOffsets.filter(
          (po) => po !== offset
        );

        fetchNextOffset = true;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // ignore aborted fetches
      } else if (err instanceof CardinalityViolationError) {
        const match = err.message.match(
          /^required link '.+' of object type '.+' is hidden by access policy \(while evaluating computed link '(.+)' of object type '.+'\)$/
        );
        if (match) {
          this.omittedLinks.add(match[1]);
          fetchNextOffset = true;
        } else {
          this.dataFetchingError = err;
          console.error(err);
        }
      } else {
        this.dataFetchingError = err as Error;
        console.error(err);
      }
    } finally {
      dbState.setLoadingTab(DataView, false);
    }

    if (fetchNextOffset) {
      this._fetchData();
    }
  });

  @modelAction
  _setData(offset: number, data: ResultSet) {
    this.data.set(offset, data);

    const endCount = offset * fetchBlockSize + data.length;
    this.loadedRowCount = Math.max(this.loadedRowCount, endCount);
    if (data.length !== fetchBlockSize && endCount !== this.rowCount) {
      // not a full block of rows, so we're at the end
      // and known row count doesn't match, so update the count
      this.rowCount = endCount;
      this.loadedRowCount = endCount;
    }

    if (!this.dataCodecs) {
      const codec = data._codec as ObjectCodec;
      const codecs = codec.getSubcodecs();
      const codecNames = codec.getFields().map((f) => f.name);
      this.dataCodecs = new Map(
        codecNames.map((name, i) => [name, codecs[i]])
      );
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
  _refreshData(updateCount: boolean = false, fieldsChanged: boolean = false) {
    this.data.clear();
    this.loadedRowCount = 0;
    if (fieldsChanged) {
      this.dataCodecs = null;
    }
    this.expandedRows = [];
    this._pendingOffsets = [...this.visibleOffsets];
    this.fullyFetchedData.clear();

    if (updateCount) {
      this._updateRowCount();
    }
    this._fetchData();
  }

  // queries

  @computed
  get dataQuery() {
    if (!this.selectedFields.length || !this.objectType) {
      return null;
    }

    const tableAlias = "t";
    const selectCols = [`${tableAlias}."id" AS "id"`];
    const linkCounts: string[] = [];
    for (const field of this.selectedFields) {
      if (field.name === "id" || field.secret) continue;
      if (field.type === ObjectFieldType.property) {
        selectCols.push(
          `${tableAlias}."${field.escapedName}" AS "${field.queryName}"`
        );
      } else {
        const pointer = this.objectType?.links[field.name];
        const countAlias = `"__count_${field.queryName}"`;
        if ((pointer as any)?._refSource && (pointer as any)?._refColumn) {
          const fkSource = (pointer as any)._refSource;
          const fkCol = (pointer as any)._refColumn;
          linkCounts.push(
            `(SELECT COUNT(*) FROM "${fkSource}" src WHERE src."${fkCol}" = ${tableAlias}."id") AS ${countAlias}`
          );
        } else if (pointer?.source?.name === this.objectType?.name) {
          const fkCol = pointer.expr || `${field.name}_id`;
          linkCounts.push(
            `CASE WHEN ${tableAlias}."${fkCol}" IS NULL THEN 0 ELSE 1 END AS ${countAlias}`
          );
        } else {
          linkCounts.push(`0 AS ${countAlias}`);
        }
      }
    }
    const filterClause = this.filter[0]?.trim();
    const whereClause = filterClause ? `WHERE ${filterClause}` : "";
    const sortClause = this.sortBy
      ? `ORDER BY "${this.sortBy!.fieldId}" ${this.sortBy!.direction}`
      : "ORDER BY id";

    return {
      query: `SELECT ${[...selectCols, ...linkCounts].join(", ")} FROM "${
        this.objectType.name
      }" ${tableAlias}
      ${whereClause}
      ${sortClause} LIMIT ${fetchBlockSize} OFFSET :offset`,
      params: {offset: 0},
    };
  }

  // sorting

  @modelAction
  setSortBy(fieldId: string) {
    const currentDirection =
      this.sortBy?.fieldId === fieldId && this.sortBy.direction;
    const direction = currentDirection
      ? currentDirection === "ASC"
        ? "DESC"
        : null
      : "ASC";

    this.sortBy = direction
      ? {
          fieldId,
          direction,
        }
      : null;

    this._refreshData();
  }

  // filters

  _getStrippedFilter() {
    const filter = this.filterEditStr.toString();
    const lines = filter.split("\n");
    const start = lines.findIndex((line) => !/^\s*#/.test(line));
    const cleaned = lines
      .slice(start === -1 ? 0 : start)
      .join("\n")
      .trim();
    const withoutKeyword = cleaned
      .replace(/^(filter|where)\s+/i, "")
      .trim()
      .replace(/;+$/, "");

    return [withoutKeyword, filter] as [string, string];
  }

  @computed
  get filterEdited() {
    if (this.errorFilter) {
      return this._getStrippedFilter()[0] !== this.errorFilter.filter;
    }
    return this._getStrippedFilter()[0] !== this.filter[0];
  }

  @modelFlow
  applyFilter = _async(function* (this: DataInspector) {
    const [filter, origFilter] = this._getStrippedFilter();

    this.errorFilter = null;
    this.filter = filter ? [filter, origFilter] : ["", ""];

    this.abortFetching();
    this._refreshData(true);
  });

  @modelAction
  revertFilter() {
    this.filterEditStr = Text.of([this.filter[1]]);
    this.errorFilter = null;
  }

  @modelAction
  disableFilter() {
    this.filter = ["", ""];
    this.errorFilter = null;

    this._refreshData(true);
  }

  @modelAction
  clearFilter() {
    this.filterEditStr = Text.of(["filter "]);
    this.errorFilter = null;

    if (this.filter[0]) {
      this.filter = ["", ""];
      this._refreshData(true);
    }
  }
}

@model("ExpandedInspector")
class ExpandedInspector extends Model({
  objectId: prop<string>(),
  objectTypeName: prop<string>(),

  state: prop<InspectorState>(
    () =>
      new InspectorState({
        autoExpandDepth: 3,
        countPrefix: "__count_",
        ignorePrefix: "__",
        noMultiline: true,
      })
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
        {newCodec: true}
      );
      if (result) {
        return {data: result, codec: result._codec};
      }
    });
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

    const link = parentObjectType.links[fieldName];
    if (!link || !link.target) {
      throw new Error(`Could not find link '${fieldName}' on ${parentObjectTypeName}`);
    }

    const objectType = link.target;

    const selectCols = [
      ...Object.values(objectType.properties)
        .filter((p) => !p.secret)
        .map((prop) => `"${prop.name}"`),
    ];
    if (!selectCols.includes(`"id"`)) {
      selectCols.unshift(`"id"`);
    }

    const fkColumn = link.expr || `${fieldName}_id`;
    const sourceTable =
      (link as any)?._refSource && (link as any)?._refColumn
        ? (link as any)._refSource
        : parentObjectType.name;
    const sourceFkCol =
      (link as any)?._refColumn && link.source?.name !== parentObjectType.name
        ? (link as any)._refColumn
        : fkColumn;

    const query = `SELECT ${selectCols.join(", ")} FROM "${objectType.name}" target
      JOIN "${sourceTable}" source ON source."${sourceFkCol}" = target.id
      WHERE source.id = :id`;

    const {result} = await dbState.connection!.query(
      query,
      {
        id: parentObjectId,
      },
      {newCodec: true}
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
  get itemsLength() {
    const itemsLength = this.state.getItems().length;
    return itemsLength ? itemsLength - 2 : 1;
  }

  @computed
  get rowsCount() {
    return Math.ceil((this.itemsLength * 28 + 12) / 40);
  }

  @computed
  get linkFields() {
    const dataInspector = findParent<DataInspector>(
      this,
      (parent) => parent instanceof DataInspector
    )!;

    return new Set(
      [...(dataInspector.allFields?.values() ?? [])]
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

    const selectCols = [
      ...Object.values(objectType.properties)
        .filter((p) => !p.secret)
        .map((prop) => `"${prop.name}"`),
    ];
    if (!selectCols.includes(`"id"`)) {
      selectCols.unshift(`"id"`);
    }

    return `SELECT ${selectCols.join(", ")} FROM "${objectType.name}"
      WHERE id = :objectId
      LIMIT 1`;
  }
}
