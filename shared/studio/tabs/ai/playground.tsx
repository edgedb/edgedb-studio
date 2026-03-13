import {Fragment, useEffect, useRef, useState} from "react";
import {observer} from "mobx-react-lite";
import Markdown from "react-markdown";
import {Link} from "react-router-dom";

import cn from "@dbsof/common/utils/classNames";
import {
  Button,
  ChatSendIcon,
  ChevronDownIcon,
  InfoIcon,
  InfoTooltip,
  Select,
  SettingsIcon,
} from "@dbsof/common/newui";
import Spinner from "@dbsof/common/ui/spinner";
import {RelativeTime} from "@dbsof/common/utils/relativeTime";
import {Theme, useTheme} from "@dbsof/common/hooks/useTheme";

import {CodeEditor} from "@dbsof/code-editor";
import {Text} from "@codemirror/state";

import {useTabState} from "../../state";
import {AIAdminState, AIPlaygroundChatItem} from "./state";

import styles from "./aiAdmin.module.scss";

const isMac =
  typeof navigator !== "undefined"
    ? navigator.platform.toLowerCase().includes("mac")
    : false;

export const PlaygroundTab = observer(function PlaygroundTab() {
  const state = useTabState(AIAdminState);
  const [_, theme] = useTheme();

  return (
    <div className={styles.playgroundLayout}>
      <PlaygroundChatHistory />
      <PlaygroundChatInput />

      <div
        className={cn(styles.playgroundConfig, {
          [styles.showConfig]: state.showConfigPanel,
        })}
      >
        <div className={styles.contentWrapper}>
          <div className={styles.header}>Model</div>
          {state.textGenerationModels ? (
            <Select<string>
              items={{
                items: [],
                groups: state.availableGenerationModels?.map(
                  ([providerName, models]) => ({
                    label: state.providers!.find(
                      (p) => p.name === providerName
                    )!.display_name,
                    items: models.map((model) => ({
                      id: model.modelName,
                      label: model.modelName,
                    })),
                  })
                ),
              }}
              placeholder="Choose model..."
              rightAlign
              selectedItemId={state.selectedPlaygroundModel}
              onChange={({id}) => state.setSelectedPlaygroundModel(id)}
            />
          ) : null}

          <div className={styles.header}>Prompt</div>
          <Select
            items={
              state.prompts?.map((prompt) => ({
                id: prompt.name,
                label: prompt.name,
              })) ?? []
            }
            placeholder="Choose prompt..."
            rightAlign
            selectedItemId={state.selectedPlaygroundPrompt}
            onChange={({id}) => state.setSelectedPlaygroundPrompt(id)}
          />

          <div className={styles.header}>
            Context Query{" "}
            <InfoTooltip
              className={styles.configTooltip}
              message={
                "An SQL expression returning a set of objects with AI indexes."
              }
            />
          </div>
          <CodeEditor
            className={styles.contextQuery}
            code={state.playgroundContextQuery}
            onChange={(code) => state.setPlaygroundContextQuery(code)}
            noPadding
            useDarkTheme={theme === Theme.dark}
          />
          {state.suggestedContextQueries.length ? (
            <ContextQuerySuggestionPopup />
          ) : null}
        </div>
        <div
          className={styles.toggleConfigButton}
          onClick={() => state.setShowConfigPanel(false)}
        >
          <ChevronDownIcon />
        </div>
      </div>
    </div>
  );
});

const PlaygroundChatHistory = observer(function PlaygroundChatHistory() {
  const state = useTabState(AIAdminState);

  return (
    <div className={styles.chatHistory}>
      <div className={styles.chatHistoryWrapper}>
        {state._hasUnfetchedChatHistory ? (
          <PlaygroundHistoryLoadingSpinner
            state={state}
            key={`loading-${state.playgroundChatHistory[0]?.$modelId}`}
          />
        ) : null}
        {state.playgroundChatHistory.map((message) => (
          <PlaygroundChatMessage key={message.$modelId} message={message} />
        ))}
        {state.isPlaygroundQueryRunning ? (
          <div className={styles.waitingForReply}>
            <span />
            <span />
            <span />

            <Button onClick={() => state.cancelRunningPlaygroundQuery()}>
              Cancel
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
});

function PlaygroundHistoryLoadingSpinner({state}: {state: AIAdminState}) {
  useEffect(() => {
    state.fetchChatHistory();
  }, []);

  return (
    <div className={styles.chatHistoryLoading}>
      <Spinner size={20} />
    </div>
  );
}

const PlaygroundChatInput = observer(function PlaygroundChatInput() {
  const state = useTabState(AIAdminState);

  return (
    <div className={styles.chatInputRow}>
      {state.playgroundContextConfigured ? (
        <div className={styles.chatInput}>
          <div className={styles.chatInputWrapper}>
            <div className={styles.overlay}>
              {state.playgroundQuery}
              {"\u200b"}
            </div>
            <textarea
              placeholder="Start Chatting..."
              value={state.playgroundQuery}
              onChange={(e) => state.setPlaygroundQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (isMac ? e.metaKey : e.ctrlKey)) {
                  e.preventDefault();
                  state.sendPlaygroundQuery();
                }
              }}
            />
          </div>

          <div
            className={cn(styles.chatSendButton, {
              [styles.disabled]: !state.canSendPlaygroundQuery,
            })}
            onClick={() => state.sendPlaygroundQuery()}
          >
            <ChatSendIcon />
          </div>
        </div>
      ) : state.providers ? (
        <div className={styles.notConfiguredMessage}>
          <InfoIcon />
          Before you can start chatting with the AI model, you first need to{" "}
          {[
            state.providers.length == 0 ? (
              <Link key="configProvider" to="ai/providers">
                configure a provider
              </Link>
            ) : state.selectedPlaygroundModel == null ? (
              <Fragment key="chooseProvider">
                choose a <em>Model</em>
              </Fragment>
            ) : null,
            state.prompts?.length == 0 ? (
              <Link key="createPrompt" to="ai/prompts">
                create a prompt
              </Link>
            ) : state.selectedPlaygroundPrompt == null ? (
              <Fragment key="choosePrompt">
                choose a <em>Prompt</em>
              </Fragment>
            ) : null,
            state.playgroundContextQuery.toString().trim() == "" ? (
              <Fragment key="setContext">
                set the <em>Context Query</em>
              </Fragment>
            ) : null,
          ]
            .filter((step) => step != null)
            .flatMap((step, i, arr) => {
              return i < arr.length - 2
                ? [step, ", "]
                : i < arr.length - 1
                ? [step, " and "]
                : [step];
            })}
          .
        </div>
      ) : null}
      <div
        className={styles.toggleConfigButton}
        onClick={() => state.setShowConfigPanel(true)}
      >
        <SettingsIcon />
      </div>
    </div>
  );
});

const PlaygroundChatMessage = observer(function PlaygroundChatMessage({
  message,
}: {
  message: AIPlaygroundChatItem;
}) {
  return (
    <div
      className={cn(styles.chatHistoryItem, {
        [styles.userRole]: message.role === "user",
      })}
    >
      <div className={styles.details}>
        {message.role ? (
          <div className={styles.role}>{message.role}</div>
        ) : null}
        <div className={styles.timestamp}>
          <RelativeTime timestamp={message.timestamp} />
        </div>
      </div>

      <div
        className={cn(styles.chatMessageContent, {
          [styles.hasError]: message.error != null,
        })}
      >
        {message.error ? (
          <div className={styles.errorMessage}>
            <span>Error: </span>
            {message.error}
          </div>
        ) : (
          message.blocks.map((block, i) => (
            <div className={styles.block} key={i}>
              <Markdown>{block.message}</Markdown>
            </div>
          ))
        )}
        {message.cancelled ? (
          <div className={styles.queryCancelled}>Query cancelled by user</div>
        ) : null}
      </div>
    </div>
  );
});

const ContextQuerySuggestionPopup = observer(
  function ContextQuerySuggestionPopup() {
    const state = useTabState(AIAdminState);
    const ref = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
      const listener = (e: MouseEvent) => {
        if (!ref.current?.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      window.addEventListener("click", listener, {capture: true});
      return () => {
        window.removeEventListener("click", listener, {capture: true});
      };
    }, [open]);

    return (
      <div
        className={styles.contextQuerySuggestion}
        onClick={() => setOpen(true)}
      >
        <span>Try a suggested Context Query?</span>

        {open ? (
          <div
            ref={ref}
            className={styles.popup}
            onClick={(e) => e.stopPropagation()}
          >
            {state.suggestedContextQueries.map((query) => (
              <div
                key={query}
                onClick={() => {
                  setOpen(false);
                  state.setPlaygroundContextQuery(Text.of([query]));
                }}
              >
                {query} <ChevronDownIcon />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }
);
