import {Fragment} from "react";
import {observer} from "mobx-react-lite";

import {
  SchemaAccessPolicy,
  SchemaObjectType,
  SchemaTrigger,
} from "@dbsof/common/schemaData";
import CodeBlock from "@dbsof/common/ui/codeBlock";

import {SearchMatches} from "../state/textView";

import {
  CollapseArrow,
  Copyable,
  CopyButton,
  CopyHighlight,
  indent,
  ItemHeader,
  Keyword,
  mapTypeLinkList,
  Punc,
  ShowInGraphButton,
  Str,
  TypeLink,
  TypeName,
} from "./utils";

import styles from "../textView.module.scss";
import {useSchemaTextState} from "../textView";
import {PointerRenderer, pointerToSDL} from "./pointer";
import {AnnotationRenderer, annotationToSDL} from "./annotation";
import {ConstraintRenderer, constraintToSDL} from "./constraint";
import {IndexRenderer, indexToSDL} from "./schemaIndex";

const InheritedGroup = observer(function InheritedGroup({
  baseId,
  type,
  matches,
  parentModule,
  ignorePointerNames,
}: {
  baseId: string;
  type: SchemaObjectType;
  matches?: SearchMatches;
  parentModule: string;
  ignorePointerNames: Set<string>;
}) {
  const pointers = [
    ...Object.values(type.properties),
    ...Object.values(type.links),
  ].filter((p) => p["@owned"]);

  if (!pointers.length) return null;

  return (
    <div className={styles.inheritedBlock}>
      <div className={styles.inheritedFrom}>
        <span>Inherited from </span>{" "}
        <TypeLink type={type} parentModule={parentModule} />
      </div>

      {pointers.map((pointer) =>
        ignorePointerNames.has(pointer.name) ? null : (
          <PointerRenderer
            key={pointer.id}
            id={baseId + pointer.id}
            pointer={pointer}
            matches={matches}
            parentModule={parentModule}
            parentObjectId={baseId}
            defaultCollapsed
          />
        )
      )}
    </div>
  );
});

export const ObjectTypeRenderer = observer(function ObjectTypeRenderer({
  type,
  matches,
}: {
  type: SchemaObjectType;
  matches?: SearchMatches;
}) {
  const state = useSchemaTextState();

  const extendingTypes = type.bases.filter((t) => t.name !== "std::Object");

  const ownedPointers = type.pointers.filter((pointer) => pointer["@owned"]);

  const collapsed = state.toggledItems.has(type.id);

  return (
    <Copyable>
      <div className={styles.typeItem}>
        <ItemHeader
          actions={
            <>
              <CopyButton getSDL={() => objectToSDL(type)} />
              <ShowInGraphButton type={type} />
            </>
          }
        >
          <CollapseArrow
            collapsed={collapsed}
            onToggle={() => state.toggleItemCollapse(type.id)}
          />
          <CopyHighlight>
            <Keyword>{type.abstract ? "abstract " : ""}type</Keyword>{" "}
            <TypeName type={type} matches={matches} />
            {extendingTypes.length ? (
              <>
                {" "}
                <Keyword>extending</Keyword>{" "}
                {mapTypeLinkList(extendingTypes, type.module)}
              </>
            ) : null}{" "}
            <Punc>
              {"{"}
              {collapsed ? "...};" : null}
            </Punc>
          </CopyHighlight>
        </ItemHeader>
        {collapsed ? null : (
          <>
            <div className={styles.indentedBlock}>
              {type.ancestors.map((ancestor) => (
                <InheritedGroup
                  key={ancestor.id}
                  baseId={type.id}
                  type={ancestor}
                  matches={matches}
                  parentModule={type.module}
                  ignorePointerNames={
                    new Set(ownedPointers.map((p) => p.name))
                  }
                />
              ))}
              {type.annotations.map((anno, i) => (
                <AnnotationRenderer key={i} annotation={anno} />
              ))}
              {ownedPointers
                .filter((pointer) => !(pointer.isDeprecated && type.builtin))
                .map((pointer) => (
                  <PointerRenderer
                    key={pointer.id}
                    pointer={pointer}
                    matches={matches}
                    parentModule={type.module}
                    parentObjectId={type.id}
                  />
                ))}
              {type.constraints.map((constraint) => (
                <ConstraintRenderer
                  key={constraint.id}
                  constraint={constraint}
                />
              ))}
              {type.indexes
                .filter((index) => index["@owned"])
                .map((index) => (
                  <IndexRenderer key={index.id} index={index} />
                ))}
              {type.accessPolicies.map((policy) => (
                <AccessPolicyRenderer key={policy.name} type={policy} />
              ))}
              {type.triggers.map((trigger) => (
                <TriggerRenderer key={trigger.name} type={trigger} />
              ))}
            </div>
            <div>
              <CopyHighlight>
                <Punc>{"};"}</Punc>
              </CopyHighlight>
            </div>
          </>
        )}
      </div>
    </Copyable>
  );
});

function getAccessKindsList(type: SchemaAccessPolicy): string[] {
  if (type.access_kinds.length === 5) {
    return ["all"];
  }
  const kinds = [];
  let updateIndex: number | null = null;
  for (const kind of type.access_kinds) {
    if (kind === "UpdateRead" || kind === "UpdateWrite") {
      if (updateIndex !== null) {
        kinds[updateIndex] = "update";
      } else {
        updateIndex = kinds.length;
        kinds.push("update " + kind.slice(6).toLowerCase());
      }
    } else {
      kinds.push(kind.toLowerCase());
    }
  }
  return kinds;
}

function AccessPolicyRenderer({type}: {type: SchemaAccessPolicy}) {
  const hasBody = !!type.annotations.length || type.errmessage != null;

  return (
    <Copyable>
      <div>
        <ItemHeader
          actions={<CopyButton getSDL={() => accessPolicyToSDL(type)} />}
        >
          <CopyHighlight>
            <Keyword>access policy</Keyword> {type.name}
          </CopyHighlight>
        </ItemHeader>
        <div className={styles.indentedBlock}>
          {type.condition ? (
            <div>
              <CopyHighlight>
                <Keyword>when</Keyword> <Punc>{"("}</Punc>
                <CodeBlock code={type.condition} inline />
                <Punc>{")"}</Punc>
              </CopyHighlight>
            </div>
          ) : null}
          <div>
            <CopyHighlight>
              <Keyword>{type.action.toLowerCase()}</Keyword>{" "}
              {getAccessKindsList(type).map((kind, i) => (
                <Fragment key={i}>
                  {i !== 0 ? ", " : null}
                  <Keyword>{kind.toLowerCase()}</Keyword>
                </Fragment>
              ))}
              {type.expr ? (
                <>
                  {" "}
                  <Keyword>using</Keyword> <Punc>{"("}</Punc>
                </>
              ) : (
                <Punc>{hasBody ? " {" : ";"}</Punc>
              )}
            </CopyHighlight>
            {type.expr ? (
              <>
                <div className={styles.indentedBlock}>
                  <CopyHighlight>
                    <CodeBlock code={type.expr} inline />
                  </CopyHighlight>
                </div>
                <CopyHighlight>
                  <Punc>{hasBody ? ") {" : ");"}</Punc>
                </CopyHighlight>
              </>
            ) : null}
          </div>
          {hasBody ? (
            <>
              <div className={styles.indentedBlock}>
                {type.errmessage ? (
                  <div>
                    <CopyHighlight>
                      <Keyword>errmessage</Keyword> <Punc>:=</Punc>{" "}
                      <Str>{type.errmessage}</Str>
                      <Punc>;</Punc>
                    </CopyHighlight>
                  </div>
                ) : null}
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
      </div>
    </Copyable>
  );
}

function TriggerRenderer({type}: {type: SchemaTrigger}) {
  return (
    <Copyable>
      <div>
        <ItemHeader actions={<CopyButton getSDL={() => triggerToSDL(type)} />}>
          <CopyHighlight>
            <Keyword>trigger</Keyword> {type.name}
          </CopyHighlight>
        </ItemHeader>
        <div className={styles.indentedBlock}>
          <div>
            <CopyHighlight>
              <Keyword>after</Keyword>{" "}
              {type.kinds.map((kind, i) => (
                <Fragment key={i}>
                  {i !== 0 ? ", " : ""}
                  <Keyword>{kind.toLowerCase()}</Keyword>
                </Fragment>
              ))}
            </CopyHighlight>
          </div>
          <div>
            <CopyHighlight>
              <Keyword>for {type.scope.toLowerCase()}</Keyword>
            </CopyHighlight>
          </div>
          <div>
            <CopyHighlight>
              <Keyword>do</Keyword> <Punc>{"("}</Punc>
              <CodeBlock code={type.expr} inline />
              <Punc>{");"}</Punc>
            </CopyHighlight>
          </div>
        </div>
      </div>
    </Copyable>
  );
}

export function objectToSDL(type: SchemaObjectType) {
  const pointers = [
    ...Object.values(type.properties),
    ...Object.values(type.links),
  ].filter((p) => p["@owned"]);
  const indexes = type.indexes.filter((index) => index["@owned"]);

  const extendingTypes = type.bases.filter((t) => t.name !== "std::Object");

  const hasBody =
    type.annotations.length ||
    pointers.length ||
    type.constraints.length ||
    indexes.length ||
    type.accessPolicies.length;

  return `${type.abstract ? "abstract " : ""}type ${type.escapedName}${
    extendingTypes.length
      ? ` extending ${extendingTypes.map((t) => t.escapedName).join(", ")}`
      : ""
  }${
    hasBody
      ? ` {\n${type.annotations.map(
          (anno) => "  " + annotationToSDL(anno) + "\n"
        )}${pointers
          .map((pointer) => indent(pointerToSDL(pointer)) + "\n")
          .join("")}${type.constraints
          .map((constraint) => indent(constraintToSDL(constraint)) + "\n")
          .join("")}${indexes
          .map((index) => indent(indexToSDL(index)) + "\n")
          .join("")}${type.accessPolicies
          .map((policy) => indent(accessPolicyToSDL(policy)) + "\n")
          .join("")}${type.triggers
          .map((trigger) => indent(triggerToSDL(trigger)) + "\n")
          .join("")}}`
      : ""
  };`;
}

export function accessPolicyToSDL(type: SchemaAccessPolicy) {
  const hasBody = !!type.annotations.length || type.errmessage != null;
  return `access policy ${type.name}\n  ${
    type.condition ? `when (${type.condition})\n  ` : ""
  }${type.action.toLowerCase()} ${getAccessKindsList(type).join(
    ", "
  )} using (\n    ${type.expr}\n  )${
    hasBody
      ? ` {\n${
          type.errmessage != null
            ? `    errmessage := '${type.errmessage}'\n`
            : ""
        }${type.annotations
          .map((anno) => "    " + annotationToSDL(anno) + "\n")
          .join("")}  };`
      : ";"
  }`;
}

export function triggerToSDL(type: SchemaTrigger) {
  return `trigger ${type.name}\n  after ${type.kinds
    .map((k) => k.toLowerCase())
    .join(", ")}\n  for ${type.scope.toLowerCase()}\n  do (${type.expr});`;
}
