import {EditorSelection, Extension, Facet} from "@codemirror/state";
import {gutter, GutterMarker, gutters} from "@codemirror/view";
import {parser} from "@dbsof/lang-query";

import styles from "../repl.module.scss";

export function isEndOfStatement(
  query: string,
  selection: EditorSelection
): boolean {
  if (selection.ranges.length !== 1 || !selection.ranges[0].empty) {
    return false;
  }
  const cursorPos = selection.ranges[0].head;
  const trimmedQuery = query.slice(0, cursorPos).trim();
  if (
    // check cursor is at the end of the query and character before is semicolon
    trimmedQuery[trimmedQuery.length - 1] === ";" &&
    query.slice(cursorPos).trim() === ""
  ) {
    const syntaxTree = parser.parse(query.toString());
    const node = syntaxTree.resolve(cursorPos, -1);

    // check cursor is not in an unfinished string or {} block
    if (node.name === "Script") {
      return true;
    }
  }
  return false;
}

interface ReplPromptConfig {
  dbName: string;
  inputMode: string;
}

const replPromptConfig = Facet.define<ReplPromptConfig, ReplPromptConfig>({
  combine(val) {
    return val[0] ?? {dbName: "", inputMode: ""};
  },
});

class ReplPromptMarker extends GutterMarker {
  constructor(
    readonly firstLine: boolean,
    readonly dbName: string,
    readonly inputMode: string
  ) {
    super();
  }

  eq(other: ReplPromptMarker) {
    return (
      this.firstLine === other.firstLine &&
      this.dbName === other.dbName &&
      this.inputMode === other.inputMode
    );
  }

  toDOM() {
    if (!this.firstLine) {
      return document.createTextNode(
        ".".repeat(this.dbName.length + this.inputMode.length + 3)
      );
    }
    const frag = document.createDocumentFragment();
    frag.appendChild(document.createTextNode(this.dbName));
    const mode = document.createElement("span");
    mode.appendChild(document.createTextNode(`[${this.inputMode}]`));
    frag.appendChild(mode);
    frag.append(document.createTextNode(">"));
    return frag;
  }
}

const replPromptGutter = gutter({
  class: styles.replPromptGutter,
  lineMarker(view, line) {
    const firstLine = view.state.doc.lineAt(line.from).number === 1;
    const config = view.state.facet(replPromptConfig);
    return new ReplPromptMarker(firstLine, config.dbName, config.inputMode);
  },
  lineMarkerChange: (update) =>
    update.startState.facet(replPromptConfig) !=
    update.state.facet(replPromptConfig),
});

export function replPrompt(config: ReplPromptConfig): Extension {
  return [replPromptConfig.of(config), gutters(), replPromptGutter];
}
