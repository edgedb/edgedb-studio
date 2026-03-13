import {SchemaObject, SchemaLink} from "../state";
import {
  SchemaGraphNode,
  SchemaGraphLink,
  SchemaGraphNodeObject,
  SchemaGraphNodeType,
  SchemaGraphLinkType,
  SchemaGraphNodeVirtual,
  SchemaGraphNodeLinkProp,
  GridPoint,
  BBOX_MARGIN,
  GRID_SIZE,
  NODE_WIDTH,
  NodePosition,
} from "./interfaces";

// Arrow head dimensions in units of grid squares
const ARROW_HEAD_WIDTH = 0.6;
const ARROW_HEAD_HEIGHT = 0.35;

export function snapToGrid(value: number) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function calculateNodeHeight(node: SchemaObject) {
  return (
    (node.properties.length +
      node.links.length +
      1 + // margin
      2 + // header and paddings
      (node.links.length ? 1 : 0)) * // links header
    GRID_SIZE
  );
}

function calculateNodeLinkPortsOffset(node: SchemaObject) {
  return node.properties.length + 3;
}

function calculateLinkPropNodeHeight(link: SchemaLink) {
  return (
    (link.properties.length + 2) * // padding + margin
    GRID_SIZE
  );
}

export function generateSchamaGraphNodesAndLinks(
  schemaObjects: SchemaObject[]
) {
  const nodes: SchemaGraphNode[] = [];
  const links: SchemaGraphLink[] = [];
  const nodeIdMapping = new Map<string, SchemaGraphNodeObject>();

  for (const object of schemaObjects) {
    const node: SchemaGraphNodeObject = {
      type: SchemaGraphNodeType.object,
      id: object.name,
      width: NODE_WIDTH,
      height: calculateNodeHeight(object),
      links: [],
      linkPortsOffset: calculateNodeLinkPortsOffset(object),
    };
    nodes.push(node);
    nodeIdMapping.set(node.id, node);
  }

  for (const object of schemaObjects) {
    const node = nodeIdMapping.get(object.name)!;

    // inheritance
    {
      const inheritLink: SchemaGraphLink = {
        type: SchemaGraphLinkType.inherit,
        id: `${object.name}-inherits`,
        name: "@@inherit",
        source: node,
        targets: object.inherits_from
          .map((targetName) => nodeIdMapping.get(targetName))
          .filter((_node) => _node !== undefined) as SchemaGraphNodeObject[],
      };

      if (inheritLink.targets.length) {
        if (inheritLink.targets.length > 1) {
          const virtualNode: SchemaGraphNodeVirtual = {
            type: SchemaGraphNodeType.virtual,
            id: `${object.name}--inheritNode`,
            width: GRID_SIZE,
            height: GRID_SIZE,
            link: inheritLink,
          };
          inheritLink.linkNode = virtualNode;
          nodes.push(virtualNode);
        }
        node.links.push(inheritLink);
        links.push(inheritLink);
      }
    }

    // relation links
    for (const link of object.links) {
      const relationLink: SchemaGraphLink = {
        type: SchemaGraphLinkType.relation,
        id: `${object.name}.${link.name}`,
        name: link.name,
        index: object.links.indexOf(link),
        source: node,
        targets: link.targetNames
          .map((targetName) => nodeIdMapping.get(targetName))
          .filter((_node) => _node !== undefined) as SchemaGraphNodeObject[],
      };

      if (relationLink.targets.length) {
        if (link.properties.length) {
          const linkPropNode: SchemaGraphNodeLinkProp = {
            type: SchemaGraphNodeType.linkprop,
            id: `${relationLink.id}..linkPropNode`,
            width: NODE_WIDTH - GRID_SIZE,
            height: calculateLinkPropNodeHeight(link),
            link: relationLink,
          };
          relationLink.linkNode = linkPropNode;
          nodes.push(linkPropNode);
        } else if (
          relationLink.targets.length > 1 ||
          relationLink.targets[0] === relationLink.source
        ) {
          const virtualNode: SchemaGraphNodeVirtual = {
            type: SchemaGraphNodeType.virtual,
            id: `${relationLink.id}..virtualNode`,
            width: GRID_SIZE,
            height: GRID_SIZE,
            link: relationLink,
          };
          relationLink.linkNode = virtualNode;
          nodes.push(virtualNode);
        }
        node.links.push(relationLink);
        links.push(relationLink);
      }
    }
  }

  return {nodes, links};
}

export function calculateBoundingBox(
  nodes: NodePosition[],
  margin: number = BBOX_MARGIN
) {
  const empty = nodes.length === 0;
  const minX = (empty ? 0 : Math.min(...nodes.map((n) => n.x))) - margin;
  const maxX =
    (empty ? 0 : Math.max(...nodes.map((n) => n.x + n.width))) + margin;
  const minY = (empty ? 0 : Math.min(...nodes.map((n) => n.y))) - margin;
  const maxY =
    (empty ? 0 : Math.max(...nodes.map((n) => n.y + n.height))) + margin;
  return {
    min: {
      x: minX,
      y: minY,
    },
    max: {
      x: maxX,
      y: maxY,
    },
    width: maxX - minX,
    height: maxY - minY,
  };
}

export type BoundingBox = ReturnType<typeof calculateBoundingBox>;

function getArcSweep(prev: GridPoint, current: GridPoint, next: GridPoint) {
  if (prev.y === current.y) {
    return prev.x < current.x
      ? next.y > current.y
        ? 1
        : 0
      : next.y > current.y
      ? 0
      : 1;
  } else {
    return prev.y < current.y
      ? next.x > current.x
        ? 0
        : 1
      : next.x > current.x
      ? 1
      : 0;
  }
}

export function getRoundedPathFromRoute(
  route: GridPoint[],
  cornerRadius: number,
  linkType?: SchemaGraphLinkType
): string {
  if (route.length < 2) return "";

  let path = `M ${route[0].x * GRID_SIZE} ${route[0].y * GRID_SIZE}`;
  for (let i = 1; i < route.length - 1; i++) {
    const [prev, current, next] = route.slice(i - 1, i + 2);

    path += ` L ${
      current.x * GRID_SIZE + Math.sign(prev.x - current.x) * cornerRadius
    } ${
      current.y * GRID_SIZE + Math.sign(prev.y - current.y) * cornerRadius
    } A ${cornerRadius} ${cornerRadius} 0 0 ${getArcSweep(
      prev,
      current,
      next
    )} ${
      current.x * GRID_SIZE + Math.sign(next.x - current.x) * cornerRadius
    } ${current.y * GRID_SIZE + Math.sign(next.y - current.y) * cornerRadius}`;
  }

  if (linkType === undefined) {
    path += `L ${route[route.length - 1].x * GRID_SIZE} ${
      route[route.length - 1].y * GRID_SIZE
    }`;
  } else {
    const isInherit = linkType === SchemaGraphLinkType.inherit;
    const parallel = {
      x: Math.sign(route[route.length - 1].x - route[route.length - 2].x),
      y: Math.sign(route[route.length - 1].y - route[route.length - 2].y),
    };
    const lastPoint = {
      x: route[route.length - 1].x - parallel.x * (2 / GRID_SIZE),
      y: route[route.length - 1].y - parallel.y * (2 / GRID_SIZE),
    };
    const w = ARROW_HEAD_WIDTH / 2;
    const h = ARROW_HEAD_HEIGHT;

    path += `L ${
      (lastPoint.x - (isInherit ? parallel.x * h : 0)) * GRID_SIZE
    } ${(lastPoint.y - (isInherit ? parallel.y * h : 0)) * GRID_SIZE}`;

    if (linkType !== undefined) {
      path += `M ${lastPoint.x * GRID_SIZE} ${lastPoint.y * GRID_SIZE} l ${
        (-parallel.x * h - parallel.y * w) * GRID_SIZE
      } ${(-parallel.y * h - parallel.x * w) * GRID_SIZE} ${
        isInherit ? "L" : "M"
      } ${(lastPoint.x - parallel.x * h + parallel.y * w) * GRID_SIZE} ${
        (lastPoint.y - parallel.y * h + parallel.x * w) * GRID_SIZE
      } L ${lastPoint.x * GRID_SIZE} ${lastPoint.y * GRID_SIZE}`;
    }
  }

  return path;
}
