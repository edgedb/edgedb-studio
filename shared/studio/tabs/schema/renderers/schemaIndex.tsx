import {observer} from "mobx-react-lite";

import {SchemaIndex} from "@dbsof/common/schemaData";

import {useSchemaTextState} from "../textView";

import {CollapseArrow, Keyword, Punc} from "./utils";

import styles from "../textView.module.scss";
import {AnnotationRenderer, annotationToSDL} from "./annotation";
import CodeBlock from "@dbsof/common/ui/codeBlock";

export const IndexRenderer = observer(function IndexRenderer({
  index,
}: {
  index: SchemaIndex;
}) {
  const state = useSchemaTextState();

  const hasBody = index.annotations.length;

  const collapsed = state.toggledItems.has(index.id);

  return (
    <div>
      <div className={styles.collapsible}>
        {hasBody ? (
          <CollapseArrow
            collapsed={collapsed}
            onToggle={() => state.toggleItemCollapse(index.id)}
          />
        ) : null}
        <Keyword>index on</Keyword> <Punc>(</Punc>
        <CodeBlock code={index.expr} inline />
        <Punc>)</Punc>
        <Punc>{hasBody ? (collapsed ? " {...};" : " {") : ";"}</Punc>
      </div>
      {hasBody && !collapsed ? (
        <>
          <div className={styles.indentedBlock}>
            {index.annotations?.map((anno) => (
              <AnnotationRenderer annotation={anno} />
            ))}
          </div>
          <div>
            <Punc>{"};"}</Punc>
          </div>
        </>
      ) : null}
    </div>
  );
});

export function indexToSDL(index: SchemaIndex) {
  return `index on (${index.expr})${
    index.annotations.length
      ? ` {\n  ${index.annotations.map(annotationToSDL).join(";\n  ")}\n}`
      : ""
  };`;
}
