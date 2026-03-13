import {useEffect} from "react";
import {observer} from "mobx-react-lite";

import cn from "@dbsof/common/utils/classNames";
import {renderResultAsJson} from "@dbsof/common/utils/renderJsonResult";
import {CopyButton} from "../../newui/copyButton";

import {GridHeader, ResultGridState, RowHeight} from "./state";

import {
  DataGrid,
  DataGridProps,
  GridContent,
  GridHeaders,
  HeaderResizeHandle,
} from "../dataGrid";
import {calculateInitialColWidths} from "../dataGrid/utils";
import {renderCellValue} from "../dataGrid/renderUtils";

import gridStyles from "../dataGrid/dataGrid.module.scss";
import inspectorStyles from "@dbsof/inspector/inspector.module.scss";

import styles from "./resultGrid.module.scss";

export {createResultGridState, ResultGridState} from "./state";

export interface ResultGridProps extends Omit<DataGridProps, "state"> {
  state: ResultGridState;
  bottomPadding?: number;
}

export const ResultGrid = observer(function ResultGrid({
  className,
  state,
  bottomPadding,
  ...props
}: ResultGridProps) {
  useEffect(() => {
    if (
      state.grid.gridContainerSize.width > 0 &&
      state.grid._colWidths.size == 0
    ) {
      state.grid.setColWidths(
        calculateInitialColWidths(
          state.flatHeaders.map(({id, typename}) => ({
            id,
            typename,
            isLink: false,
          })),
          state.grid.gridContainerSize.width
        )
      );
    }
  }, [state.grid.gridContainerSize.width]);

  return (
    <DataGrid
      className={cn(styles.resultGrid, className)}
      state={state.grid}
      {...props}
    >
      <ResultGridHeaders state={state} />
      <ResultGridContent state={state} bottomPadding={bottomPadding} />

      <CopyButton
        className={styles.copyButton}
        label="Copy JSON"
        content={() =>
          renderResultAsJson(state.data, state.codec, state.implicitLimit)
        }
      />
    </DataGrid>
  );
});

export const ResultGridHeaders = observer(function ResultGridHeaders({
  state,
}: {
  state: ResultGridState;
}) {
  const headers = state.allHeaders;
  const lastHeader = headers[headers.length - 1];
  return (
    <GridHeaders
      state={state.grid}
      style={{gridTemplateRows: `repeat(${state.maxDepth + 1}, auto)`}}
      pinnedHeaders={null}
      headers={[
        ...headers.flatMap((header, i) => {
          if (header.name == null) {
            return [];
          }
          const hasSubheaders = header.subHeaders?.[0].name != null;
          return header.name != null
            ? [
                <div
                  key={header.id}
                  className={cn(styles.header, {
                    [styles.hasSubheaders]: hasSubheaders,
                  })}
                  style={{
                    gridColumn: `${header.startIndex + 1} / ${
                      header.startIndex + header.span + 1
                    }`,
                    gridRow: `${header.depth + 1}${
                      !hasSubheaders ? `/ -1` : ""
                    }`,
                  }}
                >
                  <div className={styles.headerName}>{header.name}</div>
                  {!hasSubheaders ? (
                    <div className={styles.typename}>{header.typename}</div>
                  ) : null}
                </div>,
                (
                  header.parent == null
                    ? header.startIndex != 0
                    : header.parent.subHeaders![0] != header
                ) ? (
                  <HeaderResizeHandle
                    key={`resize-${headers[i - 1].id}`}
                    state={state.grid}
                    columnId={headers[i - 1].id}
                    style={{
                      gridColumn: header.startIndex + 1,
                      gridRowStart: header.depth + 1,
                      gridRowEnd: -1,
                    }}
                  />
                ) : null,
              ]
            : [];
        }),
        <HeaderResizeHandle
          key={`resize-${lastHeader.id}`}
          state={state.grid}
          columnId={lastHeader.id}
          style={{
            gridColumn: -2,
            gridRowStart: 1,
            gridRowEnd: -1,
          }}
        />,
      ]}
    />
  );
});

export const ResultGridContent = observer(function ResultGridContent({
  state,
  bottomPadding,
}: ResultGridProps) {
  const ranges = state.grid.visibleRanges;
  const rowTops = state.rowTops;

  const cells: JSX.Element[] = [];
  for (const header of state.flatHeaders.slice(
    ranges.cols[0],
    ranges.cols[1] + 1
  )) {
    let rowIndex = ranges.rows[0];
    while (rowIndex < ranges.rows[1]) {
      const {data, indexOffset, endIndex, dataRef} = state.getData(
        header,
        rowIndex
      );
      const tops = rowTops.get(dataRef);
      const offsetRowIndex = rowIndex - indexOffset;
      let dataIndex = tops
        ? tops.findIndex((top) => top > offsetRowIndex) - 1
        : offsetRowIndex;
      rowIndex = (tops ? tops[dataIndex] : dataIndex) + indexOffset;
      while (dataIndex < data.length && rowIndex < ranges.rows[1]) {
        cells.push(
          <GridCell
            key={`${header.startIndex}-${rowIndex}`}
            state={state}
            header={header}
            rowIndex={rowIndex}
            height={
              (tops ? tops[dataIndex + 1] : dataIndex + 1) +
              indexOffset -
              rowIndex
            }
            data={
              header.key != null
                ? data[dataIndex][header.key]
                : data[dataIndex]
            }
          />
        );
        dataIndex += 1;
        rowIndex = (tops ? tops[dataIndex] : dataIndex) + indexOffset;
      }
      const dataEndIndex =
        indexOffset + (tops ? tops[tops.length - 1] : data.length);
      if (dataEndIndex !== endIndex && dataEndIndex < ranges.rows[1]) {
        cells.push(
          <GridCell
            key={`${header.startIndex}-${dataEndIndex}`}
            state={state}
            header={header}
            rowIndex={dataEndIndex}
            height={endIndex - dataEndIndex}
            data={undefined}
          />
        );
      }
      rowIndex = endIndex;
    }
  }

  return (
    <GridContent
      className={cn(inspectorStyles.inspectorTheme)}
      style={{"--gridHeaderHeight": state.grid.headerHeight + "px"} as any}
      state={state.grid}
      cells={cells}
      bottomPadding={bottomPadding}
    />
  );
});

const GridCell = observer(function GridCell({
  state,
  header,
  rowIndex,
  height,
  data,
}: {
  state: ResultGridState;
  header: GridHeader;
  rowIndex: number;
  height: number;
  data: any;
}) {
  return (
    <div
      className={cn(gridStyles.cell, {
        [gridStyles.emptyCell]: data === undefined,
      })}
      style={{
        top: rowIndex * RowHeight,
        height: height * RowHeight,
        left: state.grid.colLefts[header.startIndex],
        width: state.grid.colWidths[header.startIndex],
      }}
    >
      {data !== undefined ? (
        <div
          className={cn(styles.cellContent, {[styles.stickyCell]: height > 1})}
        >
          {renderCellValue(data, header.codec)}
        </div>
      ) : null}
    </div>
  );
});
