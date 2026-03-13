import {
  SchemaGraphNodeObject,
  SchemaGraphLink,
  NodePositionMap,
} from "../interfaces";
import {
  WorkerReturnMessage,
  MessageTypes,
  WorkerRequestMessage,
} from "./interfaces";

import LayoutWorker from "./layout.worker?worker";

const worker = new LayoutWorker();

const handlers = new Map<number, (returnData: any) => void>();

worker.addEventListener(
  "message",
  ({data}: {data: WorkerReturnMessage<keyof MessageTypes>}) => {
    handlers.get(data.messageId)?.(data.returnData);
    handlers.delete(data.messageId);
  }
);

let messageId = 0;

function createHandler<T extends keyof MessageTypes>(
  method: T,
  args: MessageTypes[T]["args"]
): Promise<MessageTypes[T]["return"]> {
  return new Promise((resolve) => {
    const mID = messageId++;
    handlers.set(mID, resolve);
    worker.postMessage({
      messageId: mID,
      method,
      args,
    } as WorkerRequestMessage<T>);
  });
}

export function layoutObjectNodes(
  nodes: SchemaGraphNodeObject[],
  links: SchemaGraphLink[]
) {
  return createHandler("layoutObjectNodes", [nodes, links]);
}

export function layoutAndRouteLinks(
  objectNodes: SchemaGraphNodeObject[],
  links: SchemaGraphLink[],
  nodePositions: NodePositionMap
) {
  return createHandler("layoutAndRouteLinks", [
    objectNodes,
    links,
    nodePositions,
  ]);
}
