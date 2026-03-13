import {
  Completion,
  CompletionContext,
  CompletionResult,
  pickedCompletion,
} from "@codemirror/autocomplete";
import {syntaxTree} from "@codemirror/language";
import {Text} from "@codemirror/state";
import {EditorView} from "@codemirror/view";
import {SyntaxNode} from "@lezer/common";
import {SchemaObjectType} from "@dbsof/common/schemaData";

function sliceDoc(doc: Text, range: {from: number; to: number}): string {
  return doc.sliceString(range.from, range.to);
}

function isKeyword(
  doc: Text,
  node: SyntaxNode | null,
  keywords: string[]
): boolean {
  return (
    node?.name === "Keyword" &&
    keywords.includes(sliceDoc(doc, node).toLowerCase())
  );
}

function stripDefaultModuleName(type: SchemaObjectType): string {
  return type.module === "default" ? type.shortName : type.name;
}

function getKeywordAndName(
  doc: Text,
  node: SyntaxNode,
  nested: boolean
): {keyword: "select" | "insert" | "update"; name: string} | null {
  if (node.name === "Name" && node.prevSibling?.name === "Keyword") {
    const keyword = sliceDoc(doc, node.prevSibling).toLowerCase();
    if (keyword === "select" || (!nested && keyword === "insert")) {
      return {keyword, name: sliceDoc(doc, node)};
    }
    return null;
  }
  if (!nested && isKeyword(doc, node, ["set"])) {
    let prevNode = node.prevSibling;
    while (prevNode) {
      if (isKeyword(doc, prevNode, ["update"])) {
        if (prevNode.nextSibling?.name === "Name") {
          return {
            keyword: "update",
            name: sliceDoc(doc, prevNode.nextSibling),
          };
        }
        return null;
      }
      prevNode = prevNode.prevSibling;
    }
    return null;
  }
  return null;
}

export function getCompletions(schemaObjects: Map<string, SchemaObjectType>) {
  const userSchemaObjects = [...schemaObjects.values()].filter(
    (obj) =>
      !obj.builtin && !obj.unionOf && !obj.insectionOf && !obj.from_alias
  );

  return function completions(
    context: CompletionContext
  ): CompletionResult | null {
    const doc = context.state.doc;
    const pos = context.pos;

    let node: SyntaxNode | null = syntaxTree(context.state).resolveInner(
      pos,
      -1
    );

    if (node?.name === "Script") {
      node = node.childBefore(pos);
    }

    if (node?.name === "Statement") {
      node = node.childBefore(pos);
    }

    if (
      (isKeyword(doc, node, ["select", "insert", "update", "delete"]) &&
        node!.to < pos) ||
      (node?.name === "Name" &&
        isKeyword(doc, node.prevSibling, [
          "select",
          "insert",
          "update",
          "delete",
        ]))
    ) {
      return {
        from: node?.name === "Keyword" ? context.pos : node!.from,
        options: userSchemaObjects.map((obj) => ({
          label: stripDefaultModuleName(obj),
        })),
        validFor: (_text, _from, to, state) => {
          return syntaxTree(state).resolveInner(to, -1)?.name === "Name";
        },
      };
    }

    if (node?.name === "Braces") {
      const childBefore = node.childBefore(pos);
      if (
        childBefore?.name === "{" ||
        (childBefore?.name === "Punctuation" &&
          sliceDoc(doc, childBefore) === ",")
      ) {
        let path: string[] = [];
        let prevNode = node.prevSibling;

        while (true) {
          const keywordAndName =
            prevNode && getKeywordAndName(doc, prevNode, path.length > 0);
          if (keywordAndName) {
            const keyword = keywordAndName.keyword;
            let typeName = keywordAndName.name;
            if (!typeName.includes("::")) {
              typeName = "default::" + typeName;
            }
            let typeObj = schemaObjects.get(typeName);

            for (const pathPart of path) {
              if (!typeObj) break;

              const link = typeObj.links[pathPart];

              const targetName = !link?.target?.unionOf
                ? link.target!.name
                : null;
              typeObj = targetName ? schemaObjects.get(targetName) : undefined;
            }

            if (typeObj) {
              return {
                from: pos,
                options: [
                  ...(keyword === "select"
                    ? [
                        {
                          label: "*",
                          apply: [
                            ...Object.values(typeObj.properties).map(
                              (prop) => prop.name
                            ),
                            ...Object.values(typeObj.links).map(
                              (link) => `${link.name}: {}`
                            ),
                          ].join(
                            `,\n${" ".repeat(pos - doc.lineAt(pos).from)}`
                          ),
                        },
                      ]
                    : []),
                  ...Object.values(typeObj.properties).map((prop) => ({
                    label: prop.name,
                    apply: prop.name + (keyword === "select" ? "," : " := "),
                  })),
                  ...Object.values(typeObj.links).map((link) => ({
                    label: link.name,
                    apply:
                      keyword === "select"
                        ? (
                            view: EditorView,
                            completion: Completion,
                            from: number
                          ) => {
                            view.dispatch({
                              changes: {
                                from,
                                insert: `${completion.label}: {},`,
                              },
                              selection: {
                                anchor: from + completion.label.length + 3,
                              },
                              userEvent: "input.complete",
                              annotations: pickedCompletion.of(completion),
                            });
                          }
                        : link.name + " := ",
                  })),
                ],
              };
            }
            break;
          } else {
            const parentNode = prevNode?.parent;
            if (
              parentNode?.name === "Braces" &&
              sliceDoc(doc, prevNode!) === ":" &&
              parentNode.childBefore(prevNode!.from)?.name === "Name"
            ) {
              path.unshift(
                sliceDoc(doc, parentNode.childBefore(prevNode!.from)!)
              );
              prevNode = parentNode.prevSibling;
            } else {
              break;
            }
          }
        }
      }
    }

    return null;
  };
}
