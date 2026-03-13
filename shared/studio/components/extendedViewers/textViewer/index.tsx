import {memo, useEffect, useMemo, useRef} from "react";
import {Text, Compartment} from "@codemirror/state";
import {EditorView} from "@codemirror/view";

import {CodeEditorRef, createCodeEditor} from "@dbsof/code-editor";
import {Theme, useTheme} from "@dbsof/common/hooks/useTheme";
import {usePersistedState} from "@dbsof/common/hooks/usePersistedState";
import {CustomScrollbars} from "@dbsof/common/ui/customScrollbar";

import styles from "./textViewer.module.scss";
import {ToggleButton, HeaderBar} from "../shared";
import {LinewrapIcon, WhitespaceIcon} from "../../../icons";

interface TextViewerProps {
  data: string;
}

const linewrapComp = new Compartment();

const CodeEditor = createCodeEditor({
  language: null,
  highlightActiveLine: false,
  customExtensions: linewrapComp.of([]),
  showIndentationMarkers: false,
});

export const TextViewer = memo(function TextViewer({data}: TextViewerProps) {
  const editorRef = useRef<CodeEditorRef>(null);

  const [state, setState] = usePersistedState(
    "dbsofStudioExtendedTextViewer",
    {linewrap: false, renderWhitespace: false}
  );

  const [_, theme] = useTheme();

  useEffect(() => {
    editorRef.current?.dispatchEffect(
      linewrapComp.reconfigure(state.linewrap ? [EditorView.lineWrapping] : [])
    );
  }, [state]);

  const content = useMemo(() => {
    const lines = data.split("\n");
    return Text.of(
      state.renderWhitespace
        ? [
            ...lines.slice(0, -1).map((line) => line + "\n"),
            lines[lines.length - 1],
          ]
        : lines
    );
  }, [data, state.renderWhitespace]);

  return (
    <div className={styles.textViewer}>
      <HeaderBar>
        <ToggleButton
          icon={<LinewrapIcon />}
          active={state.linewrap}
          onClick={() => setState({...state, linewrap: !state.linewrap})}
        >
          Linewrap
        </ToggleButton>
        <ToggleButton
          icon={<WhitespaceIcon />}
          active={state.renderWhitespace}
          onClick={() =>
            setState({...state, renderWhitespace: !state.renderWhitespace})
          }
        >
          Show Whitespace
        </ToggleButton>
      </HeaderBar>
      <CustomScrollbars
        className={styles.scrollWrapper}
        scrollClass="cm-scroller"
        innerClass="cm-content"
      >
        <CodeEditor
          ref={editorRef}
          code={content}
          onChange={() => {}}
          useDarkTheme={theme === Theme.dark}
          renderWhitespace={state.renderWhitespace}
          readonly
        />
      </CustomScrollbars>
    </div>
  );
});
