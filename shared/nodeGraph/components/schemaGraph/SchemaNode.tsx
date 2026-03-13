import React, {useState, useRef} from "react";
import {observer} from "mobx-react-lite";
import {CSSTransition} from "react-transition-group";

import styles from "./schemaGraph.module.scss";
import {useSchemaState} from "../../state/provider";

import cn from "@dbsof/common/utils/classNames";
import {useDragHandler, Position} from "@dbsof/common/hooks/useDragHandler";

import {SchemaGraphNode, SchemaGraphNodeType} from "../../core/interfaces";
import {SchemaNodeStateInstance} from "../../state/graph";

import SchemaNodeObject from "./SchemaNodeObject";
import {ISchemaNodeProps} from "./interfaces";
import SchemaNodeLinkProps from "./SchemaNodeLinkProps";

const EDGE_SCROLL_SPEED = 0.01;
const EDGE_SCROLL_MARGIN = 10; // px

interface SchemaNodeProps {
  node: SchemaGraphNode;
}

export default observer(function SchemaNode({node}: SchemaNodeProps) {
  const schemaGraphState = useSchemaState().graph;
  const nodeRef = useRef<HTMLDivElement>(null);

  if (node.type === SchemaGraphNodeType.object) {
    const nodeState = schemaGraphState.nodesState.get(node.id);
    return nodeState ? (
      // @ts-ignore
      <CSSTransition
        in={nodeState.visible}
        timeout={300}
        classNames={styles}
        nodeRef={nodeRef}
      >
        <DraggableNode
          ref={nodeRef}
          NodeComponent={SchemaNodeObject as any}
          node={node}
          nodeState={nodeState}
        />
      </CSSTransition>
    ) : null;
  } else if (node.type === SchemaGraphNodeType.linkprop) {
    const position = schemaGraphState.linkNodePositions[node.id];
    return position ? (
      <PositionedNode state={position} style={{transition: "none"}}>
        <SchemaNodeLinkProps node={node} />
      </PositionedNode>
    ) : null;
  } else {
    return null;
  }
});

interface PositionedNodeProps {
  state: {
    x: number;
    y: number;
    visible?: boolean;
  };
  className?: string;
  style?: React.CSSProperties;
}

const PositionedNode = observer(
  React.forwardRef<
    HTMLDivElement,
    React.PropsWithChildren<PositionedNodeProps>
  >(function _PositionedNode(
    {
      children,
      state,
      className,
      style,
    }: React.PropsWithChildren<PositionedNodeProps>,
    ref // eslint-disable-line
  ) {
    const transform = `translate(${state.x}px, ${state.y}px)`;

    return (
      <div
        ref={ref}
        className={cn(
          styles.node,
          className,
          !state.visible ? styles.hidden : null
        )}
        style={{
          transform,
          ...style,
        }}
      >
        {children}
      </div>
    );
  })
);

interface DraggableNodeProps {
  NodeComponent: (props: ISchemaNodeProps) => JSX.Element;
  node: SchemaGraphNode;
  nodeState: SchemaNodeStateInstance;
}

const DraggableNode = observer(
  React.forwardRef<HTMLDivElement, DraggableNodeProps>(function _DraggableNode(
    {NodeComponent, node, nodeState}: DraggableNodeProps,
    ref // eslint-disable-line
  ) {
    const schemaGraphState = useSchemaState().graph;
    const viewport = schemaGraphState.viewport;

    const [isDragging, setDragging] = useState(false);

    const dragHandler = useDragHandler(() => {
      let currentMousePos: Position;
      let initialMouseGraphPos: Position;
      let initialNodePos: Position;
      let dragging = false;

      const updateNodePosition = () => {
        const mouseGraphPos =
          viewport.getClientPosInGraphSpace(currentMousePos);
        nodeState.updatePosition(
          initialNodePos.x + (mouseGraphPos.x - initialMouseGraphPos.x),
          initialNodePos.y + (mouseGraphPos.y - initialMouseGraphPos.y)
        );
      };

      let lastTimestamp: number;
      const handleEdgeScroll = (timestamp: number) => {
        if (!dragging) return;

        const elapsed = lastTimestamp ? timestamp - lastTimestamp : 0;
        lastTimestamp = timestamp;

        const rect = viewport.viewportRect;
        if (elapsed && rect) {
          const edgeDist = {
            x:
              currentMousePos.x < rect.left + EDGE_SCROLL_MARGIN
                ? currentMousePos.x - rect.left - EDGE_SCROLL_MARGIN
                : currentMousePos.x > rect.right - EDGE_SCROLL_MARGIN
                ? currentMousePos.x - rect.right + EDGE_SCROLL_MARGIN
                : 0,
            y:
              currentMousePos.y < rect.top + EDGE_SCROLL_MARGIN
                ? currentMousePos.y - rect.top - EDGE_SCROLL_MARGIN
                : currentMousePos.y > rect.bottom - EDGE_SCROLL_MARGIN
                ? currentMousePos.y - rect.bottom + EDGE_SCROLL_MARGIN
                : 0,
          };
          if (edgeDist.x || edgeDist.y) {
            viewport.moveToRel({
              x: -edgeDist.x * elapsed * EDGE_SCROLL_SPEED,
              y: -edgeDist.y * elapsed * EDGE_SCROLL_SPEED,
            });
            updateNodePosition();
          }
        }

        requestAnimationFrame(handleEdgeScroll);
      };

      return {
        onStart(initialMousePos: Position, e: React.MouseEvent) {
          e.stopPropagation();
          dragging = true;
          setDragging(true);
          viewport.updateViewportRect();

          initialMouseGraphPos =
            viewport.getClientPosInGraphSpace(initialMousePos);
          initialNodePos = {x: nodeState.x, y: nodeState.y};
          currentMousePos = initialMousePos;

          requestAnimationFrame(handleEdgeScroll);
        },
        onMove(currentPos: Position, isFirstMove: boolean) {
          if (isFirstMove) {
            schemaGraphState.userRepositionStart();
          }
          currentMousePos = currentPos;
          updateNodePosition();
        },
        onEnd(didMove: boolean) {
          dragging = false;
          setDragging(false);

          if (didMove) {
            schemaGraphState.userRepositionEnd();
          }
        },
      };
    });

    return (
      <PositionedNode
        ref={ref}
        state={nodeState}
        className={cn(isDragging ? styles.isDragging : null)}
      >
        <NodeComponent node={node} onDragHandleStart={dragHandler} />
      </PositionedNode>
    );
  })
);
