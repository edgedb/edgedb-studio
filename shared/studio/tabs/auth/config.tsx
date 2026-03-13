import {useEffect, useRef, useState} from "react";
import {observer} from "mobx-react-lite";
import {HexColorPicker} from "react-colorful";
import {encodeB64} from "@dbsof/platform/client";

import cn from "@dbsof/common/utils/classNames";

import {useInstanceState} from "../../state/instance";
import {useDatabaseState, useTabState} from "../../state";
import {AuthAdminState, DraftAppConfig} from "./state";

import {FieldHeader, TextInput} from "@dbsof/common/newui";
import {CopyButton} from "@dbsof/common/newui/copyButton";

import {BookIcon} from "../../icons";

import styles from "./authAdmin.module.scss";

import {GenerateKeyIcon} from "./icons";
import {normaliseHexColor} from "./colourUtils";
import {InputSkeleton, secretPlaceholder, StickyFormControls} from "./shared";

export const ConfigTab = observer(function ConfigTab() {
  const state = useTabState(AuthAdminState);

  const coreConfig = state.draftCoreConfig;

  return (
    <div className={styles.tabContentWrapper}>
      <div className={styles.docsNote}>
        <BookIcon />
        <div>
          <b>Need help integrating Studio Auth into your app?</b>
          <br />
          Check out the{" "}
          <a href="https://example.com/docs/auth" target="_blank">
            auth extension docs
          </a>
          , also here are some useful URLs:
          <AuthUrls builtinUIEnabled={state.draftUIConfig !== null} />
        </div>
      </div>

      <h2>Auth Configuration</h2>

      <div className={styles.configGrid}>
        {state.newAppAuthSchema ? (
          <AppConfigForm draft={coreConfig?.appConfig ?? null} />
        ) : null}

        <div className={styles.gridItem}>
          <div className={styles.configName}>
            <FieldHeader label="Auth signing key" />
          </div>

          <div className={cn(styles.configInput, styles.fullWidth)}>
            {coreConfig ? (
              <TextInput
                className={cn(styles.authSigningKeyInput, {
                  [styles.error]: coreConfig.signingKeyError != null,
                })}
                value={coreConfig._auth_signing_key ?? ""}
                placeholder={
                  coreConfig._auth_signing_key == null &&
                  state.configData?.signing_key_exists
                    ? secretPlaceholder
                    : ""
                }
                onChange={(e) =>
                  coreConfig.setConfigValue("auth_signing_key", e.target.value)
                }
                error={coreConfig.signingKeyError}
                suffixEl={
                  <div
                    className={styles.generateKeyButton}
                    onClick={(e) => {
                      e.preventDefault();
                      coreConfig.setConfigValue(
                        "auth_signing_key",
                        encodeB64(
                          crypto.getRandomValues(new Uint8Array(256))
                        ).replace(/=*$/, "")
                      );
                    }}
                  >
                    <GenerateKeyIcon />
                    <span>Generate Random Key</span>
                  </div>
                }
              />
            ) : (
              <InputSkeleton />
            )}
          </div>
          <div className={styles.configExplain}>
            The signing key used for auth extension. Must be at least 32
            characters long.
          </div>
        </div>

        <div className={styles.gridItem}>
          <div className={styles.configName}>
            <FieldHeader label="Token time to live" />
          </div>

          <div className={styles.configInput}>
            {coreConfig ? (
              <TextInput
                size={16}
                value={coreConfig.getConfigValue("token_time_to_live")}
                onChange={(e) =>
                  coreConfig.setConfigValue(
                    "token_time_to_live",
                    e.target.value.toUpperCase()
                  )
                }
                error={coreConfig.tokenTimeToLiveError}
              />
            ) : (
              <InputSkeleton />
            )}
          </div>
          <div className={styles.configExplain}>
            The number of seconds after which an auth token expires. A value of
            0 indicates that the token should never expire.
          </div>
        </div>

        <div className={styles.gridItem}>
          <div className={cn(styles.configName, styles.redirectUrlsLabel)}>
            <FieldHeader label="Allowed redirect urls" />
          </div>

          <div className={cn(styles.configInput, styles.fullWidth)}>
            {coreConfig ? (
              <>
                <TextInput
                  className={styles.redirectUrlsInput}
                  type="textarea"
                  value={coreConfig.getConfigValue("allowed_redirect_urls")}
                  onChange={(e) =>
                    coreConfig.setConfigValue(
                      "allowed_redirect_urls",
                      e.target.value
                    )
                  }
                  error={coreConfig.allowedRedirectUrlsError}
                />
              </>
            ) : (
              <InputSkeleton />
            )}
          </div>
          <div className={styles.configExplain}>
            Newline-separated list of URLs that will be checked against to
            ensure redirects are going to a trusted domain controlled by the
            application. URLs are matched based on checking if the candidate
            redirect URL is a match or a subdirectory of any of these allowed
            URLs.
          </div>
        </div>
      </div>

      {coreConfig ? <StickyFormControls draft={coreConfig} /> : null}
    </div>
  );
});

export const AppConfigForm = observer(function AppConfigForm({
  draft,
}: {
  draft: DraftAppConfig | null;
}) {
  return (
    <>
      <div className={styles.gridItem}>
        <div className={styles.configName}>
          <FieldHeader label="App name" />
        </div>

        <div className={cn(styles.configInput, styles.fullWidth)}>
          {draft ? (
            <TextInput
              value={draft.getConfigValue("app_name")}
              onChange={(e) =>
                draft.setConfigValue("app_name", e.target.value)
              }
            />
          ) : (
            <InputSkeleton />
          )}
        </div>
        <div className={styles.configExplain}>
          The name of your application to be shown on the login screen.
        </div>
      </div>

      <div className={styles.gridItem}>
        <div className={styles.configName}>
          <FieldHeader label="Logo URL" />
        </div>

        <div className={cn(styles.configInput, styles.fullWidth)}>
          {draft ? (
            <TextInput
              value={draft.getConfigValue("logo_url")}
              onChange={(e) =>
                draft.setConfigValue("logo_url", e.target.value)
              }
            />
          ) : (
            <InputSkeleton />
          )}
        </div>
        <div className={styles.configExplain}>
          A url to an image of your application's logo.
        </div>
      </div>

      <div className={styles.gridItem}>
        <div className={styles.configName}>
          <FieldHeader label="Dark logo URL" />
        </div>

        <div className={cn(styles.configInput, styles.fullWidth)}>
          {draft ? (
            <TextInput
              value={draft.getConfigValue("dark_logo_url")}
              onChange={(e) =>
                draft.setConfigValue("dark_logo_url", e.target.value)
              }
            />
          ) : (
            <InputSkeleton />
          )}
        </div>
        <div className={styles.configExplain}>
          A url to an image of your application's logo to be used with the dark
          theme.
        </div>
      </div>

      <div className={styles.gridItem}>
        <div className={styles.configName}>
          <FieldHeader label="Brand color" />
        </div>

        <div className={styles.configInput}>
          {draft ? (
            <>
              <div className={styles.inputWrapper}>
                <ColorPickerInput
                  color={draft.getConfigValue("brand_color")}
                  onChange={(color) =>
                    draft.setConfigValue("brand_color", color)
                  }
                />
              </div>
              <ColorPickerPopup
                color={draft.getConfigValue("brand_color")}
                onChange={(color) =>
                  draft.setConfigValue("brand_color", color.slice(1))
                }
              />
            </>
          ) : (
            <InputSkeleton />
          )}
        </div>
        <div className={styles.configExplain}>
          The brand color of your application as a hex string.
        </div>
      </div>
    </>
  );
});

function escapeHex(value: string) {
  return value.replace(/[^0-9A-F]+/gi, "").substring(0, 6);
}

const matcher = /^[0-9A-F]{3,8}$/i;

function validateHex(value: string): boolean {
  return (
    !value ||
    (matcher.test(value) && (value.length === 3 || value.length === 6))
  );
}

function ColorPickerInput({
  color,
  onChange,
}: {
  color: string;
  onChange: (color: string) => void;
}) {
  const [value, setValue] = useState(() => escapeHex(color));

  useEffect(() => {
    setValue(escapeHex(color));
  }, [color]);

  return (
    <TextInput
      prefix="#"
      spellCheck="false"
      size={7}
      value={value}
      onChange={(e) => {
        const inputValue = escapeHex(e.target.value);
        setValue(inputValue);
        if (validateHex(inputValue)) onChange(inputValue);
      }}
      onBlur={(e) => {
        if (!validateHex(e.target.value)) setValue(escapeHex(color));
        if (color && color.length < 6) onChange(normaliseHexColor(color));
      }}
    />
  );
}

function ColorPickerPopup({
  color,
  onChange,
}: {
  color: string;
  onChange: (color: string) => void;
}) {
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
      ref={ref}
      className={styles.colorPickerSwatch}
      onClick={() => setOpen(true)}
      style={{backgroundColor: `#${color || "1f8aed"}`}}
    >
      {open ? (
        <HexColorPicker
          className={styles.colorPickerPopup}
          color={color}
          onChange={onChange}
        />
      ) : null}
    </div>
  );
}

const AuthUrls = observer(function AuthUrls({
  builtinUIEnabled,
}: {
  builtinUIEnabled: boolean;
}) {
  const instanceState = useInstanceState();
  const databaseState = useDatabaseState();

  const url = new URL(instanceState.serverUrl);
  const urlWithPort = new URL(
    instanceState.serverUrlWithPort ?? instanceState.serverUrl
  );
  url.pathname = urlWithPort.pathname = `db/${encodeURIComponent(
    databaseState.name
  )}/ext/auth`;

  const baseUrl = url.toString();

  return (
    <div className={styles.authUrls}>
      <div className={styles.label}>OAuth callback endpoint:</div>
      <CopyUrl url={`${urlWithPort.toString()}/callback`} />
      <div
        className={cn({[styles.disabled]: !builtinUIEnabled})}
        style={{display: "contents"}}
      >
        <div className={styles.label}>Built-in UI sign in url:</div>
        <CopyUrl url={`${baseUrl}/ui/signin`} />
        <div className={styles.label}>Built-in UI sign up url:</div>
        <CopyUrl url={`${baseUrl}/ui/signup`} />
      </div>
    </div>
  );
});

function CopyUrl({url}: {url: string}) {
  return (
    <div className={styles.copyUrl}>
      <span>{url}</span>
      <CopyButton content={url} mini />
    </div>
  );
}
