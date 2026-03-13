import {createContext, useContext, useEffect, useLayoutEffect} from "react";
import {observer} from "mobx-react-lite";

import cn from "@dbsof/common/utils/classNames";

import {InspectorRow} from "@dbsof/inspector";
import inspectorStyles from "@dbsof/inspector/inspector.module.scss";

import styles from "./dataInspector.module.scss";

import {
  DataInspector as DataInspectorState,
  DataRowData,
  ExpandedRowData,
  ObjectField,
  ObjectFieldType,
  RowKind,
} from "./state";
import {
  DataEditingManager,
  InsertObjectEdit,
  UpdateLinkChangeKind,
} from "./state/edits";

import {useDBRouter} from "../../hooks/dbRoute";

import {SortIcon, SortedDescIcon} from "./icons";
import {
  DeleteIcon,
  UndeleteIcon,
  UndoChangesIcon,
  WarningIcon,
} from "../../icons";
import {PrimitiveType} from "../../components/dataEditor";
import {DataEditor} from "../../components/dataEditor/editor";
import {renderInvalidEditorValue} from "../../components/dataEditor/utils";

import {ArrowRightIcon, ChevronDownIcon} from "@dbsof/common/newui";

import {
  DataGrid,
  GridContent,
  GridHeaders,
  HeaderResizeHandle,
} from "@dbsof/common/components/dataGrid";
import gridStyles from "@dbsof/common/components/dataGrid/dataGrid.module.scss";
import {renderCellValue} from "@dbsof/common/components/dataGrid/renderUtils";

import {DefaultColumnWidth} from "@dbsof/common/components/dataGrid/state";
import {calculateInitialColWidths} from "@dbsof/common/components/dataGrid/utils";
import {FieldConfigButton} from "./fieldConfig";

const DataInspectorContext = createContext<{
  state: DataInspectorState;
  edits: DataEditingManager;
} | null>(null);

const useDataInspectorState = () => {
  return useContext(DataInspectorContext)!;
};

interface DataInspectorProps {
  state: DataInspectorState;
  edits: DataEditingManager;
}

export default observer(function DataInspectorTable({
  state,
  edits,
}: DataInspectorProps) {
  useEffect(() => {
    if (
      state.grid.gridContainerSize.width > 0 &&
      state.allFields !== null &&
      state.grid._colWidths.size <= 1
    ) {
      state.grid.setColWidths(
        calculateInitialColWidths(
          state.selectedFields.map(({id, typename, type}) => ({
            id,
            typename,
            isLink: type === ObjectFieldType.link,
          })),
          state.grid.gridContainerSize.width - state.indexColWidth - 40
        )
      );
    }
  }, [state.allFields, state.grid.gridContainerSize.width]);

  return (
    <DataInspectorContext.Provider value={{state, edits}}>
      <DataGrid state={state.grid}>
        <DataViewHeaders state={state} />
        <DataViewContent state={state} />
      </DataGrid>
    </DataInspectorContext.Provider>
  );
});

const DataViewHeaders = observer(function DataViewHeaders({
  state,
}: {
  state: DataInspectorState;
}) {
  let lastSubtype: {name: string; startIndex: number} | null = null;
  const headers: JSX.Element[] = [];
  const fields = state.fields ?? [];
  for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex++) {
    const field = fields[fieldIndex];
    headers.push(
      <FieldHeader
        key={field.id}
        colIndex={fieldIndex}
        field={field}
        isOmitted={state.omittedLinks.has(field.name)}
      />,
      <HeaderResizeHandle
        key={`resize-${field.id}`}
        state={state.grid}
        columnId={field.id}
        style={{
          gridColumn: fieldIndex + 3,
          gridRow: 2,
        }}
      />
    );
    if (lastSubtype && lastSubtype.name !== field.subtypeName) {
      headers.push(
        <FieldSubtypeHeader
          key={`${lastSubtype.name}-${lastSubtype.startIndex}`}
          {...lastSubtype}
          endIndex={fieldIndex}
        />
      );
    }
    lastSubtype =
      field.subtypeName != null
        ? lastSubtype && lastSubtype.name === field.subtypeName
          ? lastSubtype
          : {name: field.subtypeName, startIndex: fieldIndex}
        : null;
  }
  if (lastSubtype) {
    headers.push(
      <FieldSubtypeHeader
        key={`${lastSubtype.name}-${lastSubtype.startIndex}`}
        {...lastSubtype}
        endIndex={fields.length}
      />
    );
    lastSubtype = null;
  }

  const pinnedHeaders: JSX.Element[] = [
    <FieldConfigButton key="_fieldConfig" state={state} />,
  ];
  const pinnedFields = state.pinnedFields ?? [];
  for (let fieldIndex = 0; fieldIndex < pinnedFields.length; fieldIndex++) {
    const field = pinnedFields[fieldIndex];
    const lastField = fieldIndex === pinnedFields.length - 1;
    pinnedHeaders.push(
      <FieldHeader
        key={field.id}
        colIndex={fieldIndex}
        field={field}
        isOmitted={state.omittedLinks.has(field.name)}
      />,
      <HeaderResizeHandle
        key={`resize-${field.id}`}
        className={lastField ? gridStyles.lastPinned : undefined}
        state={state.grid}
        columnId={field.id}
        style={{
          gridColumn: fieldIndex + 3,
          gridRowStart: lastField ? 1 : 2,
          gridRowEnd: 3,
        }}
      />
    );

    if (lastSubtype && lastSubtype.name !== field.subtypeName) {
      pinnedHeaders.push(
        <FieldSubtypeHeader
          key={`${lastSubtype.name}-${lastSubtype.startIndex}`}
          {...lastSubtype}
          endIndex={fieldIndex}
        />
      );
    }
    lastSubtype =
      field.subtypeName != null
        ? lastSubtype && lastSubtype.name === field.subtypeName
          ? lastSubtype
          : {name: field.subtypeName, startIndex: fieldIndex}
        : null;
  }
  if (lastSubtype) {
    pinnedHeaders.push(
      <FieldSubtypeHeader
        key={`${lastSubtype.name}-${lastSubtype.startIndex}`}
        {...lastSubtype}
        endIndex={fields.length}
      />
    );
  }

  return (
    <GridHeaders
      className={styles.headers}
      state={state.grid}
      pinnedHeaders={pinnedHeaders}
      headers={headers}
    />
  );
});

function FieldSubtypeHeader({
  name,
  startIndex,
  endIndex,
}: {
  name: string;
  startIndex: number;
  endIndex: number;
}) {
  return (
    <div
      className={styles.subtypeRangeHeader}
      style={{
        gridRow: 1,
        gridColumnStart: startIndex + 2,
        gridColumnEnd: endIndex + 2,
      }}
    >
      <div className={styles.subtypeLabel}>{name}</div>
    </div>
  );
}

interface FieldHeaderProps {
  colIndex: number;
  field: ObjectField;
  isOmitted: boolean;
}

const FieldHeader = observer(function FieldHeader({
  colIndex,
  field,
  isOmitted,
}: FieldHeaderProps) {
  const {state} = useDataInspectorState();

  const sortDir = state.sortBy?.fieldId === field.id && state.sortBy.direction;

  return (
    <div
      className={styles.headerField}
      style={{
        gridColumn: colIndex + 2,
        gridRow: 2,
      }}
    >
      {isOmitted ? (
        <div className={styles.fieldWarning}>
          <WarningIcon />
          <div>
            Cannot fetch link data: target of required link is hidden by access
            policy
          </div>
        </div>
      ) : null}
      <div className={styles.fieldTitle}>
        <div className={styles.fieldName}>
          {field.name}
          {field.computedExpr ? <span>:=</span> : null}
        </div>
        <div className={styles.fieldTypename}>
          {field.multi ? "multi " : ""}
          {field.typename}
        </div>
      </div>

      {!field.secret &&
      field.type === ObjectFieldType.property &&
      field.name !== "id" ? (
        <div
          className={cn(styles.fieldSort, {
            [styles.fieldSorted]: !!sortDir,
            [styles.fieldSortAsc]: sortDir === "ASC",
          })}
          onClick={() => state.setSortBy(field.id)}
        >
          {sortDir ? <SortedDescIcon /> : <SortIcon />}
        </div>
      ) : null}
    </div>
  );
});

const DataViewContent = observer(function DataViewContent({
  state,
}: {
  state: DataInspectorState;
}) {
  const ranges = state.grid.visibleRanges;

  useLayoutEffect(() => {
    state.updateVisibleOffsets(...ranges.rows);
  });

  const cells: JSX.Element[] = [];
  const pinnedCells: JSX.Element[] = [];

  const fields = state.fields?.slice(ranges.cols[0], ranges.cols[1] + 1) ?? [];

  for (let rowIndex = ranges.rows[0]; rowIndex < ranges.rows[1]; rowIndex++) {
    const rowDataIndex = rowIndex - state.insertedRows.length;
    const rowData = rowDataIndex >= 0 ? state.getRowData(rowDataIndex) : null;

    pinnedCells.push(
      <StickyRow
        key={`_indexCol.${rowDataIndex}`}
        state={state}
        rowIndex={rowIndex}
        rowData={rowData}
      />
    );

    if (rowData && rowData.kind !== RowKind.data) {
      if (rowData.kind === RowKind.expanded && rowData.lastRow) {
        cells.push(
          <ExpandedEndCell
            key={`_expandedEnd-${rowIndex}`}
            state={state}
            rowIndex={rowIndex}
          />
        );
      }
      continue;
    }

    const insertedRow = !rowData ? state.insertedRows[rowIndex] : null;
    const data = rowData ? state.getData(rowData.index) : insertedRow!.data;

    let columnIndex = 1;
    for (const field of state.pinnedFields) {
      pinnedCells.push(
        <GridCellWrapper
          key={`${field.id}.${rowDataIndex}`}
          state={state}
          field={field}
          columnIndex={columnIndex++}
          rowIndex={rowIndex}
          data={data}
          insertedRow={insertedRow}
        />
      );
    }

    columnIndex += ranges.cols[0];
    for (const field of fields) {
      cells.push(
        <GridCellWrapper
          key={`${field.id}.${rowDataIndex}`}
          state={state}
          field={field}
          columnIndex={columnIndex++}
          rowIndex={rowIndex}
          data={data}
          insertedRow={insertedRow}
        />
      );
    }
  }

  return (
    <GridContent
      className={cn(inspectorStyles.inspectorTheme)}
      style={{
        paddingBottom:
          state.grid.gridContainerSize.height - state.grid.headerHeight - 40,
      }}
      state={state.grid}
      cells={cells}
      pinnedCells={pinnedCells}
    />
  );
});

const GridCellWrapper = observer(function GridCellWrapper({
  state,
  field,
  columnIndex,
  rowIndex,
  data,
  insertedRow,
}: {
  state: DataInspectorState;
  field: ObjectField;
  columnIndex: number;
  rowIndex: number;
  data: any;
  insertedRow: InsertObjectEdit | null;
}) {
  const isEmptyCell =
    field.subtypeName &&
    data?.__tname__ &&
    data?.__tname__ !== field.subtypeName;

  return (
    <div
      className={cn(gridStyles.cell, {
        [gridStyles.emptyCell]: isEmptyCell,
        [gridStyles.lastPinned]: columnIndex === state.pinnedFields.length,
        [styles.firstCol]: columnIndex === state.pinnedFields.length + 1,
        [styles.hoveredCell]: state.hoverRowIndex === rowIndex,
      })}
      style={{
        top: rowIndex * 40,
        left: state.grid.colLefts[columnIndex],
        width: state.grid._colWidths.get(field.id) ?? DefaultColumnWidth,
      }}
      onMouseEnter={() => state.setHoverRowIndex(rowIndex)}
      onMouseLeave={() => state.setHoverRowIndex(null)}
    >
      {!isEmptyCell ? (
        <GridCell field={field} data={data} insertedRow={insertedRow} />
      ) : null}
    </div>
  );
});

const ExpandedEndCell = observer(function ExpandedEndCell({
  state,
  rowIndex,
}: {
  state: DataInspectorState;
  rowIndex: number;
}) {
  return (
    <div
      className={cn(gridStyles.cell)}
      style={{
        top: rowIndex * 40,
        left: 0,
        width: state.grid.gridContentWidth,
        borderRight: 0,
      }}
    />
  );
});

const GridCell = observer(function GridCell({
  field,
  data,
  insertedRow,
}: {
  field: ObjectField;
  data: any;
  insertedRow: InsertObjectEdit | null;
}) {
  const {state, edits} = useDataInspectorState();
  const {navigate, currentPath} = useDBRouter();

  const isDeletedRow = edits.deleteEdits.has(data?.id);

  const cellId = `${data?.id}__${field.name}`;

  const cellEditState = edits.propertyEdits.get(cellId);
  const linkEditState = edits.linkEdits.get(cellId);

  const editedLink =
    state.parentObject && edits.linkEdits.get(state.parentObject.linkId);
  const editedLinkChange = editedLink?.changes.get(data?.id);

  const _value =
    cellEditState?.value !== undefined
      ? cellEditState.value.value
      : data?.[insertedRow ? field.name : field.queryName] ?? null;

  const value = insertedRow && _value ? _value.value : _value;

  if (
    !isDeletedRow &&
    field.type === ObjectFieldType.property &&
    edits.activePropertyEdit?.cellId === cellId
  ) {
    return !edits.activePropertyEdit.loaded ? (
      <div className={styles.fetchingDataPlaceholder}>loading...</div>
    ) : (
      <DataEditor state={edits.activePropertyEdit} />
    );
  }

  let content: JSX.Element | null = null;
  let selectable = false;
  if (data) {
    if (field.secret) {
      content = <span className={styles.emptySet}>secret data hidden</span>;
    } else if (field.type === ObjectFieldType.property) {
      const undoEdit =
        !isDeletedRow && !!cellEditState ? (
          <div
            className={styles.undoCellChanges}
            onClick={() => edits.clearPropertyEdit(data?.id, field.name)}
          >
            <UndoChangesIcon />
          </div>
        ) : null;

      if ((insertedRow && field.name === "id") || value === null) {
        content = (
          <>
            <span className={styles.emptySet}>
              {(insertedRow ? field.default ?? field.computedExpr : null) ??
                "{}"}
            </span>
            {undoEdit}
          </>
        );
      } else {
        const codec = state.dataCodecs?.get(field.queryName);

        if (codec) {
          content = (
            <>
              {(cellEditState && !cellEditState.value.valid) ||
              (insertedRow && _value && !_value.valid) ? (
                <span className={styles.invalidValue}>
                  {renderInvalidEditorValue(
                    value,
                    field.schemaType as PrimitiveType
                  )}
                </span>
              ) : (
                renderCellValue(value, codec)
              )}
              {undoEdit}
            </>
          );
          selectable = true;
        }
      }
    } else {
      const countData = data?.[`__count_${field.queryName}`];
      if (countData !== null || insertedRow) {
        let totalCount = field.multi || !linkEditState ? countData ?? 0 : 0;

        if (linkEditState) {
          let editCount = 0;
          for (const change of linkEditState.changes.values()) {
            if (change.kind === UpdateLinkChangeKind.Set) {
              totalCount = 1;
            } else {
              editCount += change.kind === UpdateLinkChangeKind.Add ? 1 : -1;
            }
          }
          editCount += linkEditState.inserts.size;

          // we limit totalCount to 120 so if it equals that we don't know the
          // true count, so don't apply editCount corrections
          if (totalCount !== 120) {
            totalCount = Math.max(0, totalCount + editCount);
          }
        }

        if (totalCount === 0) {
          content = (
            <>
              <span className={styles.emptySet}>
                {field.required && !insertedRow && !linkEditState
                  ? "hidden by access policy"
                  : "{}"}
              </span>
              <ArrowRightIcon />
            </>
          );
        } else {
          content = (
            <>
              <div className={styles.linksCell}>
                {totalCount > 100 ? "100+" : totalCount}{" "}
                <span>object{totalCount != 1 ? "s" : ""}</span>
              </div>
              <ArrowRightIcon />
            </>
          );
        }
      }
    }
  }

  const isEditable =
    !field.computedExpr &&
    !state.objectType?.readonly &&
    (!field.readonly || insertedRow) &&
    data &&
    (field.type === ObjectFieldType.link || field.name !== "id");

  return (
    <div
      className={cn(styles.cell, {
        [styles.selectable]: selectable,
        [styles.loadingCell]: !data,
        [styles.isDeleted]:
          isDeletedRow ||
          editedLinkChange?.kind === UpdateLinkChangeKind.Remove ||
          (!insertedRow &&
            !state.parentObject?.isMultiLink &&
            !!editedLink &&
            (state.parentObject?.editMode
              ? !!data?.__isLinked
              : !editedLinkChange)),
        [styles.editableCell]:
          !isDeletedRow &&
          isEditable &&
          field.type === ObjectFieldType.property,
        [styles.linkCell]: field.type === ObjectFieldType.link,
        [styles.hasEdits]:
          !isDeletedRow &&
          !insertedRow &&
          (!!cellEditState || !!linkEditState),
        [styles.hasErrors]:
          isEditable &&
          ((cellEditState && !cellEditState.value.valid) ||
            (insertedRow && _value && !_value.valid) ||
            (insertedRow &&
              isEditable &&
              field.required &&
              !field.hasDefault &&
              value === null &&
              !linkEditState)),
      })}
      onClick={() => {
        if (field.type === ObjectFieldType.link && content !== null) {
          state.openNestedView(
            currentPath.join("/"),
            navigate,
            data.id,
            data.__tname__,
            field,
            typeof data.id === "number"
          );
        }
      }}
      onDoubleClick={() => {
        if (isEditable) {
          if (field.type === ObjectFieldType.property) {
            edits.startEditingCell(data.id, data.__tname__, field, () =>
              state.fetchFullCellData(data.id, value, field)
            );
          } else {
            state.openNestedView(
              currentPath.join("/"),
              navigate,
              data.id,
              data.__tname__,
              field,
              true
            );
          }
        }
      }}
    >
      {content}
    </div>
  );
});

interface StickyRowProps {
  state: DataInspectorState;
  rowIndex: number;
  rowData: DataRowData | ExpandedRowData | null;
}

const StickyRow = observer(function StickyRow({
  state,
  rowIndex,
  rowData,
}: StickyRowProps) {
  // const isMobile = useIsMobile();
  if (rowData?.kind === RowKind.expanded) {
    // return isMobile ? (
    //   <MobileDataInspector rowData={rowData} />
    // ) : (
    return <ExpandedDataInspector rowIndex={rowIndex} rowData={rowData} />;
    // );
  } else {
    return (
      <DataRowIndex
        rowIndex={rowIndex}
        dataIndex={rowData?.index ?? null}
        active={state.hoverRowIndex === rowIndex}
      />
    );
  }
});

const DataRowIndex = observer(function DataRowIndex({
  rowIndex,
  dataIndex,
  active,
}: {
  rowIndex: number;
  dataIndex: number | null;
  active: boolean;
}) {
  const {state, edits} = useDataInspectorState();

  // const isMobile = useIsMobile();

  if (
    dataIndex !== null &&
    dataIndex >= (state.rowCount ?? state.loadedRowCount)
  ) {
    return null;
  }

  const rowDataIndex = rowIndex - state.insertedRows.length;

  const data = dataIndex !== null && state.getData(dataIndex);

  const isDeletedRow = data != null && edits.deleteEdits.has(data.id);

  const editedLink =
    state.parentObject && edits.linkEdits.get(state.parentObject.linkId);

  const editedLinkChange = editedLink?.changes.get(data?.id);

  const hasLinkEdit = state.parentObject?.editMode
    ? !!editedLinkChange ||
      (!state.parentObject?.isMultiLink &&
        editedLink != null &&
        !!data?.__isLinked)
    : state.parentObject?.isMultiLink
    ? !!editedLinkChange
    : !!editedLink;

  let rowAction: JSX.Element | null = null;
  if ((dataIndex === null || data) && !state.objectType?.readonly) {
    if (state.parentObject?.editMode) {
      let input: JSX.Element;
      if (state.parentObject.isMultiLink) {
        input = (
          <input
            type="checkbox"
            checked={
              dataIndex !== null
                ? editedLinkChange
                  ? editedLinkChange.kind === UpdateLinkChangeKind.Add
                  : data.__isLinked
                : editedLink?.inserts.has(state.insertedRows[rowIndex]) ??
                  false
            }
            onChange={() => {
              if (dataIndex !== null) {
                if (editedLinkChange) {
                  edits.removeLinkUpdate(
                    state.parentObject!.id,
                    state.parentObject!.fieldName,
                    data.id
                  );
                } else {
                  edits.addLinkUpdate(
                    state.parentObject!.id!,
                    state.parentObject!.subtypeName ??
                      state.parentObject!.objectTypeName,
                    state.parentObject!.fieldName,
                    state.objectType!,
                    data.__isLinked
                      ? UpdateLinkChangeKind.Remove
                      : UpdateLinkChangeKind.Add,
                    data.id,
                    data.__tname__
                  );
                }
              } else {
                edits.toggleLinkInsert(
                  state.parentObject!.id!,
                  state.parentObject!.subtypeName ??
                    state.parentObject!.objectTypeName,
                  state.parentObject!.fieldName,
                  state.objectType!,
                  state.insertedRows[rowIndex]
                );
              }
            }}
          />
        );
      } else {
        const checked = editedLink?.setNull
          ? false
          : dataIndex !== null
          ? editedLink
            ? editedLink.changes.has(data.id)
            : data.__isLinked
          : editedLink?.inserts.has(state.insertedRows[rowIndex]) ?? false;
        const sharedArgs = [
          state.parentObject!.id!,
          state.parentObject!.subtypeName ??
            state.parentObject!.objectTypeName,
          state.parentObject!.fieldName,
          state.objectType!,
        ] as const;
        input = (
          <input
            className={styles.isRadio}
            type="checkbox"
            checked={checked}
            onChange={() => {
              if (checked) {
                edits.setLinkNull(...sharedArgs);
              } else {
                if (dataIndex !== null) {
                  if (data.__isLinked) {
                    edits.clearLinkEdits(state.parentObject!.linkId);
                  } else {
                    edits.addLinkUpdate(
                      ...sharedArgs,
                      UpdateLinkChangeKind.Set,
                      data.id,
                      data.__tname__
                    );
                  }
                } else {
                  edits.toggleLinkInsert(
                    ...sharedArgs,
                    state.insertedRows[rowIndex],
                    true
                  );
                }
              }
            }}
          />
        );
      }

      rowAction = <label className={styles.selectLinkAction}>{input}</label>;
    } else {
      rowAction = (
        <div
          className={styles.deleteRowAction}
          onClick={() => {
            if (dataIndex !== null) {
              edits.toggleRowDelete(data.id, data.__tname__);
              if (state.expandedInspectors.has(data.id)) {
                state.toggleRowExpanded(rowDataIndex);
              }
            } else {
              edits.removeInsertedRow(state.insertedRows[rowIndex]);
            }
          }}
        >
          {isDeletedRow ? <UndeleteIcon /> : <DeleteIcon />}
        </div>
      );
    }
  }

  return (
    <>
      <div
        className={cn(gridStyles.cell, styles.rowIndex, {
          [gridStyles.lastPinned]: state.pinnedFields.length === 0,
          [styles.active]: active,
          [styles.hasLinkEdit]: hasLinkEdit,
          [styles.isNewRow]: dataIndex === null,
          [styles.isDeletedRow]: isDeletedRow,
          [styles.unlinked]:
            editedLinkChange?.kind === UpdateLinkChangeKind.Remove ||
            (dataIndex !== null &&
              !state.parentObject?.isMultiLink &&
              !!editedLink &&
              (state.parentObject?.editMode
                ? !!data?.__isLinked
                : !editedLinkChange)),
        })}
        style={{
          top: rowIndex * 40,
          width: state.grid._colWidths.get("_indexCol"),
        }}
        onMouseEnter={() => state.setHoverRowIndex(rowIndex)}
        onMouseLeave={() => state.setHoverRowIndex(null)}
      >
        <div className={styles.rowActions}>{rowAction}</div>
        <div className={styles.index}>
          {dataIndex !== null ? dataIndex + 1 : null}
        </div>
        {dataIndex !== null ? (
          // isMobile ? (
          //   <button
          //     className={styles.expandRowMobile}
          //     onClick={() => {
          //       state.toggleRowExpanded(dataIndex);
          //     }}
          //   >
          //     <TopRightIcon />
          //   </button>
          // ) : (
          <div
            className={cn(styles.expandRow, {
              [styles.isExpanded]: state.expandedDataRowIndexes.has(dataIndex),
              [styles.isHidden]: isDeletedRow,
            })}
            onClick={() => {
              state.toggleRowExpanded(dataIndex);
            }}
          >
            <ChevronDownIcon />
          </div>
        ) : // )
        null}
      </div>
    </>
  );
});

const ExpandedDataInspector = observer(function ExpandedDataInspector({
  rowIndex,
  rowData,
}: {
  rowIndex: number;
  rowData: ExpandedRowData;
}) {
  const {state} = useDataInspectorState();
  const {navigate, currentPath} = useDBRouter();
  const basePath = currentPath.join("/");

  return (
    <>
      {rowData.indexes.map((index) => {
        const item = rowData.state.getItems()?.[index];
        const lastItem = index === rowData.state.itemsLength - 1;
        return (
          <div
            key={`inspectorRow-${rowData.dataRowIndex}-${index}`}
            className={cn(styles.inspectorRow, {[styles.lastItem]: lastItem})}
            style={{
              top:
                (rowIndex - rowData.dataRowOffset) * 40 +
                (index ? 6 : 0) +
                index * 28,
              paddingLeft: state.indexColWidth - 16,
              paddingTop: index ? 0 : 6,
              paddingBottom: lastItem
                ? rowData.state.rowsCount * 40 -
                  (rowData.state.itemsLength * 28 + 7)
                : 0,
              width: state.grid.gridContainerSize.width - 16,
            }}
          >
            {item ? (
              <>
                <InspectorRow
                  item={item}
                  state={rowData.state.state}
                  isExpanded={!!rowData.state.state.expanded?.has(item.id)}
                  toggleExpanded={() => {
                    rowData.state.toggleExpanded(index);
                  }}
                  disableCopy
                  overflowEllipsis
                />
                {item.level === 2 &&
                rowData.state.linkFields.has(item.fieldName as string) ? (
                  <div
                    className={styles.viewInTableButton}
                    onClick={() =>
                      state.openNestedView(
                        basePath,
                        navigate,
                        rowData.state.objectId,
                        rowData.state.objectTypeName,
                        state.fields!.find(
                          (field) => field.name === item.fieldName
                        )!
                      )
                    }
                  >
                    View in Table
                  </div>
                ) : null}
              </>
            ) : (
              <div>Loading...</div>
            )}
          </div>
        );
      })}
    </>
  );
});

// interface MobileDataInspectorProps {
//   rowData: ExpandedRowData;
// }

// export const MobileDataInspector = ({rowData}: MobileDataInspectorProps) => {
//   const item = rowData.state.getItems()?.[0] as ObjectLikeItem | undefined;

//   const {state} = useDataInspectorState();
//   const fields =
//     state.allFields?.fields.filter(
//       (field) =>
//         !field.subtypeName ||
//         field.subtypeName === rowData.state.objectTypeName
//     ) || [];
//   const codecs =
//     (item?.codec as ObjectCodec)?.getFields().reduce((codecs, {name}, i) => {
//       codecs[name] = item?.codec.getSubcodecs()[i]!;
//       return codecs;
//     }, {} as {[name: string]: ICodec}) ?? {};

//   const {navigate, currentPath} = useDBRouter();
//   const basePath = currentPath.join("/");

//   const closeExtendedView = () => {
//     state.toggleRowExpanded(rowData.dataRowIndex);
//     state.gridRef?.resetAfterRowIndex(rowData.dataRowIndex);
//   };

//   return (
//     <div className={styles.mobileInspectorWindow}>
//       <div className={styles.fieldsWrapper}>
//         {item &&
//           fields.map((field) => {
//             const isLink = field.type === ObjectFieldType.link;
//             const data = item.data;
//             const value = isLink
//               ? Number(data[`__count_${field.name}`])
//               : data[field.name];

//             const codec = codecs[field.name];

//             return (
//               <div className={styles.field} key={field.name}>
//                 <div className={styles.fieldHeader}>
//                   <span className={styles.name}>{field.name}</span>
//                   <span className={styles.type}>
//                     {`${field.multi ? "multi" : ""} ${field.typename}`}
//                   </span>
//                 </div>
//                 {isLink ? (
//                   <button
//                     className={styles.linkObjName}
//                     onClick={() => {
//                       state.openNestedView(
//                         basePath,
//                         navigate,
//                         data.id,
//                         data.__tname__,
//                         field
//                       );
//                     }}
//                   >
//                     {field.typename.split("::").pop()}
//                     <span>{value}</span>
//                   </button>
//                 ) : codec ? (
//                   renderCellValue(value, codec)
//                 ) : (
//                   <p className={styles.fieldValue}>{value}</p>
//                 )}
//               </div>
//             );
//           })}
//       </div>
//       <div className={styles.footer}>
//         <button onClick={closeExtendedView} className={styles.footerBtn}>
//           <BackIcon />
//         </button>

//         <p className={styles.title}>
//           {item ? item.data.__tname__ : `loading...`}
//         </p>
//       </div>
//     </div>
//   );
// };
