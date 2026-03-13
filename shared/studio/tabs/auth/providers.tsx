import {useMemo, useState} from "react";
import {observer} from "mobx-react-lite";

import cn from "@dbsof/common/utils/classNames";

import {useTabState} from "../../state";
import {
  _providersInfo,
  AuthAdminState,
  AuthProviderData,
  DraftProviderConfig,
  DraftUIConfig,
  LocalEmailPasswordProviderData,
  LocalMagicLinkProviderData,
  LocalWebAuthnProviderData,
  OAuthProviderData,
  ProviderKind,
  ProviderTypename,
} from "./state";

import {
  Button,
  Checkbox,
  ChevronDownIcon,
  ConfirmButton,
  FieldHeader,
  InfoTooltip,
  Select,
  SelectItem,
  TextInput,
} from "@dbsof/common/newui";

import styles from "./authAdmin.module.scss";
import {EmailProviderWarning, StickyBottomBar} from "./shared";
import {Theme, useTheme} from "@dbsof/common/hooks/useTheme";
import {AppConfigForm} from "./config";
import {
  DarkThemeIcon,
  LightThemeIcon,
} from "@dbsof/common/ui/themeSwitcher/icons";
import {LoginUIPreview} from "./loginUIPreview";
import {LoadingSkeleton} from "@dbsof/common/newui/loadingSkeleton";

export const ProvidersTab = observer(function ProvidersTab() {
  const state = useTabState(AuthAdminState);

  return (
    <div className={styles.tabContentWrapper}>
      <h2>Providers</h2>
      {state.providers ? (
        <>
          {state.providers.length ? (
            <>
              {state.emailProviderWarnings.verificationNoSmtp ? (
                <EmailProviderWarning>
                  You have auth providers requiring email verification enabled,
                  but no method for verifying emails is configured.
                  <br />
                  <span
                    className={styles.link}
                    onClick={() => state.setSelectedTab("smtp")}
                  >
                    Enable an SMTP provider
                  </span>{" "}
                  or{" "}
                  <span
                    className={styles.link}
                    onClick={() => state.setSelectedTab("webhooks")}
                  >
                    create a webhook
                  </span>{" "}
                  to handle email verification.
                </EmailProviderWarning>
              ) : state.emailProviderWarnings.passwordNoReset ? (
                <EmailProviderWarning>
                  You have the 'Email + Password' auth provider enabled, but no
                  method for sending password resets is configured.
                  <br />
                  <span
                    className={styles.link}
                    onClick={() => state.setSelectedTab("smtp")}
                  >
                    Enable an SMTP provider
                  </span>{" "}
                  or{" "}
                  <span
                    className={styles.link}
                    onClick={() => state.setSelectedTab("webhooks")}
                  >
                    create a webhook
                  </span>{" "}
                  to handle password resets.
                </EmailProviderWarning>
              ) : state.emailProviderWarnings.magicLinkNoMethods ? (
                <EmailProviderWarning>
                  You have the 'Magic Link' auth provider enabled, but no
                  method for sending magic links is configured.
                  <br />
                  <span
                    className={styles.link}
                    onClick={() => state.setSelectedTab("smtp")}
                  >
                    Enable an SMTP provider
                  </span>{" "}
                  or{" "}
                  <span
                    className={styles.link}
                    onClick={() => state.setSelectedTab("webhooks")}
                  >
                    create a webhook
                  </span>{" "}
                  to handle magic links.
                </EmailProviderWarning>
              ) : null}

              <div className={styles.cardList}>
                {state.providers.map((provider) => (
                  <ProviderCard key={provider.name} provider={provider} />
                ))}
              </div>
            </>
          ) : null}

          {state.draftProviderConfig ? (
            <div className={styles.addDraft}>
              <DraftProviderConfigForm
                draftState={state.draftProviderConfig}
              />
            </div>
          ) : state.providers.length < state.providerTypenames.length ? (
            <div className={styles.addDraft}>
              <Button onClick={() => state.addDraftProvider()}>
                Add Provider
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <div className={styles.cardList}>
          <LoadingSkeleton className={styles.providerSkeleton} />
          <LoadingSkeleton className={styles.providerSkeleton} />
          <LoadingSkeleton className={styles.providerSkeleton} />
        </div>
      )}

      <h2 style={{marginTop: "96px"}}>Built-in Login UI</h2>
      {state.draftUIConfig ? (
        <UIConfigForm draft={state.draftUIConfig} />
      ) : state.uiConfig != null ? (
        <div className={styles.enableUI}>
          <Button onClick={() => state.enableUI()}>Enable UI</Button>
        </div>
      ) : (
        <LoadingSkeleton className={styles.uiConfigSkeleton} />
      )}
    </div>
  );
});

function getProviderSelectItems(
  providers: typeof _providersInfo,
  existingProviders: Set<string>
) {
  return {
    items: [],
    groups: Object.entries(
      Object.entries(providers).reduce<{
        [group in ProviderKind]: SelectItem<ProviderTypename>[];
      }>((items, [id, provider]) => {
        if (!items[provider.kind]) {
          items[provider.kind] = [];
        }
        items[provider.kind].push({
          id: id as ProviderTypename,
          label: (
            <div className={styles.providerSelectItem}>
              {provider.icon}
              {provider.displayName}
            </div>
          ),
          disabled:
            (id as ProviderTypename) !== "ext::auth::OpenIDConnectProvider" &&
            existingProviders.has(id),
        });
        return items;
      }, {} as any)
    ).map(([label, items]) => ({label, items})),
  };
}

const DraftProviderConfigForm = observer(function DraftProviderConfigForm({
  draftState,
}: {
  draftState: DraftProviderConfig;
}) {
  const state = useTabState(AuthAdminState);

  const providerItems = useMemo(
    () =>
      getProviderSelectItems(
        state.providersInfo,
        new Set(state.providers?.map((p) => p._typename))
      ),
    [state.providers]
  );
  const providerKind = _providersInfo[draftState.selectedProviderType].kind;

  return (
    <div className={cn(styles.draftForm)}>
      <div className={styles.formRow}>
        <Select
          items={providerItems}
          selectedItemId={draftState.selectedProviderType}
          onChange={(item) => draftState.setSelectedProviderType(item.id)}
        />
      </div>

      {providerKind === "OAuth" ? (
        <>
          {draftState.selectedProviderType ===
          "ext::auth::OpenIDConnectProvider" ? (
            <>
              <div className={cn(styles.formRow, styles.evenWidth)}>
                <TextInput
                  label={
                    <>
                      Provider name
                      <InfoTooltip
                        message={
                          <>
                            The unique identifier referenced by the{" "}
                            <code>provider</code> option in the auth API's
                          </>
                        }
                      />
                    </>
                  }
                  value={draftState.providerName ?? ""}
                  onChange={(e) => draftState.setProviderName(e.target.value)}
                  error={draftState.providerNameError}
                />
                <TextInput
                  label={
                    <>
                      Provider display name
                      <InfoTooltip message="Provider name to be displayed in the login UI" />
                    </>
                  }
                  value={draftState.displayName ?? ""}
                  onChange={(e) => draftState.setDisplayName(e.target.value)}
                  error={draftState.displayNameError}
                />
              </div>

              <div className={cn(styles.formRow, styles.evenWidth)}>
                <TextInput
                  label={
                    <>
                      Issuer URL
                      <InfoTooltip message="The issuer URL of the provider" />
                    </>
                  }
                  value={draftState.issuerUrl ?? ""}
                  onChange={(e) => draftState.setIssuerUrl(e.target.value)}
                  error={draftState.issuerUrlError}
                />
                <TextInput
                  label={
                    <>
                      Logo URL
                      <InfoTooltip message="A url to an image of the provider's logo" />
                    </>
                  }
                  optional
                  value={draftState.logoUrl ?? ""}
                  onChange={(e) => draftState.setLogoUrl(e.target.value)}
                  error={draftState.logoUrlError}
                />
              </div>
            </>
          ) : null}

          <div className={cn(styles.formRow, styles.evenWidth)}>
            <TextInput
              label={
                <>
                  Client ID
                  <InfoTooltip message={"Client ID from the OAuth provider"} />
                </>
              }
              value={draftState.oauthClientId ?? ""}
              onChange={(e) => draftState.setOauthClientId(e.target.value)}
              error={draftState.oauthClientIdError}
            />
            <TextInput
              label={
                <>
                  Client secret{" "}
                  <InfoTooltip
                    message={"Secret provided by the OAuth provider"}
                  />
                </>
              }
              value={draftState.oauthSecret ?? ""}
              onChange={(e) => draftState.setOauthSecret(e.target.value)}
              error={draftState.oauthSecretError}
            />
          </div>
          <div className={cn(styles.formRow, styles.fullWidth)}>
            <TextInput
              label={
                <>
                  Additional scopes{" "}
                  <InfoTooltip
                    message={
                      "Space-separated list of scopes to be included in the authorize request to the OAuth provider"
                    }
                  />
                </>
              }
              optional
              value={draftState.additionalScope}
              onChange={(e) => draftState.setAdditionalScope(e.target.value)}
            />
          </div>
        </>
      ) : providerKind === "Local" ? (
        <>
          {draftState.selectedProviderType ===
          "ext::auth::WebAuthnProviderConfig" ? (
            <div className={cn(styles.formRow, styles.fullWidth)}>
              <TextInput
                label={
                  <>
                    Relying party origin
                    <InfoTooltip
                      message={
                        <>
                          The full origin of the sign-in page including
                          protocol and port of the application. If using the
                          built-in UI, this should be the origin of the Studio
                          server.
                        </>
                      }
                    />
                  </>
                }
                value={draftState.webauthnRelyingOrigin ?? ""}
                onChange={(e) =>
                  draftState.setWebauthnRelyingOrigin(e.target.value)
                }
                error={draftState.webauthnRelyingOriginError}
              />
            </div>
          ) : null}
          {draftState.selectedProviderType ===
            "ext::auth::EmailPasswordProviderConfig" ||
          draftState.selectedProviderType ===
            "ext::auth::WebAuthnProviderConfig" ? (
            <div className={styles.formRow}>
              <Checkbox
                label={
                  <>
                    Require email verification
                    <InfoTooltip
                      message={
                        <>
                          Whether the email needs to be verified before the
                          user is allowed to sign in.
                        </>
                      }
                    />
                  </>
                }
                checked={draftState.requireEmailVerification}
                onChange={(checked) =>
                  draftState.setRequireEmailVerification(checked)
                }
              />
            </div>
          ) : null}
          {draftState.selectedProviderType ===
          "ext::auth::MagicLinkProviderConfig" ? (
            <div className={styles.formRow}>
              <TextInput
                label={
                  <>
                    Token time to live
                    <InfoTooltip
                      message={
                        <>
                          The time after which a magic link token expires.
                          Defaults to 10 minutes.
                        </>
                      }
                    />
                  </>
                }
                size={16}
                optional
                value={draftState.tokenTimeToLive}
                onChange={(e) =>
                  draftState.setTokenTimeToLive(e.target.value.toUpperCase())
                }
                error={draftState.tokenTimeToLiveError}
              />
            </div>
          ) : null}
          {state.hasVerificationMethod &&
          (draftState.selectedProviderType ===
            "ext::auth::EmailPasswordProviderConfig" ||
            draftState.selectedProviderType ===
              "ext::auth::WebAuthnProviderConfig" ||
            draftState.selectedProviderType ===
              "ext::auth::MagicLinkProviderConfig") ? (
            <div className={styles.formRow}>
              <Checkbox
                label={
                  <>
                    Use one-time code verification
                    <InfoTooltip
                      message={
                        <>
                          {draftState.selectedProviderType ===
                          "ext::auth::MagicLinkProviderConfig"
                            ? "Send a short one-time code instead of a link in the magic link email. This allows the user to sign in on a different device to the one on which they receive the email."
                            : "During email verification, send a short one-time code instead of a link. This allows the user to verify their email on a different device to the one on which they signed up."}
                        </>
                      }
                    />
                  </>
                }
                checked={draftState.useCodeVerificationMethod}
                onChange={(checked) =>
                  draftState.setUseCodeVerificationMethod(checked)
                }
              />
            </div>
          ) : null}
          {state.hasMagicLinkAutoSignup &&
          draftState.selectedProviderType ===
            "ext::auth::MagicLinkProviderConfig" ? (
            <div className={styles.formRow}>
              <Checkbox
                label={
                  <>
                    Enable auto signup
                    <InfoTooltip
                      message={
                        <>
                          Automatically register a new identity when a user
                          attempts to sign in using an email that hasn't yet
                          been explicitly registered using the sign up API.
                        </>
                      }
                    />
                  </>
                }
                checked={draftState.enableAutoSignup}
                onChange={(checked) => draftState.setEnableAutoSignup(checked)}
              />
            </div>
          ) : null}
        </>
      ) : null}

      <div className={cn(styles.formRow, styles.buttons)}>
        <Button onClick={() => state.cancelDraftProvider()}>Cancel</Button>
        <Button
          kind="primary"
          onClick={() => draftState.addProvider()}
          disabled={!draftState.formValid}
          loading={draftState.updating}
        >
          {draftState.updating ? "Adding Provider..." : "Add Provider"}
        </Button>
      </div>
    </div>
  );
});

function ProviderCard({provider}: {provider: AuthProviderData}) {
  const state = useTabState(AuthAdminState);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isOpenIdConnect =
    provider._typename === "ext::auth::OpenIDConnectProvider";
  const {displayName, icon, kind} = _providersInfo[provider._typename];

  return (
    <div className={cn(styles.card, styles.providerCard)}>
      <div className={styles.cardMain}>
        <div className={styles.details}>
          {isOpenIdConnect && provider.logo_url ? (
            <div
              className={styles.logo}
              style={{backgroundImage: `url(${provider.logo_url}`}}
            />
          ) : (
            icon
          )}
          <div className={styles.name}>
            {isOpenIdConnect ? (
              <>
                {provider.display_name} <span>{displayName}</span>
              </>
            ) : (
              displayName
            )}
          </div>
          <div className={styles.providerType}>{kind}</div>
        </div>
        <div
          className={cn(styles.expandButton, {[styles.expanded]: expanded})}
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronDownIcon />
        </div>
      </div>

      {expanded ? (
        <div className={styles.expandedConfig}>
          <div className={cn(styles.formRow, styles.evenWidth)}>
            <TextInput readOnly label="Provider name" value={provider.name} />
            {isOpenIdConnect ? (
              <TextInput
                readOnly
                label="Provider display name"
                value={provider.display_name}
              />
            ) : (
              <div className={styles.spacer} />
            )}
          </div>
          {isOpenIdConnect ? (
            <div className={cn(styles.formRow, styles.evenWidth)}>
              <TextInput
                readOnly
                label="Issuer URL"
                value={provider.issuer_url}
              />
              <TextInput
                readOnly
                label="Logo URL"
                value={provider.logo_url ?? ""}
              />
            </div>
          ) : null}
          {kind === "OAuth" ? (
            <>
              <div className={cn(styles.formRow, styles.evenWidth)}>
                <TextInput
                  readOnly
                  label="Client ID"
                  value={(provider as OAuthProviderData).client_id}
                />
                <TextInput
                  readOnly
                  label="Client secret"
                  value={"secret hidden"}
                  type="password"
                />
              </div>
              <div className={cn(styles.formRow, styles.fullWidth)}>
                <TextInput
                  readOnly
                  label="Additional scopes"
                  value={
                    (provider as OAuthProviderData).additional_scope ?? ""
                  }
                />
              </div>
            </>
          ) : kind === "Local" ? (
            <>
              {provider.name === "builtin::local_webauthn" ? (
                <div className={cn(styles.formRow, styles.fullWidth)}>
                  <TextInput
                    readOnly
                    label="Relying party origin"
                    value={
                      (provider as LocalWebAuthnProviderData)
                        .relying_party_origin
                    }
                  />
                </div>
              ) : null}
              {provider.name === "builtin::local_emailpassword" ||
              provider.name === "builtin::local_webauthn" ? (
                <div className={styles.formRow}>
                  <Checkbox
                    readOnly
                    label="Require email verification"
                    checked={
                      (
                        provider as
                          | LocalEmailPasswordProviderData
                          | LocalWebAuthnProviderData
                      ).require_verification
                    }
                  />
                </div>
              ) : null}
              {provider.name === "builtin::local_magic_link" ? (
                <div className={styles.formRow}>
                  <TextInput
                    readOnly
                    size={16}
                    label="Token time to live"
                    value={
                      (provider as LocalMagicLinkProviderData)
                        .token_time_to_live
                    }
                  />
                </div>
              ) : null}
              {state.hasVerificationMethod &&
              (provider.name === "builtin::local_emailpassword" ||
                provider.name === "builtin::local_webauthn" ||
                provider.name === "builtin::local_magic_link") ? (
                <div className={styles.formRow}>
                  <Checkbox
                    readOnly
                    label="Use one-time code verification"
                    checked={
                      (provider as LocalEmailPasswordProviderData)
                        .verification_method === "Code"
                    }
                  />
                </div>
              ) : null}
              {state.hasMagicLinkAutoSignup &&
              provider.name === "builtin::local_magic_link" ? (
                <div className={styles.formRow}>
                  <Checkbox
                    readOnly
                    label="Enable auto signup"
                    checked={
                      (provider as LocalMagicLinkProviderData).auto_signup ===
                      true
                    }
                  />
                </div>
              ) : null}
            </>
          ) : null}

          <div className={cn(styles.formRow, styles.buttons)}>
            <ConfirmButton
              loading={deleting}
              onClick={() => {
                setDeleting(true);
                state.removeProvider(provider._typename, provider.name);
              }}
            >
              {deleting ? "Removing..." : "Remove"}
            </ConfirmButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const UIConfigForm = observer(function UIConfig({
  draft,
}: {
  draft: DraftUIConfig;
}) {
  const state = useTabState(AuthAdminState);
  const [_, theme] = useTheme();

  const [disablingUI, setDisablingUI] = useState(false);

  return (
    <div>
      <div className={styles.configGrid}>
        <div className={styles.gridItem}>
          <div className={styles.configName}>
            <FieldHeader label="Redirect to" />
          </div>

          <div className={cn(styles.configInput, styles.fullWidth)}>
            <TextInput
              value={draft.getConfigValue("redirect_to")}
              onChange={(e) =>
                draft.setConfigValue("redirect_to", e.target.value)
              }
              error={draft.redirectToError}
            />
          </div>
          <div className={styles.configExplain}>
            The url to redirect to after successful sign in.
          </div>
        </div>

        <div className={styles.gridItem}>
          <div className={styles.configName}>
            <FieldHeader label="Redirect to on signup" />
          </div>

          <div className={cn(styles.configInput, styles.fullWidth)}>
            <TextInput
              value={draft.getConfigValue("redirect_to_on_signup")}
              onChange={(e) =>
                draft.setConfigValue("redirect_to_on_signup", e.target.value)
              }
            />
          </div>
          <div className={styles.configExplain}>
            The url to redirect to after a new user signs up. If not set,
            'redirect_to' will be used instead.
          </div>
        </div>

        {draft.appConfig ? <AppConfigForm draft={draft.appConfig} /> : null}
      </div>

      <StickyBottomBar visible={true}>
        {state.uiConfig ? (
          <ConfirmButton
            onClick={() => {
              setDisablingUI(true);
              state.disableUI();
            }}
            loading={disablingUI}
            style={{marginRight: "auto"}}
          >
            Disable UI
          </ConfirmButton>
        ) : (
          <Button
            onClick={() => {
              state.disableUI();
            }}
            loading={disablingUI}
            style={{marginRight: "auto"}}
          >
            Cancel
          </Button>
        )}

        {state.uiConfig && draft.formChanged ? (
          <Button kind="outline" onClick={() => draft.clearForm()}>
            Clear Changes
          </Button>
        ) : null}
        <Button
          kind="primary"
          onClick={() => draft.update()}
          disabled={draft.formError || !draft.formChanged || draft.updating}
          loading={draft.updating}
        >
          {state.uiConfig ? "Update" : "Enable UI"}
        </Button>
      </StickyBottomBar>

      <div className={styles.loginUIPreview}>
        <div className={styles.loginUIPreviewHeader}>
          <span>Preview</span>
          <div
            className={styles.themeSwitch}
            onClick={() =>
              draft.setShowDarkTheme(
                !(draft.showDarkTheme ?? theme === Theme.dark)
              )
            }
          >
            {draft.showDarkTheme ?? theme == Theme.dark ? (
              <>
                <DarkThemeIcon /> Dark theme
              </>
            ) : (
              <>
                <LightThemeIcon /> Light theme
              </>
            )}
          </div>
        </div>
        <LoginUIPreview
          key={state.providers?.length ?? 0}
          draft={
            state.newAppAuthSchema
              ? state.draftCoreConfig!.appConfig!
              : draft.appConfig!
          }
          providers={state.providers ?? []}
          darkTheme={draft.showDarkTheme ?? theme == Theme.dark}
        />
      </div>
    </div>
  );
});
