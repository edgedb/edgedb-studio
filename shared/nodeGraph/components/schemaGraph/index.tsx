import React, {useRef, useEffect, useCallback, Fragment} from "react";
import {observer} from "mobx-react-lite";

import styles from "./schemaGraph.module.scss";
import {useSchemaState} from "../../state/provider";
import {useDragHandler, Position} from "@dbsof/common/hooks/useDragHandler";

import SchemaNode from "./SchemaNode";
import SchemaLink from "./SchemaLink";
import cn from "@dbsof/common/utils/classNames";
import {GRID_SIZE} from "../../core/interfaces";
import {SchemaState} from "../../state";
import {DebugState} from "./debug";

const SchemaGraphCanvas = observer(function _SchemaGraphCanvas({
  debug,
}: {
  debug: DebugState[0];
}) {
  const schemaState = useSchemaState();

  const BBox = schemaState.graph.nodesBoundingBox;

  const {debugMargins, debugOOBMarkers} = getDebug(debug, schemaState);

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (schemaState.graph.disableTransitions) {
      // force repaint
      // eslint-disable-next-line
      ref.current?.scrollTop;
      schemaState.graph._focusModeExitResetComplete();
    }
  });

  const unselectedRoutes = schemaState.graph.routes.filter(
    (route) =>
      !(
        route.link.source.id === schemaState.selectedObjectName &&
        route.link.name === schemaState.selectedLinkName
      )
  );
  const selectedRoutes = schemaState.graph.routes.filter(
    (route) =>
      route.link.source.id === schemaState.selectedObjectName &&
      route.link.name === schemaState.selectedLinkName
  );

  return (
    <>
      <svg
        className={cn({[styles.grid_background]: debug.showGrid})}
        viewBox={`${BBox.min.x} ${BBox.min.y} ${BBox.width} ${BBox.height}`}
        style={{
          left: BBox.min.x + "px",
          top: BBox.min.y + "px",
          width: BBox.width + "px",
          height: BBox.height + "px",
          zIndex: debug.showMargins ? 100 : "auto",
        }}
      >
        <g>{debugMargins}</g>
        <g>{debugOOBMarkers}</g>
        <g transform={`translate(${GRID_SIZE / 2} ${GRID_SIZE / 2})`}>
          {[...unselectedRoutes, ...selectedRoutes].map((route) => (
            <SchemaLink key={route.link.id} route={route} />
          ))}
        </g>
      </svg>
      <div
        ref={ref}
        className={cn(
          styles.canvas,
          schemaState.graph.disableTransitions
            ? styles.disableTransitions
            : null
        )}
      >
        {schemaState.graph.nodes!.map((node) => (
          <SchemaNode node={node} key={node.id} />
        ))}
      </div>
    </>
  );
});

interface SchemaGraphProps {
  debug: any;
  className?: string;
}

export default observer(function SchemaGraph({
  debug,
  className,
}: SchemaGraphProps) {
  // const appState = useAppState();
  const schemaState = useSchemaState();
  const schemaGraphState = schemaState.graph;

  const viewportRef = useRef<HTMLDivElement>(null);

  const viewport = schemaGraphState.viewport;

  const zoomFactor = debug.zoomFactor;

  useEffect(() => {
    const viewportEl = viewportRef.current;
    if (viewportEl) {
      viewport.setViewportEl(viewportEl);
    }

    return () => {
      viewport.setViewportEl(undefined);
    };
  }, [viewportRef, viewport]);

  const scrollHandler = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      viewport.clearEasing();
      const scrollDelta = -e.deltaY;

      viewport.setZoomLevelRel(
        scrollDelta / zoomFactor,
        viewport.getClientPosInGraphSpace({
          x: e.clientX,
          y: e.clientY,
        })
      );
    },
    [viewport, zoomFactor]
  );

  const graphDragHandler = useDragHandler(() => {
    let lastMousePos: Position;

    return {
      onStart(initialMousePos: Position): void {
        lastMousePos = initialMousePos;
      },
      onEnd(_: boolean): void {
        // appState.setGlobalDragCursor(null);
      },
      onMove(currentMousePos: Position, isFirstMove: boolean): void {
        if (isFirstMove) {
          // Only set global dragging cursor on first move to prevent
          // global dragging cursor overlay from conflicting with double click
          // appState.setGlobalDragCursor("grabbing");
        }
        viewport.clearEasing();
        schemaGraphState.dragCanvasRel({
          x: currentMousePos.x - lastMousePos.x,
          y: currentMousePos.y - lastMousePos.y,
        });
        lastMousePos = currentMousePos;
      },
    };
  }, [schemaGraphState, viewport]);

  const transform = `
    translate(${viewport.position.x}px, ${viewport.position.y}px)
    scale(${viewport.zoomLevel})`;

  const handleClickOutside = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      schemaState.deselectAll();
    }
  };

  return (
    <div
      ref={viewportRef}
      className={cn(styles.schemaGraph, className)}
      onClick={handleClickOutside}
      onMouseDown={graphDragHandler}
      onWheel={scrollHandler}
      onDoubleClick={() => {
        if (schemaState.graph.focusedNode) {
          schemaState.graph.exitFocusMode();
        }
      }}
    >
      <div
        className={styles.transformContainer}
        style={{transform}}
        onClick={handleClickOutside}
      >
        {schemaGraphState.isLoaded ? (
          <SchemaGraphCanvas debug={debug} />
        ) : null}
      </div>
    </div>
  );
});

function getDebug(debug: DebugState[0], schemaState: SchemaState) {
  const debugMargins = debug.showMargins
    ? [...schemaState.graph.nodesState.values()].map((nodePos) => {
        const margins =
          nodePos.width === 264
            ? [48, 48]
            : nodePos.width === 24
            ? [0, 0]
            : [24, 0];
        return (
          <Fragment key={nodePos.id}>
            <rect
              className={styles.debug_boundingboxes}
              x={nodePos.x}
              y={nodePos.y}
              width={nodePos.width}
              height={nodePos.height}
            />
            <rect
              className={styles.debug_boundingboxes_outer}
              x={nodePos.x - margins[0]}
              y={nodePos.y - margins[1]}
              width={nodePos.width + margins[0] * 2}
              height={nodePos.height + margins[1] * 2}
            />
            <text x={nodePos.x} y={nodePos.y} style={{fill: "#fff"}}>
              {nodePos.id}
            </text>
          </Fragment>
        );
      })
    : null;

  const debugOOBMarkers = debug.showOOBMarkers
    ? schemaState.graph.outOfBoundsMarkers?.map((item) => (
        <circle cx={item.x} cy={item.y} r="10" fill="red" />
      ))
    : null;

  return {debugMargins, debugOOBMarkers};
}
