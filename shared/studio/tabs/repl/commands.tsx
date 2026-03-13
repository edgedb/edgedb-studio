import {CommandOutputKind, CommandResult} from "./state/commands";

import styles from "./repl.module.scss";
import {Repl} from "./state";

export function renderCommandResult(state: Repl, result: CommandResult) {
  const ctrlKey = navigator.platform.toLowerCase().includes("mac")
    ? "Cmd"
    : "Ctrl";

  switch (result.kind) {
    case CommandOutputKind.help:
      return (
        <div className={styles.commandHelp}>
          <div className={styles.heading}>Shortcuts</div>
          <div className={styles.command}>{ctrlKey}+Enter</div>
          <div className={styles.info}>Run query</div>
          <div className={styles.command}>{ctrlKey}+ArrowUp/ArrowDown</div>
          <div className={styles.info}>Navigate query history</div>

          {state.sqlModeSupported ? (
            <>
              <div className={styles.heading}>Settings</div>
              <div className={styles.command}>
                \set language {"("}query | sql{")"},
                <br />
                \query, \sql
              </div>
              <div className={styles.info}>Set the query language</div>
            </>
          ) : null}

          <div className={styles.heading}>Introspection</div>
          <div className={styles.subheading}>
            (options: -s = show system objects, -I = case-insensitive match, -v
            = verbose)
          </div>

          <div className={styles.command}>\l</div>
          <div className={styles.info}>
            List databases <span>(alias: \list databases)</span>
          </div>
          <div className={styles.command}>
            \ls <span>[-sI] [PATTERN]</span>
          </div>
          <div className={styles.info}>
            List scalar types <span>(alias: \list scalars)</span>
          </div>
          <div className={styles.command}>
            \lt <span>[-sI] [PATTERN]</span>
          </div>
          <div className={styles.info}>
            List object types <span>(alias: \list types)</span>
          </div>
          <div className={styles.command}>
            \lr <span>[-I] [PATTERN]</span>
          </div>
          <div className={styles.info}>
            List roles <span>(alias: \list roles)</span>
          </div>
          <div className={styles.command}>
            \lm <span>[-I] [PATTERN]</span>
          </div>
          <div className={styles.info}>
            List modules <span>(alias: \list modules)</span>
          </div>
          <div className={styles.command}>
            \la <span>[-sIv] [PATTERN]</span>
          </div>
          <div className={styles.info}>
            List expression aliases <span>(alias: \list aliases)</span>
          </div>
          <div className={styles.command}>
            \lc <span>[-I] [PATTERN]</span>
          </div>
          <div className={styles.info}>
            List casts <span>(alias: \list casts)</span>
          </div>
          <div className={styles.command}>
            \li <span>[-sI] [PATTERN]</span>
          </div>
          <div className={styles.info}>
            List indexes <span>(alias: \list indexes)</span>
          </div>

          <div className={styles.heading}>Connection</div>

          <div className={styles.command}>\c, \connect DBNAME</div>
          <div className={styles.info}>Switch to database DBNAME</div>

          <div className={styles.heading}>Help</div>

          <div className={styles.command}>\?, \h, \help</div>
          <div className={styles.info}>Show help on backslash commands</div>

          <div className={styles.spacer} />

          <div className={styles.command}>\clear</div>
          <div className={styles.info}>Clear query history</div>
        </div>
      );
    case CommandOutputKind.error:
      return <div>{result.msg}</div>;
    case CommandOutputKind.text:
      return <div className={styles.commandTextOutput}>{result.content}</div>;
    case CommandOutputKind.table:
      return (
        <table className={styles.commandTableOutput}>
          <thead>
            <tr>
              {result.content[0].map((cell, i) => (
                <th key={i}>{cell}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.content.slice(1).map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={`${ri},${ci}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    default:
      return null;
  }
}
