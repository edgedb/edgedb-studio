import * as debug from "@dbsof/common/utils/debug";
import {layoutLinkNodes} from "./grid";
import {
  SchemaGraphNodeObject,
  SchemaGraphLink,
  NodePositionMap,
  SchemaGraphLinkType,
  NodePosition,
  Grid,
  GridNodesMap,
  layoutAndRouteLinksReturn,
} from "./interfaces";
import {calculateBoundingBox} from "./utils";
import {routeLinks} from "./routeLinks";

export function layoutAndRouteLinks(
  objectNodes: SchemaGraphNodeObject[],
  links: SchemaGraphLink[],
  nodePositions: NodePositionMap
): layoutAndRouteLinksReturn {
  const inheritLinks = links.filter(
    (link) => link.type === SchemaGraphLinkType.inherit
  );
  const selfLinks = links.filter(
    (link) => link.targets.length === 1 && link.targets[0] === link.source
  );
  const relationLinks = links.filter(
    (link) =>
      link.type === SchemaGraphLinkType.relation && !selfLinks.includes(link)
  );

  debug.timeStart("Layout Links");
  const {linkNodePositions, grid, gridNodes} = layoutLinkNodes(
    objectNodes,
    [...inheritLinks, ...relationLinks],
    nodePositions
  );
  debug.timeEnd("Layout Links");

  const BBox = calculateBoundingBox([
    ...Object.values(nodePositions),
    ...linkNodePositions,
  ]);

  debug.timeStart("Route Inherit Links");
  const {routes: inheritRoutes, errors: inheritErrors} = routeLinks(
    grid,
    gridNodes,
    inheritLinks,
    BBox
  );
  debug.timeEnd("Route Inherit Links");

  if (inheritErrors.length) {
    // If any inherit links fail to layout, try to layout
    // inherit links before linkprop links
    return alternativeLayout(
      objectNodes,
      inheritLinks,
      relationLinks,
      selfLinks,
      nodePositions
    );
  } else {
    // continue and layout relation links
    debug.timeStart("Route Relation Links");
    const {routes: relationRoutes, errors: relationErrors} = routeLinks(
      grid,
      gridNodes,
      relationLinks,
      BBox
    );
    debug.timeEnd("Route Relation Links");

    // route self links last
    const {
      routes: selfRoutes,
      errors: selfErrors,
      linkNodePositions: selfPositions,
    } = layoutSelfLinks(
      objectNodes,
      selfLinks,
      nodePositions,
      linkNodePositions,
      grid,
      gridNodes
    );

    return {
      routes: [...inheritRoutes, ...relationRoutes, ...selfRoutes],
      errors: [...relationErrors, ...selfErrors],
      linkNodePositions: [...linkNodePositions, ...selfPositions],
    };
  }
}

function alternativeLayout(
  objectNodes: SchemaGraphNodeObject[],
  inheritLinks: SchemaGraphLink[],
  relationLinks: SchemaGraphLink[],
  selfLinks: SchemaGraphLink[],
  nodePositions: NodePositionMap
) {
  debug.log("Inherit link layout failed -> Attempting alternative layout");

  debug.timeStart("Layout Inherit Links");
  const {
    linkNodePositions: inheritPositions,
    grid,
    gridNodes,
  } = layoutLinkNodes(objectNodes, inheritLinks, nodePositions);
  debug.timeEnd("Layout Inherit Links");

  let BBox = calculateBoundingBox([
    ...Object.values(nodePositions),
    ...inheritPositions,
  ]);

  debug.timeStart("Route Inherit Links");
  const {routes: inheritRoutes, errors: inheritErrors} = routeLinks(
    grid,
    gridNodes,
    inheritLinks,
    BBox
  );
  debug.timeEnd("Route Inherit Links");

  debug.timeStart("Layout Relation Links");
  const {linkNodePositions} = layoutLinkNodes(
    objectNodes,
    relationLinks,
    nodePositions,
    grid,
    gridNodes
  );
  debug.timeEnd("Layout Relation Links");

  BBox = calculateBoundingBox([
    ...Object.values(nodePositions),
    ...inheritPositions,
    ...linkNodePositions,
  ]);

  debug.timeStart("Route Relation Links");
  const {routes: relationRoutes, errors: relationErrors} = routeLinks(
    grid,
    gridNodes,
    relationLinks,
    BBox
  );
  debug.timeEnd("Route Relation Links");

  // route self links last
  const {
    routes: selfRoutes,
    errors: selfErrors,
    linkNodePositions: selfPositions,
  } = layoutSelfLinks(
    objectNodes,
    selfLinks,
    nodePositions,
    [...linkNodePositions, ...inheritPositions],
    grid,
    gridNodes
  );

  return {
    routes: [...inheritRoutes, ...relationRoutes, ...selfRoutes],
    errors: [...inheritErrors, ...relationErrors, ...selfErrors],
    linkNodePositions: [
      ...inheritPositions,
      ...linkNodePositions,
      ...selfPositions,
    ],
  };
}

function layoutSelfLinks(
  objectNodes: SchemaGraphNodeObject[],
  selfLinks: SchemaGraphLink[],
  nodePositions: NodePositionMap,
  linkNodePositions: NodePosition[],
  grid: Grid,
  gridNodes: GridNodesMap
) {
  if (selfLinks.length) {
    debug.timeStart("Layout Self Links");
    const {linkNodePositions: selfLinkPositions} = layoutLinkNodes(
      objectNodes,
      selfLinks,
      nodePositions,
      grid,
      gridNodes
    );
    debug.timeEnd("Layout Self Links");

    const BBox = calculateBoundingBox([
      ...Object.values(nodePositions),
      ...linkNodePositions,
      ...selfLinkPositions,
    ]);

    debug.timeStart("Route Self Links");
    const {routes, errors} = routeLinks(grid, gridNodes, selfLinks, BBox);
    debug.timeEnd("Route Self Links");

    return {routes, errors, linkNodePositions: selfLinkPositions};
  }
  return {
    routes: [],
    errors: [],
    linkNodePositions: [],
  };
}
