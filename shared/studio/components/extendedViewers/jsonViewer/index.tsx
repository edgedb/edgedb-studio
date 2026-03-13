import {memo, useRef} from "react";
import {Text} from "@codemirror/state";
import {codeFolding, foldGutter} from "@codemirror/language";
import {json} from "@codemirror/lang-json";
import {CodeEditorRef, createCodeEditor} from "@dbsof/code-editor";
import {Theme, useTheme} from "@dbsof/common/hooks/useTheme";
import {prettyPrintJSON} from "@dbsof/common/utils/renderJsonResult";

import styles from "./jsonViewer.module.scss";
import {HeaderBar} from "../shared";
import {CustomScrollbars} from "@dbsof/common/ui/customScrollbar";

interface JsonViewerProps {
  data: string;
}

const markerEl = document.createElement("span");
markerEl.innerHTML = `<svg
  width="10"
  height="10"
  viewBox="0 0 14 7"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <path
    d="M13 1L7 6L1 1"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>`;

const CodeEditor = createCodeEditor({
  language: json(),
  highlightActiveLine: false,
  customExtensions: [
    codeFolding(),
    foldGutter({
      markerDOM: (open) => {
        const el = markerEl.cloneNode(true) as HTMLElement;
        if (!open) {
          (el.firstChild! as HTMLElement).style.transform = "rotate(-90deg)";
        }
        return el;
      },
    }),
  ],
});

export const JsonViewer = memo(function JsonViewer({data}: JsonViewerProps) {
  const editorRef = useRef<CodeEditorRef>(null);

  const [_, theme] = useTheme();

  return (
    <div className={styles.jsonViewer}>
      <HeaderBar />
      <CustomScrollbars
        className={styles.scrollWrapper}
        scrollClass="cm-scroller"
        innerClass="cm-content"
      >
        <CodeEditor
          ref={editorRef}
          code={Text.of(prettyPrintJSON(data).split("\n"))}
          onChange={() => {}}
          useDarkTheme={theme === Theme.dark}
          readonly
        />
      </CustomScrollbars>
    </div>
  );
});
