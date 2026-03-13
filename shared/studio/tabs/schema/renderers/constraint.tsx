import {Fragment} from "react";
import {observer} from "mobx-react-lite";

import {SchemaConstraint} from "@dbsof/common/schemaData";
import {paramToSDL} from "@dbsof/common/schemaData/utils";

import {useSchemaTextState} from "../textView";
import {SearchMatches} from "../state/textView";

import {
  CollapseArrow,
  Copyable,
  CopyButton,
  CopyHighlight,
  ItemHeader,
  Keyword,
  Punc,
  Str,
  TypeName,
} from "./utils";

import styles from "../textView.module.scss";
import {SchemaParamRenderer} from "./function";
import {AnnotationRenderer, annotationToSDL} from "./annotation";
import CodeBlock from "@dbsof/common/ui/codeBlock";

export const AbstractConstraintRenderer = observer(
  function AbstractConstraintRenderer({
    type,
    matches,
  }: {
    type: SchemaConstraint;
    matches?: SearchMatches;
  }) {
    return (
      <ConstraintRenderer
        constraint={type}
        matches={matches}
        className={styles.typeItem}
      />
    );
  }
);

export const ConstraintRenderer = observer(function ConstraintRenderer({
  constraint,
  matches,
  className,
}: {
  constraint: SchemaConstraint;
  matches?: SearchMatches;
  className?: string;
}) {
  const state = useSchemaTextState();

  const hasBody =
    (constraint.abstract && constraint.expr) ||
    (!constraint.inheritedFields.has("errmessage") && constraint.errmessage) ||
    constraint.annotations.length;

  const collapsed = state.toggledItems.has(constraint.id);

  return (
    <Copyable>
      <div className={className}>
        <ItemHeader
          actions={<CopyButton getSDL={() => constraintToSDL(constraint)} />}
        >
          {hasBody ? (
            <CollapseArrow
              collapsed={collapsed}
              onToggle={() => state.toggleItemCollapse(constraint.id)}
            />
          ) : null}
          <CopyHighlight>
            <Keyword>
              {constraint.abstract ? "abstract " : ""}
              {constraint.delegated ? "delegated " : ""}constraint
            </Keyword>{" "}
            <TypeName type={constraint} matches={matches} />
            {constraint.params.length ? (
              <>
                (
                {constraint.params.map((param, i) => (
                  <Fragment key={i}>
                    {i !== 0 ? ", " : null}
                    {constraint.abstract ? (
                      <SchemaParamRenderer
                        param={param}
                        parentModule={constraint.module}
                      />
                    ) : (
                      <>
                        {param.kind === "NamedOnlyParam" ? (
                          <>{param.name} := </>
                        ) : null}
                        <CodeBlock code={param["@value"]} inline />
                      </>
                    )}
                  </Fragment>
                ))}
                )
              </>
            ) : null}
            {constraint.subjectexpr ? (
              <>
                {" "}
                <Keyword>on</Keyword> <Punc>(</Punc>
                <CodeBlock code={constraint.subjectexpr} inline />
                <Punc>)</Punc>
              </>
            ) : null}
            <Punc>{hasBody ? (collapsed ? " {...};" : " {") : ";"}</Punc>
          </CopyHighlight>
        </ItemHeader>
        {hasBody && !collapsed ? (
          <>
            <div className={styles.indentedBlock}>
              {constraint.abstract && constraint.expr ? (
                <div>
                  <CopyHighlight>
                    <Keyword>using</Keyword> <Punc>(</Punc>
                    <CodeBlock code={constraint.expr} inline />
                    <Punc>);</Punc>
                  </CopyHighlight>
                </div>
              ) : null}
              {!constraint.inheritedFields.has("errmessage") &&
              constraint.errmessage ? (
                <div>
                  <CopyHighlight>
                    <Keyword>errmessage</Keyword> <Punc>:=</Punc>{" "}
                    <Str>{constraint.errmessage}</Str>
                    <Punc>;</Punc>
                  </CopyHighlight>
                </div>
              ) : null}
              {constraint.annotations?.map((anno, i) => (
                <AnnotationRenderer key={i} annotation={anno} />
              ))}
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

export function constraintToSDL(constraint: SchemaConstraint) {
  const hasBody =
    (constraint.abstract && constraint.expr) ||
    (!constraint.inheritedFields.has("errmessage") && constraint.errmessage) ||
    constraint.annotations.length;

  return `${constraint.abstract ? "abstract " : ""}${
    constraint.delegated ? "delegated " : ""
  }constraint ${constraint.name}${
    constraint.params.length
      ? `(${constraint.params
          .map((param) =>
            constraint.abstract
              ? paramToSDL(param)
              : `${
                  param.kind === "NamedOnlyParam" ? `${param.name} := ` : ""
                }${param["@value"]}`
          )
          .join(", ")})`
      : ""
  }${constraint.subjectexpr ? ` on (${constraint.subjectexpr})` : ""}${
    hasBody
      ? ` {\n${
          constraint.abstract && constraint.expr
            ? `  using (${constraint.expr});\n`
            : ""
        }}`
      : ""
  }${
    !constraint.inheritedFields.has("errmessage") && constraint.errmessage
      ? `  errmessage := '${constraint.errmessage}';\n`
      : ""
  }${
    constraint.annotations.length
      ? constraint.annotations
          .map((anno) => "  " + annotationToSDL(anno) + "\n")
          .join("")
      : ""
  };`;
}
