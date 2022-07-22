import {
  useEffect,
  useRef,
  useState,
  useLayoutEffect,
  useImperativeHandle,
  forwardRef,
} from "react";

import {EditorState, StateEffect, Text} from "@codemirror/state";
import {
  EditorView,
  keymap,
  highlightActiveLine,
  highlightSpecialChars,
  drawSelection,
  KeyBinding,
  lineNumbers,
  highlightActiveLineGutter,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentLess,
  indentMore,
} from "@codemirror/commands";
import {
  bracketMatching,
  LanguageSupport,
  syntaxHighlighting,
} from "@codemirror/language";
import {
  closeBrackets,
  closeBracketsKeymap,
  autocompletion,
  completionKeymap,
} from "@codemirror/autocomplete";
import {indentationMarkers} from "@replit/codemirror-indentation-markers";
import {indentOnInput} from "@codemirror/language";
import {lintKeymap} from "@codemirror/lint";

import {edgeql, edgeqlLanguage} from "@edgedb/lang-edgeql";
import {highlightStyle, darkTheme, lightTheme} from "./theme";
import {getCompletions} from "./completions";

import {SchemaObjectType} from "@edgedb/common/schemaData";

import styles from "./codeEditor.module.scss";

interface ExtensionConfig {
  onChange: (doc: Text) => void;
  keybindings?: KeyBinding[];
  useDarkTheme?: boolean;
  language?: LanguageSupport;
  schemaObjects?: Map<string, SchemaObjectType>;
}

function getExtensions({
  onChange,
  keybindings = [],
  useDarkTheme = false,
  language,
  schemaObjects,
}: ExtensionConfig) {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    ...(schemaObjects
      ? [
          edgeqlLanguage.data.of({
            autocomplete: getCompletions(schemaObjects),
          }),
        ]
      : []),
    highlightActiveLine(),
    indentationMarkers(),
    keymap.of([
      ...keybindings,
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...completionKeymap,
      ...lintKeymap,
      {
        key: "Tab",
        run: ({state, dispatch}) => {
          if (state.selection.ranges.some((r) => !r.empty))
            return indentMore({state, dispatch});
          dispatch(
            state.update(state.replaceSelection("  "), {
              scrollIntoView: true,
              userEvent: "input",
            })
          );
          return true;
        },
        shift: indentLess,
      },
    ]),
    //
    useDarkTheme ? darkTheme : lightTheme,
    syntaxHighlighting(highlightStyle),
    language ?? edgeql(),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update.state.doc);
      }
    }),
  ];
}

function createState(doc: Text, extensionConfig: ExtensionConfig) {
  return EditorState.create({
    doc,
    extensions: getExtensions(extensionConfig),
  });
}

export interface CodeEditorProps {
  code: Text;
  onChange: (value: Text) => void;
  keybindings?: KeyBinding[];
  useDarkTheme?: boolean;
  language?: LanguageSupport;
  schemaObjects?: Map<string, SchemaObjectType>;
}

export interface CodeEditorRef {
  focus: () => void;
}

export const CodeEditor = forwardRef(function CodeEditor(
  {
    code,
    onChange,
    keybindings = [],
    language,
    useDarkTheme = false,
    schemaObjects,
  }: CodeEditorProps,
  componentRef
) {
  const ref = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  useImperativeHandle<unknown, CodeEditorRef>(componentRef, () => ({
    focus: () => view.current?.focus(),
  }));

  useEffect(() => {
    if (ref.current) {
      view.current = new EditorView({
        state: createState(code, {
          onChange,
          keybindings,
          useDarkTheme,
          language,
          schemaObjects,
        }),
        parent: ref.current,
      });

      return () => {
        view.current?.destroy();
      };
    }
  }, [ref]);

  useEffect(() => {
    if (view.current && view.current?.state.doc !== code) {
      view.current.setState(
        createState(code, {
          onChange,
          keybindings,
          useDarkTheme,
          language,
          schemaObjects,
        })
      );
    }
  }, [code]);

  useLayoutEffect(() => {
    if (view.current) {
      view.current.dispatch({
        effects: StateEffect.reconfigure.of(
          getExtensions({
            onChange,
            keybindings,
            useDarkTheme,
            language,
            schemaObjects,
          })
        ),
      });
    }
  }, [useDarkTheme, schemaObjects, language]);

  useEffect(() => {
    if (ref.current?.firstChild) {
      const observer = new ResizeObserver((entries) => {
        (
          ref.current?.querySelector(".cm-content") as HTMLElement
        )?.style.setProperty(
          "padding-bottom",
          // `${entries[0].contentRect.height - 25}px`
          `${entries[0].contentRect.height / 2}px`
        );
      });

      observer.observe(ref.current.firstChild as Element);

      return () => {
        observer.disconnect();
      };
    }
  }, [ref]);

  return <div className={styles.codeEditor} ref={ref} />;
});
