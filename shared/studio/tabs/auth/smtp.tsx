import {observer} from "mobx-react-lite";

import {useTabState} from "../../state";
import {
  AuthAdminState,
  CLOUD_SMTP_PROVIDER_NAME,
  DraftSMTPConfig,
  EmailProviderConfig,
  smtpSecurity,
  SMTPSecurity,
} from "./state";

import cn from "@dbsof/common/utils/classNames";

import {
  Button,
  Checkbox,
  ChevronDownIcon,
  ConfirmButton,
  FieldHeader,
  Select,
  TextInput,
  WarningIcon,
} from "@dbsof/common/newui";
import {LoadingSkeleton} from "@dbsof/common/newui/loadingSkeleton";

import styles from "./authAdmin.module.scss";
import {
  EmailProviderWarning,
  InputSkeleton,
  StickyFormControls,
} from "./shared";
import Spinner from "@dbsof/common/ui/spinner";
import {useState} from "react";

export const SMTPConfigTab = observer(function SMTPConfigTab() {
  const state = useTabState(AuthAdminState);

  let content: JSX.Element | null = null;
  if (state.newSMTPSchema) {
    const newDraftState = state.draftSMTPConfigs.get("");

    content = state.emailProviders ? (
      <>
        {state.emailProviders.length ? (
          state.emailProviderWarnings.verificationNoSmtp ? (
            <EmailProviderWarning>
              You have auth providers requiring email verification enabled.
              Select a provider below to enable sending verification emails, or{" "}
              <span
                className={styles.link}
                onClick={() => state.setSelectedTab("webhooks")}
              >
                create a webhook
              </span>{" "}
              for handling email verification.
            </EmailProviderWarning>
          ) : state.emailProviderWarnings.passwordNoReset ? (
            <EmailProviderWarning>
              You have the 'Email + Password' auth provider enabled. Select a
              provider below to enable sending password reset emails, or{" "}
              <span
                className={styles.link}
                onClick={() => state.setSelectedTab("webhooks")}
              >
                create a webhook
              </span>{" "}
              for handling password resets.
            </EmailProviderWarning>
          ) : state.emailProviderWarnings.magicLinkNoMethods ? (
            <EmailProviderWarning>
              You have the 'Magic Link' auth provider enabled. Select a
              provider below to enable sending magic links via email, or{" "}
              <span
                className={styles.link}
                onClick={() => state.setSelectedTab("webhooks")}
              >
                create a webhook
              </span>{" "}
              for handling magic links.
            </EmailProviderWarning>
          ) : null
        ) : null}

        <div
          className={cn(styles.cardList, {
            [styles.emailProvidersUpdating]: state.updatingEmailProviders,
          })}
        >
          {state.hasCloudSMTP ? (
            <EmailProviderCard
              state={state}
              provider={CLOUD_SMTP_PROVIDER_NAME}
            />
          ) : null}
          {state.emailProviders.map((provider) => (
            <EmailProviderCard
              key={provider.name}
              state={state}
              provider={provider}
            />
          ))}
        </div>

        {newDraftState ? (
          <div className={styles.addDraft}>
            <NewDraftSMTPProviderForm
              state={state}
              draftState={newDraftState}
            />
          </div>
        ) : (
          <div className={styles.addDraft}>
            <Button onClick={() => state.addDraftSMTPProvider()}>
              Add SMTP Provider
            </Button>
          </div>
        )}
      </>
    ) : (
      <div className={styles.cardList}>
        <LoadingSkeleton className={styles.emailProviderSkeleton} />
        <LoadingSkeleton className={styles.emailProviderSkeleton} />
      </div>
    );
  } else {
    const draftState = state.draftSMTPConfigs.get("");

    content = draftState ? (
      <>
        <SMTPConfigForm
          loaded={draftState?.currentConfig != null}
          smtp={draftState}
        />

        <StickyFormControls draft={draftState} />
      </>
    ) : null;
  }

  return (
    <div className={styles.tabContentWrapper}>
      <div className={styles.titleWrapper}>
        <h2>SMTP Configuration</h2>

        <ResetCurrentProviderButton state={state} />
      </div>

      {content}
    </div>
  );
});

function ResetCurrentProviderButton({state}: {state: AuthAdminState}) {
  const [loading, setLoading] = useState(false);

  return state.currentEmailProvider === null || state.hasCloudSMTP ? null : (
    <Button
      kind="outline"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await state.resetCurrentEmailProvider();
        } finally {
          setLoading(false);
        }
      }}
    >
      Disable all SMTP providers
    </Button>
  );
}

const EmailProviderCard = observer(function EmailProviderCard({
  state,
  provider,
}: {
  state: AuthAdminState;
  provider: EmailProviderConfig | typeof CLOUD_SMTP_PROVIDER_NAME;
}) {
  const [updating, setUpdating] = useState(false);

  const isSelectedProvider =
    state.currentEmailProvider ===
    (provider === CLOUD_SMTP_PROVIDER_NAME ? provider : provider.name);
  const draftState =
    provider !== CLOUD_SMTP_PROVIDER_NAME
      ? state.draftSMTPConfigs.get(provider.name)
      : null;

  return (
    <div
      className={cn(styles.card, styles.emailProviderCard, {
        [styles.isCloudProvider]: provider === CLOUD_SMTP_PROVIDER_NAME,
      })}
    >
      <div className={styles.cardMain}>
        {updating ? (
          <Spinner
            className={styles.updatingSpinner}
            size={18.5}
            strokeWidth={1.5}
          />
        ) : (
          <svg
            className={cn(styles.selectCurrentProvider, {
              [styles.selected]: isSelectedProvider,
            })}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="-6 -6 32 32"
            fill="none"
            onClick={() => {
              setUpdating(true);
              (isSelectedProvider || provider === CLOUD_SMTP_PROVIDER_NAME
                ? state.resetCurrentEmailProvider()
                : state.setCurrentEmailProvider(provider.name)
              ).finally(() => setUpdating(false));
            }}
          >
            <circle cx="10" cy="10" r="9.5" />
            {isSelectedProvider ? (
              <path
                d="M14.6226 7.0503L8.43506 13.2378L5.62256 10.4253"
                stroke="#fff"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
          </svg>
        )}
        <div className={styles.details}>
          {provider === CLOUD_SMTP_PROVIDER_NAME ? (
            <>
              <div className={styles.name}>Cloud SMTP</div>
              <div className={styles.cloudSmtpDesc}>
                Auto configured SMTP provided by Studio Cloud for development use.
              </div>
              <div className={styles.cloudSmtpNote}>
                Note: This provider is rate limited and the sender address is
                non customizable, so for your production app you should
                configure your own SMTP provider below.
              </div>
            </>
          ) : (
            <>
              <div className={styles.name}>{provider.name}</div>
              {provider._typename === "cfg::SMTPProviderConfig" ? (
                <div className={styles.senderhost}>
                  {provider.sender} <span>•</span>{" "}
                  {provider.host || "localhost"}:
                  {provider.port ||
                    (provider.security === "PlainText"
                      ? "25"
                      : provider.security === "TLS"
                      ? "465"
                      : provider.security === "STARTTLS"
                      ? "587"
                      : "587/25")}
                </div>
              ) : null}
            </>
          )}
        </div>
        {provider !== CLOUD_SMTP_PROVIDER_NAME ? (
          <div
            className={cn(styles.expandButton, {
              [styles.expanded]: draftState?.expanded ?? false,
            })}
            onClick={() =>
              draftState
                ? draftState.toggleExpanded()
                : state.addDraftSMTPProvider(provider)
            }
          >
            <ChevronDownIcon />
          </div>
        ) : null}
      </div>

      {provider !== CLOUD_SMTP_PROVIDER_NAME && draftState?.expanded ? (
        <>
          <div className={styles.expandedEmailProviderConfig}>
            <SMTPConfigForm smtp={draftState} loaded hasName />
          </div>

          {draftState.formChanged &&
          draftState.getConfigValue("password").trim() === "" ? (
            <div className={styles.passwordWarning}>
              <WarningIcon />
              <div>
                <span>Warning:</span> You have not entered a password. If there
                is an existing password, it will be deleted when you update
                this SMTP provider unless you re-enter the password above.
              </div>
            </div>
          ) : null}

          <div className={styles.buttons}>
            <ConfirmButton
              style={{marginRight: "auto"}}
              onClick={() => state.removeEmailProvider(provider.name)}
            >
              Remove
            </ConfirmButton>

            {draftState.formChanged ? (
              <Button
                disabled={draftState.updating}
                onClick={() => draftState.clearForm()}
              >
                Clear changes
              </Button>
            ) : null}
            <Button
              kind="primary"
              onClick={() => draftState.update()}
              disabled={draftState.formError || !draftState.formChanged}
              loading={draftState.updating}
            >
              {draftState.updating ? "Updating..." : "Update"}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
});

const NewDraftSMTPProviderForm = observer(function NewDraftSMTPProviderForm({
  state,
  draftState,
}: {
  state: AuthAdminState;
  draftState: DraftSMTPConfig;
}) {
  return (
    <div className={styles.newDraftSMTPProvider}>
      <SMTPConfigForm loaded hasName newProvider smtp={draftState} />

      <div className={styles.buttons}>
        <Button
          disabled={draftState.updating}
          onClick={() => state.cancelDraftSMTPProvider()}
        >
          Cancel
        </Button>
        <Button
          kind="primary"
          onClick={() => draftState.update()}
          disabled={draftState.formError || !draftState.formChanged}
          loading={draftState.updating}
        >
          {draftState.updating
            ? "Adding SMTP Provider..."
            : "Add SMTP Provider"}
        </Button>
      </div>
    </div>
  );
});

const SMTPConfigForm = observer(function SMTPConfigForm({
  hasName,
  newProvider,
  loaded,
  smtp,
  readonly,
}: {
  hasName?: boolean;
  newProvider?: boolean;
  loaded: boolean;
  smtp: DraftSMTPConfig;
  readonly?: boolean;
}) {
  const security = smtp.getConfigValue("security") as unknown as SMTPSecurity;

  return (
    <div className={styles.configGrid}>
      {hasName ? (
        <div className={styles.gridItem}>
          <div className={styles.configName}>
            <FieldHeader label="Provider name" />
          </div>

          <div className={cn(styles.configInput, styles.fullWidth)}>
            {loaded ? (
              <TextInput
                value={smtp.getConfigValue("name")}
                onChange={(e) => smtp.setConfigValue("name", e.target.value)}
                error={smtp.nameError}
                readOnly={readonly}
              />
            ) : (
              <InputSkeleton />
            )}
          </div>
          <div className={styles.configExplain}>
            The name of the email provider. Must be unique.
          </div>
        </div>
      ) : null}

      <div className={styles.gridItem}>
        <div className={styles.configName}>
          <FieldHeader label="Sender" />
        </div>

        <div className={cn(styles.configInput, styles.fullWidth)}>
          {loaded ? (
            <TextInput
              value={smtp.getConfigValue("sender")}
              onChange={(e) => smtp.setConfigValue("sender", e.target.value)}
              error={smtp.senderError}
              readOnly={readonly}
            />
          ) : (
            <InputSkeleton />
          )}
        </div>
        <div className={styles.configExplain}>
          "From" address of system emails sent for e.g. password reset, etc.
        </div>
      </div>

      <div className={styles.gridItem}>
        <div className={styles.configName}>
          <FieldHeader label="Host" />
        </div>

        <div className={cn(styles.configInput, styles.fullWidth)}>
          {loaded ? (
            <TextInput
              value={smtp.getConfigValue("host")}
              onChange={(e) => smtp.setConfigValue("host", e.target.value)}
              placeholder="localhost"
              readOnly={readonly}
            />
          ) : (
            <InputSkeleton />
          )}
        </div>
        <div className={styles.configExplain}>
          Host of SMTP server to use for sending emails. If not set,
          "localhost" will be used.
        </div>
      </div>

      <div className={styles.gridItem}>
        <div className={styles.configName}>
          <FieldHeader label="Port" />
        </div>

        <div className={styles.configInput}>
          {loaded ? (
            <TextInput
              value={smtp.getConfigValue("port")}
              onChange={(e) => smtp.setConfigValue("port", e.target.value)}
              placeholder={
                security === "STARTTLSOrPlainText"
                  ? "587 or 25"
                  : security === "TLS"
                  ? "465"
                  : security === "STARTTLS"
                  ? "587"
                  : "25"
              }
              error={smtp.portError}
              readOnly={readonly}
              size={10}
            />
          ) : (
            <InputSkeleton />
          )}
        </div>
        <div className={styles.configExplain}>
          Port of SMTP server to use for sending emails. If not set, common
          defaults will be used depending on security: 465 for TLS, 587 for
          STARTTLS, 25 otherwise.
        </div>
      </div>

      <div className={styles.gridItem}>
        <div className={styles.configName}>
          <FieldHeader label="Username" />
        </div>

        <div className={cn(styles.configInput, styles.fullWidth)}>
          {loaded ? (
            <TextInput
              value={smtp.getConfigValue("username")}
              onChange={(e) => smtp.setConfigValue("username", e.target.value)}
              readOnly={readonly}
            />
          ) : (
            <InputSkeleton />
          )}
        </div>
        <div className={styles.configExplain}>
          Username to login as after connected to SMTP server.
        </div>
      </div>

      <div className={styles.gridItem}>
        <div className={styles.configName}>
          <FieldHeader label={newProvider ? "Password" : "New password"} />
        </div>

        <div className={cn(styles.configInput, styles.fullWidth)}>
          {loaded ? (
            <TextInput
              value={smtp.getConfigValue("password")}
              onChange={(e) => smtp.setConfigValue("password", e.target.value)}
              readOnly={readonly}
            />
          ) : (
            <InputSkeleton />
          )}
        </div>
        <div className={styles.configExplain}>
          Password for login after connected to SMTP server.{" "}
          {!newProvider
            ? "Note: will replace the currently configured SMTP password."
            : null}
        </div>
      </div>

      <div className={styles.gridItem}>
        <div className={styles.configName}>
          <FieldHeader label="Security" />
        </div>

        <div className={styles.configInput}>
          {loaded ? (
            <Select<SMTPSecurity>
              className={styles.securitySelect}
              selectedItemId={smtp.getConfigValue("security") as any}
              onChange={(item) => smtp.setConfigValue("security", item.id)}
              items={smtpSecurity.map((val) => ({id: val, label: val}))}
              disabled={readonly}
            />
          ) : (
            <InputSkeleton />
          )}
        </div>
        <div className={styles.configExplain}>
          Security mode of the connection to SMTP server. By default, initiate
          a STARTTLS upgrade if supported by the server, or fallback to
          PlainText.
        </div>
      </div>

      <div className={styles.gridItem}>
        <div className={styles.configName}>
          <FieldHeader label="Validate certs" />
        </div>

        <div className={styles.configInput}>
          {loaded ? (
            <Checkbox
              checked={
                smtp._validate_certs ??
                smtp.currentConfig?.validate_certs ??
                true
              }
              onChange={(checked) =>
                smtp.setConfigValue("validate_certs", checked)
              }
              readOnly={readonly}
            />
          ) : (
            <InputSkeleton />
          )}
        </div>
        <div className={styles.configExplain}>
          Determines if SMTP server certificates are validated.
        </div>
      </div>

      <div className={styles.gridItem}>
        <div className={styles.configName}>
          <FieldHeader label="Timeout per email" />
        </div>

        <div className={styles.configInput}>
          {loaded ? (
            <TextInput
              value={smtp.getConfigValue("timeout_per_email")}
              onChange={(e) =>
                smtp.setConfigValue(
                  "timeout_per_email",
                  e.target.value.toUpperCase()
                )
              }
              error={smtp.timeoutPerEmailError}
              readOnly={readonly}
            />
          ) : (
            <InputSkeleton />
          )}
        </div>
        <div className={styles.configExplain}>
          Maximum time in seconds to send an email, including retry attempts.
        </div>
      </div>

      <div className={styles.gridItem}>
        <div className={styles.configName}>
          <FieldHeader label="Timeout per attempt" />
        </div>

        <div className={styles.configInput}>
          {loaded ? (
            <TextInput
              value={smtp.getConfigValue("timeout_per_attempt")}
              onChange={(e) =>
                smtp.setConfigValue(
                  "timeout_per_attempt",
                  e.target.value.toUpperCase()
                )
              }
              error={smtp.timeoutPerAttemptError}
              readOnly={readonly}
            />
          ) : (
            <InputSkeleton />
          )}
        </div>
        <div className={styles.configExplain}>
          Maximum time in seconds for each SMTP request.
        </div>
      </div>
    </div>
  );
});
