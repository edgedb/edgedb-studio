import {Language} from "@codemirror/language";
import {highlightTree} from "@lezer/highlight";

import {queryLanguage} from "@dbsof/lang-query";
import {highlightStyle} from "@dbsof/code-editor/theme";

enum SyntaxColour {
  base,
  purple,
  green,
  blue,
  red,
  orange,
  comment,
  mod,
}

const styleClassMapping = (
  (highlightStyle.module as any).rules as string[]
).reduce((mapping, style) => {
  const [_, className, colour] = [
    ...(style.match(/\.(.*?)\s.*--syntax-(\w*)/) ?? []),
  ];
  mapping[className] = SyntaxColour[colour as any] as any;
  return mapping;
}, {} as {[key: string]: SyntaxColour});

export type ThumbnailData = number[][];

export function getThumbnailData({
  query,
  language,
}: // errorRange,
{
  query: string;
  language?: Language;
  errorRange?: [number, number];
}): ThumbnailData {
  const tree = (language ?? queryLanguage).parser.parse(query);

  const lines: ThumbnailData = [];
  let currentLine: number[] = [];
  let cursor = 0;
  let lineOffset = 0;

  function addRange(from: number, to: number, colour: SyntaxColour) {
    let inWord = query[from] !== " " && query[from] !== "\t";
    let wordStart = from;
    for (let i = from; i < to; i++) {
      switch (query[i]) {
        case "\n":
          if (inWord) {
            currentLine.push(wordStart - lineOffset, i - lineOffset, colour);
          }
          lines.push(currentLine);
          currentLine = [];
          lineOffset = i + 1;
          addRange(i + 1, to, colour);
          return;
        case " ":
        case "\t":
          if (inWord) {
            currentLine.push(wordStart - lineOffset, i - lineOffset, colour);
            inWord = false;
          }
          break;
        default:
          if (!inWord) {
            wordStart = i;
            inWord = true;
          }
          break;
      }
    }
    if (inWord) {
      currentLine.push(wordStart - lineOffset, to - lineOffset, colour);
    }
  }

  highlightTree(tree, highlightStyle, (from, to, classes) => {
    if (from !== cursor) {
      addRange(cursor, from, SyntaxColour.base);
    }
    addRange(from, to, styleClassMapping[classes]);
    cursor = to;
  });

  if (cursor !== query.length) {
    addRange(cursor, query.length, SyntaxColour.base);
  }

  if (currentLine.length) {
    lines.push(currentLine);
  }

  return lines.slice(0, 16);
}

export function renderThumbnail(data: ThumbnailData) {
  return (
    <svg viewBox="-5 -5 105 70">
      {data.flatMap((line, y) => {
        const blocks: JSX.Element[] = [];
        for (let i = 0; i < line.length; i += 3) {
          blocks.push(
            <rect
              key={`${y}-${i}`}
              x={line[i] * 2}
              y={y * 4}
              width={(line[i + 1] - line[i]) * 2}
              height={3}
              rx={0.75}
              fill={`var(--syntax-${SyntaxColour[line[i + 2]]})`}
            />
          );
        }
        return blocks;
      })}
    </svg>
  );
}
