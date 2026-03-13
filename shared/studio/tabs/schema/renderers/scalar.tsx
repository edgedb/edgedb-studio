import {observer} from "mobx-react-lite";

import {SchemaScalarType} from "@dbsof/common/schemaData";

import {useSchemaTextState} from "../textView";

import {
  CollapseArrow,
  Copyable,
  CopyButton,
  CopyHighlight,
  ItemHeader,
  Keyword,
  mapTypeLinkList,
  Punc,
  TypeName,
} from "./utils";

import styles from "../textView.module.scss";

import {SearchMatches} from "../state/textView";

import {AnnotationRenderer, annotationToSDL} from "./annotation";
import {ConstraintRenderer, constraintToSDL} from "./constraint";

export const ScalarTypeRenderer = observer(function ScalarTypeRenderer({
  type,
  matches,
}: {
  type: SchemaScalarType;
  matches?: SearchMatches;
}) {
  const state = useSchemaTextState();

  const hasBody = type.annotations.length || type.constraints.length;

  const collapsed = state.toggledItems.has(type.id);

  return (
    <Copyable>
      <div className={styles.typeItem}>
        <ItemHeader actions={<CopyButton getSDL={() => scalarToSDL(type)} />}>
          {hasBody ? (
            <CollapseArrow
              collapsed={collapsed}
              onToggle={() => state.toggleItemCollapse(type.id)}
            />
          ) : null}
          <CopyHighlight>
            <Keyword>{type.abstract ? "abstract " : ""}scalar type</Keyword>{" "}
            <TypeName type={type} matches={matches} />
            {type.enum_values ? (
              <>
                {" "}
                <Keyword>extending</Keyword>
                {` enum<${type.enum_values.join(", ")}>`}
              </>
            ) : type.bases.length ? (
              <>
                {" "}
                <Keyword>extending</Keyword>{" "}
                {mapTypeLinkList(type.bases, type.module)}
                {type.arg_values ? `<${type.arg_values.join(", ")}>` : null}
              </>
            ) : null}
            <Punc>{hasBody ? (collapsed ? " {...};" : " {") : ";"}</Punc>
          </CopyHighlight>
        </ItemHeader>
        {hasBody && !collapsed ? (
          <>
            <div className={styles.indentedBlock}>
              {type.annotations.map((anno, i) => (
                <AnnotationRenderer key={i} annotation={anno} />
              ))}
              {type.constraints.map((constraint) => (
                <ConstraintRenderer
                  key={constraint.id}
                  constraint={constraint}
                />
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

export function scalarToSDL(type: SchemaScalarType) {
  const hasBody = type.annotations.length || type.constraints.length;

  return `${type.abstract ? "abstract " : ""}scalar type ${type.escapedName}${
    type.enum_values
      ? ` extending enum<${type.enum_values.join(", ")}>`
      : type.bases.length
      ? ` extending ${type.bases.map((t) => t.escapedName).join(", ")}${
          type.arg_values ? `<${type.arg_values.join(", ")}>` : ""
        }`
      : ""
  }${
    hasBody
      ? ` {\n${
          type.annotations.length
            ? type.annotations
                .map((anno) => "  " + annotationToSDL(anno) + "\n")
                .join("")
            : ""
        }${
          type.constraints.length
            ? type.constraints
                .map(
                  (constraint) =>
                    "  " +
                    constraintToSDL(constraint).replace(/\n/g, "  \n") +
                    "\n"
                )
                .join("")
            : ""
        }}`
      : ""
  };`;
}
