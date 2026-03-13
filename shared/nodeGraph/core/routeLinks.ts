import {aStar} from "./aStar";
import {
  SchemaGraphNode,
  SchemaGraphLink,
  SchemaGraphNodeType,
  SchemaGraphLinkType,
  SchemaGraphNodeObject,
  SchemaGraphNodeLinkProp,
  Route,
  GridNodeCell,
  hashGridPoint,
  GridCellType,
  Grid,
  GridLink,
  GridPoint,
  GridPointHash,
  GridLinkCellKind,
  newGridLinkCell,
  GRID_SIZE,
  GridNode,
} from "./interfaces";
import {BoundingBox} from "./utils";

export function routeLinks(
  grid: Grid,
  gridNodes: Map<string, GridNode>,
  sourceLinks: SchemaGraphLink[],
  BBox: BoundingBox,
  alignLinks: boolean = true
) {
  const gridBBox = {
    min: {x: BBox.min.x / GRID_SIZE, y: BBox.min.y / GRID_SIZE},
    max: {x: BBox.max.x / GRID_SIZE, y: BBox.max.y / GRID_SIZE},
  };

  const routes: Route[] = [];
  const errors: any[] = [];

  for (const link of sourceLinks) {
    const route: Route = {
      link,
      paths: [],
    };

    let sourceNode = gridNodes.get(link.source.id)!;
    let virtualSourceCell: GridNodeCell | null = null;

    if (link.linkNode) {
      const targetNode = gridNodes.get(link.linkNode.id)!;
      const gridLink = {link, source: sourceNode, target: targetNode};
      const {sourcePorts, targetPorts} = getValidPorts(gridLink, alignLinks);
      const routePath = routeLink(
        grid,
        gridLink,
        sourcePorts.filter((cell) => {
          return !grid
            .get(hashGridPoint(cell))
            ?.some(
              (_cell) =>
                _cell.type === GridCellType.LINK &&
                _cell.gridLink.link.source === gridLink.link.source
            );
        }),
        targetPorts,
        gridBBox
      );

      if (routePath.status === "failed") {
        errors.push(routePath);
        continue;
      }
      if (link.linkNode.type === SchemaGraphNodeType.linkprop) {
        route.paths.push(
          addRouteToGridAndSimplify(grid, routePath.path!, gridLink)
        );
      } else {
        virtualSourceCell = grid
          .get(hashGridPoint(routePath.path![0]))!
          .find(
            (cell) =>
              cell.type === GridCellType.NODE &&
              cell.gridNode.node.type === SchemaGraphNodeType.object
          ) as GridNodeCell;
      }
      sourceNode = targetNode;
    }

    for (const target of link.targets) {
      const targetNode = gridNodes.get(target.id)!;
      const gridLink = {link, source: sourceNode, target: targetNode};
      const {sourcePorts, targetPorts} = getValidPorts(gridLink, alignLinks);

      const selfTargetPorts =
        virtualSourceCell && link.source === target
          ? targetPorts.filter(
              (cell) =>
                Math.abs(cell.x - virtualSourceCell!.x) > 1 ||
                Math.abs(cell.y - virtualSourceCell!.y) > 1
            )
          : targetPorts;

      const routePath = routeLink(
        grid,
        gridLink,
        virtualSourceCell ? [virtualSourceCell] : sourcePorts,
        selfTargetPorts,
        gridBBox
      );

      if (routePath.status === "success") {
        route.paths.push(
          addRouteToGridAndSimplify(grid, routePath.path!, gridLink)
        );
      } else {
        errors.push(routePath);
      }
    }

    routes.push(route);
  }

  return {routes, errors};
}

function getVisibleCells(grid: Grid, gridLink: GridLink, point: GridPoint) {
  return grid.get(hashGridPoint(point))?.filter((cell) => {
    switch (cell.type) {
      case GridCellType.NODE:
        // All object nodes are visible
        if (cell.gridNode.node.type === SchemaGraphNodeType.object)
          return true;

        // Only linkprop nodes with same source object are visible
        // but all linkprop nodes are visible to inherit links
        return (
          cell.gridNode.node.type === SchemaGraphNodeType.linkprop &&
          (gridLink.link.type === SchemaGraphLinkType.inherit ||
            cell.gridNode.node.link.source === gridLink.link.source)
        );

      case GridCellType.LINKPROPBLOCKER: {
        // All Linkprop blocker node are visible to inherit links and
        // links of the same source unless linkprop belongs to this link
        const link = (cell.gridNode.node as SchemaGraphNodeLinkProp).link;
        return (
          gridLink.link.type === SchemaGraphLinkType.inherit ||
          (link.source === gridLink.link.source && link !== gridLink.link)
        );
      }
      case GridCellType.LINK:
        // If route is temporary route to virtual node
        // no other links are visible
        if (gridLink.target.node.type === SchemaGraphNodeType.virtual) {
          return false;
        }
        if (cell.gridLink.link.type === SchemaGraphLinkType.inherit) {
          // All inherit links are visible unless part of same link
          return cell.gridLink.link !== gridLink.link;
        }
        return (
          // Links with same source are visible
          cell.gridLink.link.source === gridLink.link.source &&
          // ...unless part of same branched link
          !(
            cell.gridLink.source === gridLink.source &&
            cell.gridLink.link === gridLink.link
          )
        );
    }
  });
}

function getValidPorts(link: GridLink, alignLinks: boolean) {
  const sourcePorts =
    alignLinks && link.source.node.type === SchemaGraphNodeType.object
      ? link.source.ports.filter((port) => {
          const linkPortsStart =
            link.source.top +
            (link.source.node as SchemaGraphNodeObject).linkPortsOffset;
          const linkPortsEnd = link.source.top + link.source.height - 1;
          if (link.link.type === SchemaGraphLinkType.inherit) {
            return port.y < linkPortsStart || port.y >= linkPortsEnd;
          } else {
            return port.y === linkPortsStart + link.link.index!;
          }
        })
      : link.source.ports;
  const targetPorts =
    alignLinks && link.target.node.type === SchemaGraphNodeType.object
      ? link.target.ports.filter((port) => {
          const linkPortsStart =
            link.target.top +
            (link.target.node as SchemaGraphNodeObject).linkPortsOffset;
          const linkPortsEnd = link.target.top + link.target.height - 1;
          return port.y < linkPortsStart || port.y >= linkPortsEnd;
        })
      : link.target.ports;

  return {sourcePorts, targetPorts};
}

function routeLink(
  grid: Grid,
  gridLink: GridLink,
  sourceCells: GridNodeCell[],
  targetCells: GridNodeCell[],
  BBox: {min: GridPoint; max: GridPoint}
) {
  const targetSet: Set<GridNodeCell> = new Set(targetCells);
  const targetHashes = new Set(targetCells.map(hashGridPoint));
  const searchResult = aStar<GridPoint, GridPointHash>({
    startNodes: sourceCells,
    isEnd: (point) => targetHashes.has(hashGridPoint(point)),
    neighbors: (point, prevPoint) => {
      const visibleLinkCellsAtPoint = getVisibleCells(
        grid,
        gridLink,
        point
      )?.some((cell) => cell.type === GridCellType.LINK);

      return [
        {x: point.x, y: point.y - 1},
        {x: point.x, y: point.y + 1},
        {x: point.x - 1, y: point.y},
        {x: point.x + 1, y: point.y},
      ]
        .map((nextPoint) => {
          // Skip the previous point in the path
          if (
            prevPoint &&
            prevPoint.x === nextPoint.x &&
            prevPoint.y === nextPoint.y
          )
            return null;

          // Only route inside graph bounding box
          if (
            nextPoint.x <= BBox.min.x ||
            nextPoint.x >= BBox.max.x ||
            nextPoint.y <= BBox.min.y ||
            nextPoint.y >= BBox.max.y
          )
            return null;

          const existingCells = getVisibleCells(grid, gridLink, nextPoint);

          // Prevent path from entering blocker or node
          // unless it's the target node
          if (
            existingCells?.some(
              (cell) =>
                cell.type === GridCellType.LINKPROPBLOCKER ||
                (cell.type === GridCellType.NODE && !targetSet.has(cell))
            )
          )
            return null;

          const createsCorner =
            prevPoint &&
            prevPoint.x !== nextPoint.x &&
            prevPoint.y !== nextPoint.y;

          const proximityPenalty = getProximityPenalty(nextPoint, grid);

          let crossoverPenalty = 0;

          // Don't allow next point if it creates a corner at last point
          // and link path already exists at last point
          if (createsCorner && visibleLinkCellsAtPoint) return null;

          // If visible path already exists at this point
          if (existingCells?.some((cell) => cell.type === GridCellType.LINK)) {
            // Don't allow path to overlap corner
            if (
              existingCells?.some(
                (cell) =>
                  cell.type === GridCellType.LINK &&
                  cell.kind === GridLinkCellKind.CORNER
              )
            )
              return null;

            crossoverPenalty = 1;
          }

          return {
            node: nextPoint,
            cost:
              1 +
              (createsCorner ? 1 : 0) +
              crossoverPenalty +
              proximityPenalty,
          };
        })
        .filter((nextNode) => nextNode) as {node: GridPoint; cost: number}[];
    },
    heuristic: (point) => {
      return Math.min(
        ...targetCells.map((cell) => {
          return Math.abs(cell.x - point.x) + Math.abs(cell.y - point.y);
        })
      );
    },
    hash: (node, prevPoint) =>
      hashGridPoint(node) + (prevPoint ? "|" + hashGridPoint(prevPoint) : ""),
  });

  if (searchResult.status !== "success" || searchResult.path.length < 2) {
    return {
      status: "failed",
      gridLink,
      searchResult,
    };
  }

  return {
    status: "success",
    path: searchResult.path,
  };
}

function addRouteToGridAndSimplify(
  grid: Grid,
  route: GridPoint[],
  gridLink: GridLink
) {
  const simplifiedPath: GridPoint[] = [route[0]];

  for (let i = 0; i < route.length; i++) {
    let kind: GridLinkCellKind | undefined;
    if (i > 0 && i < route.length - 1) {
      const [prev, point, next] = route.slice(i - 1, i + 2);

      kind =
        prev.x !== next.x && prev.y !== next.y
          ? GridLinkCellKind.CORNER
          : GridLinkCellKind.NORMAL;

      if (kind === GridLinkCellKind.CORNER) {
        simplifiedPath.push(point);
      }
    }

    const linkCell = newGridLinkCell(route[i].x, route[i].y, gridLink, kind);
    const pointHash = hashGridPoint(linkCell);
    if (!grid.has(pointHash)) {
      grid.set(pointHash, []);
    }
    grid.get(pointHash)!.push(linkCell);
  }

  simplifiedPath.push(route[route.length - 1]);

  if (gridLink.target.node.type === SchemaGraphNodeType.linkprop) {
    const lastGridNode = grid
      .get(hashGridPoint(route[route.length - 1]))
      ?.find(
        (cell) =>
          cell.type === GridCellType.NODE && cell.gridNode === gridLink.target
      ) as GridNodeCell;
    gridLink.target.ports = gridLink.target.ports.filter(
      (cell) => cell.edge !== lastGridNode.edge
    );
  }

  return simplifiedPath;
}

function getProximityPenalty(point: GridPoint, grid: Grid) {
  const nextPoints = [
    {x: point.x, y: point.y - 1},
    {x: point.x, y: point.y + 1},
    {x: point.x - 1, y: point.y},
    {x: point.x + 1, y: point.y},
  ];

  for (const nextPoint of nextPoints) {
    const gridCells = grid.get(hashGridPoint(nextPoint)) ?? [];
    for (const cell of gridCells) {
      if (
        cell.type === GridCellType.NODE &&
        cell.gridNode.node.type === SchemaGraphNodeType.object
      )
        return 1;
    }
  }
  return 0;
}
