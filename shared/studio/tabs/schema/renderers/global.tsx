import {observer} from "mobx-react-lite";

import {SchemaGlobal} from "@dbsof/common/schemaData";

import {
  CollapseArrow,
  Copyable,
  CopyButton,
  CopyHighlight,
  ItemHeader,
  Keyword,
  Punc,
  TypeLink,
  TypeName,
} from "./utils";
import {useSchemaTextState} from "../textView";
import {SearchMatches} from "../state/textView";

import styles from "../textView.module.scss";
import CodeBlock from "@dbsof/common/ui/codeBlock";
import {AnnotationRenderer, annotationToSDL} from "./annotation";

export const GlobalRenderer = observer(function GlobalRenderer({
  type,
  matches,
}: {
  type: SchemaGlobal;
  matches: SearchMatches;
}) {
  const state = useSchemaTextState();

  const hasBody = type.default || type.annotations.length;

  const collapsed = state.toggledItems.has(type.id);

  return (
    <Copyable>
      <div className={styles.typeItem}>
        <ItemHeader actions={<CopyButton getSDL={() => globalToSDL(type)} />}>
          {hasBody ? (
            <CollapseArrow
              collapsed={collapsed}
              onToggle={() => state.toggleItemCollapse(type.id)}
            />
          ) : null}
          <CopyHighlight>
            <Keyword>
              {type.required ? "required " : ""}
              {type.cardinality === "Many" ? "multi " : ""}global
            </Keyword>{" "}
            <TypeName type={type} matches={matches} />
            {!type.expr ? (
              <>
                <Punc>:</Punc>{" "}
                <TypeLink type={type.target} parentModule={type.module} />
              </>
            ) : !hasBody ? (
              <>
                {" "}
                <Punc>{":= ("}</Punc>
                <CodeBlock code={type.expr} inline />
                <Punc>{")"}</Punc>
              </>
            ) : null}
            {<Punc>{hasBody ? (collapsed ? " {...};" : " {") : ";"}</Punc>}
          </CopyHighlight>
        </ItemHeader>
        {hasBody && !collapsed ? (
          <>
            <div className={styles.indentedBlock}>
              {type.default ? (
                <div>
                  <CopyHighlight>
                    <Keyword>default</Keyword> <Punc>{":= ("}</Punc>
                    <CodeBlock code={type.default} inline />
                    <Punc>{");"}</Punc>
                  </CopyHighlight>
                </div>
              ) : null}
              {type.expr ? (
                <div>
                  <CopyHighlight>
                    <Keyword>using</Keyword> <Punc>{"("}</Punc>
                    <CodeBlock code={type.expr} inline />
                    <Punc>{");"}</Punc>
                  </CopyHighlight>
                </div>
              ) : null}
              {type.annotations?.map((anno) => (
                <AnnotationRenderer annotation={anno} />
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

export function globalToSDL(type: SchemaGlobal) {
  const hasBody = type.default || type.annotations.length;

  return `${type.required ? "required " : ""}${
    type.cardinality === "Many" ? "multi " : ""
  }global ${type.escapedName}${
    !type.expr
      ? `: ${type.target.escapedName}`
      : !hasBody
      ? ` := (${type.expr})`
      : ""
  }${
    hasBody
      ? `{\n${type.default ? `  default := (${type.default});\n` : ""}${
          type.expr ? `  using (${type.expr});\n` : ""
        }${
          type.annotations.length
            ? type.annotations
                .map((anno) => "  " + annotationToSDL(anno) + "\n")
                .join("")
            : ""
        }}`
      : ""
  };`;
}
