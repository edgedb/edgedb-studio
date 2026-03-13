import {observer} from "mobx-react-lite";

import {
  SchemaAbstractAnnotation,
  SchemaAnnotation,
  splitName,
} from "@dbsof/common/schemaData";

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
import {useSchemaTextState} from "../textView";
import {SearchMatches} from "../state/textView";

import styles from "../textView.module.scss";

export function AnnotationRenderer({
  annotation,
}: {
  annotation: SchemaAnnotation;
}) {
  const {module, shortName} = splitName(annotation.name);

  return (
    <Copyable>
      <ItemHeader
        actions={<CopyButton getSDL={() => annotationToSDL(annotation)} />}
      >
        <CopyHighlight>
          <Keyword>annotation</Keyword> <TypeName type={{module, shortName}} />{" "}
          <Punc>:=</Punc> <Str>{annotation["@value"]}</Str>
          <Punc>;</Punc>
        </CopyHighlight>
      </ItemHeader>
    </Copyable>
  );
}

export function annotationToSDL(type: SchemaAnnotation) {
  return `annotation ${type.name} := '${type["@value"]}';`;
}

export const AbstractAnnotationRenderer = observer(
  function AbstractAnnotationRenderer({
    type,
    matches,
  }: {
    type: SchemaAbstractAnnotation;
    matches: SearchMatches;
  }) {
    const state = useSchemaTextState();

    const hasBody = !!type.annotations?.length;

    const collapsed = state.toggledItems.has(type.id);

    return (
      <Copyable>
        <div className={styles.typeItem}>
          <ItemHeader
            actions={
              <CopyButton getSDL={() => abstractAnnotationToSDL(type)} />
            }
          >
            {hasBody ? (
              <CollapseArrow
                collapsed={collapsed}
                onToggle={() => state.toggleItemCollapse(type.id)}
              />
            ) : null}
            <CopyHighlight>
              <Keyword>
                abstract {type.inheritable ? "inheritable " : ""}annotation
              </Keyword>{" "}
              <TypeName type={type} matches={matches} />
              {<Punc>{hasBody ? (collapsed ? " {...};" : " {") : ";"}</Punc>}
            </CopyHighlight>
          </ItemHeader>
          {hasBody && !collapsed ? (
            <>
              <div className={styles.indentedBlock}>
                {type.annotations?.map((anno, i) => (
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
  }
);

export function abstractAnnotationToSDL(type: SchemaAbstractAnnotation) {
  const hasBody = type.annotations!.length;
  return `abstract ${type.inheritable ? "inheritable " : ""}annotation ${
    type.name
  }${
    hasBody
      ? `{\n${type
          .annotations!.map((anno) => "  " + annotationToSDL(anno))
          .join("\n")}\n};`
      : ";"
  }`;
}
