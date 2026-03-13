import {layoutObjectNodes} from "../webcolaLayout";
import {layoutAndRouteLinks} from "../linkLayout";
import {
  MessageTypes,
  WorkerRequestMessage,
  WorkerReturnMessage,
} from "./interfaces";

// eslint errors in workers silently break build (but not electron-dev)
// https://github.com/timarney/react-app-rewired/issues/362
// eslint-disable-next-line
const ctx: Worker = self as any;

ctx.addEventListener("message", ({data}) => {
  const {messageId, method, args} = data as WorkerRequestMessage<
    keyof MessageTypes
  >;
  switch (method) {
    case "layoutObjectNodes":
      layoutObjectNodes(
        ...(args as MessageTypes["layoutObjectNodes"]["args"])
      ).then((nodePositions) =>
        ctx.postMessage({
          messageId,
          returnData: nodePositions,
        } as WorkerReturnMessage<"layoutObjectNodes">)
      );
      break;
    case "layoutAndRouteLinks": {
      const returnData = layoutAndRouteLinks(
        ...(args as MessageTypes["layoutAndRouteLinks"]["args"])
      );
      ctx.postMessage({
        messageId,
        returnData,
      } as WorkerReturnMessage<"layoutAndRouteLinks">);
    }
  }
});
