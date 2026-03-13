import {observer} from "mobx-react-lite";

import {SchemaAlias} from "@dbsof/common/schemaData";

import {
  CollapseArrow,
  Copyable,
  CopyButton,
  CopyHighlight,
  ItemHeader,
  Keyword,
  Punc,
  TypeName,
} from "./utils";
import {useSchemaTextState} from "../textView";
import {SearchMatches} from "../state/textView";

import styles from "../textView.module.scss";

import {AnnotationRenderer, annotationToSDL} from "./annotation";
import CodeBlock from "@dbsof/common/ui/codeBlock";

export const AliasRenderer = observer(function AliasRenderer({
  type,
  matches,
}: {
  type: SchemaAlias;
  matches: SearchMatches;
}) {
  const state = useSchemaTextState();

  const hasBody = !!type.annotations?.length;
  const multilineExpr = type.expr.includes("\n") || /^select/i.test(type.expr);

  const collapsed = state.toggledItems.has(type.id);

  return (
    <Copyable>
      <div className={styles.typeItem}>
        <ItemHeader actions={<CopyButton getSDL={() => aliasToSDL(type)} />}>
          {hasBody || multilineExpr ? (
            <CollapseArrow
              collapsed={collapsed}
              onToggle={() => state.toggleItemCollapse(type.id)}
            />
          ) : null}
          <CopyHighlight>
            <Keyword>alias</Keyword> <TypeName type={type} matches={matches} />
            {collapsed ? (
              <Punc>{hasBody ? " {...};" : " := (...);"}</Punc>
            ) : hasBody ? (
              <Punc>{" {"}</Punc>
            ) : (
              <>
                <Punc> :=</Punc>{" "}
                {multilineExpr ? (
                  <Punc>{"("}</Punc>
                ) : (
                  <>
                    <CodeBlock code={type.expr} inline />
                    <Punc>;</Punc>
                  </>
                )}
              </>
            )}
          </CopyHighlight>
        </ItemHeader>
        {!collapsed && (hasBody || multilineExpr) ? (
          hasBody ? (
            <>
              <div className={styles.indentedBlock}>
                {type.annotations?.map((anno, i) => (
                  <AnnotationRenderer key={i} annotation={anno} />
                ))}
                <div>
                  <CopyHighlight>
                    <Keyword>using</Keyword> <Punc>{"("}</Punc>
                    {multilineExpr ? (
                      <>
                        <br />
                        <CodeBlock code={type.expr} inline />
                        <br />
                      </>
                    ) : (
                      <CodeBlock code={type.expr} inline />
                    )}
                    <Punc>{");"}</Punc>
                  </CopyHighlight>
                </div>
              </div>
              <div>
                <CopyHighlight>
                  <Punc>{"};"}</Punc>
                </CopyHighlight>
              </div>
            </>
          ) : (
            <>
              <div>
                <CodeBlock code={type.expr} inline />
              </div>
              <div>
                <Punc>{");"}</Punc>
              </div>
            </>
          )
        ) : null}
      </div>
    </Copyable>
  );
});

export function aliasToSDL(type: SchemaAlias) {
  const hasBody = !!type.annotations?.length;
  const multilineExpr = type.expr.includes("\n") || /^select/i.test(type.expr);

  return `alias ${type.name} ${
    hasBody
      ? `{\n${
          type.annotations.length
            ? type.annotations
                .map((anno) => "  " + annotationToSDL(anno) + "\n")
                .join("")
            : ""
        }  using (${
          multilineExpr
            ? `\n    ${type.expr.replace(/\n/g, "\n    ")}\n  `
            : type.expr
        });\n}`
      : `:= ${
          multilineExpr
            ? `(\n  ${type.expr.replace(/\n/g, "\n  ")}\n)`
            : type.expr
        }`
  };`;
}
