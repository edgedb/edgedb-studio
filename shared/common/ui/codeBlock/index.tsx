import React, {Fragment} from "react";
import {StyleModule} from "style-mod";

import {Tree} from "@lezer/common";
import {Language} from "@codemirror/language";
import {highlightTree} from "@lezer/highlight";

import {queryLanguage} from "@dbsof/lang-query";
import {highlightStyle} from "@dbsof/code-editor/theme";

if (highlightStyle.module) {
  StyleModule.mount(document, highlightStyle.module);
}

export type Range = [number, number];

export type CustomRange = {range: Range} & (
  | {style?: string; attrs?: {[key: string]: string}}
  | {
      renderer: (range: Range, content: JSX.Element) => JSX.Element;
    }
);

export interface CodeBlockProps {
  code: string;
  language?: Language;
  customRanges?: CustomRange[] | ((tree: Tree) => CustomRange[]);
  inline?: boolean;
}

export default function CodeBlock({
  code,
  language,
  customRanges,
  inline,
  ...otherProps
}: React.HTMLAttributes<HTMLPreElement> & CodeBlockProps) {
  const tree = (language ?? queryLanguage).parser.parse(code);

  const html: (string | JSX.Element)[] = [];

  let ranges = Array.isArray(customRanges)
    ? customRanges
    : customRanges?.(tree);

  let nextRangeIndex = 0;
  let currentRange = ranges?.[nextRangeIndex++];

  let customRangeBuffer: (string | JSX.Element)[] | null = null;

  let cursor = 0;
  function addSpan(text: string, className?: string): void {
    if (
      !customRangeBuffer &&
      currentRange &&
      currentRange.range[0] >= cursor &&
      currentRange.range[0] <= cursor + text.length
    ) {
      if (currentRange.range[0] !== cursor) {
        const textSlice = text.slice(0, currentRange.range[0] - cursor);
        html.push(
          className ? (
            <span key={html.length} className={className}>
              {textSlice}
            </span>
          ) : (
            textSlice
          )
        );
        text = text.slice(currentRange.range[0] - cursor);
      }
      cursor = currentRange.range[0];
      customRangeBuffer = [];
    }
    if (customRangeBuffer) {
      if (currentRange!.range[1] <= cursor + text.length) {
        const textSlice = text.slice(0, currentRange!.range[1] - cursor);
        customRangeBuffer.push(
          className ? (
            <span key={customRangeBuffer.length} className={className}>
              {textSlice}
            </span>
          ) : (
            textSlice
          )
        );

        html.push(
          "renderer" in currentRange! ? (
            <Fragment key={html.length}>
              {currentRange!.renderer(
                currentRange!.range,
                <>{customRangeBuffer}</>
              )}
            </Fragment>
          ) : (
            <span
              key={html.length}
              className={currentRange!.style}
              {...currentRange!.attrs}
            >
              {customRangeBuffer}
            </span>
          )
        );

        customRangeBuffer = null;
        cursor = currentRange!.range[1];
        currentRange = ranges?.[nextRangeIndex++];
        return addSpan(text.slice(textSlice.length), className);
      } else {
        customRangeBuffer.push(
          className ? (
            <span key={customRangeBuffer.length} className={className}>
              {text}
            </span>
          ) : (
            text
          )
        );
        cursor += text.length;
        return;
      }
    }
    html.push(
      className ? (
        <span key={html.length} className={className}>
          {text}
        </span>
      ) : (
        text
      )
    );
    cursor += text.length;
  }

  highlightTree(tree, highlightStyle, (from, to, classes) => {
    if (cursor !== from) {
      addSpan(code.slice(cursor, from));
    }
    addSpan(code.slice(from, to), classes);
  });
  addSpan(code.slice(cursor));

  if (currentRange && customRangeBuffer) {
    html.push(
      "renderer" in currentRange ? (
        <Fragment key={html.length}>
          {currentRange!.renderer(
            currentRange!.range,
            <>{customRangeBuffer}</>
          )}
        </Fragment>
      ) : (
        <span
          key={html.length}
          className={currentRange.style}
          {...currentRange.attrs}
        >
          {customRangeBuffer}
        </span>
      )
    );
  }

  return inline ? (
    <span {...otherProps}>{html}</span>
  ) : (
    <pre {...otherProps}>{html}</pre>
  );
}
