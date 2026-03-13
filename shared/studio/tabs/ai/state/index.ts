import {action, computed, observable, reaction, runInAction} from "mobx";
import {
  Model,
  _async,
  _await,
  arrayActions,
  findParent,
  fromSnapshot,
  getParent,
  getSnapshot,
  idProp,
  model,
  modelAction,
  modelFlow,
  objectMap,
  prop,
} from "mobx-keystone";
import {connCtx, dbCtx} from "../../../state";
import {Text} from "@codemirror/state";
import {ChatParticipantRole, RAGRequest, SSEStream, runRAGQuery} from "./rag";
import {SchemaObjectType} from "@dbsof/common/schemaData";
import {
  storeAIPlaygroundChatItem,
  fetchAIPlaygroundChatHistory,
} from "../../../idbStore";
import {instanceCtx} from "../../../state/instance";

export interface TextGenModel {
  modelName: string;
  providerName: string;
}

export interface ProviderInfo {
  _typename: string;
  name: string;
  display_name: string;
  client_id: string | null;
  api_style: string;
  api_url: string;
}

export interface ProviderConfigType {
  typename: string;
  name: string | null;
  displayName: string;
}

export interface Prompt {
  id: string;
  name: string;
  messages: PromptMessage[];
}
export interface PromptMessage {
  id: string;
  participant_role: PromptChatParticipantRole;
  participant_name: string | null;
  content: string | null;
}

export type PromptChatParticipantRole =
  | "System"
  | "User"
  | "Assistant"
  | "Tool";

@model("AIAdmin")
export class AIAdminState extends Model({
  lastSelectedTab: prop("").withSetter(),

  newProviderDraft: prop<AIProviderDraft | null>(null),

  promptDrafts: prop(() => objectMap<AIPromptDraft>()),
  newPromptDraft: prop<AIPromptDraft | null>(null),

  selectedPlaygroundModel: prop<string | null>(null).withSetter(),
  selectedPlaygroundPrompt: prop<string | null>(null).withSetter(),
  playgroundQuery: prop<string>("").withSetter(),
  playgroundChatHistory: prop<AIPlaygroundChatItem[]>(() => []),
  showConfigPanel: prop(false).withSetter(),
}) {
  onAttachedToRootStore() {
    const configKey = `dbsofAIPlaygroundConfig-${instanceCtx.get(this)!
      .instanceId!}/${dbCtx.get(this)!.name}`;

    const configJSON = localStorage.getItem(configKey);
    if (configJSON) {
      try {
        const config = JSON.parse(configJSON);
        if (typeof config.model === "string") {
          this.setSelectedPlaygroundModel(config.model);
        }
        if (typeof config.prompt === "string") {
          this.setSelectedPlaygroundPrompt(config.prompt);
        }
        if (typeof config.contextQuery === "string") {
          this.setPlaygroundContextQuery(Text.of([config.contextQuery]));
        }
      } catch {
        // ignore error
      }
    }

    const disposers = [
      reaction(
        () => this.availableGenerationModels,
        (availableModels) => {
          if (!availableModels) return;
          const modelNames = availableModels.flatMap(([_, models]) =>
            models.map((m) => m.modelName)
          );
          if (
            this.selectedPlaygroundModel == null ||
            !modelNames.includes(this.selectedPlaygroundModel)
          ) {
            this.setSelectedPlaygroundModel(modelNames[0] ?? null);
          }
        }
      ),
      reaction(
        () => this.prompts,
        (prompts) => {
          if (!prompts) return;
          if (
            this.selectedPlaygroundPrompt == null ||
            !prompts.some((p) => p.name === this.selectedPlaygroundPrompt)
          ) {
            this.setSelectedPlaygroundPrompt(prompts[0]?.name ?? null);
          }
        }
      ),
      reaction(
        () => ({
          model: this.selectedPlaygroundModel,
          prompt: this.selectedPlaygroundPrompt,
          contextQuery: this.playgroundContextQuery.toString(),
        }),
        (config) => {
          localStorage.setItem(configKey, JSON.stringify(config));
        }
      ),
    ];

    return () => {
      for (const disposer of disposers) {
        disposer();
      }
    };
  }

  // providers

  @computed
  get providerConfigTypes(): ProviderConfigType[] {
    return [...(dbCtx.get(this)!.schemaData?.objects.values() ?? [])]
      .filter(
        (obj) =>
          obj.module === "ext::ai" &&
          obj.ancestors.some((anc) => anc.name === "ext::ai::ProviderConfig")
      )
      .map((obj) => ({
        typename: obj.name,
        name: obj.properties.name.default?.replace(/^'|'$/g, "") ?? null,
        displayName: obj.properties.display_name.default!.replace(
          /^'|'$/g,
          ""
        ),
      }))
      .sort((a, b) =>
        a.name ? (b.name ? a.name.localeCompare(b.name) : -1) : b.name ? 1 : 0
      );
  }

  @computed
  get providerConfigTypesByName() {
    return new Map(this.providerConfigTypes.map((p) => [p.name, p]));
  }

  @modelAction
  createProviderDraft(providerName?: string) {
    const existingProviderNames = this.existingProviderNames;
    this.newProviderDraft = new AIProviderDraft({
      typename: !providerName
        ? this.providerConfigTypes.filter(
            (p) => !(p.name && existingProviderNames.has(p.name))
          )[0].typename
        : (
            this.providerConfigTypesByName.get(providerName) ??
            this.providerConfigTypesByName.get(null)!
          ).typename,
      name: providerName
        ? this.providerConfigTypesByName.has(providerName)
          ? null
          : providerName
        : null,
    });
  }

  @modelAction
  clearProviderDraft() {
    this.newProviderDraft = null;
  }

  async removeProvider(typename: string, name: string) {
    const conn = connCtx.get(this)!;

    await conn.execute(
      `configure current database reset ${typename}
        filter .name = ${JSON.stringify(name)}`
    );
    await this.refreshConfig();
  }

  @computed
  get textGenerationModels() {
    const modelTypeObjs = [
      ...(dbCtx.get(this)!.schemaData?.objects.values() ?? []),
    ].filter((obj) =>
      obj.ancestors.some((anc) => anc.name === "ext::ai::TextGenerationModel")
    );
    return modelTypeObjs.length
      ? modelTypeObjs.reduce(
          (models, obj) => {
            const modelName = obj.annotations.find(
              (ann) => ann.name === "ext::ai::model_name"
            )?.["@value"];
            const providerName = obj.annotations.find(
              (ann) => ann.name === "ext::ai::model_provider"
            )?.["@value"];
            if (!modelName || !providerName) return models;
            if (!models[providerName]) {
              models[providerName] = [];
            }
            models[providerName].push({
              modelName,
              providerName,
            });
            return models;
          },
          {} as {[providerName: string]: TextGenModel[]}
        )
      : null;
  }

  @computed
  get availableGenerationModels() {
    return this.textGenerationModels && this.providers
      ? Object.entries(this.textGenerationModels).filter(([providerName]) =>
          this.providers!.some((p) => p.name === providerName)
        )
      : null;
  }

  @computed
  get indexedObjectTypes() {
    const objectTypes = [
      ...(dbCtx.get(this)!.schemaData?.objects.values() ?? []),
    ];
    const indexed: {
      [providerName: string]: {objType: SchemaObjectType; modelName: string}[];
    } = {};
    for (const objType of objectTypes) {
      for (const idx of objType.indexes) {
        const modelProvider = idx.annotations.find(
          (ann) => ann.name === "ext::ai::model_provider"
        )?.["@value"];
        const modelName = idx.annotations.find(
          (ann) => ann.name === "ext::ai::model_name"
        )?.["@value"];
        if (modelProvider && modelName) {
          if (!indexed[modelProvider]) {
            indexed[modelProvider] = [];
          }
          indexed[modelProvider].push({modelName, objType});
        }
      }
    }
    return indexed;
  }

  @computed
  get indexesWithoutProviders() {
    return this.providers
      ? Object.keys(this.indexedObjectTypes).filter(
          (providerName) => !this.existingProviderNames.has(providerName)
        )
      : null;
  }

  @observable
  providers: ProviderInfo[] | null = null;

  @observable
  prompts: Prompt[] | null = null;

  @computed
  get existingProviderNames() {
    return new Set(this.providers?.map((p) => p.name));
  }

  async refreshConfig() {
    const conn = connCtx.get(this)!;

    const {result} = await conn.query(
      `select {
        config := assert_single(cfg::Config.extensions[is ext::ai::Config] {
          providers: {
            _typename := .__type__.name,
            name,
            display_name,
            client_id,
            api_style,
            api_url,
          }
        }),
        prompts := (select ext::ai::ChatPrompt {
          id,
          name,
          messages: {
            id,
            participant_role,
            participant_name,
            content
          } order by .participant_role
            then .participant_name
        } order by .name)
      }`,
      undefined,
      {ignoreSessionConfig: true}
    );

    if (result === null) return;

    const {config, prompts} = result[0];

    runInAction(() => {
      this.providers = (config.providers as ProviderInfo[]).sort((a, b) =>
        a.name.startsWith("builtin::") === b.name.startsWith("builtin::")
          ? a.name.localeCompare(b.name)
          : a.name.startsWith("builtin::")
            ? -1
            : 1
      );
      this.prompts = prompts;
    });
  }

  // prompts

  @modelAction
  openChatPrompt(prompt: Prompt) {
    if (this.promptDrafts.has(prompt.id)) {
      this.promptDrafts.get(prompt.id)!.setExpanded(true);
    } else {
      this.promptDrafts.set(
        prompt.id,
        new AIPromptDraft({
          id: prompt.id,
        })
      );
    }
  }

  @modelAction
  createDraftChatPrompt() {
    this.newPromptDraft = new AIPromptDraft({
      id: null,
    });
    this.newPromptDraft.createDraftMessage();
  }

  @modelAction
  _removeDraftChatPrompt() {
    this.newPromptDraft = null;
  }

  async saveNewPrompt() {
    const newPromptDraft = this.newPromptDraft;

    if (!newPromptDraft) return;

    const conn = connCtx.get(this)!;

    const messages = Object.values(newPromptDraft._messages).map((m) => ({
      role: m.participant_role,
      name: m.participant_name?.trim() || null,
      content: m.content,
    }));

    await conn.query(
      `with
        newMessages := (
          for m in json_array_unpack(<json>$messages)
          union (
            insert ext::ai::ChatPromptMessage {
              participant_role := <str>m['role'],
              participant_name := <str>m['name'],
              content := <str>m['content']
            }
          )
        )
      insert ext::ai::ChatPrompt {
        name := <str>$name,
        messages := newMessages
      }`,
      {name: newPromptDraft.name.trim(), messages: JSON.stringify(messages)},
      {ignoreSessionConfig: true}
    );

    await this.refreshConfig();

    this._removeDraftChatPrompt();
  }

  async deletePrompt(promptId: string) {
    const conn = connCtx.get(this)!;

    await conn.query(
      `delete ext::ai::ChatPrompt
      filter .id = <uuid>$promptId`,
      {promptId},
      {ignoreSessionConfig: true}
    );

    await this.refreshConfig();

    this.promptDrafts.delete(promptId);
  }

  // playground

  @observable.ref
  playgroundContextQuery: Text = Text.empty;

  @action
  setPlaygroundContextQuery(code: Text) {
    this.playgroundContextQuery = code;
  }

  @computed
  get suggestedContextQueries() {
    return Object.values(this.indexedObjectTypes)
      .flat()
      .map(({objType}) =>
        objType.module === "default" ? objType.shortName : objType.name
      );
  }

  @computed
  get playgroundContextConfigured() {
    return (
      this.selectedPlaygroundModel != null &&
      this.selectedPlaygroundPrompt != null &&
      this.playgroundContextQuery.toString().trim() != ""
    );
  }

  @computed
  get canSendPlaygroundQuery() {
    return (
      this.playgroundQuery.trim() !== "" && this.playgroundContextConfigured
    );
  }

  @observable.ref
  _runningPlaygroundAbortController: AbortController | null = null;

  _currentMessage: AIPlaygroundChatItem | null = null;

  @computed
  get isPlaygroundQueryRunning() {
    return this._runningPlaygroundAbortController != null;
  }

  cancelRunningPlaygroundQuery() {
    this._runningPlaygroundAbortController?.abort();
  }

  _storePlaygroundChatItem(item: AIPlaygroundChatItem) {
    return storeAIPlaygroundChatItem({
      instanceId: instanceCtx.get(this)!.instanceId!,
      dbName: dbCtx.get(this)!.name,
      timestamp: item.timestamp,
      data: getSnapshot(item),
    });
  }

  @modelFlow
  sendPlaygroundQuery = _async(function* (this: AIAdminState) {
    if (this.isPlaygroundQueryRunning || !this.canSendPlaygroundQuery) return;

    const connectConfig = connCtx.get(this)!.config;

    const request: RAGRequest = {
      model: this.selectedPlaygroundModel!,
      query: this.playgroundQuery.trim(),
      context: {
        query: this.playgroundContextQuery.toString(),
      },
    };

    const userMessage = new AIPlaygroundChatItem({
      role: "user",
      timestamp: Date.now(),
      blocks: [
        {
          type: "text",
          message: request.query,
        },
      ],
    });

    this.playgroundChatHistory.push(userMessage);
    this.playgroundQuery = "";
    this._storePlaygroundChatItem(userMessage);

    this._runningPlaygroundAbortController = new AbortController();
    try {
      const stream: SSEStream = yield* _await(
        runRAGQuery(
          connectConfig,
          request,
          this._runningPlaygroundAbortController
        )
      );
      yield* _await(this._handleSSEStream(stream));
    } catch (err) {
      let errorMessageItem: AIPlaygroundChatItem | null = null;
      if (err instanceof DOMException && err.name === "AbortError") {
        if (this._currentMessage) {
          this._currentMessage.cancelled = true;
        } else {
          errorMessageItem = new AIPlaygroundChatItem({
            role: null,
            timestamp: Date.now(),
            cancelled: true,
          });
        }
      } else {
        let errMessage = err instanceof Error ? err.message : String(err);
        try {
          const errData = JSON.parse(errMessage);
          if (typeof errData.message === "string") {
            errMessage = errData.message;
          }
        } catch {
          // ignore error
        }
        errorMessageItem = new AIPlaygroundChatItem({
          role: null,
          timestamp: Date.now(),
          error: errMessage,
        });
      }
      if (this._currentMessage) {
        this._storePlaygroundChatItem(this._currentMessage);
        this._currentMessage = null;
      }
      if (errorMessageItem) {
        this.playgroundChatHistory.push(errorMessageItem);
        this._storePlaygroundChatItem(errorMessageItem);
      }
    } finally {
      this._runningPlaygroundAbortController = null;
    }
  });

  async _handleSSEStream(stream: SSEStream) {
    for await (const event of stream) {
      switch (event.type) {
        case "message_start":
          if (this._currentMessage) {
            throw new Error(
              "received 'message_start' while last message not complete"
            );
          }
          this._currentMessage = new AIPlaygroundChatItem({
            role: event.message.role,
            timestamp: Date.now(),
          });
          arrayActions.push(this.playgroundChatHistory, this._currentMessage);
          break;
        case "content_block_start":
          if (!this._currentMessage) {
            throw new Error(
              "received 'content_block_start' before message started"
            );
          }
          switch (event.content_block.type) {
            case "text":
              this._currentMessage.createTextBlock(
                event.index,
                event.content_block.text
              );
              break;
          }
          break;
        case "content_block_delta":
          if (!this._currentMessage) {
            throw new Error(
              "received 'content_block_delta' before message started"
            );
          }
          switch (event.delta.type) {
            case "text_delta":
              this._currentMessage.updateTextBlock(
                event.index,
                event.delta.text
              );
              break;
          }
          break;
        case "content_block_stop":
          if (!this._currentMessage) {
            throw new Error(
              "received 'content_block_stop' before message started"
            );
          }
          if (this._currentMessage.blocks[event.index] == null) {
            throw new Error(
              `received 'content_block_stop' for index ${event.index} before block start`
            );
          }
          break;
        case "message_stop":
          if (!this._currentMessage) {
            throw new Error("received 'message_stop' before message started");
          }

          this._storePlaygroundChatItem(this._currentMessage);
          this._currentMessage = null;
          break;
        case "error":
          console.error(event.error);
      }
    }
  }

  @observable
  _hasUnfetchedChatHistory = true;

  @observable
  _fetchingChatHistory = false;

  @modelFlow
  fetchChatHistory = _async(function* (this: AIAdminState) {
    if (this._fetchingChatHistory || !this._hasUnfetchedChatHistory) {
      return;
    }
    this._fetchingChatHistory = true;
    const history = yield* _await(
      fetchAIPlaygroundChatHistory(
        instanceCtx.get(this)!.instanceId!,
        dbCtx.get(this)!.name,
        this.playgroundChatHistory[0]?.timestamp ?? Date.now(),
        50
      )
    );
    this._hasUnfetchedChatHistory = history.length === 50;

    const historyItems: AIPlaygroundChatItem[] = Array(history.length);
    for (let i = history.length - 1; i >= 0; i--) {
      const item = fromSnapshot<AIPlaygroundChatItem>(history[i].data);
      historyItems[history.length - 1 - i] = item;
    }

    this.playgroundChatHistory.unshift(...historyItems);

    this._fetchingChatHistory = false;
  });
}

interface ChatMessageBlock {
  type: "text";
  message: string;
}

@model("AIAdmin/PlaygroundChatItem")
export class AIPlaygroundChatItem extends Model({
  $modelId: idProp,
  role: prop<ChatParticipantRole | null>(),
  timestamp: prop<number>(),
  blocks: prop<ChatMessageBlock[]>(() => []),
  cancelled: prop<boolean>(false),
  error: prop<string | null>(null),
}) {
  @modelAction
  createTextBlock(index: number, message: string) {
    if (this.blocks[index] != null) {
      throw new Error(
        `Chat message block with index ${index} already created`
      );
    }
    this.blocks[index] = {type: "text", message};
  }

  @modelAction
  updateTextBlock(index: number, textDelta: string) {
    const block = this.blocks[index];
    if (block.type !== "text") {
      throw new Error(
        `No chat message block at index ${index} with type 'text'`
      );
    }
    block.message += textDelta;
  }
}

export type AIProviderAPIStyle = "OpenAI" | "Anthropic";

@model("AIAdmin/ProviderDraft")
export class AIProviderDraft extends Model({
  typename: prop<string>().withSetter(),
  name: prop<string | null>(null).withSetter(),
  displayName: prop<string>("").withSetter(),
  apiUrl: prop<string | null>(null).withSetter(),
  apiStyle: prop<AIProviderAPIStyle>("Anthropic").withSetter(),
  clientId: prop<string>("").withSetter(),
  secret: prop<string | null>(null).withSetter(),
}) {
  @computed
  get providerConfigType() {
    const state = getParent<AIAdminState>(this)!;
    return state.providerConfigTypes.find(
      (p) => p.typename === this.typename
    )!;
  }

  @computed
  get nameError() {
    if (this.name === null) return null;
    if (this.name.trim() === "") return "Provider name is required";
    return getParent<AIAdminState>(this)!.existingProviderNames.has(this.name)
      ? "Provider name already exists"
      : null;
  }

  @computed
  get apiUrlError() {
    if (this.apiUrl === null) return null;
    if (this.apiUrl.trim() === "") return "API URL is required";
    return null;
  }

  @computed
  get secretError() {
    if (this.secret === null) return null;
    if (this.secret.trim() === "") return "Secret is required";
    return null;
  }

  @computed
  get formValid() {
    return (
      (this.providerConfigType.name == null
        ? this.name != null &&
          !this.nameError &&
          this.apiUrl != null &&
          !this.apiUrlError
        : true) &&
      this.secret != null &&
      !this.secretError
    );
  }

  @observable
  updating = false;

  @observable
  error: string | null = null;

  @action
  async addProvider() {
    if (!this.formValid) return;

    const conn = connCtx.get(this)!;
    const state = getParent<AIAdminState>(this)!;

    this.updating = true;
    this.error = null;

    try {
      const providerConfig = this.providerConfigType;

      const queryFields: string[] = [];
      if (providerConfig.name == null) {
        queryFields.push(`name := ${JSON.stringify(this.name!.trim())}`);
        if (this.displayName.trim()) {
          queryFields.push(
            `display_name := ${JSON.stringify(this.displayName.trim())}`
          );
        }
        queryFields.push(
          `api_style := ext::ai::ProviderAPIStyle.${this.apiStyle}`,
          `api_url := ${JSON.stringify(this.apiUrl!.trim())}`
        );
      }
      if (this.clientId.trim()) {
        queryFields.push(
          `client_id := ${JSON.stringify(this.clientId.trim())}`
        );
      }
      queryFields.push(`secret := ${JSON.stringify(this.secret!.trim())}`);

      await conn.execute(
        `configure current database
          insert ${this.typename} {
            ${queryFields.join(",\n")}
          }`
      );
      await state.refreshConfig();
      state.clearProviderDraft();
    } catch (e) {
      console.log(e);
      runInAction(
        () => (this.error = e instanceof Error ? e.message : String(e))
      );
    } finally {
      runInAction(() => (this.updating = false));
    }
  }
}

@model("AIAdmin/PromptDraft")
export class AIPromptDraft extends Model({
  id: prop<string | null>(),

  expanded: prop(true).withSetter(),
}) {
  _getState() {
    return findParent<AIAdminState>(
      this,
      (node) => node instanceof AIAdminState
    )!;
  }

  @computed
  get _prompt() {
    return this._getState().prompts!.find((p) => p.id === this.id);
  }

  @observable
  _name: string | null = null;

  @computed
  get name() {
    return this._prompt?.name ?? this._name ?? "";
  }

  @action
  setName(name: string) {
    this._name = name;
  }

  @observable
  _messages: {[messageId: string]: PromptMessage} = {};

  @computed
  get allMessages() {
    return [
      ...(this._prompt?.messages ?? []),
      ...Object.values(this._messages).filter((m) => m.id.startsWith("_")),
    ];
  }

  getMessage(id: string): [boolean, PromptMessage] {
    if (this._messages[id]) {
      return [true, this._messages[id]];
    } else {
      return [false, this._prompt!.messages.find((m) => m.id === id)!];
    }
  }

  @action
  createDraftMessage() {
    const id = `_${Math.round(Math.random() * 10 ** 16)}`;
    this._messages[id] = {
      id,
      participant_role: "System",
      participant_name: null,
      content: null,
    };
  }

  @action
  removeDraftMessage(id: string) {
    delete this._messages[id];
  }

  _ensureMessage(messageId: string) {
    if (!this._messages[messageId]) {
      this._messages[messageId] = {
        ...this._prompt!.messages.find((m) => m.id === messageId)!,
      };
    }
  }

  @action
  setMessageRole(id: string, role: PromptChatParticipantRole) {
    this._ensureMessage(id);
    this._messages[id].participant_role = role;
  }

  @action
  setMessageName(id: string, name: string) {
    this._ensureMessage(id);
    this._messages[id].participant_name = name;
  }

  @action
  setMessageContent(id: string, content: string) {
    this._ensureMessage(id);
    this._messages[id].content = content;
  }

  getMessageError(id: string) {
    const messageContent = this._messages[id]?.content;
    if (messageContent == null) return null;
    return messageContent.trim() === ""
      ? "Prompt message content is required"
      : null;
  }

  @computed
  get nameError() {
    if (this._name === null) return null;
    if (this._name.trim() === "") return "Prompt name is required";
    return getParent<AIAdminState>(this)!.prompts?.some(
      (p) => p.name === this._name
    )
      ? "Prompt name already exists"
      : null;
  }

  @computed
  get isPromptValid() {
    return (
      this._name != null &&
      this.nameError === null &&
      Object.values(this._messages).every(
        (m) => m.content != null && m.content.trim() !== ""
      )
    );
  }

  async deleteMessage(messageId: string) {
    const conn = connCtx.get(this)!;

    await conn.query(
      `with
        deletedMessage := (
          delete ext::ai::ChatPromptMessage
          filter .id = <uuid>$messageId
        )
      update ext::ai::ChatPrompt
      filter .id = <uuid>$promptId
      set {
        messages -= deletedMessage
      }`,
      {promptId: this.id, messageId},
      {ignoreSessionConfig: true}
    );

    await this._getState().refreshConfig();

    this.removeDraftMessage(messageId);
  }

  async updateMessage(messageId: string) {
    const conn = connCtx.get(this)!;

    const {participant_role, participant_name, content} =
      this._messages[messageId];

    await conn.query(
      `update ext::ai::ChatPromptMessage
      filter .id = <uuid>$messageId
      set {
        participant_role := <str>$participant_role,
        participant_name := <optional str>$participant_name,
        content := <str>$content
      }`,
      {
        messageId,
        participant_role,
        participant_name: participant_name?.trim() || null,
        content,
      },
      {ignoreSessionConfig: true}
    );

    await this._getState().refreshConfig();

    this.removeDraftMessage(messageId);
  }

  async saveMessage(messageId: string) {
    const conn = connCtx.get(this)!;

    const {participant_role, participant_name, content} =
      this._messages[messageId];

    await conn.query(
      `with
        newMessage := (
          insert ext::ai::ChatPromptMessage {
            participant_role := <str>$participant_role,
            participant_name := <optional str>$participant_name,
            content := <str>$content
          }
        )
      update ext::ai::ChatPrompt
      filter .id = <uuid>$promptId
      set {
        messages += newMessage
      }`,
      {
        promptId: this.id,
        participant_role,
        participant_name: participant_name?.trim() || null,
        content,
      },
      {ignoreSessionConfig: true}
    );

    await this._getState().refreshConfig();

    this.removeDraftMessage(messageId);
  }
}
