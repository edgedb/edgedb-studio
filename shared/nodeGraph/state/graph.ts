import {
  types,
  flow,
  getSnapshot,
  applySnapshot,
  getParentOfType,
  Instance,
} from "mobx-state-tree";
import * as debug from "@dbsof/common/utils/debug";
import {Schema, SchemaObject} from ".";
import {
  SchemaGraphNode,
  SchemaGraphLink,
  SchemaGraphRoute,
  SchemaGraphNodeType,
  SchemaGraphNodeObject,
  layoutObjectNodesReturn,
  layoutAndRouteLinksReturn,
  SchemaGraphLinkType,
  NodePosition,
  GRID_SIZE,
  BBOX_MARGIN,
} from "../core/interfaces";
import {
  generateSchamaGraphNodesAndLinks,
  calculateBoundingBox,
  layoutAndRouteLinks,
  layoutObjectNodes,
  removeOverlaps,
  getRoundedPathFromRoute,
  focusedLayout,
} from "../core";
import {Ease, easings} from "@dbsof/common/utils/easing";

export const SchemaNodeState = types
  .model("NodeState", {
    id: types.identifier,
    visible: true,
    x: types.number,
    y: types.number,
    width: types.number,
    height: types.number,
  })
  .views((self) => ({
    get cx() {
      return self.x + self.width / 2;
    },
    get cy() {
      return self.y + self.height / 2;
    },
  }))
  .actions((self) => ({
    updatePosition(x: number, y: number) {
      self.x = x;
      self.y = y;
    },
    updateVisibility(visible: boolean) {
      self.visible = visible;
    },
  }));

// eslint-disable-next-line
export interface SchemaNodeStateInstance
  extends Instance<typeof SchemaNodeState> {}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 1;
const GraphViewport = types
  .model("GraphViewport", {
    position: types.frozen({x: 0, y: 0}),
    zoomLevel: 1,
  })
  .volatile((_self) => ({
    viewportRect: null as DOMRect | null,
    currentEasing: null as Ease | null,
  }))
  .views((self) => ({
    getOffsetPosInGraphSpace(pos: {x: number; y: number}) {
      return {
        x: (pos.x - self.position.x) / self.zoomLevel,
        y: (pos.y - self.position.y) / self.zoomLevel,
      };
    },
    get canZoomIn() {
      return self.zoomLevel < MAX_ZOOM;
    },
    get canZoomOut() {
      return self.zoomLevel > MIN_ZOOM;
    },
  }))
  .extend((self) => {
    let viewportEl: HTMLDivElement | undefined;

    const updateViewportRect = () => {
      const rect = viewportEl?.getBoundingClientRect();
      if (rect) self.viewportRect = rect;
    };

    // https://github.com/microsoft/TypeScript/issues/37861
    // @ts-ignore
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries[0]) {
        (self as any).updateViewportRect();
      }
    });

    return {
      views: {
        getClientPosInGraphSpace(pos: {x: number; y: number}) {
          const rect = self.viewportRect;
          return self.getOffsetPosInGraphSpace({
            x: pos.x - (rect?.x ?? 0),
            y: pos.y - (rect?.y ?? 0),
          });
        },
      },
      actions: {
        clearEasing() {
          if (self.currentEasing) {
            self.currentEasing.stop();
            self.currentEasing = null;
          }
        },
        updateViewportRect,
        setViewportEl(el: HTMLDivElement | undefined) {
          viewportEl = el;
          resizeObserver.disconnect();
          if (el) {
            resizeObserver.observe(el);
          } else {
            self.viewportRect = null;
          }
        },
        moveTo(pos: {x: number; y: number}) {
          self.position = pos;
        },
        moveToRel(pos: {x: number; y: number}) {
          this.moveTo({
            x: self.position.x + pos.x,
            y: self.position.y + pos.y,
          });
        },
        setZoomLevel(zoom: number, centerOn?: {x: number; y: number} | null) {
          const newZoom = Math.max(Math.min(zoom, MAX_ZOOM), MIN_ZOOM);

          if (centerOn !== null) {
            const center =
              centerOn ??
              self.getOffsetPosInGraphSpace({
                x: self.viewportRect!.width / 2,
                y: self.viewportRect!.height / 2,
              });

            const zoomDelta = newZoom - self.zoomLevel;

            this.moveToRel({
              x: -center.x * zoomDelta,
              y: -center.y * zoomDelta,
            });
          }

          self.zoomLevel = newZoom;
        },
        setZoomLevelRel(zoom: number, centerOn?: {x: number; y: number}) {
          this.setZoomLevel(self.zoomLevel + zoom, centerOn);
        },
      },
    };
  })
  .actions((self) => ({
    moveCenterOn(
      center?: {x: number; y: number},
      ease: boolean = true,
      zoom: number = self.zoomLevel
    ) {
      const currentPosition = {...self.position};
      const currentZoomLevel = self.zoomLevel;

      const targetZoomLevel = Math.max(Math.min(zoom, MAX_ZOOM), MIN_ZOOM);
      const targetPosition = center
        ? {
            x:
              (self.viewportRect?.width || 0) / 2 - center.x * targetZoomLevel,
            y:
              (self.viewportRect?.height || 0) / 2 -
              center.y * targetZoomLevel,
          }
        : currentPosition;

      if (!ease) {
        self.moveTo(targetPosition);
        self.setZoomLevel(targetZoomLevel, null);
      } else {
        const positionDelta = {
          x: targetPosition.x - currentPosition.x,
          y: targetPosition.y - currentPosition.y,
        };
        const zoomDelta = targetZoomLevel - currentZoomLevel;
        self.clearEasing();
        self.currentEasing = new Ease(
          easings.easeOutCubic,
          500,
          (progress) => {
            self.moveTo({
              x: currentPosition.x + positionDelta.x * progress,
              y: currentPosition.y + positionDelta.y * progress,
            });
            self.setZoomLevel(currentZoomLevel + zoomDelta * progress, null);
          }
        );
      }
    },
  }));

export const SchemaGraph = types
  .model("SchemaGraph", {
    nodes: types.maybe(types.frozen<SchemaGraphNode[]>()),
    links: types.maybe(types.frozen<SchemaGraphLink[]>()),
    nodesState: types.map(SchemaNodeState),
    nodesStateHistoryUndoStack: types.array(types.frozen()),
    nodesStateHistoryRedoStack: types.array(types.frozen()),
    viewport: GraphViewport,
  })
  .volatile((_self) => ({
    nodesBoundingBox: calculateBoundingBox([]),
    routes: [] as SchemaGraphRoute[],
    linkNodePositions: {} as {[id: string]: NodePosition},
    hideAllLinks: false,
    debugShowAllLinks: false,
    focusedNode: null as SchemaGraphNodeObject | null,
    disableTransitions: false,
  }))
  .views((self) => ({
    get isLoaded() {
      return self.nodes;
    },
    get objectNodes() {
      return self.nodes?.filter(
        (node) => node.type === SchemaGraphNodeType.object
      ) as SchemaGraphNodeObject[] | undefined;
    },
    get visibleNodesState() {
      return [...self.nodesState.values()].filter(
        (nodeState) => nodeState.visible
      );
    },
    get visibleNodes() {
      const visibleIds = new Set(
        this.visibleNodesState.map((node) => node.id)
      );
      return self.nodes?.filter((node) => visibleIds.has(node.id)) as
        | SchemaGraphNodeObject[]
        | undefined;
    },
    get showModuleNames() {
      const moduleNames = getParentOfType(self, Schema)
        .moduleNames as Set<string>;
      return moduleNames.size > 1 || !moduleNames.has("default");
    },
    get visibleBounds() {
      const {position, viewportRect, zoomLevel} = self.viewport;

      const minX = viewportRect ? -position.x / zoomLevel : 0;
      const minY = viewportRect ? -position.y / zoomLevel : 0;
      const width = viewportRect ? viewportRect.width / zoomLevel : 0;
      const height = viewportRect ? viewportRect.height / zoomLevel : 0;

      return {
        min: {
          x: minX,
          y: minY,
        },
        max: {
          x: minX + width,
          y: minY + height,
        },
        width,
        height,
      };
    },
    get noNodesInVisibleBounds() {
      if (!self.viewport.viewportRect) {
        return false;
      }

      const BBox = self.nodesBoundingBox;
      const visibleBounds = this.visibleBounds;

      return (
        BBox.min.x + BBOX_MARGIN > visibleBounds.max.x ||
        BBox.max.x - BBOX_MARGIN < visibleBounds.min.x ||
        BBox.min.y + BBOX_MARGIN > visibleBounds.max.y ||
        BBox.max.y - BBOX_MARGIN < visibleBounds.min.y
      );
    },
    get dragBounds() {
      const {viewportRect, zoomLevel} = self.viewport;
      const BBox = self.nodesBoundingBox;
      return {
        top: (viewportRect?.height ?? 0) - BBox.min.y * zoomLevel,
        left: (viewportRect?.width ?? 0) - BBox.min.x * zoomLevel,
        right: -BBox.max.x * zoomLevel,
        bottom: -BBox.max.y * zoomLevel,
      };
    },
    get outOfBoundsMarkers() {
      const schemaState = getParentOfType(self, Schema);

      const selectedLinks = self.links?.filter(
        (link) =>
          link.source.id === schemaState.selectedObjectName &&
          link.name === schemaState.selectedLinkName
      );

      if (!selectedLinks?.length) return null;

      const bounds = this.visibleBounds;

      const markers: {
        x: number;
        y: number;
        direction: "UP" | "DOWN" | "LEFT" | "RIGHT";
      }[] = [];

      for (const link of selectedLinks) {
        const route = self.routes.find((_route) => _route.link.id === link.id);
        if (!route) continue;
        for (const path of route.simplifiedPaths) {
          let prevPointInsideBounds: boolean | null = null;
          for (let i = 0; i < path.length - 1; i++) {
            const point = path[i];
            const pointInsideBounds =
              point.x < bounds.max.x &&
              point.x > bounds.min.x &&
              point.y < bounds.max.y &&
              point.y > bounds.min.y;
            if (
              prevPointInsideBounds !== null &&
              prevPointInsideBounds !== pointInsideBounds
            ) {
              const prevPoint = path[i - 1];
              const direction = pointInsideBounds
                ? point.x > prevPoint.x
                  ? "LEFT"
                  : point.x < prevPoint.x
                  ? "RIGHT"
                  : point.y > prevPoint.y
                  ? "UP"
                  : "DOWN"
                : point.x > prevPoint.x
                ? "RIGHT"
                : point.x < prevPoint.x
                ? "LEFT"
                : point.y > prevPoint.y
                ? "DOWN"
                : "UP";

              markers.push({
                direction,
                x:
                  direction === "LEFT"
                    ? bounds.min.x
                    : direction === "RIGHT"
                    ? bounds.max.x
                    : point.x,
                y:
                  direction === "UP"
                    ? bounds.min.y
                    : direction === "DOWN"
                    ? bounds.max.y
                    : point.y,
              });
            } else prevPointInsideBounds = pointInsideBounds;
          }
        }
      }

      return markers;
    },
  }))
  // setup
  .actions((self) => ({
    updateGraphNodesAndLinks(schemaObjects: SchemaObject[]) {
      const {nodes, links} = generateSchamaGraphNodesAndLinks(schemaObjects);
      self.nodes = nodes;
      self.links = links;
    },
  }))
  // history
  .actions((self) => ({
    saveNodesStateToHistory() {
      const snapshot = getSnapshot(self.nodesState);
      self.nodesStateHistoryUndoStack.push(snapshot);
      self.nodesStateHistoryRedoStack.clear();
    },
    undoNodesState() {
      if (!self.nodesStateHistoryUndoStack.length) return;
      const snapshot = getSnapshot(self.nodesState);
      self.nodesStateHistoryRedoStack.push(snapshot);
      applySnapshot(self.nodesState, self.nodesStateHistoryUndoStack.pop());
    },
    redoNodesState() {
      if (!self.nodesStateHistoryRedoStack.length) return;
      const snapshot = getSnapshot(self.nodesState);
      self.nodesStateHistoryUndoStack.push(snapshot);
      applySnapshot(self.nodesState, self.nodesStateHistoryRedoStack.pop());
    },
  }))
  // layouting
  .actions((self) => ({
    centerOnNode(nodeId: string) {
      const nodeState = self.nodesState.get(nodeId);
      if (!nodeState || !nodeState.visible) return;

      self.viewport.moveCenterOn({
        x: nodeState.cx,
        y: nodeState.cy,
      });
    },
    resetViewportPosition(ease: boolean = false) {
      const BBox = self.nodesBoundingBox;
      const center = {
        x: BBox.min.x + BBox.width / 2,
        y: BBox.min.y + BBox.height / 2,
      };
      self.viewport.moveCenterOn(center, ease, 1);
    },
    dragCanvasRel(pos: {x: number; y: number}) {
      const {position} = self.viewport;
      const bounds = self.dragBounds;
      self.viewport.moveTo({
        x: Math.max(Math.min(position.x + pos.x, bounds.left), bounds.right),
        y: Math.max(Math.min(position.y + pos.y, bounds.top), bounds.bottom),
      });
    },
    updateBoundingBox() {
      self.nodesBoundingBox = calculateBoundingBox([
        ...self.visibleNodesState,
        ...Object.values(self.linkNodePositions),
      ]);
    },
    removeOverlappingObjectNodes() {
      const realignedNodes = removeOverlaps(
        self.visibleNodesState.map((node) => getSnapshot(node))
      );
      for (const node of realignedNodes) {
        self.nodesState.get(node.id)?.updatePosition(node.x, node.y);
      }
    },
  }))
  .actions((self) => ({
    layoutLinks: flow(function* () {
      const objectNodes = self.visibleNodes;
      const nodePositions = getSnapshot(self.nodesState);

      if (!objectNodes) return;

      const links = self.focusedNode
        ? self.focusedNode.links.filter(
            (link) => link.type === SchemaGraphLinkType.relation
          )
        : objectNodes.flatMap((node) => node.links);

      const {routes, errors, linkNodePositions}: layoutAndRouteLinksReturn =
        yield layoutAndRouteLinks(objectNodes, links, nodePositions);

      if (errors.length) {
        debug.error("Link routing failed", errors);
      }

      self.linkNodePositions = linkNodePositions.reduce((_links, link) => {
        _links[link.id] = link;
        return _links;
      }, {} as {[id: string]: NodePosition});
      self.updateBoundingBox();

      self.routes = routes.map((route) => ({
        link: route.link,
        simplifiedPaths: route.paths.map((path) =>
          path.map((point) => ({
            x: (point.x + 0.5) * GRID_SIZE,
            y: (point.y + 0.5) * GRID_SIZE,
          }))
        ),
        paths: route.paths.map((path, i) =>
          getRoundedPathFromRoute(
            path,
            8,
            route.link.linkNode?.type === SchemaGraphNodeType.linkprop &&
              i === 0
              ? undefined
              : route.link.type
          )
        ),
      }));
      self.hideAllLinks = false;
    }),
  }))
  .actions((self) => ({
    autoLayoutNodes: flow(function* () {
      const {objectNodes} = self;
      if (!objectNodes?.length) return;

      if (self.nodesState.size > 0) {
        self.saveNodesStateToHistory();
      }

      debug.timeStart("Auto Layout");
      const layoutedNodes: layoutObjectNodesReturn = yield layoutObjectNodes(
        objectNodes,
        self.links!
      );
      debug.timeEnd("Auto Layout");
      self.nodesState.replace(layoutedNodes.map((node) => [node.id, node]));

      self.updateBoundingBox();
      self.resetViewportPosition(false);

      yield self.layoutLinks();
    }),
  }))
  .actions((self) => ({
    focusOnNode: flow(function* (nodeId: string) {
      if (!self.focusedNode) {
        self.saveNodesStateToHistory();
      }

      const focusedNode = self.objectNodes!.find(
        (node) => node.id === nodeId
      )!;

      self.focusedNode = focusedNode;
      self.hideAllLinks = true;

      const focusedLinks = focusedNode.links.filter(
        (link) => link.type === SchemaGraphLinkType.relation
      );

      const focusedNodes = new Set([
        focusedNode,
        ...focusedLinks.flatMap((link) => link.targets),
      ]);

      const focusedNodeIds = new Set(
        [...focusedNodes.values()].map((node) => node.id)
      );

      for (const nodeState of self.nodesState.values()) {
        nodeState.updateVisibility(focusedNodeIds.has(nodeState.id));
      }

      const layoutedNodes = focusedLayout(focusedNode);

      const oldFocusedNodePos = self.nodesState.get(nodeId)!;
      const newFocusedNodePos = layoutedNodes.find(
        (node) => node.id === nodeId
      )!;
      const nodeOffset = {
        x: oldFocusedNodePos.x - newFocusedNodePos.x,
        y: oldFocusedNodePos.y - newFocusedNodePos.y,
      };

      for (const node of layoutedNodes) {
        self.nodesState
          .get(node.id)
          ?.updatePosition(node.x + nodeOffset.x, node.y + nodeOffset.y);
      }

      self.updateBoundingBox();

      yield self.layoutLinks();

      self.centerOnNode(nodeId);
    }),
    exitFocusMode() {
      if (!self.focusedNode) return;

      const focusedNodeId = self.focusedNode.id;

      self.disableTransitions = true;
      self.hideAllLinks = true;

      const exitState =
        self.nodesStateHistoryUndoStack[
          self.nodesStateHistoryUndoStack.length - 1
        ];

      const currentFocusedNodePos = self.nodesState.get(focusedNodeId)!;
      const exitFocusedNodePos = exitState[focusedNodeId] as NodePosition;
      const nodeOffset = {
        x: currentFocusedNodePos.x - exitFocusedNodePos.x,
        y: currentFocusedNodePos.y - exitFocusedNodePos.y,
      };

      for (const nodeState of self.nodesState.values()) {
        nodeState.updatePosition(
          nodeState.x - nodeOffset.x,
          nodeState.y - nodeOffset.y
        );
      }

      self.updateBoundingBox();

      self.viewport.moveToRel({
        x: nodeOffset.x * self.viewport.zoomLevel,
        y: nodeOffset.y * self.viewport.zoomLevel,
      });
    },
    _focusModeExitResetComplete() {
      self.disableTransitions = false;
      self.focusedNode = null;

      applySnapshot(self.nodesState, self.nodesStateHistoryUndoStack.pop());

      self.layoutLinks();
    },
  }))
  // drag and drop
  .actions((self) => ({
    userRepositionStart() {
      if (!self.focusedNode) {
        self.saveNodesStateToHistory();
      }
      self.hideAllLinks = true;
    },
    userRepositionEnd() {
      self.removeOverlappingObjectNodes();
      self.layoutLinks();
    },
  }))
  // debug
  .actions((self) => ({
    setDebugShowAllLinks(show: boolean) {
      self.debugShowAllLinks = show;
    },
  }));
