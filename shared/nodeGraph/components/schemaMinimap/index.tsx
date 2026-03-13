import React from "react";
import {observer} from "mobx-react-lite";

import styles from "./schemaMinimap.module.scss";
import {useSchemaState} from "../../state/provider";
import cn from "@dbsof/common/utils/classNames";
import {useDragHandler, Position} from "@dbsof/common/hooks/useDragHandler";

interface SchemaMinimapProps {
  className?: string;
}

export default observer(function SchemaMinimap({
  className,
}: SchemaMinimapProps) {
  const schemaState = useSchemaState();
  const viewport = schemaState.graph.viewport;

  const {nodesBoundingBox: BBox, visibleBounds} = schemaState.graph;
  const {viewportRect, zoomLevel} = viewport;

  const viewportDragHandler = useDragHandler(() => {
    let lastMousePos: Position;
    let scaleFactor: number;

    return {
      onStart(initialMousePos: Position, e: React.MouseEvent) {
        const rect = e.currentTarget.getBoundingClientRect();
        scaleFactor = viewport.viewportRect!.width / rect.width;
        lastMousePos = initialMousePos;
      },
      onMove(currentMousePos: Position) {
        schemaState.graph.dragCanvasRel({
          x: (lastMousePos.x - currentMousePos.x) * scaleFactor,
          y: (lastMousePos.y - currentMousePos.y) * scaleFactor,
        });
        lastMousePos = currentMousePos;
      },
    };
  });

  return (
    <div className={cn(styles.minimap, className)}>
      <svg
        className={styles.map}
        viewBox={`${BBox.min.x - 100} ${BBox.min.y - 100} ${
          BBox.width + 200
        } ${BBox.height + 200}`}
      >
        {schemaState.graph.visibleNodes?.map((node) => {
          const pos = schemaState.graph.nodesState.get(node.id);
          const isAbstract = schemaState.objects?.get(node.id)?.is_abstract;
          if (!pos) return null;
          return (
            <rect
              key={node.id}
              className={cn(isAbstract ? styles.abstractObject : undefined)}
              x={pos.x}
              y={pos.y}
              width={pos.width}
              height={pos.height}
            />
          );
        })}
        {viewportRect ? (
          <rect
            className={styles.viewport}
            x={visibleBounds.min.x}
            y={visibleBounds.min.y}
            width={visibleBounds.width}
            height={visibleBounds.height}
            rx={BBox.height / 40}
            onMouseDown={viewportDragHandler}
          />
        ) : null}
      </svg>
      <div className={styles.controls}>
        <button
          className={
            !schemaState.graph.viewport.canZoomOut ? styles.disabled : ""
          }
          onClick={() => schemaState.graph.viewport.setZoomLevelRel(-0.1)}
          style={{marginRight: "2px"}}
        >
          <svg viewBox="0 0 12 12">
            <path d="M 0 6 H 12" />
          </svg>
        </button>
        {(zoomLevel * 100).toFixed(0)}%
        <button
          className={
            !schemaState.graph.viewport.canZoomIn ? styles.disabled : ""
          }
          onClick={() => schemaState.graph.viewport.setZoomLevelRel(0.1)}
        >
          <svg viewBox="0 0 12 12">
            <path d="M 6 0 V 12 M 0 6 H 12" />
          </svg>
        </button>
      </div>
    </div>
  );
});
