import {Fragment} from "react";
import {observer} from "mobx-react-lite";

import {SchemaOperator} from "@dbsof/common/schemaData";

import {Arrow, ItemHeader, Keyword, Punc, TypeLink, TypeName} from "./utils";

import {SearchMatches} from "../state/textView";

import styles from "../textView.module.scss";
import {AnnotationRenderer} from "./annotation";
import {SchemaParamRenderer} from "./function";
import {useSchemaTextState} from "../textView";

export const OperatorTypeRenderer = observer(function OperatorTypeRenderer({
  type,
  matches,
}: {
  type: SchemaOperator;
  matches: SearchMatches;
}) {
  const state = useSchemaTextState();

  const hasBody = type.annotations?.length;

  const collapsed = state.toggledItems.has(type.id);

  return (
    <div className={styles.typeItem}>
      <ItemHeader>
        <Keyword>{type.operatorKind.toLowerCase()} operator</Keyword>{" "}
        <TypeName type={type} matches={matches} />(
        {type.wrapParams ? <br /> : null}
        {type.params.map((param, i) => (
          <Fragment key={i}>
            {i !== 0 ? (
              type.wrapParams ? (
                <>
                  ,<br />
                </>
              ) : (
                ", "
              )
            ) : null}
            {type.wrapParams ? "\u00a0\u00a0" : null}
            <SchemaParamRenderer param={param} parentModule={type.module} />
          </Fragment>
        ))}
        {type.wrapParams ? <br /> : null}
        ) <Arrow />{" "}
        {type.returnTypemod !== "SingletonType" ? (
          <Keyword>
            {type.returnTypemod === "SetOfType" ? "set of " : "optional "}
          </Keyword>
        ) : null}
        <TypeLink type={type.returnType} parentModule={type.module} />
        <Punc>{hasBody ? (collapsed ? "{...};" : " {") : ";"}</Punc>
      </ItemHeader>
      {hasBody && !collapsed ? (
        <>
          <div className={styles.indentedBlock}>
            {type.annotations?.map((anno, i) => (
              <AnnotationRenderer key={i} annotation={anno} />
            ))}
          </div>
          <div>
            <Punc>{"};"}</Punc>
          </div>
        </>
      ) : (
        <div></div>
      )}
    </div>
  );
});
