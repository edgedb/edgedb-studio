import {observer} from "mobx-react-lite";

import {Button, CrossIcon} from "@dbsof/common/newui";
import {ExplainCodeBlock} from "../../components/explainVis/codeblock";

import {AnalyseQueryState, PerfStatsState} from "./state";

import styles from "./perfStats.module.scss";
import {ExplainVis} from "../../components/explainVis";
import Spinner from "@dbsof/common/ui/spinner";
import {ExplainHighlightsRenderer} from "../../components/explainVis/codeEditorContexts";
import {ParamsEditorPanel} from "../queryEditor/paramEditor";

export const AnalyzeQueryPanel = observer(function AnalyzeQueryPanel({
  perfStatsState,
  state,
  onClose,
}: {
  perfStatsState: PerfStatsState;
  state: AnalyseQueryState;
  onClose: () => void;
}) {
  const paramsState = perfStatsState.paramsEditor;

  return (
    <div className={styles.analyzePanel}>
      <div className={styles.panelHeader}>
        <div className={styles.closePanel} onClick={onClose}>
          <CrossIcon />
        </div>
      </div>
      <div className={styles.panelContent}>
        <div className={styles.queryWrapper}>
          <div className={styles.query}>
            <ExplainCodeBlock
              className={styles.code}
              code={state.query}
              explainContexts={state.explainState?.contextsByBufIdx[0] ?? []}
            />
            {state.explainState ? (
              <ExplainHighlightsRenderer
                // ref={explainHighlightsRef}
                state={state.explainState}
                isEditor={false}
              />
            ) : null}
          </div>
          <ParamsEditorPanel
            state={paramsState}
            disabled={!!(state.explainState || state.controller)}
          />
        </div>
        <div className={styles.explain}>
          {state.explainState ? (
            <ExplainVis state={state.explainState} />
          ) : paramsState.paramDefs.size == 0 ? (
            <Spinner className={styles.loading} size={20} />
          ) : (
            <div className={styles.runAnalyzeQuery}>
              <Button
                kind="primary"
                disabled={paramsState.hasErrors}
                onClick={() => perfStatsState.runAnalyzeQuery()}
              >
                Analyze query
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
