// Modified from https://github.com/andrewrk/node-astar/blob/master/index.js

import FastPriorityQueue from "fastpriorityqueue";

interface SearchNode<Node> {
  data: Node;
  g: number;
  h: number;
  f: number;
  parent?: SearchNode<Node>;
}

const maxNodeSearch = 10000;

export function aStar<Node, Hash>(params: {
  startNodes: Node[];
  isEnd: (node: Node, prevNode?: Node) => boolean;
  neighbors: (node: Node, prevNode?: Node) => {node: Node; cost: number}[];
  heuristic: (node: Node) => number;
  hash: (node: Node, prevNode?: Node) => Hash;
}) {
  const hash = params.hash;
  let seachedNodesCount = 0;

  const closedDataSet = new Set<Hash>();
  const openHeap = new FastPriorityQueue<SearchNode<Node>>(
    (a, b) => b.f > a.f
  );
  const openDataMap = new Map<Hash, SearchNode<Node>>();

  params.startNodes.forEach((nodeData) => {
    const node: SearchNode<Node> = {
      data: nodeData,
      g: 0,
      h: params.heuristic(nodeData),
      f: Infinity,
    };
    node.f = node.h;
    // leave .parent undefined
    openHeap.add(node);
    openDataMap.set(hash(node.data, node.parent?.data), node);
  });
  let bestNode = openHeap.peek() as SearchNode<Node>;

  while (!openHeap.isEmpty()) {
    if (seachedNodesCount++ > maxNodeSearch) {
      return {
        status: "timeout",
        cost: bestNode.g,
        path: reconstructPath(bestNode),
      };
    }

    const node = openHeap.poll() as SearchNode<Node>;
    const nodeHash = hash(node.data, node.parent?.data);
    openDataMap.delete(nodeHash);
    if (params.isEnd(node.data, node.parent?.data)) {
      // done
      return {
        status: "success",
        cost: node.g,
        path: reconstructPath(node),
      };
    }
    // not done yet
    closedDataSet.add(nodeHash);
    const neighbors = params.neighbors(node.data, node.parent?.data);
    for (const neighborData of neighbors) {
      const neighborHash = hash(neighborData.node, node.data);
      if (closedDataSet.has(neighborHash)) {
        // skip closed neighbors
        continue;
      }
      const gFromThisNode = node.g + neighborData.cost;
      let neighborNode = openDataMap.get(neighborHash);
      let update = false;
      if (neighborNode === undefined) {
        // add neighbor to the open set
        neighborNode = {
          data: neighborData.node,
          g: Infinity,
          h: Infinity,
          f: Infinity,
        };
        // other properties will be set later
        openDataMap.set(neighborHash, neighborNode);
      } else {
        if (neighborNode.g < gFromThisNode) {
          // skip this one because another route is faster
          continue;
        }
        update = true;
      }
      // found a new or better route.
      // update this neighbor with this node as its new parent
      neighborNode.parent = node;
      neighborNode.g = gFromThisNode;
      neighborNode.h = params.heuristic(neighborData.node);
      neighborNode.f = gFromThisNode + neighborNode.h;
      if (neighborNode.h < bestNode.h) bestNode = neighborNode;
      if (update) {
        openHeap.removeOne((_node) => _node === neighborNode);
      }
      openHeap.add(neighborNode);
    }
  }
  // all the neighbors of every accessible node have been exhausted
  return {
    status: "noPath",
    cost: bestNode.g,
    path: reconstructPath(bestNode),
  };
}

function reconstructPath<Node>(fromNode: SearchNode<Node>): Node[] {
  const path: Node[] = [];
  let node: SearchNode<Node> | undefined = fromNode;
  while (node) {
    path.push(node.data);
    node = node.parent;
  }
  return path.reverse();
}
