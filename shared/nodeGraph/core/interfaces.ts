// Consts

export const GRID_SIZE = 24;
export const BBOX_MARGIN = 15 * GRID_SIZE;
export const NODE_WIDTH = 11 * GRID_SIZE;

// Schema

export enum SchemaGraphNodeType {
  object,
  linkprop,
  virtual,
}

export enum SchemaGraphLinkType {
  inherit,
  relation,
}

interface SchemaGraphNodeBase {
  id: string;
  width: number;
  height: number;
}

export interface SchemaGraphNodeObject extends SchemaGraphNodeBase {
  type: SchemaGraphNodeType.object;
  links: SchemaGraphLink[];
  linkPortsOffset: number;
}

export interface SchemaGraphNodeLinkProp extends SchemaGraphNodeBase {
  type: SchemaGraphNodeType.linkprop;
  link: SchemaGraphLink;
}

export interface SchemaGraphNodeVirtual extends SchemaGraphNodeBase {
  type: SchemaGraphNodeType.virtual;
  link: SchemaGraphLink;
}

export type SchemaGraphNode =
  | SchemaGraphNodeObject
  | SchemaGraphNodeLinkProp
  | SchemaGraphNodeVirtual;

export interface SchemaGraphLink {
  type: SchemaGraphLinkType;
  id: string;
  name: string;
  index?: number;
  source: SchemaGraphNodeObject;
  targets: SchemaGraphNodeObject[];
  linkNode?: SchemaGraphNodeLinkProp | SchemaGraphNodeVirtual;
}

export interface SchemaGraphRoute {
  link: SchemaGraphLink;
  simplifiedPaths: {x: number; y: number}[][];
  paths: string[];
}

// Grid

export interface NodePosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NodePositionMap {
  [key: string]: NodePosition;
}

export interface GridPoint {
  x: number;
  y: number;
}

export type GridPointHash = string;

export function hashGridPoint({x, y}: GridPoint): GridPointHash {
  return `${x},${y}`;
}

export enum GridCellType {
  NODE,
  LINK,
  LINKPROPBLOCKER,
}

export enum GridEdgeDirection {
  TOP,
  LEFT,
  RIGHT,
  BOTTOM,
}

export interface GridNode {
  node: SchemaGraphNode;
  ports: GridNodeCell[];
  top: number;
  height: number;
}

export interface GridNodeCell extends GridPoint {
  type: GridCellType.NODE | GridCellType.LINKPROPBLOCKER;
  gridNode: GridNode;
  edge?: GridEdgeDirection;
}

export const newGridNodeCell = (
  x: number,
  y: number,
  gridNode: GridNode,
  edge?: GridEdgeDirection,
  type: GridCellType.NODE | GridCellType.LINKPROPBLOCKER = GridCellType.NODE
): GridNodeCell => ({
  type,
  x,
  y,
  gridNode,
  edge,
});

export interface GridLink {
  link: SchemaGraphLink;
  source: GridNode;
  target: GridNode;
}

export enum GridLinkCellKind {
  NORMAL,
  CORNER,
}

export interface GridLinkCell extends GridPoint {
  type: GridCellType.LINK;
  kind: GridLinkCellKind;
  gridLink: GridLink;
}

export const newGridLinkCell = (
  x: number,
  y: number,
  gridLink: GridLink,
  kind = GridLinkCellKind.NORMAL
): GridLinkCell => ({
  type: GridCellType.LINK,
  kind,
  x,
  y,
  gridLink,
});

export type GridCell = GridNodeCell | GridLinkCell;

export type Grid = Map<GridPointHash, GridCell[]>;

export type GridNodesMap = Map<string, GridNode>;

export interface Route {
  link: SchemaGraphLink;
  paths: GridPoint[][];
}

export type layoutObjectNodesReturn = NodePosition[];
export type layoutAndRouteLinksReturn = {
  routes: Route[];
  errors: any[];
  linkNodePositions: NodePosition[];
};
