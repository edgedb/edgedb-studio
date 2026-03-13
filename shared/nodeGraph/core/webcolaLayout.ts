import {
  Layout as webcolaLayout,
  Link as webcolaLink,
  Node as webcolaNode,
  EventType as webcolaEventType,
} from "webcola/dist/src/layout";
import {
  Rectangle as webcolaRect,
  removeOverlaps as webcolaRemoveOverlaps,
} from "webcola/dist/src/rectangle";
import {
  NodePosition,
  SchemaGraphNodeObject,
  SchemaGraphLink,
  GRID_SIZE,
  layoutObjectNodesReturn,
} from "./interfaces";
import {snapToGrid} from "./utils";

export interface LayoutOpts {
  margins?: [number, number];
  linkLengthMult?: number;
  initialUnconstrainedInter?: number;
  initalUserContraintIters?: number;
  initalAllConstraintsIters?: number;
}

const optDefaults = (_opts: LayoutOpts): Required<LayoutOpts> => ({
  margins: [3, 3],
  linkLengthMult: 0.7,
  initialUnconstrainedInter: 20,
  initalUserContraintIters: 20,
  initalAllConstraintsIters: 20,
});

interface WebcolaNode {
  id: string;
  index: number;
  width: number;
  height: number;
}
interface WebcolaLink {
  id: string;
  source: WebcolaNode;
  target: WebcolaNode;
}

export async function layoutObjectNodes(
  nodes: SchemaGraphNodeObject[],
  links: SchemaGraphLink[],
  options: LayoutOpts = {}
): Promise<layoutObjectNodesReturn> {
  const opts = optDefaults(options);

  const nodeMapping = new Map<SchemaGraphNodeObject, WebcolaNode>();

  const webcolaNodes = nodes.map((node, i) => {
    const margins = opts.margins;
    const _webcolaNode = {
      id: node.id,
      index: i,
      width: node.width + margins[0] * 2 * GRID_SIZE,
      height: node.height + margins[1] * 2 * GRID_SIZE,
    };
    nodeMapping.set(node, _webcolaNode);
    return _webcolaNode;
  });

  const webcolaLinks = links.reduce<WebcolaLink[]>((_links, link) => {
    const source = nodeMapping.get(link.source);
    for (const linkTarget of link.targets) {
      const target = nodeMapping.get(linkTarget);
      if (source && target) {
        _links.push({
          id: `${link.id}-${linkTarget.id}`,
          source: source,
          target: target,
        });
      }
    }

    return _links;
  }, []);

  const layout = await runLayout(webcolaNodes, webcolaLinks, opts);

  const positionedNodes: NodePosition[] = removeOverlaps(
    layout.nodes() as NodePosition[]
  ).map((node) => {
    const margins = opts.margins;
    return {
      id: (node as any as WebcolaNode).id,
      x: node.x + margins[0] * GRID_SIZE,
      y: node.y + margins[1] * GRID_SIZE,
      width: node.width! - margins[0] * 2 * GRID_SIZE,
      height: node.height! - margins[1] * 2 * GRID_SIZE,
    };
  });

  return positionedNodes;
}

function runLayout(
  nodes: WebcolaNode[],
  links: WebcolaLink[],
  opts: Required<LayoutOpts>
) {
  return new Promise((resolve: (value: webcolaLayout) => void) => {
    const layout = new webcolaLayout();

    layout
      .handleDisconnected(false)
      .linkDistance(nodes[0].width * opts.linkLengthMult)
      .avoidOverlaps(true)
      .nodes(nodes)
      .links(links as unknown as webcolaLink<webcolaNode>[])
      .on(webcolaEventType.end, () => {
        resolve(layout);
      });

    layout.start(
      opts.initialUnconstrainedInter,
      opts.initalUserContraintIters,
      opts.initalAllConstraintsIters,
      0
    );
  });
}

export function removeOverlaps(nodes: NodePosition[]): NodePosition[] {
  const rects = nodes.map(
    (node) =>
      new webcolaRect(
        node.x,
        node.x + node.width,
        node.y,
        node.y + node.height
      )
  );

  webcolaRemoveOverlaps(rects);

  return rects.map((rect, i) => ({
    ...nodes[i],
    x: snapToGrid(rect.x),
    y: snapToGrid(rect.y),
  }));
}
