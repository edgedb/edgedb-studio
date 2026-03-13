import {Fragment, useState} from "react";
import {observer} from "mobx-react-lite";

import cn from "@dbsof/common/utils/classNames";
import {
  Button,
  ConfirmButton,
  ChevronDownIcon,
  InfoTooltip,
  Select,
  TextInput,
  WarningIcon,
} from "@dbsof/common/newui";

import {useTabState} from "../../state";
import {
  AIAdminState,
  AIProviderAPIStyle,
  AIProviderDraft,
  ProviderInfo,
} from "./state";
import {AILogosByName} from "./logos";

import styles from "./aiAdmin.module.scss";

export const ProvidersTab = observer(function ProvidersTab() {
  const state = useTabState(AIAdminState);

  return (
    <div className={styles.providersLayout}>
      <div className={styles.contentWrapper}>
        <h2>Providers</h2>
        {state.indexesWithoutProviders?.length ? (
          <div className={styles.indexesWarning}>
            <WarningIcon />
            <span>Warning:</span> There are indexes in your schema using
            providers without any configuration.
            <div className={styles.addMissingProviderLinks}>
              Add missing configuration for the{" "}
              {state.indexesWithoutProviders.map((providerName, i, arr) => {
                const link = (
                  <span
                    onClick={() => {
                      state.createProviderDraft(providerName);
                    }}
                  >
                    {state.providerConfigTypesByName.get(providerName)
                      ?.displayName ?? providerName}
                  </span>
                );
                return (
                  <Fragment key={providerName}>
                    {link}
                    {i < arr.length - 2
                      ? ", "
                      : i == arr.length - 2
                      ? ", and "
                      : ""}
                  </Fragment>
                );
              })}{" "}
              provider{state.indexesWithoutProviders.length > 1 ? "s" : ""}.
            </div>
          </div>
        ) : null}
        <div className={styles.providerList}>
          {state.providers?.map((provider) => (
            <ProviderCard key={provider.name} provider={provider} />
          ))}
        </div>
        <div className={styles.addProvider}>
          {state.newProviderDraft ? (
            <ProviderDraftForm draft={state.newProviderDraft} />
          ) : (
            <Button onClick={() => state.createProviderDraft()}>
              Add Provider
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});

function ProviderCard({provider}: {provider: ProviderInfo}) {
  const state = useTabState(AIAdminState);
  const [expanded, setExpanded] = useState(false);

  const usedByIndexes = state.indexedObjectTypes[provider.name];

  return (
    <div className={styles.providerCard}>
      <div className={styles.cardMain}>
        {AILogosByName[provider.name]}
        <div className={styles.details}>
          <div className={styles.displayName}>{provider.display_name}</div>
          <div className={styles.name}>{provider.name}</div>
        </div>
        {usedByIndexes ? (
          <div className={styles.usedBy}>
            Used by {usedByIndexes.length} index
            {usedByIndexes.length > 1 ? "es" : ""}
          </div>
        ) : null}
        <div
          className={cn(styles.expandButton, {[styles.expanded]: expanded})}
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronDownIcon />
        </div>
      </div>
      {expanded ? (
        <div className={styles.expandedConfig}>
          {state.providerConfigTypes.find(
            (p) => p.typename === provider._typename
          )!.name == null ? (
            <div className={cn(styles.formRow, styles.fullWidth)}>
              <TextInput
                className={styles.apiStyle}
                readOnly
                label={"API Style"}
                value={provider.api_style}
              />
              <TextInput readOnly label={"API URL"} value={provider.api_url} />
            </div>
          ) : null}
          <div className={cn(styles.formRow, styles.fullWidth)}>
            <TextInput
              readOnly
              label={"Client ID"}
              value={provider.client_id ?? ""}
            />
            <TextInput
              readOnly
              label={"Secret"}
              value={"secret hidden"}
              type="password"
            />
          </div>
          <div className={cn(styles.formRow, styles.buttons)}>
            <ConfirmButton
              onClick={() =>
                state.removeProvider(provider._typename, provider.name)
              }
            >
              Remove
            </ConfirmButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const ProviderDraftForm = observer(function ProviderDraftForm({
  draft,
}: {
  draft: AIProviderDraft;
}) {
  const state = useTabState(AIAdminState);

  return (
    <div className={styles.draftProviderForm}>
      <div className={styles.formRow}>
        <Select
          items={state.providerConfigTypes.map((p) => ({
            id: p.typename,
            label: (
              <span className={styles.providerSelectItem}>
                {p.name ? AILogosByName[p.name] : null}
                {p.displayName}
              </span>
            ),
            disabled:
              p.name != null && state.existingProviderNames.has(p.name),
          }))}
          selectedItemId={draft.typename}
          onChange={({id}) => draft.setTypename(id)}
        />
      </div>
      {draft.providerConfigType.name == null ? (
        <>
          <div className={cn(styles.formRow, styles.evenWidth)}>
            <TextInput
              label={
                <>
                  Provider Name{" "}
                  <InfoTooltip
                    message={
                      <>
                        The unique identifier referenced by{" "}
                        <code>model_provider</code> in your custom{" "}
                        <code>ext::ai::Model</code> types.
                      </>
                    }
                  />
                </>
              }
              value={draft.name ?? ""}
              onChange={(e) => draft.setName(e.target.value)}
              error={draft.nameError}
            />
            <TextInput
              label={"Provider Display Name"}
              optional
              placeholder={draft.providerConfigType.displayName}
              value={draft.displayName}
              onChange={(e) => draft.setDisplayName(e.target.value)}
            />
          </div>
          <div className={cn(styles.formRow, styles.fullWidth)}>
            <Select<AIProviderAPIStyle>
              className={styles.apiStyleSelect}
              label="API Style"
              items={[
                {id: "Anthropic", label: "Anthropic"},
                {id: "OpenAI", label: "OpenAI"},
              ]}
              selectedItemId={draft.apiStyle}
              onChange={({id}) => draft.setApiStyle(id)}
            />
            <TextInput
              label={"API URL"}
              value={draft.apiUrl ?? ""}
              onChange={(e) => draft.setApiUrl(e.target.value)}
              error={draft.apiUrlError}
            />
          </div>
        </>
      ) : null}
      <div className={cn(styles.formRow, styles.evenWidth)}>
        <TextInput
          label={"Client ID"}
          optional
          value={draft.clientId}
          onChange={(e) => draft.setClientId(e.target.value)}
        />
        <TextInput
          label={"Secret"}
          value={draft.secret ?? ""}
          onChange={(e) => draft.setSecret(e.target.value)}
          error={draft.secretError}
        />
      </div>
      <div className={cn(styles.formRow, styles.buttons)}>
        <Button onClick={() => state.clearProviderDraft()}>Cancel</Button>
        <Button
          kind="primary"
          onClick={() => draft.addProvider()}
          disabled={draft.updating || !draft.formValid}
        >
          {draft.updating ? "Adding Provider..." : "Add Provider"}
        </Button>
      </div>
    </div>
  );
});
