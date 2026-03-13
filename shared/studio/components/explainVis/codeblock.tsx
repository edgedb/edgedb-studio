import CodeBlock, {
  CodeBlockProps,
  CustomRange,
} from "@dbsof/common/ui/codeBlock";
import {useMemo} from "react";
import {Contexts as ExplainContexts} from "./state";

export function ExplainCodeBlock({
  explainContexts,
  ...props
}: React.HTMLAttributes<HTMLPreElement> &
  Omit<CodeBlockProps, "customRanges"> & {explainContexts: ExplainContexts}) {
  const customRanges = useMemo(
    () => explainContextsToRanges(explainContexts),
    [explainContexts]
  );

  return <CodeBlock {...props} customRanges={customRanges} />;
}

function explainContextsToRanges(explainContexts: ExplainContexts) {
  const edges = explainContexts
    .flatMap((ctx) => [
      {
        type: "start",
        index: ctx.start,
        ctxId: ctx.id,
      },
      {
        type: "end",
        index: ctx.end,
        ctxId: ctx.id,
      },
    ])
    .sort((a, b) => a.index - b.index);

  if (!edges.length) {
    return [];
  }

  const customRanges: CustomRange[] = [];
  let cursor = edges[0].index;
  const currentCtxIds = new Set<number>([edges[0].ctxId]);
  for (const edge of edges.slice(1)) {
    if (cursor !== edge.index) {
      const ctxIds = [...currentCtxIds];
      customRanges.push({
        range: [cursor, edge.index],
        renderer: (_, content) => {
          for (const ctxId of ctxIds) {
            content = <span data-ctx-id={ctxId.toString()}>{content}</span>;
          }
          return content;
        },
      });
    }

    if (edge.type == "start") {
      currentCtxIds.add(edge.ctxId);
    } else {
      currentCtxIds.delete(edge.ctxId);
    }
    cursor = edge.index;
  }

  return customRanges;
}
