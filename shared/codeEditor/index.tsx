import {
  useEffect,
  useRef,
  useLayoutEffect,
  useImperativeHandle,
  forwardRef,
} from "react";

import {
  EditorState,
  Text,
  Compartment,
  EditorSelection,
  Extension,
  StateEffect,
  Range,
  RangeSet,
} from "@codemirror/state";
import {
  EditorView,
  keymap,
  highlightActiveLine as highlightActiveLineExt,
  highlightSpecialChars,
  drawSelection,
  KeyBinding,
  lineNumbers,
  Decoration,
  WidgetType,
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
  indentOnInput,
} from "@codemirror/language";
import {
  closeBrackets,
  closeBracketsKeymap,
  autocompletion,
  completionKeymap,
} from "@codemirror/autocomplete";
import {indentationMarkers} from "@replit/codemirror-indentation-markers";
import {lintKeymap} from "@codemirror/lint";

import {
  queryLanguageSupport,
  queryLanguage,
} from "@dbsof/lang-query";
import {highlightStyle, darkTheme, lightTheme} from "./theme";
import {getCompletions} from "./completions";

import cn from "@dbsof/common/utils/classNames";

import {SchemaObjectType} from "@dbsof/common/schemaData";

import styles from "./codeEditor.module.scss";
import {cursorPlugin} from "./terminalCursor";

const readOnlyComp = new Compartment();
const darkThemeComp = new Compartment();
const keybindingsComp = new Compartment();
const onChangeComp = new Compartment();
const autocompleteComp = new Compartment();
const renderWhitespaceComp = new Compartment();

const errorUnderlineComp = new Compartment();
const errorUnderlineMark = Decoration.mark({
  class: styles.errorUnderline,
});
const errorLineHighlight = Decoration.line({
  class: styles.errorLineHighlight,
});

const warningsUnderlineComp = new Compartment();
const warningUnderlineMark = Decoration.mark({
  class: styles.warningUnderline,
});

function getErrorExtension(range: [number, number], doc: Text) {
  if (range[1] > doc.length) {
    return [];
  }

  const decos: Range<Decoration>[] =
    range[0] !== range[1] ? [errorUnderlineMark.range(...range)] : [];

  const startLine = doc.lineAt(range[0]).number;
  const endLine = doc.lineAt(range[1]).number;
  for (let i = startLine; i <= endLine; i++) {
    decos.push(errorLineHighlight.range(doc.line(i).from));
  }

  return EditorView.decorations.of(RangeSet.of(decos, true));
}

function getWarningsExtension(ranges: [number, number][], doc: Text) {
  const decos: Range<Decoration>[] = ranges.flatMap((range) =>
    range[1] <= doc.length && range[0] !== range[1]
      ? [warningUnderlineMark.range(...range)]
      : []
  );

  return EditorView.decorations.of(RangeSet.of(decos, true));
}

const explainContextsComp = new Compartment();

interface ExplainContextsData {
  contexts: {
    id: number;
    bufIdx: number;
    start: number;
    end: number;
    text: string;
    linkedBufIdx: number | null;
  }[][];
  buffers: string[];
}

class ExplainContextSnippetWidget extends WidgetType {
  constructor(
    readonly content: string,
    readonly ctxs: ExplainContextsData["contexts"][number]
  ) {
    super();
  }

  eq(other: ExplainContextSnippetWidget) {
    return other.content === this.content && other.ctxs === this.ctxs;
  }

  toDOM() {
    let el = document.createElement("span");
    el.setAttribute("aria-hidden", "true");
    el.className = styles.explainContextSnippet;
    let i = 0;
    for (const ctx of this.ctxs ?? []) {
      el.appendChild(
        document.createTextNode(this.content.slice(i, ctx.start))
      );
      const ctxEl = document.createElement("span");
      ctxEl.classList.add(styles.explainContextMark);
      ctxEl.dataset.ctxId = ctx.id.toString();
      ctxEl.textContent = this.content.slice(ctx.start, ctx.end);
      el.appendChild(ctxEl);
      i = ctx.end;
    }
    el.appendChild(document.createTextNode(this.content.slice(i)));
    return el;
  }
}

function getExplainContextsExtension({
  contexts,
  buffers,
}: ExplainContextsData) {
  const decos: Range<Decoration>[] = [];

  for (const ctx of contexts[0] ?? []) {
    decos.push(
      Decoration.mark({
        class: styles.explainContextMark,
        attributes: {
          "data-ctx-id": ctx.id.toString(),
        },
      }).range(ctx.start, ctx.end)
    );
    if (ctx.linkedBufIdx != null) {
      decos.push(
        Decoration.widget({
          widget: new ExplainContextSnippetWidget(
            buffers[ctx.linkedBufIdx - 1],
            contexts[ctx.linkedBufIdx]
          ),
          side: 1,
        }).range(ctx.end)
      );
    }
  }

  return EditorView.decorations.of(RangeSet.of(decos, true));
}

const specialCharRender = (
  _code: number,
  desc: string | null,
  placeholder: string
) => {
  let span = document.createElement("span");
  span.textContent = placeholder === "\u2022" ? "\u00B7" : placeholder;
  if (desc) {
    span.title = desc;
    span.setAttribute("aria-label", desc);
  }
  span.className = "cm-specialChar";
  return span;
};

const baseExtensions = [
  history(),
  drawSelection(),
  indentOnInput(),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  EditorState.allowMultipleSelections.of(true),
  syntaxHighlighting(highlightStyle),
];

export interface CodeEditorProps {
  code: Text;
  onChange: (value: Text) => void;
  className?: string;
  keybindings?: KeyBinding[];
  useDarkTheme?: boolean;
  readonly?: boolean;
  schemaObjects?: Map<string, SchemaObjectType>;
  noPadding?: boolean;
  renderWhitespace?: boolean;
  errorUnderline?: [number, number];
  warningUnderlines?: [number, number][];
  explainContexts?: ExplainContextsData;
}

export interface CodeEditorRef {
  ref: HTMLDivElement;
  view: () => EditorView;
  focus: () => void;
  dispatchEffect: (effects: StateEffect<any> | StateEffect<any>[]) => void;
}

export function createCodeEditor({
  language,
  highlightActiveLine = true,
  formatLineNo,
  disableLineNumbers,
  terminalCursor,
  customExtensions = [],
  showIndentationMarkers = true,
}: {
  language?: LanguageSupport | null;
  highlightActiveLine?: boolean;
  formatLineNo?: (lineNo: number) => string;
  disableLineNumbers?: boolean;
  terminalCursor?: boolean;
  customExtensions?: Extension;
  showIndentationMarkers?: boolean;
}) {
  function createState({
    doc,
    onChange,
    readonly,
    keybindings,
    useDarkTheme,
    schemaObjects,
    renderWhitespace,
    errorUnderline,
    warningUnderlines,
    explainContexts,
  }: {
    doc: Text;
    onChange: (value: Text) => void;
    readonly: boolean;
    keybindings: KeyBinding[];
    useDarkTheme: boolean;
    schemaObjects?: Map<string, SchemaObjectType>;
    renderWhitespace?: boolean;
    errorUnderline?: [number, number];
    warningUnderlines?: [number, number][];
    explainContexts?: ExplainContextsData;
  }) {
    return EditorState.create({
      doc,
      selection: EditorSelection.cursor(doc.length),
      extensions: [
        ...baseExtensions,
        showIndentationMarkers ? indentationMarkers() : [],
        renderWhitespaceComp.of(
          highlightSpecialChars({
            render: specialCharRender,
            addSpecialChars: renderWhitespace ? /\s/ : undefined,
          })
        ),
        highlightActiveLine ? highlightActiveLineExt() : [],
        !disableLineNumbers
          ? lineNumbers({
              formatNumber: formatLineNo,
            })
          : [],
        readOnlyComp.of([
          EditorState.readOnly.of(readonly),
          EditorView.editable.of(!readonly),
        ]),
        keybindingsComp.of(keymap.of(keybindings)),
        keymap.of([
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
        darkThemeComp.of(useDarkTheme ? darkTheme : lightTheme),
        language === undefined ? queryLanguageSupport() : language ?? [],
        onChangeComp.of(
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChange(update.state.doc);
            }
          })
        ),
        autocompleteComp.of(
          schemaObjects
            ? [
                queryLanguage.data.of({
                  autocomplete: getCompletions(schemaObjects),
                }),
              ]
            : []
        ),
        terminalCursor ? cursorPlugin() : [],
        errorUnderlineComp.of(
          errorUnderline ? getErrorExtension(errorUnderline, doc) : []
        ),
        warningsUnderlineComp.of(
          warningUnderlines ? getWarningsExtension(warningUnderlines, doc) : []
        ),
        explainContextsComp.of(
          explainContexts ? getExplainContextsExtension(explainContexts) : []
        ),
        customExtensions,
      ],
    });
  }

  return forwardRef(function CodeEditor(
    {
      code,
      onChange,
      className,
      keybindings = [],
      noPadding,
      readonly = false,
      schemaObjects,
      useDarkTheme = false,
      renderWhitespace,
      errorUnderline,
      warningUnderlines,
      explainContexts,
    }: CodeEditorProps,
    componentRef
  ) {
    const ref = useRef<HTMLDivElement>(null);
    const view = useRef<EditorView | null>(null);

    useImperativeHandle<unknown, CodeEditorRef>(
      componentRef,
      () => ({
        ref: ref.current!,
        view: () => view.current!,
        focus: () => view.current?.focus(),
        dispatchEffect: (effects: StateEffect<any> | StateEffect<any>[]) =>
          view.current?.dispatch({effects}),
      }),
      [ref]
    );

    useEffect(() => {
      if (ref.current) {
        view.current = new EditorView({
          state: createState({
            doc: code,
            keybindings,
            onChange,
            readonly,
            useDarkTheme,
            schemaObjects,
            renderWhitespace,
            errorUnderline,
            warningUnderlines,
            explainContexts,
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
          createState({
            doc: code,
            keybindings,
            onChange,
            readonly,
            useDarkTheme,
            schemaObjects,
            renderWhitespace,
            errorUnderline,
            warningUnderlines,
            explainContexts,
          })
        );
      }
    }, [code]);

    useLayoutEffect(
      () =>
        view.current?.dispatch({
          effects: readOnlyComp.reconfigure([
            EditorState.readOnly.of(readonly),
            EditorView.editable.of(!readonly),
          ]),
        }),
      [readonly]
    );

    useLayoutEffect(
      () =>
        view.current?.dispatch({
          effects: darkThemeComp.reconfigure(
            useDarkTheme ? darkTheme : lightTheme
          ),
        }),
      [useDarkTheme]
    );

    useLayoutEffect(
      () =>
        view.current?.dispatch({
          effects: keybindingsComp.reconfigure(keymap.of(keybindings)),
        }),
      [keybindings]
    );

    useLayoutEffect(
      () =>
        view.current?.dispatch({
          effects: onChangeComp.reconfigure(
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                onChange(update.state.doc);
              }
            })
          ),
        }),
      [onChange]
    );

    useLayoutEffect(
      () =>
        view.current?.dispatch({
          effects: autocompleteComp.reconfigure(
            schemaObjects
              ? [
                  queryLanguage.data.of({
                    autocomplete: getCompletions(schemaObjects),
                  }),
                ]
              : []
          ),
        }),
      [schemaObjects]
    );

    useLayoutEffect(
      () =>
        view.current?.dispatch({
          effects: renderWhitespaceComp.reconfigure(
            highlightSpecialChars({
              render: specialCharRender,
              addSpecialChars: renderWhitespace ? /\s/ : undefined,
            })
          ),
        }),
      [renderWhitespace]
    );

    useLayoutEffect(() => {
      view.current?.dispatch({
        effects: errorUnderlineComp.reconfigure(
          errorUnderline
            ? getErrorExtension(errorUnderline, view.current.state.doc)
            : []
        ),
      });
    }, [errorUnderline]);

    useLayoutEffect(() => {
      view.current?.dispatch({
        effects: warningsUnderlineComp.reconfigure(
          warningUnderlines
            ? getWarningsExtension(warningUnderlines, view.current.state.doc)
            : []
        ),
      });
    }, [warningUnderlines]);

    useLayoutEffect(() => {
      view.current?.dispatch({
        effects: explainContextsComp.reconfigure(
          explainContexts ? getExplainContextsExtension(explainContexts) : []
        ),
      });
    }, [explainContexts]);

    useEffect(() => {
      if (!noPadding && ref.current?.firstChild) {
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

    return (
      <div
        className={cn(styles.codeEditor, className, {
          [styles.terminalCursor]: !!terminalCursor,
        })}
        ref={ref}
      />
    );
  });
}

export const CodeEditor = createCodeEditor({});
