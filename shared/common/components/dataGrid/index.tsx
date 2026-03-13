import {PropsWithChildren, useEffect, useRef, useState} from "react";
import {observer} from "mobx-react-lite";

import cn from "@dbsof/common/utils/classNames";

import {useResize} from "../../hooks/useResize";
import {CustomScrollbars} from "../../ui/customScrollbar";

import {DataGridState, DefaultColumnWidth} from "./state";

import styles from "./dataGrid.module.scss";
import {useGlobalDragCursor} from "../../hooks/globalDragCursor";

export interface DataGridProps {
  state: DataGridState;
  className?: string;
  style?: React.CSSProperties;
  noVerticalScroll?: boolean;
}

export function DataGrid({
  state,
  className,
  style,
  noVerticalScroll,
  children,
}: PropsWithChildren<DataGridProps>) {
  const ref = useRef<HTMLDivElement | null>(null);

  useResize(ref, ({width, height}) =>
    state.setGridContainerSize(width, height)
  );

  useEffect(() => {
    const container = state.gridElRef;

    if (container) {
      const listener = () => {
        state.updateScrollPos(container.scrollTop, container.scrollLeft);
      };

      container.addEventListener("scroll", listener);

      return () => {
        container.removeEventListener("scroll", listener);
      };
    }
  }, [state.gridElRef]);

  return (
    <CustomScrollbars
      className={cn(styles.scrollbarWrapper, className)}
      innerClass={styles.innerWrapper}
      style={style}
      headerPadding={noVerticalScroll ? undefined : state.headerHeight}
      hideVertical={noVerticalScroll}
    >
      <div
        ref={(el) => {
          state.gridElRef = el;
          ref.current = el;
          if (el) {
            el.scrollTop = state.scrollPos.top;
            el.scrollLeft = state.scrollPos.left;
          }
        }}
        className={cn(styles.dataGrid, {
          [styles.noVerticalScroll]: !!noVerticalScroll,
        })}
      >
        <div className={styles.innerWrapper}>{children}</div>
      </div>
    </CustomScrollbars>
  );
}

export const GridHeaders = observer(function GridHeaders({
  className,
  state,
  pinnedHeaders,
  headers,
  style,
}: {
  className?: string;
  state: DataGridState;
  pinnedHeaders: React.ReactNode;
  headers: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useResize(ref, ({height}) => state.setHeaderHeight(height));

  return (
    <div
      ref={ref}
      className={cn(styles.headers, className)}
      style={{
        ...style,
        gridTemplateColumns: `${
          state.pinnedColsWidth ? `${state.pinnedColsWidth}px ` : ""
        }${state.colWidths.join(
          "px "
        )}px minmax(var(--dataGridHeaderEndWidth, 100px), 1fr)`,
      }}
    >
      {state.pinnedColWidths.length ? (
        <div
          className={cn(styles.pinnedHeaders, className)}
          style={{
            gridTemplateColumns: `${
              state.pinnedColWidths.join("px ") || "0"
            }px`,
          }}
        >
          {pinnedHeaders}
        </div>
      ) : null}
      {headers}
    </div>
  );
});

export function HeaderResizeHandle({
  className,
  state,
  columnId,
  style,
}: {
  className?: string;
  state: DataGridState;
  columnId: string;
  style?: React.CSSProperties;
}) {
  const [_, setGlobalDrag] = useGlobalDragCursor();
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={cn(styles.resizeHandle, className, {
        [styles.dragging]: dragging,
      })}
      style={style}
      onMouseDown={(e) => {
        const startMouseLeft = e.clientX;
        const startColWidth =
          state._colWidths.get(columnId) ?? DefaultColumnWidth;
        const moveListener = (e: MouseEvent) => {
          state.setColWidth(
            columnId,
            e.clientX - startMouseLeft + startColWidth
          );
        };
        setGlobalDrag("col-resize");
        setDragging(true);

        window.addEventListener("mousemove", moveListener);
        window.addEventListener(
          "mouseup",
          () => {
            window.removeEventListener("mousemove", moveListener);
            setGlobalDrag(null);
            setDragging(false);
            state.onColumnResizeComplete?.(state._colWidths);
          },
          {once: true}
        );
      }}
    />
  );
}

export const GridContent = observer(function GridContent({
  className,
  style,
  state,
  pinnedCells,
  cells,
  bottomPadding,
}: {
  className?: string;
  style?: React.CSSProperties;
  state: DataGridState;
  pinnedCells?: React.ReactNode;
  cells: React.ReactNode;
  bottomPadding?: number;
}) {
  return (
    <div
      className={cn(styles.gridContent, className)}
      style={{
        ...style,
        height: state.gridContentHeight + (bottomPadding ?? 0),
        width: state.gridContentWidth,
      }}
    >
      {pinnedCells ? (
        <div
          className={styles.pinnedContent}
          style={{width: state.pinnedColsWidth}}
        >
          {pinnedCells}
        </div>
      ) : null}
      {cells}
    </div>
  );
});
