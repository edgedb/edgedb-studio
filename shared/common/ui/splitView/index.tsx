import React, {Fragment, useRef} from "react";
import {observer} from "mobx-react-lite";

import cn from "@dbsof/common/utils/classNames";

import styles from "./splitView.module.scss";

import {useDragHandler, Position} from "@dbsof/common/hooks/useDragHandler";
import {useGlobalDragCursor} from "@dbsof/common/hooks/globalDragCursor";

import {SplitViewDirection, SplitViewState} from "./model";
import {useIsMobile} from "../../hooks/useMobile";

interface SplitViewProps {
  views: JSX.Element[];
  state: SplitViewState;
  minViewSize?: number;
}

interface ResizeDragHandlerParams {
  viewIndex: number;
}

export default observer(function SplitView({
  views,
  state,
  minViewSize = 10,
  className,
  ...otherProps
}: React.HTMLAttributes<HTMLDivElement> & SplitViewProps) {
  const [_, setGlobalDragCursor] = useGlobalDragCursor();
  const isMobile = useIsMobile();

  const ref = useRef<HTMLDivElement>(null);

  const childSizeKey =
    !isMobile && state.direction === SplitViewDirection.vertical
      ? "height"
      : "width";

  const resizeHandler = useDragHandler<ResizeDragHandlerParams>(() => {
    let initialPos: Position;
    let parentSize: number;
    let initialSize: number;
    let maxSize: number;
    let axis: "x" | "y";

    return {
      onStart(
        initialMousePos: Position,
        _: React.MouseEvent,
        params?: ResizeDragHandlerParams
      ) {
        setGlobalDragCursor(
          state.direction === SplitViewDirection.vertical
            ? "ns-resize"
            : "ew-resize"
        );
        initialPos = initialMousePos;
        const BBox = ref.current!.getBoundingClientRect();
        parentSize =
          state.direction === SplitViewDirection.vertical
            ? BBox.height
            : BBox.width;
        initialSize = state.sizes[params!.viewIndex];
        maxSize = initialSize + state.sizes[params!.viewIndex + 1];
        axis = state.direction === SplitViewDirection.vertical ? "y" : "x";
      },
      onMove(
        currentMousePos: Position,
        _: boolean,
        params?: ResizeDragHandlerParams
      ) {
        const sizeDelta =
          ((currentMousePos[axis] - initialPos[axis]) / parentSize) * 100;
        const newSize = Math.min(
          Math.max(initialSize + sizeDelta, minViewSize),
          maxSize - minViewSize
        );
        const newSizes = [...state.sizes];
        newSizes[params!.viewIndex] = newSize;
        newSizes[params!.viewIndex + 1] = maxSize - newSize;
        state.setSizes(newSizes as [number, number]);
      },
      onEnd() {
        setGlobalDragCursor(null);
      },
    };
  }, [state.sizes, state.direction]);

  return (
    <div
      {...otherProps}
      ref={ref}
      className={cn(className, styles.splitViewContainer, {
        [styles.splitVertical]:
          !isMobile && state.direction === SplitViewDirection.vertical,
      })}
    >
      {views.map((view, viewIndex) => {
        const lastView = viewIndex === views.length - 1;
        const margins = 2 + (viewIndex === 0 ? -1 : 0) + (lastView ? -1 : 0);
        const size = {
          [childSizeKey]: `calc(${state.sizes[viewIndex]}%${
            margins ? ` - ${margins}px` : ""
          })`,
        };

        return (
          <Fragment key={viewIndex}>
            {((isMobile && state.activeViewIndex === viewIndex) ||
              !isMobile) && (
              <div className={styles.splitViewChild} style={size}>
                {view}
              </div>
            )}
            {!lastView ? (
              <Resizer
                direction={state.direction}
                onResizeStart={(e) =>
                  resizeHandler(e, {
                    viewIndex,
                  })
                }
              />
            ) : null}
          </Fragment>
        );
      })}
    </div>
  );
});

interface ResizerProps {
  direction: SplitViewDirection;
  onResizeStart: (event: React.MouseEvent) => void;
}

function Resizer({onResizeStart}: ResizerProps) {
  return (
    <div className={styles.resizer}>
      <div className={styles.grabHandle} onMouseDown={onResizeStart}></div>
      <div className={styles.resizerIndicator} />
    </div>
  );
}
