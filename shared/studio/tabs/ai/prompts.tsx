import {useState} from "react";
import {observer} from "mobx-react-lite";

import cn from "@dbsof/common/utils/classNames";
import {
  Button,
  ConfirmButton,
  ChevronDownIcon,
  InfoIcon,
  InfoTooltip,
  Select,
  TextInput,
} from "@dbsof/common/newui";

import {useTabState} from "../../state";
import {AIAdminState, AIPromptDraft, PromptChatParticipantRole} from "./state";

import textStyles from "@dbsof/common/newui/textInput/textInput.module.scss";
import fieldHeaderStyles from "@dbsof/common/newui/fieldHeader/fieldHeader.module.scss";
import styles from "./aiAdmin.module.scss";

export const PromptsTab = observer(function PromptTab() {
  const state = useTabState(AIAdminState);

  return (
    <div className={styles.promptsLayout}>
      <div className={styles.contentWrapper}>
        <h2>Prompts</h2>
        <div className={styles.promptsList}>
          {state.prompts?.map((prompt) => (
            <PromptCard key={prompt.id} promptId={prompt.id} />
          ))}
          {state.newPromptDraft ? (
            <PromptCard promptId={null} />
          ) : (
            <div className={styles.addNewPrompt}>
              <Button onClick={() => state.createDraftChatPrompt()}>
                Add new prompt
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

const PromptCard = observer(function PromptCard({
  promptId,
}: {
  promptId: string | null;
}) {
  const state = useTabState(AIAdminState);
  const [updating, setUpdating] = useState(false);

  const prompt = promptId
    ? state.prompts?.find((p) => p.id == promptId)
    : null;
  const draft = promptId
    ? state.promptDrafts.get(promptId)
    : state.newPromptDraft!;
  const expanded = draft?.expanded ?? false;

  return (
    <div className={styles.promptCardWrapper}>
      <div className={styles.promptCardHeaderWrapper}>
        <div className={styles.promptCard}>
          <div className={styles.cardMain}>
            {prompt ? (
              <>
                <div className={styles.details}>
                  <div className={styles.name}>{prompt.name}</div>
                  <div className={styles.messageCount}>
                    {prompt.messages.length} message
                    {prompt.messages.length > 1 ? "s" : ""}
                  </div>
                </div>
                <div className={styles.buttons}>
                  {expanded ? (
                    <ConfirmButton
                      onClick={async () => {
                        try {
                          setUpdating(true);
                          await state.deletePrompt(prompt.id);
                        } finally {
                          setUpdating(false);
                        }
                      }}
                      disabled={updating}
                    >
                      {updating ? "Deleting..." : "Delete"}
                    </ConfirmButton>
                  ) : null}
                  <div
                    className={cn(styles.expandButton, {
                      [styles.expanded]: draft?.expanded ?? false,
                    })}
                    onClick={() =>
                      expanded
                        ? draft!.setExpanded(false)
                        : state.openChatPrompt(prompt)
                    }
                  >
                    <ChevronDownIcon />
                  </div>
                </div>
              </>
            ) : (
              <>
                <TextInput
                  className={styles.promptNameInput}
                  placeholder="Prompt Name"
                  value={draft!.name}
                  onChange={(e) => draft!.setName(e.target.value)}
                  error={draft!.nameError}
                />
                <div className={styles.buttons}>
                  <Button
                    onClick={() => state._removeDraftChatPrompt()}
                    disabled={updating}
                  >
                    Remove
                  </Button>
                  <Button
                    kind="primary"
                    onClick={async () => {
                      try {
                        setUpdating(true);
                        await state.saveNewPrompt();
                      } finally {
                        setUpdating(false);
                      }
                    }}
                    disabled={updating || !draft!.isPromptValid}
                  >
                    {updating ? "Saving..." : "Save"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {draft && (expanded || !prompt) ? (
        <div className={styles.promptMessageList}>
          {draft.allMessages.map((message) => (
            <PromptMessageCard
              key={message.id}
              draft={draft}
              messageId={message.id}
            />
          ))}
          <div className={styles.addPromptMessage}>
            <Button onClick={() => draft.createDraftMessage()}>
              Add new message
            </Button>

            <svg className={styles.connectingLine} viewBox="0 0 42 100">
              <path d="M 21, 0 V 90 A 8 8 0 0 0 29, 98 H 42" />
            </svg>
          </div>
        </div>
      ) : null}
    </div>
  );
});

const PromptMessageCard = observer(function PromptMessageCard({
  draft,
  messageId,
}: {
  draft: AIPromptDraft;
  messageId: string;
}) {
  const [isDraft, message] = draft.getMessage(messageId);
  const [updating, setUpdating] = useState(false);

  const isNew = messageId.startsWith("_");

  const contentError = draft.getMessageError(messageId);
  const contentIsValid =
    message.content != null && message.content.trim() !== "";

  return (
    <div className={cn(styles.promptMessageCard, {[styles.newDraft]: isNew})}>
      <div className={styles.participant}>
        <Select
          className={styles.promptRole}
          label="Role"
          items={(
            [
              "System",
              "User",
              "Assistant",
              "Tool",
            ] as PromptChatParticipantRole[]
          ).map((val) => ({
            id: val,
            label: val,
          }))}
          selectedItemId={message.participant_role}
          onChange={({id}) => draft.setMessageRole(messageId, id)}
        />
        <TextInput
          className={styles.promptMessageName}
          label="Name"
          optional
          value={message.participant_name ?? ""}
          onChange={(e) => draft.setMessageName(messageId, e.target.value)}
        />
      </div>
      <label className={cn(textStyles.textField)}>
        <div className={fieldHeaderStyles.fieldHeader}>
          Content{" "}
          <InfoTooltip
            message={
              <>
                Use the <code>{"{context}"}</code> and <code>{"{query}"}</code>{" "}
                placeholders to inject the matched context information and the
                user query into the prompt respectively.
              </>
            }
          />
        </div>
        <div
          className={cn(styles.promptMessageContentWrapper, {
            [styles.hasError]: contentError != null,
          })}
        >
          <div className={styles.overlay}>
            {replaceMessageContent(message.content ?? "", [
              "{query}",
              "{context}",
            ])}
            {"\u200b"}
          </div>
          <textarea
            value={message.content ?? ""}
            onChange={(e) =>
              draft.setMessageContent(messageId, e.target.value)
            }
          />
          {contentError != null ? (
            <div className={textStyles.error}>
              <InfoIcon />
              <div>{contentError}</div>
            </div>
          ) : null}
        </div>
      </label>
      <div className={styles.buttons}>
        {(isNew ? draft.allMessages : draft._prompt?.messages ?? []).length >
        1 ? (
          !isNew ? (
            <ConfirmButton
              onClick={async () => {
                try {
                  setUpdating(true);
                  await draft.deleteMessage(messageId);
                } catch {
                  setUpdating(false);
                }
              }}
              disabled={updating}
            >
              {updating ? "Deleting..." : "Delete"}
            </ConfirmButton>
          ) : (
            <Button onClick={() => draft.removeDraftMessage(messageId)}>
              Remove
            </Button>
          )
        ) : null}

        <div className={styles.spacer} />

        {draft.id && isDraft ? (
          <>
            {!isNew ? (
              <Button onClick={() => draft.removeDraftMessage(messageId)}>
                Clear
              </Button>
            ) : null}
            {isNew ? (
              <Button
                onClick={async () => {
                  try {
                    setUpdating(true);
                    await draft.saveMessage(messageId);
                  } finally {
                    setUpdating(false);
                  }
                }}
                disabled={updating || !contentIsValid}
              >
                {updating ? "Saving..." : "Save"}
              </Button>
            ) : (
              <Button
                onClick={async () => {
                  try {
                    setUpdating(true);
                    await draft.updateMessage(messageId);
                  } finally {
                    setUpdating(false);
                  }
                }}
                disabled={updating || !contentIsValid}
              >
                {updating ? "Updating..." : "Update"}
              </Button>
            )}
          </>
        ) : null}
      </div>

      <svg className={styles.connectingLine} viewBox="0 0 42 100">
        <path d="M 21, 0 V 90 A 8 8 0 0 0 29, 98 H 42" />
      </svg>
      <svg className={styles.expandingConnectingLine}>
        <line x1="21" y1="100%" x2="21" y2="0%" />
      </svg>
    </div>
  );
});

function replaceMessageContent(content: string, replacements: string[]) {
  let parts: (string | JSX.Element)[] = [content];
  let i = 0;
  for (const replacement of replacements) {
    const newParts: (string | JSX.Element)[] = [];
    for (const part of parts) {
      if (typeof part !== "string") {
        newParts.push(part);
        continue;
      }
      const subparts = part.split(replacement);
      newParts.push(
        ...subparts
          .slice(0, -1)
          .flatMap((subpart) => [
            subpart,
            <span key={i++}>{replacement}</span>,
          ]),
        subparts[subparts.length - 1]
      );
    }
    parts = newParts;
  }
  return <>{parts}</>;
}
