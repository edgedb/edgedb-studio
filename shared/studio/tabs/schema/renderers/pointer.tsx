import {Fragment} from "react";
import {observer} from "mobx-react-lite";

import {SchemaPointer, SchemaRewrite} from "@dbsof/common/schemaData";

import {SearchMatches} from "../state/textView";

import {
  CollapseArrow,
  Copyable,
  CopyButton,
  CopyHighlight,
  highlightString,
  indent,
  ItemHeader,
  Keyword,
  mapTypeLinkList,
  Punc,
  TypeLink,
} from "./utils";

import styles from "../textView.module.scss";
import {useSchemaTextState} from "../textView";
import {AnnotationRenderer, annotationToSDL} from "./annotation";
import {ConstraintRenderer, constraintToSDL} from "./constraint";
import {IndexRenderer, indexToSDL} from "./schemaIndex";
import CodeBlock from "@dbsof/common/ui/codeBlock";

const targetDeleteKeywords = {
  Restrict: "restrict",
  DeleteSource: "delete source",
  Allow: "allow",
  DeferredRestrict: "deferred restrict",
};
const sourceDeleteKeywords = {
  Allow: "allow",
  DeleteTarget: "delete target",
};

export const AbstractPointerRenderer = observer(
  function AbstractPointerRenderer({
    type,
    matches,
  }: {
    type: SchemaPointer;
    matches: SearchMatches;
  }) {
    return (
      <PointerRenderer
        pointer={type}
        matches={matches}
        className={styles.typeItem}
        parentModule={type.module}
      />
    );
  }
);

export const PointerRenderer = observer(function _PointerRenderer({
  id,
  pointer,
  className,
  matches,
  parentModule,
  parentObjectId,
  linkName,
  defaultCollapsed = false,
}: {
  id?: string;
  pointer: SchemaPointer;
  className?: string;
  matches?: SearchMatches;
  parentModule: string;
  parentObjectId?: string;
  linkName?: string;
  defaultCollapsed?: boolean;
}) {
  const state = useSchemaTextState();

  const hasBody =
    pointer.default ||
    pointer.readonly ||
    pointer.annotations.length ||
    pointer.constraints.length ||
    pointer.rewrites.length ||
    (pointer.type === "Link" &&
      (Object.keys(pointer.properties).length ||
        pointer.indexes.length ||
        pointer.onTargetDelete !== "Restrict" ||
        pointer.onSourceDelete !== "Allow"));

  const bases = (pointer.bases as SchemaPointer[]).filter((p) => !p.source);
  const overloaded = pointer.bases.length !== bases.length;

  const collapsed =
    defaultCollapsed !== state.toggledItems.has(id ?? pointer.id);

  const pointerPath = pointer.abstract
    ? ""
    : linkName
    ? `${linkName}.${pointer.name}`
    : pointer.name;
  const match = matches?.[pointerPath];

  return (
    <Copyable>
      <div className={className}>
        <ItemHeader
          actions={<CopyButton getSDL={() => pointerToSDL(pointer)} />}
        >
          {hasBody ? (
            <CollapseArrow
              collapsed={collapsed}
              onToggle={() => state.toggleItemCollapse(id ?? pointer.id)}
            />
          ) : null}
          <CopyHighlight>
            {pointer.abstract ? (
              <Keyword>abstract </Keyword>
            ) : (
              <>
                {overloaded ? <Keyword>overloaded </Keyword> : null}
                {pointer.required ? <Keyword>required </Keyword> : null}
                {pointer.cardinality === "Many" ? (
                  <Keyword>multi </Keyword>
                ) : null}
              </>
            )}
            <Keyword>
              {pointer.type === "Property" ? "property" : "link"}
            </Keyword>{" "}
            {match
              ? highlightString(pointer.name, match as number[])
              : pointer.name}
            {bases.length ? (
              <>
                {" "}
                <Keyword>extending</Keyword>{" "}
                {mapTypeLinkList(bases, parentModule)}
              </>
            ) : null}
            {pointer.abstract ? null : pointer.expr && !hasBody ? (
              <>
                {" "}
                <Punc>:=</Punc> <Punc>(</Punc>
                <CodeBlock code={pointer.expr} inline />
                <Punc>)</Punc>
              </>
            ) : (
              <>
                <Punc>:</Punc>{" "}
                <TypeLink type={pointer.target!} parentModule={parentModule} />
              </>
            )}
            <Punc>{hasBody ? (collapsed ? " {...};" : " {") : ";"}</Punc>
          </CopyHighlight>
        </ItemHeader>
        {hasBody && !collapsed ? (
          <>
            <div className={styles.indentedBlock}>
              {pointer.default ? (
                <div>
                  <CopyHighlight>
                    <Keyword>default</Keyword> <Punc>{":= ("}</Punc>
                    <CodeBlock code={pointer.default} inline />
                    <Punc>{");"}</Punc>
                  </CopyHighlight>
                </div>
              ) : null}
              {pointer.readonly ? (
                <div>
                  <CopyHighlight>
                    <Keyword>readonly</Keyword> <Punc>{":="}</Punc>{" "}
                    <span className={styles.literal}>true</span>
                    <Punc>{";"}</Punc>
                  </CopyHighlight>
                </div>
              ) : null}
              {pointer.type === "Link" ? (
                <>
                  {pointer.onTargetDelete !== "Restrict" ? (
                    <div>
                      <CopyHighlight>
                        <Keyword>
                          on target delete{" "}
                          {targetDeleteKeywords[pointer.onTargetDelete]}
                        </Keyword>
                        <Punc>;</Punc>
                      </CopyHighlight>
                    </div>
                  ) : null}
                  {pointer.onSourceDelete !== "Allow" ? (
                    <div>
                      <CopyHighlight>
                        <Keyword>
                          on source delete{" "}
                          {sourceDeleteKeywords[pointer.onSourceDelete]}
                        </Keyword>
                        <Punc>;</Punc>
                      </CopyHighlight>
                    </div>
                  ) : null}
                </>
              ) : null}
              {pointer.expr ? (
                <div>
                  <CopyHighlight>
                    <Keyword>using</Keyword> <Punc>{"("}</Punc>
                    <CodeBlock code={pointer.expr} inline />
                    <Punc>{");"}</Punc>
                  </CopyHighlight>
                </div>
              ) : null}
              {pointer.annotations.map((anno, i) => (
                <AnnotationRenderer key={i} annotation={anno} />
              ))}
              {pointer.constraints.map((constraint) => (
                <ConstraintRenderer
                  key={constraint.id}
                  constraint={constraint}
                />
              ))}
              {pointer.rewrites.map((rewrite, i) => (
                <RewriteRenderer key={i} rewrite={rewrite} />
              ))}
              {pointer.type === "Link" && pointer.properties
                ? Object.values(pointer.properties).map((prop) => (
                    <PointerRenderer
                      key={prop.id}
                      pointer={prop}
                      parentModule={parentModule}
                      parentObjectId={parentObjectId}
                      linkName={pointer.name}
                      matches={matches}
                    />
                  ))
                : null}
              {pointer.type === "Link"
                ? pointer.indexes.map((index) => (
                    <IndexRenderer key={index.id} index={index} />
                  ))
                : null}
            </div>
            <div>
              <CopyHighlight>
                <Punc>{"};"}</Punc>
              </CopyHighlight>
            </div>
          </>
        ) : null}
      </div>
    </Copyable>
  );
});

function RewriteRenderer({rewrite}: {rewrite: SchemaRewrite}) {
  return (
    <Copyable>
      <div>
        <ItemHeader
          actions={<CopyButton getSDL={() => rewriteToSDL(rewrite)} />}
        >
          <CopyHighlight>
            <Keyword>rewrite</Keyword>{" "}
            {rewrite.kinds.map((kind, i) => (
              <Fragment key={i}>
                {i !== 0 ? ", " : ""}
                <Keyword>{kind.toLowerCase()}</Keyword>
              </Fragment>
            ))}
          </CopyHighlight>
        </ItemHeader>
        <div className={styles.indentedBlock}>
          <div>
            <CopyHighlight>
              <Keyword>using</Keyword> <Punc>{"("}</Punc>
              <CodeBlock code={rewrite.expr} inline />
              <Punc>{");"}</Punc>
            </CopyHighlight>
          </div>
        </div>
      </div>
    </Copyable>
  );
}

export function pointerToSDL(pointer: SchemaPointer): string {
  const hasBody =
    pointer.default ||
    pointer.readonly ||
    pointer.annotations.length ||
    pointer.constraints.length ||
    pointer.rewrites.length ||
    (pointer.type === "Link" &&
      (Object.keys(pointer.properties).length ||
        pointer.indexes.length ||
        pointer.onTargetDelete !== "Restrict" ||
        pointer.onSourceDelete !== "Allow"));

  const bases = (pointer.bases as SchemaPointer[]).filter((p) => !p.source);
  const overloaded = pointer.bases.length !== bases.length;

  return `${
    pointer.abstract
      ? "abstract "
      : `${overloaded ? "overloaded " : ""}${
          pointer.required ? "required " : ""
        }${pointer.cardinality === "Many" ? "multi " : ""}`
  }${pointer.type === "Property" ? "property" : "link"} ${
    pointer.escapedName
  }${
    bases.length
      ? " extending " + bases.map((p) => p.escapedName).join(", ")
      : ""
  }${
    pointer.abstract
      ? ""
      : pointer.expr && !hasBody
      ? ` := (${pointer.expr})`
      : `: ${pointer.target!.escapedName}`
  }${
    hasBody
      ? ` {\n${pointer.default ? `  default := (${pointer.default});\n` : ""}${
          pointer.readonly ? `  readonly := true;\n` : ""
        }${
          pointer.type === "Link"
            ? `${
                pointer.onTargetDelete !== "Restrict"
                  ? `  on target delete ${
                      targetDeleteKeywords[pointer.onTargetDelete]
                    };\n`
                  : ""
              }${
                pointer.onSourceDelete !== "Allow"
                  ? `  on source delete ${
                      sourceDeleteKeywords[pointer.onSourceDelete]
                    };\n`
                  : ""
              }`
            : ""
        }${pointer.expr ? `  using (${pointer.expr});\n` : ""}${
          pointer.annotations.length
            ? pointer.annotations
                .map((anno) => "  " + annotationToSDL(anno) + "\n")
                .join("")
            : ""
        }${
          pointer.constraints.length
            ? pointer.constraints
                .map(
                  (constraint) =>
                    "  " +
                    constraintToSDL(constraint).replace(/\n/g, "\n  ") +
                    "\n"
                )
                .join("")
            : ""
        }${pointer.rewrites
          .map((rewrite) => indent(rewriteToSDL(rewrite)) + "\n")
          .join("")}${
          pointer.type === "Link" && pointer.properties
            ? Object.values(pointer.properties)
                .map(
                  (prop) =>
                    "  " + pointerToSDL(prop).replace(/\n/g, "\n  ") + "\n"
                )
                .join("")
            : ""
        }${
          pointer.type === "Link" && pointer.indexes.length
            ? pointer.indexes.map((index) => "  " + indexToSDL(index) + "\n")
            : ""
        }}`
      : ""
  };`;
}

function rewriteToSDL(rewrite: SchemaRewrite) {
  return `rewrite ${rewrite.kinds.join(", ")}\n  using (${rewrite.expr});`;
}
