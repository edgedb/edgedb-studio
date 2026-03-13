import {observer} from "mobx-react-lite";

import cn from "@dbsof/common/utils/classNames";
import {
  Button,
  Checkbox,
  ChevronDownIcon,
  ConfirmButton,
  FieldHeader,
  InfoTooltip,
  TextInput,
} from "@dbsof/common/newui";

import {useTabState} from "../../state";
import {AuthAdminState, DraftWebhookConfig, WebhookConfigData} from "./state";

import styles from "./authAdmin.module.scss";
import {useState} from "react";
import {LoadingSkeleton} from "@dbsof/common/newui/loadingSkeleton";
import {EmailProviderWarning} from "./shared";

export const WebhooksTab = observer(function WebhooksTab() {
  const state = useTabState(AuthAdminState);

  return (
    <div className={styles.tabContentWrapper}>
      <h2>Webhooks</h2>

      {state.emailProviderWarnings.verificationNoSmtp ? (
        <EmailProviderWarning>
          You have auth providers requiring email verification enabled. Create
          a webhook below to handle the 'EmailVerificationRequested' event, or{" "}
          <span
            className={styles.link}
            onClick={() => state.setSelectedTab("smtp")}
          >
            enable an SMTP provider
          </span>{" "}
          to send verification emails.
        </EmailProviderWarning>
      ) : state.emailProviderWarnings.passwordNoReset ? (
        <EmailProviderWarning>
          You have the 'Email + Password' auth provider enabled. Create a
          webhook below to handle the 'PasswordResetRequested' event, or{" "}
          <span
            className={styles.link}
            onClick={() => state.setSelectedTab("smtp")}
          >
            enable an SMTP provider
          </span>{" "}
          to send password resets.
        </EmailProviderWarning>
      ) : state.emailProviderWarnings.magicLinkNoMethods ? (
        <EmailProviderWarning>
          You have the 'Magic Link' auth provider enabled. Create a webhook
          below to handle the '
          {state.emailProviderWarnings.magicLinkNoMethods === "Code"
            ? "OneTimeCodeRequested"
            : "MagicLinkRequested"}
          ' event, or{" "}
          <span
            className={styles.link}
            onClick={() => state.setSelectedTab("smtp")}
          >
            enable an SMTP provider
          </span>{" "}
          to send magic links.
        </EmailProviderWarning>
      ) : null}

      {state.webhooks ? (
        <>
          {state.webhooks.length ? (
            <div className={styles.cardList}>
              {state.webhooks.map((webhook) => (
                <WebhookConfigCard key={webhook.url} config={webhook} />
              ))}
            </div>
          ) : null}

          <div className={styles.addDraft}>
            {state.draftWebhookConfig ? (
              <WebhookDraftForm draft={state.draftWebhookConfig} />
            ) : (
              <Button onClick={() => state.addDraftWebhook()}>
                Add Webhook
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className={styles.cardList}>
          <LoadingSkeleton className={styles.webhookSkeleton} />
          <LoadingSkeleton className={styles.webhookSkeleton} />
          <LoadingSkeleton className={styles.webhookSkeleton} />
        </div>
      )}
    </div>
  );
});

function WebhookConfigCard({config}: {config: WebhookConfigData}) {
  const state = useTabState(AuthAdminState);
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(styles.card, styles.webhookConfigCard, {
        [styles.expanded]: expanded,
      })}
    >
      <div className={styles.cardMain}>
        <div className={styles.details}>
          <div className={styles.url}>{config.url}</div>
          <div className={styles.events}>
            {config.events.map((event) => (
              <span key={event}>{event}</span>
            ))}
          </div>
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
          <div className={cn(styles.formRow, styles.fullWidth)}>
            <TextInput readOnly label={"Webhook URL"} value={config.url} />
            <TextInput
              readOnly
              label={"Signing secret key"}
              value={config.signing_secret_key_exists ? "secret hidden" : ""}
              type="password"
            />
          </div>
          <div className={styles.webhookEvents}>
            <FieldHeader label="Events" />
            <div className={styles.grid}>
              {state.webhookEventsList.map((col, i) => (
                <div key={i}>
                  {col.map(({name, label}) => (
                    <Checkbox
                      readOnly
                      key={name}
                      label={label}
                      checked={config.events.includes(name)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className={cn(styles.formRow, styles.buttons)}>
            <ConfirmButton onClick={() => state.removeWebhook(config.url)}>
              Remove
            </ConfirmButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const WebhookDraftForm = observer(function WebhookDraftForm({
  draft,
}: {
  draft: DraftWebhookConfig;
}) {
  const state = useTabState(AuthAdminState);

  return (
    <div className={cn(styles.draftForm, styles.draftWebhookForm)}>
      <div className={cn(styles.formRow, styles.evenWidth)}>
        <TextInput
          label="Webhook URL"
          value={draft.url ?? ""}
          onChange={(e) => draft.setUrl(e.target.value)}
          error={draft.urlError}
        />{" "}
        <TextInput
          label={
            <>
              Signing secret key{" "}
              <InfoTooltip message="The secret key used to sign webhook requests" />
            </>
          }
          optional
          value={draft.signing_key ?? ""}
          onChange={(e) => draft.setSigning_key(e.target.value)}
        />
      </div>

      <div className={styles.webhookEvents}>
        <FieldHeader
          label="Events"
          headerNote="At least one event must be selected"
        />
        <div className={styles.grid}>
          {state.webhookEventsList.map((col, i) => (
            <div key={i}>
              {col.map(({name, label}) => (
                <Checkbox
                  key={name}
                  label={label}
                  checked={draft.events.has(name)}
                  onChange={(checked) => {
                    if (checked) {
                      draft.events.add(name);
                    } else {
                      draft.events.delete(name);
                    }
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className={cn(styles.formRow, styles.buttons)}>
        <Button onClick={() => state.cancelDraftWebhook()}>Cancel</Button>
        <Button
          kind="primary"
          onClick={() => draft.addWebhook()}
          disabled={!draft.formValid}
          loading={draft.updating}
        >
          {draft.updating ? "Adding Webhook..." : "Add Webhook"}
        </Button>
      </div>
    </div>
  );
});
