import {
  SchemaGraphNodeObject,
  SchemaGraphLink,
  layoutObjectNodesReturn,
  NodePositionMap,
  layoutAndRouteLinksReturn,
} from "../interfaces";

export interface WorkerReturnMessage<T extends keyof MessageTypes> {
  messageId: number;
  returnData: MessageTypes[T]["return"];
}

export interface WorkerRequestMessage<T extends keyof MessageTypes> {
  messageId: number;
  method: T;
  args: MessageTypes[T]["args"];
}

export interface MessageTypes {
  layoutObjectNodes: {
    args: [SchemaGraphNodeObject[], SchemaGraphLink[]];
    return: layoutObjectNodesReturn;
  };
  layoutAndRouteLinks: {
    args: [SchemaGraphNodeObject[], SchemaGraphLink[], NodePositionMap];
    return: layoutAndRouteLinksReturn;
  };
}
