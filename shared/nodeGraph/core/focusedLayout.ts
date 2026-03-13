import {removeOverlaps} from "./webcolaLayout";
import {
  SchemaGraphNodeObject,
  NodePosition,
  SchemaGraphLinkType,
  SchemaGraphLink,
} from "./interfaces";

export function focusedLayout(
  focusedNode: SchemaGraphNodeObject
): NodePosition[] {
  const layoutBaseRadius = focusedNode.width;
  const nodePositions: NodePosition[] = [
    {
      id: focusedNode.id,
      width: focusedNode.width,
      height: focusedNode.height,
      x: -focusedNode.width / 2,
      y: -focusedNode.height / 2,
    },
  ];

  const nonSelfLinks = focusedNode.links.filter(
    (link) =>
      link.type === SchemaGraphLinkType.relation &&
      link.targets.some((target) => target !== focusedNode)
  );

  const targetLinks = nonSelfLinks.reduce((links, link) => {
    for (const target of link.targets) {
      if (!links.has(target)) {
        links.set(target, []);
      }
      links.get(target)!.push(link);
    }
    return links;
  }, new Map<SchemaGraphNodeObject, SchemaGraphLink[]>());

  const sortedTargets = [...targetLinks.entries()]
    .map(([target, links]) => {
      const avgIndex =
        links.reduce((sum, link) => sum + nonSelfLinks.indexOf(link), 0) /
        links.length;
      return {target, avgIndex};
    })
    .sort((a, b) => a.avgIndex - b.avgIndex)
    .map(({target}) => target);

  const leftList: SchemaGraphNodeObject[][] = [];
  const rightList: SchemaGraphNodeObject[][] = [];
  let i = 0;
  let inLeftList = false;
  while (i < sortedTargets.length) {
    const target = sortedTargets[i];
    const links = targetLinks.get(target)!;

    const cluster = [target];

    let nextTarget = sortedTargets[i + 1];
    while (nextTarget && doOverlap(links, targetLinks.get(nextTarget)!)) {
      cluster.push(nextTarget);
      i++;
      nextTarget = sortedTargets[i + 1];
    }

    (inLeftList ? leftList : rightList).push(cluster);
    inLeftList = !inLeftList;
    i++;
  }

  const leftListLarger = leftList.flat().length > rightList.flat().length;

  for (const list of [leftList, rightList]) {
    if (!list.length) continue;
    const listLarger = list === leftList ? leftListLarger : !leftListLarger;

    const stepAngle = Math.PI / (list.length + (listLarger ? 0 : 1));
    const startAngle = -Math.PI / 2 + (listLarger ? stepAngle / 2 : stepAngle);

    for (let i = 0; i < list.length; i++) {
      const targets = list[i];
      const hasLinkNodes = targets.some((target) =>
        targetLinks.get(target)!.some((link) => link.linkNode)
      );

      const layoutRadius =
        layoutBaseRadius *
        (2 + (hasLinkNodes ? 0.5 : 0) + (targets.length > 1 ? 0.5 : 0));

      const cx =
        layoutRadius *
        Math.cos(i * stepAngle + startAngle) *
        (list === leftList ? -1 : 1);
      const cy = layoutRadius * Math.sin(i * stepAngle + startAngle);

      const clusterRadius = targets.length > 1 ? layoutBaseRadius / 2 : 0;
      const clusterAngle = (Math.PI * 2) / targets.length;

      for (let i = 0; i < targets.length; i++) {
        const node = targets[i];
        nodePositions.push({
          id: node.id,
          width: node.width,
          height: node.height,
          x: cx + clusterRadius * Math.cos(i * clusterAngle) - node.width / 2,
          y: cy + clusterRadius * Math.sin(i * clusterAngle) - node.height / 2,
        });
      }
    }
  }

  return removeOverlaps(nodePositions);
}

function doOverlap<T>(a: T[], b: T[]): boolean {
  for (const item of a) {
    if (b.includes(item)) return true;
  }
  return false;
}
