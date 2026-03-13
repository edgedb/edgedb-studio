import {useEffect, useRef, useState} from "react";

import cn from "@dbsof/common/utils/classNames";

import {
  AuthProviderData,
  DraftAppConfig,
  OAuthProviderData,
  OpenIDProviderData,
  _providersInfo,
} from "./state";

import styles from "./loginuipreview.module.scss";
import {getColourVariables, normaliseHexColor} from "./colourUtils";

export function LoginUIPreview({
  draft,
  providers,
  darkTheme,
}: {
  draft: DraftAppConfig;
  providers: AuthProviderData[];
  darkTheme: boolean;
}) {
  const appName = draft.getConfigValue("app_name");
  const brandColor = draft.getConfigValue("brand_color") || "1f8aed";
  const logoUrl = draft.getConfigValue("logo_url");
  const darkLogoUrl = draft.getConfigValue("dark_logo_url");

  const colorVariables = getColourVariables(normaliseHexColor(brandColor));

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [wrapperHeight, setWrapperHeight] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (wrapperRef.current) {
      setWrapperHeight(wrapperRef.current.children[0].clientHeight);
    }
  }, []);

  let hasPasswordProvider = false,
    hasWebAuthnProvider = false,
    hasMagicLinkProvider = false;
  const oauthProviders: (OAuthProviderData | OpenIDProviderData)[] = [];
  for (const provider of providers) {
    switch (provider._typename) {
      case "ext::auth::EmailPasswordProviderConfig":
        hasPasswordProvider = true;
        break;
      case "ext::auth::WebAuthnProviderConfig":
        hasWebAuthnProvider = true;
        break;
      case "ext::auth::MagicLinkProviderConfig":
        hasMagicLinkProvider = true;
        break;
      default:
        oauthProviders.push(provider);
    }
  }

  const hasEmailFactor =
    hasPasswordProvider || hasWebAuthnProvider || hasMagicLinkProvider;

  const oauthButtons = oauthProviders.map((provider) => (
    <a key={provider.name}>
      {provider._typename === "ext::auth::OpenIDConnectProvider" &&
      provider.logo_url ? (
        <img src={provider.logo_url} />
      ) : (
        _providersInfo[provider._typename].icon
      )}
      <span>
        Sign in with{" "}
        {provider._typename === "ext::auth::OpenIDConnectProvider"
          ? provider.display_name
          : _providersInfo[provider._typename].displayName}
      </span>
    </a>
  ));

  let extraPadding = 0;
  let emailFactorForm = (
    <>
      <label htmlFor="preview_email">Email</label>
      <input id="preview_email" readOnly />
    </>
  );
  const passwordInput = (
    <>
      <div className={styles.fieldHeader}>
        <label htmlFor="preview_password">Password</label>
        <a id="forgot-password-link" className={styles.fieldNote}>
          Forgot password?
        </a>
      </div>
      <input id="preview_password" readOnly />
    </>
  );
  if (hasWebAuthnProvider && hasMagicLinkProvider) {
    const tabs = [
      {
        title: "Passkey",
        content: (
          <>
            {emailFactorForm}
            <Button label="Sign In" />
          </>
        ),
      },
    ];
    if (hasPasswordProvider) {
      tabs.push({
        title: "Password",
        content: (
          <>
            {emailFactorForm}
            {passwordInput}
            <Button label="Sign In" />
          </>
        ),
      });
    }
    tabs.push({
      title: "Email Link",
      content: (
        <>
          {emailFactorForm}
          <Button label="Email sign in link" />
        </>
      ),
    });
    emailFactorForm = <Tabs tabs={tabs} />;
    extraPadding = hasPasswordProvider ? 84 : 0;
  } else if (
    hasPasswordProvider &&
    (hasWebAuthnProvider || hasMagicLinkProvider)
  ) {
    emailFactorForm = (
      <>
        {emailFactorForm}
        <TabSlider
          selectedIndex={selectedIndex}
          tabs={[
            {
              content: (
                <>
                  <Button
                    label={
                      hasMagicLinkProvider ? "Email sign in link" : "Sign In"
                    }
                  />
                  <Button
                    label="Sign in with password"
                    secondary
                    onClick={() => setSelectedIndex(1)}
                  />
                </>
              ),
            },
            {
              content: (
                <>
                  {passwordInput}
                  <div className={styles.buttonGroup}>
                    <Button
                      label={null}
                      secondary
                      onClick={() => setSelectedIndex(0)}
                    />
                    <Button label="Sign in with password" />
                  </div>
                </>
              ),
            },
          ]}
        />
      </>
    );
    extraPadding = 22;
  } else {
    emailFactorForm = (
      <>
        {emailFactorForm}
        {hasPasswordProvider ? passwordInput : null}
        <Button
          label={hasMagicLinkProvider ? "Email sign in link" : "Sign In"}
        />
      </>
    );
  }

  return (
    <div
      className={cn(
        styles.previewPage,
        darkTheme ? "dark-theme" : "light-theme",
        {
          [styles.darkTheme]: darkTheme,
        }
      )}
      style={colorVariables as any}
    >
      {logoUrl ? (
        <picture className={styles.brandLogo}>
          <img src={darkTheme ? darkLogoUrl || logoUrl : logoUrl} />
        </picture>
      ) : null}
      <div
        ref={wrapperRef}
        className={styles.wrapper}
        style={{
          height: wrapperHeight ? `${wrapperHeight}px` : undefined,
          marginBottom: extraPadding,
        }}
      >
        <form noValidate onSubmit={(e) => e.preventDefault()}>
          <h1>
            {appName ? (
              <>
                <span>Sign in to</span> {appName}
              </>
            ) : (
              <span>Sign in</span>
            )}
          </h1>

          <div
            className={cn(styles.oauthButtons, {
              [styles.collapsed]: hasEmailFactor && oauthProviders.length >= 3,
            })}
          >
            {oauthButtons}
          </div>

          {hasEmailFactor && oauthButtons.length ? (
            <div className={styles.divider}>
              <span>or</span>
            </div>
          ) : null}

          {hasEmailFactor ? (
            <>
              {emailFactorForm}

              <div className={styles.bottomNote}>
                Don't have an account? <a>Sign up</a>
              </div>
            </>
          ) : null}
        </form>
      </div>
    </div>
  );
}

function Button({
  label,
  secondary = false,
  onClick,
}: {
  label: string | null;
  secondary?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={cn({
        [styles.secondary]: secondary,
        [styles.iconOnly]: label == null,
      })}
      onClick={onClick}
    >
      {label != null ? <span>{label}</span> : null}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="25"
        viewBox="0 0 24 25"
        fill="none"
      >
        <path
          d="M5 12.5H19"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 5.5L19 12.5L12 19.5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function Tabs({
  tabs,
}: {
  tabs: {
    title: string;
    content: JSX.Element;
  }[];
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  return (
    <>
      <div className={styles.tabs}>
        {tabs.map(({title}, i) => (
          <div
            key={i}
            className={cn(styles.tab, {[styles.active]: selectedIndex === i})}
            onClick={() => setSelectedIndex(i)}
          >
            {title}
            <svg xmlns="http://www.w3.org/2000/svg" height="2" fill="none">
              <rect height="2" width="100%" rx="1" />
            </svg>
          </div>
        ))}
      </div>
      <TabSlider tabs={tabs} selectedIndex={selectedIndex} />
    </>
  );
}

function TabSlider({
  tabs,
  selectedIndex,
}: {
  tabs: {content: JSX.Element}[];
  selectedIndex: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    if (ref.current) {
      setHeight(ref.current.children[selectedIndex].scrollHeight);
    }
  }, [selectedIndex]);

  return (
    <div
      ref={ref}
      className={styles.sliderContainer}
      style={{
        transform: `translateX(${-100 * selectedIndex}%)`,
        height: height ? `${height}px` : undefined,
      }}
    >
      {tabs.map(({content}, i) => (
        <div
          key={i}
          className={cn(styles.sliderSection, {
            [styles.active]: selectedIndex == i,
          })}
        >
          {content}
        </div>
      ))}
    </div>
  );
}
