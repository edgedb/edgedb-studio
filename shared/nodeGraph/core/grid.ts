import {
  NodePosition,
  SchemaGraphLink,
  SchemaGraphNodeType,
  NodePositionMap,
  GridNode,
  newGridNodeCell,
  GridEdgeDirection,
  Grid,
  hashGridPoint,
  GridCellType,
  SchemaGraphNodeObject,
  GRID_SIZE,
  GridPoint,
  SchemaGraphNodeLinkProp,
  SchemaGraphNodeVirtual,
  SchemaGraphLinkType,
  GridNodesMap,
} from "./interfaces";
import {snapToGrid} from "./utils";

const sum = (values: number[]) => values.reduce((_sum, n) => _sum + n, 0);

interface NodeSize {
  width: number;
  height: number;
}

export function layoutLinkNodes(
  objectNodes: SchemaGraphNodeObject[],
  links: SchemaGraphLink[],
  nodePositions: NodePositionMap,
  reuseGrid?: Grid,
  reuseGridNodes?: GridNodesMap
) {
  const linkNodePositions: NodePosition[] = [];
  let grid = reuseGrid;
  let gridNodes = reuseGridNodes;
  if (!grid || !gridNodes) {
    const newGrid = initGrid(objectNodes, nodePositions);
    grid = newGrid.grid;
    gridNodes = newGrid.gridNodes;
  }

  const linksWithNodes = [
    ...links.filter(
      (link) => link.linkNode?.type === SchemaGraphNodeType.linkprop
    ),
    ...links.filter(
      (link) => link.linkNode?.type === SchemaGraphNodeType.virtual
    ),
  ];

  for (const link of linksWithNodes) {
    const linkNode = link.linkNode!;

    const margins =
      linkNode.type === SchemaGraphNodeType.linkprop ? [3, 1] : [0, 0];
    const width = linkNode.width / GRID_SIZE + margins[0] * 2;
    const height = linkNode.height / GRID_SIZE + margins[1] * 2;

    const nodeCenters = [link.source, ...link.targets].map((node) => {
      const pos = nodePositions[node.id]!;
      return {x: pos.x + pos.width / 2, y: pos.y + pos.height / 2};
    });

    const centerPoint = {
      x:
        (nodeCenters[0].x +
          sum(nodeCenters.slice(1).map((n) => n.x)) /
            (nodeCenters.length - 1)) /
        2,
      y:
        (nodeCenters[0].y +
          sum(nodeCenters.slice(1).map((n) => n.y)) /
            (nodeCenters.length - 1)) /
        2,
    };

    const linkCenterPos = {
      x: snapToGrid(centerPoint.x - linkNode.width / 2) / GRID_SIZE,
      y: snapToGrid(centerPoint.y - linkNode.height / 2) / GRID_SIZE,
    };

    const linkPos = findClosestPosition(
      grid,
      linkCenterPos,
      {
        width,
        height,
      },
      link
    );

    const nodePos: NodePosition = {
      id: linkNode.id,
      width: linkNode.width,
      height: linkNode.height,
      x: (linkPos.x + margins[0]) * GRID_SIZE,
      y: (linkPos.y + margins[1]) * GRID_SIZE,
    };

    addNodeToGrid(grid, gridNodes, nodePos, linkNode);

    linkNodePositions.push(nodePos);
  }

  return {grid, gridNodes, linkNodePositions};
}

function pointToNum({x, y}: GridPoint) {
  return ((x + 32768) << 16) + (y + 32768);
}

function findClosestPosition(
  grid: Grid,
  point: GridPoint,
  nodeSize: NodeSize,
  link: SchemaGraphLink
) {
  const queue: GridPoint[] = [point];
  const queued = new Set<number>([pointToNum(queue[0])]);

  while (true) {
    const newPoint = queue.shift()!;

    if (checkNodeFitsAtPoint(grid, newPoint, nodeSize, link)) {
      return newPoint;
    }

    const nextPoints = [
      {x: newPoint.x, y: newPoint.y + 1},
      {x: newPoint.x - 1, y: newPoint.y},
      {x: newPoint.x, y: newPoint.y - 1},
      {x: newPoint.x + 1, y: newPoint.y},
    ];
    for (const nextPoint of nextPoints) {
      const num = pointToNum(nextPoint);
      if (!queued.has(num)) {
        queue.push(nextPoint);
        queued.add(num);
      }
    }
  }
}

function checkNodeFitsAtPoint(
  grid: Grid,
  point: GridPoint,
  nodeSize: NodeSize,
  link: SchemaGraphLink
) {
  for (let y = 0; y < nodeSize.height; y++) {
    for (let x = 0; x < nodeSize.width; x++) {
      if (
        grid
          .get(hashGridPoint({x: point.x + x, y: point.y + y}))
          ?.some((cell) => {
            if (cell.type === GridCellType.NODE) {
              return (
                cell.gridNode.node.type === SchemaGraphNodeType.object ||
                cell.gridNode.node.link.source === link.source
              );
            } else if (cell.type === GridCellType.LINKPROPBLOCKER) {
              return (
                (cell.gridNode.node as SchemaGraphNodeLinkProp).link.source ===
                link.source
              );
            } else if (cell.type === GridCellType.LINK) {
              return (
                cell.gridLink.link.type === SchemaGraphLinkType.inherit ||
                cell.gridLink.link.source === link.source
              );
            }
          })
      )
        return false;
    }
  }
  return true;
}

function addNodeToGrid(
  grid: Grid,
  gridNodes: GridNodesMap,
  nodePos: NodePosition,
  node: SchemaGraphNodeLinkProp | SchemaGraphNodeVirtual
) {
  const gridNode: GridNode = {
    node,
    ports: [],
    top: nodePos.y / GRID_SIZE,
    height: node.height / GRID_SIZE,
  };
  gridNodes.set(node.id, gridNode);

  if (node.type === SchemaGraphNodeType.virtual) {
    const x = nodePos.x / GRID_SIZE;
    const y = nodePos.y / GRID_SIZE;
    const nodeCell = newGridNodeCell(x, y, gridNode);

    gridNode.ports.push(nodeCell);
  } else {
    const edges = getNodeEdgeCells(gridNode, nodePos);

    const edgeCells = [
      edges.topLeft,
      ...edges.top,
      edges.topRight,
      ...edges.left,
      ...edges.right,
      edges.bottomLeft,
      ...edges.bottom,
      edges.bottomRight,
      ...edges.inner,
    ];

    for (const cell of edgeCells) {
      let cells = grid.get(hashGridPoint(cell));
      if (!cells) {
        cells = [];
        grid.set(hashGridPoint(cell), cells);
      }
      cells.push(cell);
    }

    gridNode.ports.push(...edges.left, ...edges.right);

    for (const cell of edges.left) {
      const blocker = newGridNodeCell(
        cell.x - 1,
        cell.y,
        gridNode,
        undefined,
        GridCellType.LINKPROPBLOCKER
      );
      let cells = grid.get(hashGridPoint(blocker));
      if (!cells) {
        cells = [];
        grid.set(hashGridPoint(blocker), cells);
      }
      cells.push(blocker);
    }
    for (const cell of edges.right) {
      const blocker = newGridNodeCell(
        cell.x + 1,
        cell.y,
        gridNode,
        undefined,
        GridCellType.LINKPROPBLOCKER
      );
      let cells = grid.get(hashGridPoint(blocker));
      if (!cells) {
        cells = [];
        grid.set(hashGridPoint(blocker), cells);
      }
      cells.push(blocker);
    }
  }
}

function getNodeCorners(nodePos: NodePosition) {
  const x0 = nodePos.x / GRID_SIZE;
  const y0 = nodePos.y / GRID_SIZE;
  const x1 = x0 + nodePos.width / GRID_SIZE - 1;
  const y1 = y0 + nodePos.height / GRID_SIZE - 1;
  return {
    x0,
    y0,
    x1,
    y1,
  };
}

function getNodeEdgeCells(node: GridNode, nodePos: NodePosition) {
  const {x0, y0, x1, y1} = getNodeCorners(nodePos);
  const w = x1 - x0 - 1;
  const h = y1 - y0 - 1;
  return {
    topLeft: newGridNodeCell(x0, y0, node),
    top: Array(x1 - x0 - 1)
      .fill(0)
      .map((_, i) =>
        newGridNodeCell(x0 + i + 1, y0, node, GridEdgeDirection.TOP)
      ),
    topRight: newGridNodeCell(x1, y0, node),
    left: Array(y1 - y0 - 1)
      .fill(0)
      .map((_, i) =>
        newGridNodeCell(x0, y0 + i + 1, node, GridEdgeDirection.LEFT)
      ),
    right: Array(y1 - y0 - 1)
      .fill(0)
      .map((_, i) =>
        newGridNodeCell(x1, y0 + i + 1, node, GridEdgeDirection.RIGHT)
      ),
    bottomLeft: newGridNodeCell(x0, y1, node),
    bottom: Array(x1 - x0 - 1)
      .fill(0)
      .map((_, i) =>
        newGridNodeCell(x0 + i + 1, y1, node, GridEdgeDirection.BOTTOM)
      ),
    bottomRight: newGridNodeCell(x1, y1, node),
    inner: Array(w * h)
      .fill(0)
      .map((_, i) =>
        newGridNodeCell(x0 + 1 + (i % w), y0 + 1 + ((i / w) | 0), node)
      ),
  };
}

function initGrid(
  nodes: SchemaGraphNodeObject[],
  nodePositions: NodePositionMap
) {
  const grid: Grid = new Map();
  const gridNodes = new Map<string, GridNode>();

  for (const node of nodes) {
    const nodePos = nodePositions[node.id]!;
    const gridNode: GridNode = {
      node,
      ports: [],
      top: nodePos.y / GRID_SIZE,
      height: node.height / GRID_SIZE,
    };
    gridNodes.set(node.id, gridNode);

    const edges = getNodeEdgeCells(gridNode, nodePos);

    const edgeCells = [
      edges.topLeft,
      ...edges.top,
      edges.topRight,
      ...edges.left,
      ...edges.right,
      edges.bottomLeft,
      ...edges.bottom,
      edges.bottomRight,
      ...edges.inner,
    ];

    for (const cell of edgeCells) {
      grid.set(hashGridPoint(cell), [cell]);
    }

    gridNode.ports.push(
      ...edges.left,
      ...edges.right,
      ...edges.top,
      ...edges.bottom
    );
  }

  return {grid, gridNodes};
}
