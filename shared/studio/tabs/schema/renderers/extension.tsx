import cn from "@dbsof/common/utils/classNames";
import {SchemaExtension} from "@dbsof/common/schemaData";

import {
  Copyable,
  CopyButton,
  CopyHighlight,
  highlightString,
  ItemHeader,
  Keyword,
  Punc,
} from "./utils";

import {SearchMatches} from "../state/textView";

import styles from "../textView.module.scss";

export function ExtensionRenderer({
  type,
  matches,
}: {
  type: SchemaExtension;
  matches?: SearchMatches;
}) {
  const nameMatch = matches?.[""];

  return (
    <Copyable>
      <div className={cn(styles.typeItem, styles.topLevel)}>
        <ItemHeader
          actions={<CopyButton getSDL={() => extensionToSDL(type)} />}
        >
          <CopyHighlight>
            <Keyword>using extension</Keyword>{" "}
            {nameMatch
              ? highlightString(type.name, nameMatch as number[])
              : type.name}
            <Punc>;</Punc>
          </CopyHighlight>
        </ItemHeader>
      </div>
    </Copyable>
  );
}

export function extensionToSDL(type: SchemaExtension) {
  return `using extension ${type.name};`;
}
