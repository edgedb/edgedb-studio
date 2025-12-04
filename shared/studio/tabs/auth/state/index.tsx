import {action, computed, observable, runInAction} from "mobx";
import {
  arraySet,
  findParent,
  getParent,
  Model,
  model,
  modelAction,
  objectMap,
  prop,
} from "mobx-keystone";
import {parsers} from "../../../components/dataEditor/parsers";
import {connCtx, dbCtx} from "../../../state";
import {instanceCtx} from "../../../state/instance";
import {
  AppleIcon,
  AzureIcon,
  DiscordIcon,
  GithubIcon,
  GoogleIcon,
  SlackIcon,
} from "../icons";

export const CLOUD_SMTP_PROVIDER_NAME = "cloud";

interface AuthAppData {
  app_name: string | null;
  logo_url: string | null;
  dark_logo_url: string | null;
  brand_color: string | null;
}

export interface AuthConfigData extends AuthAppData {
  signing_key_exists: boolean;
  token_time_to_live: string;
  allowed_redirect_urls: string;
}

export type OAuthProviderData = {
  name: string;
  _typename:
    | "ext::auth::AppleOAuthProvider"
    | "ext::auth::AzureOAuthProvider"
    | "ext::auth::DiscordOAuthProvider"
    | "ext::auth::GitHubOAuthProvider"
    | "ext::auth::GoogleOAuthProvider"
    | "ext::auth::SlackOAuthProvider";
  client_id: string;
  additional_scope: string | null;
};
export type OpenIDProviderData = Omit<OAuthProviderData, "_typename"> & {
  _typename: "ext::auth::OpenIDConnectProvider";
  display_name: string;
  issuer_url: string;
  logo_url: string | null;
};
export type VerificationMethod = "Link" | "Code";
export type LocalEmailPasswordProviderData = {
  name: string;
  _typename: "ext::auth::EmailPasswordProviderConfig";
  require_verification: boolean;
  verification_method?: VerificationMethod;
};
export type LocalWebAuthnProviderData = {
  name: string;
  _typename: "ext::auth::WebAuthnProviderConfig";
  relying_party_origin: string;
  require_verification: boolean;
  verification_method?: VerificationMethod;
};
export type LocalMagicLinkProviderData = {
  name: string;
  _typename: "ext::auth::MagicLinkProviderConfig";
  token_time_to_live: string;
  verification_method?: VerificationMethod;
  auto_signup?: boolean;
};
export type AuthProviderData =
  | OAuthProviderData
  | OpenIDProviderData
  | LocalEmailPasswordProviderData
  | LocalWebAuthnProviderData
  | LocalMagicLinkProviderData;

export interface AuthUIConfigData {
  redirect_to: string;
  redirect_to_on_signup: string;
}

export const smtpSecurity = [
  "PlainText",
  "TLS",
  "STARTTLS",
  "STARTTLSOrPlainText",
] as const;

export type SMTPSecurity = (typeof smtpSecurity)[number];

export interface SMTPConfigData {
  _typename: "cfg::SMTPProviderConfig";
  name: string;
  sender: string;
  host: string;
  port: string;
  username: string;
  password: string;
  security: SMTPSecurity;
  validate_certs: boolean;
  timeout_per_email: string;
  timeout_per_attempt: string;
}

export type EmailProviderConfig = SMTPConfigData;

export type WebhookEvent =
  | "IdentityCreated"
  | "IdentityAuthenticated"
  | "EmailFactorCreated"
  | "EmailVerified"
  | "EmailVerificationRequested"
  | "PasswordResetRequested"
  | "MagicLinkRequested"
  | "OneTimeCodeRequested"
  | "OneTimeCodeVerified";

export interface WebhookConfigData {
  url: string;
  events: [WebhookEvent, ...WebhookEvent[]];
  signing_secret_key_exists: boolean;
}

export type ProviderKind = "OAuth" | "Local";

export const _providersInfo: {
  [key in AuthProviderData["_typename"]]: {
    kind: ProviderKind;
    displayName: string;
    icon: JSX.Element;
  };
} = {
  // oauth
  "ext::auth::AppleOAuthProvider": {
    kind: "OAuth",
    displayName: "Apple",
    icon: <AppleIcon />,
  },
  "ext::auth::AzureOAuthProvider": {
    kind: "OAuth",
    displayName: "Azure",
    icon: <AzureIcon />,
  },
  "ext::auth::DiscordOAuthProvider": {
    kind: "OAuth",
    displayName: "Discord",
    icon: <DiscordIcon />,
  },
  "ext::auth::GitHubOAuthProvider": {
    kind: "OAuth",
    displayName: "GitHub",
    icon: <GithubIcon />,
  },
  "ext::auth::GoogleOAuthProvider": {
    kind: "OAuth",
    displayName: "Google",
    icon: <GoogleIcon />,
  },
  "ext::auth::SlackOAuthProvider": {
    kind: "OAuth",
    displayName: "Slack",
    icon: <SlackIcon />,
  },
  "ext::auth::OpenIDConnectProvider": {
    kind: "OAuth",
    displayName: "OpenID Connect",
    icon: <></>,
  },
  // local
  "ext::auth::EmailPasswordProviderConfig": {
    kind: "Local",
    displayName: "Email + Password",
    icon: <></>,
  },
  "ext::auth::WebAuthnProviderConfig": {
    kind: "Local",
    displayName: "WebAuthn",
    icon: <></>,
  },
  "ext::auth::MagicLinkProviderConfig": {
    kind: "Local",
    displayName: "Magic link",
    icon: <></>,
  },
};

export type ProviderTypename = keyof typeof _providersInfo;

@model("AuthAdmin")
export class AuthAdminState extends Model({
  selectedTab: prop<"config" | "providers" | "webhooks" | "smtp">(
    "config"
  ).withSetter(),

  draftCoreConfig: prop<DraftCoreConfig | null>(null),
  draftProviderConfig: prop<DraftProviderConfig | null>(null),
  draftWebhookConfig: prop<DraftWebhookConfig | null>(null),
  draftUIConfig: prop<DraftUIConfig | null>(null),
  draftSMTPConfigs: prop(() => objectMap<DraftSMTPConfig>()),
}) {
  @computed
  get newAppAuthSchema() {
    return (
      dbCtx.get(this)!.schemaData?.objectsByName.get("ext::auth::AuthConfig")
        ?.properties["app_name"] != null
    );
  }
  @computed
  get newSMTPSchema() {
    return (
      dbCtx
        .get(this)!
        .schemaData?.objectsByName.get("cfg::EmailProviderConfig") != null
    );
  }

  @computed
  get hasWebhooksSchema() {
    return (
      dbCtx
        .get(this)!
        .schemaData?.objectsByName.has("ext::auth::WebhookConfig") === true
    );
  }

  @computed
  get hasVerificationMethod() {
    return (
      dbCtx
        .get(this)!
        .schemaData?.objectsByName.get(
          "ext::auth::EmailPasswordProviderConfig"
        )?.properties["verification_method"] != null
    );
  }

  @computed
  get hasMagicLinkAutoSignup() {
    return (
      dbCtx
        .get(this)!
        .schemaData?.objectsByName.get("ext::auth::MagicLinkProviderConfig")
        ?.properties["auto_signup"] != null
    );
  }

  @computed
  get webhookEventsList() {
    return (
      [
        [
          "IdentityCreated",
          "IdentityAuthenticated",
          ...(this.hasVerificationMethod
            ? (["OneTimeCodeRequested", "OneTimeCodeVerified"] as const)
            : []),
        ],
        ["EmailFactorCreated", "EmailVerified", "EmailVerificationRequested"],
        ["PasswordResetRequested", "MagicLinkRequested"],
      ] satisfies WebhookEvent[][]
    ).map((col) =>
      col.map((name) => ({
        name: name,
        label: name.replace(/[A-Z]/g, "\u200b$&"), // insert zero width space between words
      }))
    );
  }

  @computed
  get providersInfo() {
    const objects = dbCtx.get(this)!.schemaData?.objectsByName;
    const providers = {} as typeof _providersInfo;
    for (const providerName of Object.keys(
      _providersInfo
    ) as ProviderTypename[]) {
      if (objects?.has(providerName)) {
        providers[providerName] = _providersInfo[providerName];
      }
    }
    return providers;
  }

  @computed
  get providerTypenames() {
    return Object.keys(this.providersInfo) as ProviderTypename[];
  }

  @modelAction
  addDraftProvider() {
    const existingProviders = new Set(this.providers?.map((p) => p._typename));
    this.draftProviderConfig = new DraftProviderConfig({
      selectedProviderType: this.providerTypenames.find(
        (name) => !existingProviders.has(name)
      )!,
    });
  }
  @modelAction
  cancelDraftProvider() {
    this.draftProviderConfig = null;
  }

  async removeProvider(typename: string, name: string) {
    const conn = connCtx.get(this)!;

    await conn.execute(
      `configure current database reset ${typename}
        filter .name = ${JSON.stringify(name)}`
    );
    await this.refreshConfig();
  }

  @modelAction
  addDraftWebhook() {
    this.draftWebhookConfig = new DraftWebhookConfig({});
  }
  @modelAction
  cancelDraftWebhook() {
    this.draftWebhookConfig = null;
  }

  async removeWebhook(webhookUrl: string) {
    const conn = connCtx.get(this)!;

    await conn.execute(
      `configure current database reset ext::auth::WebhookConfig
        filter .url = ${JSON.stringify(webhookUrl)}`
    );
    await this.refreshConfig();
  }

  @modelAction
  _createDraftCoreConfig() {
    if (!this.draftCoreConfig) {
      this.draftCoreConfig = new DraftCoreConfig({
        appConfig: this.newAppAuthSchema ? new DraftAppConfig({}) : null,
      });
    }
  }

  @modelAction
  enableUI() {
    if (!this.draftUIConfig) {
      this.draftUIConfig = new DraftUIConfig({
        appConfig: !this.newAppAuthSchema ? new DraftAppConfig({}) : null,
      });
    }
  }

  async disableUI() {
    if (this.uiConfig) {
      const conn = connCtx.get(this)!;
      await conn.execute(
        "configure current database reset ext::auth::UIConfig"
      );
    }

    this.refreshConfig();
  }

  @modelAction
  _removeDraftUIConfig() {
    this.draftUIConfig = null;
  }

  @modelAction
  addDraftSMTPProvider(provider?: EmailProviderConfig) {
    if (provider) {
      this.draftSMTPConfigs.set(
        provider.name,
        new DraftSMTPConfig({currentConfig: provider})
      );
    } else {
      this.draftSMTPConfigs.set(
        "",
        new DraftSMTPConfig({
          currentConfig: {
            security: "STARTTLSOrPlainText",
            validate_certs: true,
            timeout_per_email: "60",
            timeout_per_attempt: "15",
          },
        })
      );
    }
  }
  @modelAction
  cancelDraftSMTPProvider(name?: string) {
    this.draftSMTPConfigs.delete(name ?? "");
  }

  @observable
  updatingEmailProviders = false;

  @computed
  get hasCloudSMTP() {
    return instanceCtx.get(this)?.isCloud ?? false;
  }

  @action
  async removeEmailProvider(name: string) {
    this.updatingEmailProviders = true;

    const conn = connCtx.get(this)!;

    try {
      await conn.execute(
        `configure current branch reset cfg::EmailProviderConfig filter .name = ${JSON.stringify(
          name
        )}`
      );
      await this.refreshConfig();
    } finally {
      runInAction(() => (this.updatingEmailProviders = false));
    }
  }

  @action
  async setCurrentEmailProvider(name: string) {
    this.updatingEmailProviders = true;

    const conn = connCtx.get(this)!;

    try {
      await conn.execute(
        `configure current branch set current_email_provider_name := ${JSON.stringify(
          name
        )}`
      );
      await this.refreshConfig();
    } finally {
      runInAction(() => (this.updatingEmailProviders = false));
    }
  }

  @action
  async resetCurrentEmailProvider() {
    this.updatingEmailProviders = true;

    const conn = connCtx.get(this)!;

    try {
      await conn.execute(
        `configure current branch reset current_email_provider_name`
      );
      await this.refreshConfig();
    } finally {
      runInAction(() => (this.updatingEmailProviders = false));
    }
  }

  @computed
  get emailProviderWarnings() {
    const passwordProvider = this.providers?.find(
      (p) => p._typename === "ext::auth::EmailPasswordProviderConfig"
    );
    const webauthnProvider = this.providers?.find(
      (p) => p._typename === "ext::auth::WebAuthnProviderConfig"
    );
    const magicLinkProvider = this.providers?.find(
      (p) => p._typename === "ext::auth::MagicLinkProviderConfig"
    );

    const emailVerification =
      passwordProvider?.require_verification ||
      webauthnProvider?.require_verification ||
      false;

    const passwordResetWebhook = this.webhooks?.some((wh) =>
      wh.events.includes("PasswordResetRequested")
    );
    const magicLinkWebhook = this.webhooks?.some((wh) =>
      wh.events.includes("MagicLinkRequested")
    );
    const oneTimeCodeWebhook = this.webhooks?.some((wh) =>
      wh.events.includes("OneTimeCodeRequested")
    );
    const emailVerificationWebhook = this.webhooks?.some((wh) =>
      wh.events.includes("EmailVerificationRequested")
    );

    const smtpConfigured =
      this.hasCloudSMTP ||
      this.emailProviders?.some(
        (provider) => provider.name === this.currentEmailProvider
      );

    return {
      verificationNoSmtp:
        emailVerification && !emailVerificationWebhook && !smtpConfigured,
      passwordNoReset:
        !!passwordProvider && !passwordResetWebhook && !smtpConfigured,
      magicLinkNoMethods:
        !!magicLinkProvider &&
        !(magicLinkProvider.verification_method === "Code"
          ? oneTimeCodeWebhook
          : magicLinkWebhook) &&
        !smtpConfigured
          ? magicLinkProvider.verification_method ?? "Link"
          : false,
    };
  }

  onAttachedToRootStore() {}

  @observable.ref
  configData: AuthConfigData | null = null;

  @observable.ref
  providers: AuthProviderData[] | null = null;

  @observable.ref
  uiConfig: AuthUIConfigData | false | null = null;

  @observable.ref
  emailProviders: EmailProviderConfig[] | null = null;

  @observable
  currentEmailProvider: string | null = null;

  @observable.ref
  webhooks: WebhookConfigData[] | null = null;

  @computed
  get webhookUrls() {
    return new Set(this.webhooks?.map((webhook) => webhook.url));
  }

  async refreshConfig() {
    const conn = connCtx.get(this)!;
    const {
      newAppAuthSchema,
      newSMTPSchema,
      hasVerificationMethod,
      hasMagicLinkAutoSignup,
    } = this;

    if (!newSMTPSchema && !this.draftSMTPConfigs.has("")) {
      this.draftSMTPConfigs.set(
        "",
        new DraftSMTPConfig({currentConfig: null})
      );
    }

    const appConfigQuery = `
    app_name,
    logo_url,
    dark_logo_url,
    brand_color,
    `;

    const hasWebAuthn =
      !!this.providersInfo["ext::auth::WebAuthnProviderConfig"];
    const hasMagicLink =
      !!this.providersInfo["ext::auth::MagicLinkProviderConfig"];
    const hasOpenIDConnect =
      !!this.providersInfo["ext::auth::OpenIDConnectProvider"];

    const {result} = await conn.query(
      `with module ext::auth
      select {
        auth := assert_single(cfg::Config.extensions[is AuthConfig] {
          signing_key_exists := signing_key_exists(),
          token_time_to_live_seconds := <str>duration_get(.token_time_to_live, 'totalseconds'),
          ${newAppAuthSchema ? appConfigQuery : ""}
          allowed_redirect_urls,
          providers: {
            _typename := .__type__.name,
            name,
            [is OAuthProviderConfig].client_id,
            [is OAuthProviderConfig].additional_scope,
            ${
              hasOpenIDConnect
                ? `[is OpenIDConnectProvider].display_name,
              [is OpenIDConnectProvider].issuer_url,
              [is OpenIDConnectProvider].logo_url,`
                : ""
            }
            require_verification := (
              [is EmailPasswordProviderConfig].require_verification${
                hasWebAuthn
                  ? ` ?? [is WebAuthnProviderConfig].require_verification`
                  : ""
              }
            ),
            ${
              hasVerificationMethod
                ? `verification_method := (
              [is EmailPasswordProviderConfig].verification_method ??
              [is WebAuthnProviderConfig].verification_method ??
              [is MagicLinkProviderConfig].verification_method
            ),`
                : ""
            }
            ${
              hasWebAuthn
                ? `[is WebAuthnProviderConfig].relying_party_origin,`
                : ""
            }
            ${
              hasMagicLink
                ? `token_time_to_live_seconds := <str>duration_get([is MagicLinkProviderConfig].token_time_to_live, 'totalseconds'),`
                : ""
            }
            ${
              hasMagicLinkAutoSignup
                ? `[is MagicLinkProviderConfig].auto_signup`
                : ""
            }
          },
          ui: {
            redirect_to,
            redirect_to_on_signup,
            ${newAppAuthSchema ? "" : appConfigQuery}
          },
          ${
            this.hasWebhooksSchema
              ? `webhooks := (
            with webhook := .webhooks
            select webhook {
              url,
              events,
              signing_secret_key_exists := webhook_signing_key_exists(webhook),
            }
          )`
              : ""
          }
        }),
        emailProviders := ${
          newSMTPSchema
            ? `cfg::Config.email_providers {
          _typename := .__type__.name,
          name,
          [is cfg::SMTPProviderConfig].sender,
          [is cfg::SMTPProviderConfig].host,
          [is cfg::SMTPProviderConfig].port,
          [is cfg::SMTPProviderConfig].username,
          [is cfg::SMTPProviderConfig].security,
          [is cfg::SMTPProviderConfig].validate_certs,
          timeout_per_email_seconds := <str>duration_get([is cfg::SMTPProviderConfig].timeout_per_email, 'totalseconds'),
          timeout_per_attempt_seconds := <str>duration_get([is cfg::SMTPProviderConfig].timeout_per_attempt, 'totalseconds'),
        }`
            : `{ assert_single(cfg::Config.extensions[is SMTPConfig] {
          sender,
          host,
          port,
          username,
          security,
          validate_certs,
          timeout_per_email_seconds := <str>duration_get(.timeout_per_email, 'totalseconds'),
          timeout_per_attempt_seconds := <str>duration_get(.timeout_per_attempt, 'totalseconds'),
        }) }`
        },
        currentEmailProvider := ${
          newSMTPSchema
            ? `assert_single(cfg::Config.current_email_provider_name)`
            : `<str>{}`
        }
      }`,
      undefined,
      {ignoreSessionConfig: true}
    );

    if (result === null) return;

    const {auth, emailProviders, currentEmailProvider} = result[0];

    runInAction(() => {
      this.configData = {
        signing_key_exists: auth.signing_key_exists,
        token_time_to_live: auth.token_time_to_live_seconds,
        allowed_redirect_urls: auth.allowed_redirect_urls.join("\n"),
        app_name: auth.app_name ?? auth.ui?.app_name ?? null,
        logo_url: auth.logo_url ?? auth.ui?.logo_url ?? null,
        dark_logo_url: auth.dark_logo_url ?? auth.ui?.dark_logo_url ?? null,
        brand_color: auth.brand_color ?? auth.ui?.brand_color ?? null,
      };
      this.providers = (
        auth.providers.map((p: any) =>
          p._typename === "ext::auth::MagicLinkProviderConfig"
            ? {...p, token_time_to_live: p.token_time_to_live_seconds}
            : p
        ) as AuthProviderData[]
      ).sort((a, b) => {
        const aKind = _providersInfo[a._typename].kind;
        const bKind = _providersInfo[b._typename].kind;
        return aKind == bKind
          ? a.name.localeCompare(b.name)
          : bKind.localeCompare(aKind);
      });
      this.uiConfig = auth.ui ?? false;
      this._createDraftCoreConfig();
      if (auth.ui) {
        this.enableUI();
      } else {
        this._removeDraftUIConfig();
      }
      this.emailProviders = (
        Array.isArray(emailProviders) ? emailProviders : [emailProviders]
      ).map((provider: any) => ({
        ...provider,
        port: provider.port?.toString(),
        timeout_per_email: provider.timeout_per_email_seconds,
        timeout_per_attempt: provider.timeout_per_attempt_seconds,
      }));
      this.currentEmailProvider = currentEmailProvider;
      if (newSMTPSchema) {
        for (const [draftName] of this.draftSMTPConfigs) {
          if (
            !this.emailProviders?.some(
              (provider) => provider.name === draftName
            )
          ) {
            this.draftSMTPConfigs.delete(draftName);
          }
        }
      } else {
        this.draftSMTPConfigs
          .get("")!
          .setCurrentConfig(this.emailProviders![0]);
      }

      this.webhooks = auth.webhooks ?? [];
    });
  }
}

function validateDuration(dur: string, required: boolean) {
  dur = dur.trim();
  if (!dur.length) {
    return required ? `Duration is required` : null;
  }
  try {
    if (/^\d+$/.test(dur)) return null;
    parsers["std::duration"](dur, null);
  } catch {
    return `Invalid duration`;
  }
  return null;
}

export interface AbstractDraftConfig {
  updating: boolean;
  formChanged: boolean;
  formError: boolean;
  update: () => void;
  clearForm: () => void;
}

type AuthCoreConfigName =
  | "auth_signing_key"
  | "token_time_to_live"
  | "allowed_redirect_urls";

@model("AuthAdmin/DraftCoreConfig")
export class DraftCoreConfig
  extends Model({
    _auth_signing_key: prop<string | null>(null),
    _token_time_to_live: prop<string | null>(null),
    _allowed_redirect_urls: prop<string | null>(null),
    appConfig: prop<DraftAppConfig | null>(),
  })
  implements AbstractDraftConfig
{
  getConfigValue(name: Exclude<AuthCoreConfigName, "auth_signing_key">) {
    return (
      this[`_${name}`] ??
      (getParent<AuthAdminState>(this)?.configData || null)?.[name] ??
      ""
    );
  }

  @modelAction
  setConfigValue(name: AuthCoreConfigName, val: string) {
    this[`_${name}`] = val;
  }

  @computed
  get signingKeyError() {
    if (
      this._auth_signing_key === null &&
      getParent<AuthAdminState>(this)?.configData?.signing_key_exists
    ) {
      return null;
    }
    const key = this._auth_signing_key ?? "";
    return key === ""
      ? "Signing key is required"
      : key.length < 32
      ? "Signing key too short"
      : null;
  }

  @computed
  get tokenTimeToLiveError() {
    let dur = this._token_time_to_live;
    if (dur === null) return null;
    return validateDuration(dur, true);
  }

  @computed
  get allowedRedirectUrlsError() {
    const urls = this._allowed_redirect_urls;
    if (urls === null) return null;

    const urlList = urls.split("\n").filter((str) => str.trim() !== "");
    if (urlList.length > 128) {
      return "Too many URLs, maximum supported number of URLs is 128.";
    }

    const invalidUrls = urlList.filter((u) => {
      try {
        new URL(u);
        return false;
      } catch (e) {
        return true;
      }
    });

    if (invalidUrls.length > 0) {
      return `List containes the following invalid URLs:\n${invalidUrls.join(
        ",\n"
      )}`;
    }

    return null;
  }

  @computed
  get formError() {
    return (
      !!this.signingKeyError ||
      !!this.tokenTimeToLiveError ||
      !!this.allowedRedirectUrlsError
    );
  }

  @computed
  get formChanged() {
    return (
      this._auth_signing_key != null ||
      this._token_time_to_live != null ||
      this._allowed_redirect_urls != null ||
      (this.appConfig?.changed ?? false)
    );
  }

  @modelAction
  clearForm() {
    this._auth_signing_key = null;
    this._token_time_to_live = null;
    this._allowed_redirect_urls = null;
    this.appConfig?.clear();
  }

  @observable
  updating = false;

  @observable
  error: string | null = null;

  @action
  async update() {
    if (this.formError || !this.formChanged) return;

    const conn = connCtx.get(this)!;
    const state = getParent<AuthAdminState>(this)!;

    this.updating = true;
    this.error = null;

    const query = (
      [
        {name: "auth_signing_key", cast: null, transform: null},
        {name: "token_time_to_live", cast: "std::duration", transform: null},
        {
          name: "allowed_redirect_urls",
          cast: null,
          transform: (urls: string) => {
            const urlList = urls
              .split("\n")
              .filter((str) => str.trim() !== "");
            return `{${urlList.map((u) => JSON.stringify(u)).join(", ")}}`;
          },
        },
      ] as const
    )
      .map(({name, cast, transform}) => {
        const val = this[`_${name}`];
        if (val == null) return null;
        if (val.trim() === "") {
          return `configure current database reset ext::auth::AuthConfig::${name};`;
        }
        return `configure current database set ext::auth::AuthConfig::${name} := ${
          cast ? `<${cast}>` : ""
        }${(transform ?? JSON.stringify)(val)};`;
      })
      .filter((s) => s != null) as string[];

    if (this.appConfig) {
      query.push(...this.appConfig.getUpdateQuery(true));
    }

    try {
      await conn.execute(query.join("\n"));
      await state.refreshConfig();
      this.clearForm();
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

@model("AuthAdmin/DraftAppConfig")
export class DraftAppConfig extends Model({
  _app_name: prop<string | null>(null),
  _logo_url: prop<string | null>(null),
  _dark_logo_url: prop<string | null>(null),
  _brand_color: prop<string | null>(null),
}) {
  getConfigValue(name: keyof AuthAppData) {
    return (
      this[`_${name}`] ??
      (findParent<AuthAdminState>(
        this,
        (parent) => parent instanceof AuthAdminState
      )?.configData || null)?.[name] ??
      ""
    );
  }

  @modelAction
  setConfigValue<Name extends keyof AuthAppData>(
    name: Name,
    val: AuthAppData[Name]
  ) {
    (this as any)[`_${name}`] = val;
  }

  @computed
  get changed() {
    return (
      this._app_name != null ||
      this._logo_url != null ||
      this._dark_logo_url != null ||
      this._brand_color != null
    );
  }

  @modelAction
  clear() {
    this._app_name = null;
    this._logo_url = null;
    this._dark_logo_url = null;
    this._brand_color = null;
  }

  getUpdateQuery(newSchema: boolean) {
    if (!this.changed) return [];

    return (["app_name", "logo_url", "dark_logo_url", "brand_color"] as const)
      .map(
        newSchema
          ? (name) => {
              const val = this[`_${name}`];
              if (val == null) return null;
              if (typeof val === "string" && val.trim() === "") {
                return `configure current database reset ext::auth::AuthConfig::${name};`;
              }
              return `configure current database set ext::auth::AuthConfig::${name} := ${JSON.stringify(
                val
              )};`;
            }
          : (name) => {
              const val = this.getConfigValue(name);
              return val ? `${name} := ${JSON.stringify(val)}` : null;
            }
      )
      .filter((s) => s != null) as string[];
  }
}

@model("AuthAdmin/DraftUIConfig")
export class DraftUIConfig extends Model({
  _redirect_to: prop<string | null>(null),
  _redirect_to_on_signup: prop<string | null>(null),
  appConfig: prop<DraftAppConfig | null>(),

  showDarkTheme: prop<boolean | null>(null).withSetter(),
}) {
  getConfigValue(name: keyof AuthUIConfigData) {
    return (
      this[`_${name}`] ??
      (getParent<AuthAdminState>(this)?.uiConfig || null)?.[name] ??
      ""
    );
  }

  @modelAction
  setConfigValue(name: keyof AuthUIConfigData, val: string) {
    this[`_${name}`] = val;
  }

  @computed
  get redirectToError() {
    return !this.getConfigValue("redirect_to").length
      ? `Redirect url is required`
      : null;
  }

  @computed
  get formError() {
    return this.redirectToError != null;
  }

  @computed
  get formChanged() {
    return (
      this._redirect_to != null ||
      this._redirect_to_on_signup != null ||
      (this.appConfig?.changed ?? false)
    );
  }

  @modelAction
  clearForm() {
    this._redirect_to = null;
    this._redirect_to_on_signup = null;
    this.appConfig?.clear();
  }

  @observable
  updating = false;

  @observable
  error: string | null = null;

  @action
  async update() {
    if (this.formError || !this.formChanged) return;

    const conn = connCtx.get(this)!;
    const state = getParent<AuthAdminState>(this)!;

    this.updating = true;
    this.error = null;

    try {
      await conn.execute(`
        configure current database reset ext::auth::UIConfig;
        configure current database
          insert ext::auth::UIConfig {
            redirect_to := ${JSON.stringify(
              this.getConfigValue("redirect_to")
            )},
            ${[
              ...(["redirect_to_on_signup"] as const)
                .map((name) => {
                  const val = this.getConfigValue(name);
                  return val ? `${name} := ${JSON.stringify(val)}` : null;
                })
                .filter((l) => l),
              ...(this.appConfig?.getUpdateQuery(false) ?? []),
            ].join(",\n")}
          };`);
      await state.refreshConfig();
      this.clearForm();
    } catch (e) {
      console.error(e);
      runInAction(
        () => (this.error = e instanceof Error ? e.message : String(e))
      );
    } finally {
      runInAction(() => (this.updating = false));
    }
  }
}

@model("AuthAdmin/DraftSMTPConfig")
export class DraftSMTPConfig
  extends Model({
    currentConfig: prop<Partial<SMTPConfigData> | null>().withSetter(),
    _name: prop<string | null>(null),
    _sender: prop<string | null>(null),
    _host: prop<string | null>(null),
    _port: prop<string | null>(null),
    _username: prop<string | null>(null),
    _password: prop<string | null>(null),
    _security: prop<SMTPSecurity | null>(null),
    _validate_certs: prop<boolean | null>(null),
    _timeout_per_email: prop<string | null>(null),
    _timeout_per_attempt: prop<string | null>(null),
  })
  implements AbstractDraftConfig
{
  @observable
  expanded = true;

  @action
  toggleExpanded() {
    this.expanded = !this.expanded;
  }

  getConfigValue(
    name: Exclude<keyof SMTPConfigData, "_typename" | "validate_certs">
  ) {
    return this[`_${name}`] ?? this.currentConfig?.[name] ?? "";
  }

  @modelAction
  setConfigValue<Name extends keyof SMTPConfigData>(
    name: Name,
    val: SMTPConfigData[Name]
  ) {
    (this as any)[`_${name}`] = val;
  }

  @computed
  get parentState() {
    return findParent<AuthAdminState>(
      this,
      (parent) => parent instanceof AuthAdminState
    )!;
  }

  @computed
  get nameError() {
    if (!this.parentState.newSMTPSchema) return null;
    const val = this.getConfigValue("name").trim();
    if (val == "") {
      return "Name is required";
    }
    if (
      val !== this.currentConfig?.name &&
      ((this.parentState.hasCloudSMTP && val === CLOUD_SMTP_PROVIDER_NAME) ||
        this.parentState.emailProviders?.some(
          (provider) => provider.name === val
        ))
    ) {
      return "Name already exists";
    }
    return null;
  }

  @computed
  get senderError() {
    if (!this.parentState.newSMTPSchema) return null;
    const val = this.getConfigValue("sender").trim();
    if (val == "") {
      return "Sender is required";
    }
    return null;
  }

  @computed
  get portError() {
    const val = this.getConfigValue("port").trim();
    if (val === "") {
      return null;
    }
    const int = parseInt(val, 10);
    if (!/^\d+$/.test(val) || Number.isNaN(int) || int < 0 || int > 65535) {
      return `Port must be an integer between 0 and 65535`;
    }
    return null;
  }

  @computed
  get timeoutPerEmailError() {
    const val = this.getConfigValue("timeout_per_email").trim();
    if (!val.length) {
      return `Value is required`;
    }
    try {
      if (/^\d+$/.test(val)) return null;
      parsers["std::duration"](val, null);
    } catch {
      return `Invalid duration`;
    }
    return null;
  }

  @computed
  get timeoutPerAttemptError() {
    const val = this.getConfigValue("timeout_per_attempt").trim();
    if (!val.length) {
      return `Value is required`;
    }
    try {
      if (/^\d+$/.test(val)) return null;
      parsers["std::duration"](val, null);
    } catch {
      return `Invalid duration`;
    }
    return null;
  }

  @computed
  get formError() {
    return (
      !!this.nameError ||
      !!this.senderError ||
      !!this.portError ||
      !!this.timeoutPerEmailError ||
      !!this.timeoutPerAttemptError
    );
  }

  @computed
  get formChanged() {
    return (
      this._name != null ||
      this._sender != null ||
      this._host != null ||
      this._port != null ||
      this._username != null ||
      this._password != null ||
      this._security != null ||
      this._validate_certs != null ||
      this._timeout_per_email != null ||
      this._timeout_per_attempt != null
    );
  }

  @modelAction
  clearForm() {
    this._name = null;
    this._sender = null;
    this._host = null;
    this._port = null;
    this._username = null;
    this._password = null;
    this._security = null;
    this._validate_certs = null;
    this._timeout_per_email = null;
    this._timeout_per_attempt = null;
  }

  @observable
  updating = false;

  @observable
  error: string | null = null;

  @action
  async update() {
    if (this.formError || !this.formChanged) return;

    const conn = connCtx.get(this)!;
    const state = this.parentState;

    const {newSMTPSchema} = state;

    this.updating = true;
    this.error = null;

    const fields = [
      ...(newSMTPSchema ? ([{name: "name", cast: null}] as const) : []),
      {name: "sender", cast: null},
      {name: "host", cast: null},
      {name: "port", cast: "int32"},
      {name: "username", cast: null},
      {name: "password", cast: null},
      {
        name: "security",
        cast: newSMTPSchema ? "cfg::SMTPSecurity" : "ext::auth::SMTPSecurity",
      },
      {name: "validate_certs", cast: null},
      {name: "timeout_per_email", cast: "std::duration"},
      {name: "timeout_per_attempt", cast: "std::duration"},
    ] as const;

    const query = newSMTPSchema
      ? `
      ${
        this.currentConfig?.name
          ? `configure current branch reset cfg::SMTPProviderConfig filter .name = ${JSON.stringify(
              this.currentConfig.name
            )};`
          : ""
      }
      configure current branch insert cfg::SMTPProviderConfig {
        ${fields
          .map(({name, cast}) => {
            let val = this[`_${name}`] ?? this.currentConfig?.[name];
            if (typeof val === "string") {
              val = val.trim();
            }
            if (val == null || val === "") {
              return null;
            }
            return `${name} := ${cast ? `<${cast}>` : ""}${JSON.stringify(
              val
            )},`;
          })
          .filter((s) => s != null)
          .join("\n")}
      };
    `
      : fields
          .map(({name, cast}) => {
            const val = this[`_${name}`];
            if (val == null) return null;
            if (typeof val === "string" && val.trim() === "") {
              return `configure current database reset ext::auth::SMTPConfig::${name};`;
            }
            return `configure current database set ext::auth::SMTPConfig::${name} := ${
              cast ? `<${cast}>` : ""
            }${JSON.stringify(val)};`;
          })
          .filter((s) => s != null)
          .join("\n");

    try {
      await conn.execute(query);
      await state.refreshConfig();
      if (newSMTPSchema) {
        state.cancelDraftSMTPProvider(this.currentConfig?.name);
      } else {
        this.clearForm();
      }
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

@model("AuthAdmin/DraftProviderConfig")
export class DraftProviderConfig extends Model({
  selectedProviderType: prop<ProviderTypename>().withSetter(),

  oauthClientId: prop<string | null>(null).withSetter(),
  oauthSecret: prop<string | null>(null).withSetter(),
  additionalScope: prop("").withSetter(),
  alwaysShowConsentForm: prop(true).withSetter(),

  providerName: prop<string | null>(null).withSetter(),
  displayName: prop<string | null>(null).withSetter(),
  issuerUrl: prop<string | null>(null).withSetter(),
  logoUrl: prop<string>("").withSetter(),

  webauthnRelyingOrigin: prop<string | null>(null).withSetter(),

  requireEmailVerification: prop(true).withSetter(),
  useCodeVerificationMethod: prop(false).withSetter(),
  enableAutoSignup: prop(false).withSetter(),

  tokenTimeToLive: prop("").withSetter(),
}) {
  @computed
  get oauthClientIdError(): string | null {
    if (this.oauthClientId == null) return null;
    if (this.oauthClientId.trim() === "") {
      return "Client ID is required";
    }
    return this.selectedProviderType === "ext::auth::OpenIDConnectProvider"
      ? this._getIssuerClientIdError()
      : null;
  }

  @computed
  get oauthSecretError(): string | null {
    if (this.oauthSecret === null) return null;
    return this.oauthSecret.trim() === "" ? "Secret is required" : null;
  }

  @computed
  get providerNameError(): string | null {
    if (this.providerName === null) return null;
    if (this.providerName.trim() === "") {
      return "Provider name is required";
    }
    if (this.providerName.startsWith("builtin::")) {
      return "Provider name cannot start with 'builtin::'";
    }
    const providerNames = getParent<AuthAdminState>(this)?.providers?.map(
      (p) => p.name
    );
    if (providerNames?.includes(this.providerName.trim())) {
      return "A provider with this name already exists";
    }
    return null;
  }

  @computed
  get displayNameError(): string | null {
    if (this.displayName === null) return null;
    return this.displayName.trim() === ""
      ? "Provider display name is required"
      : null;
  }

  _getIssuerClientIdError(): string | null {
    const issuerUrl = this.issuerUrl?.trim();
    const clientId = this.oauthClientId?.trim();
    return getParent<AuthAdminState>(this)?.providers?.some(
      (p) =>
        p._typename === "ext::auth::OpenIDConnectProvider" &&
        p.issuer_url === issuerUrl &&
        p.client_id === clientId
    )
      ? "A provider with this Issuer URL and Client ID pair already exists"
      : null;
  }

  @computed
  get issuerUrlError(): string | null {
    if (this.issuerUrl === null) return null;
    if (this.issuerUrl.trim() === "") {
      return "Issuer URL is required";
    }
    try {
      new URL(this.issuerUrl.trim());
    } catch {
      return "Invalid URL";
    }
    return this._getIssuerClientIdError();
  }

  @computed
  get logoUrlError(): string | null {
    if (this.logoUrl.trim() === "") {
      return null;
    }
    try {
      new URL(this.logoUrl.trim());
    } catch {
      return "Invalid URL";
    }
    return null;
  }

  @computed
  get webauthnRelyingOriginError(): string | null {
    if (this.webauthnRelyingOrigin == null) return null;
    const origin = this.webauthnRelyingOrigin.trim();
    if (origin === "") {
      return "Relying origin is required";
    }
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      return "Invalid origin";
    }
    if (!url.protocol || !url.host) {
      return "Relying origin must contain a protocol and host";
    }
    if (
      url.username ||
      url.password ||
      !(url.pathname === "" || url.pathname === "/") ||
      url.search ||
      url.hash
    ) {
      return "Relying origin can only contain protocol, hostname and port";
    }
    return null;
  }

  @computed
  get tokenTimeToLiveError(): string | null {
    return validateDuration(this.tokenTimeToLive, false);
  }

  @computed
  get formValid(): boolean {
    switch (_providersInfo[this.selectedProviderType].kind) {
      case "OAuth":
        return (
          this.oauthClientId != null &&
          !this.oauthClientIdError &&
          this.oauthSecret != null &&
          !this.oauthSecretError &&
          (this.selectedProviderType === "ext::auth::OpenIDConnectProvider"
            ? this.providerName != null &&
              !this.providerNameError &&
              this.displayName != null &&
              !this.displayNameError &&
              this.issuerUrl != null &&
              !this.issuerUrlError &&
              !this.logoUrlError
            : true)
        );
      case "Local":
        return this.selectedProviderType ===
          "ext::auth::WebAuthnProviderConfig"
          ? this.webauthnRelyingOrigin != null &&
              !this.webauthnRelyingOriginError
          : this.selectedProviderType === "ext::auth::MagicLinkProviderConfig"
          ? !this.tokenTimeToLiveError
          : true;
    }
  }

  @observable
  updating = false;

  @observable
  error: string | null = null;

  @action
  async addProvider() {
    if (!this.formValid) return;

    const conn = connCtx.get(this)!;
    const state = getParent<AuthAdminState>(this)!;

    this.updating = true;
    this.error = null;

    try {
      const provider = _providersInfo[this.selectedProviderType];

      const queryFields: string[] = [];
      if (provider.kind === "OAuth") {
        if (this.selectedProviderType === "ext::auth::OpenIDConnectProvider") {
          queryFields.push(
            `name := ${JSON.stringify(this.providerName!.trim())}`,
            `display_name := ${JSON.stringify(this.displayName!.trim())}`,
            `issuer_url := ${JSON.stringify(this.issuerUrl!.trim())}`
          );
          if (this.selectedProviderType === "ext::auth::DiscordOAuthProvider") {
            queryFields.push(
              `always_show_consent_form := ${
                this.alwaysShowConsentForm ? "true" : "false"
              }`
            );
          };
          if (this.logoUrl.trim()) {
            queryFields.push(
              `logo_url := ${JSON.stringify(this.logoUrl!.trim())}`
            );
          }
        }
        queryFields.push(
          `client_id := ${JSON.stringify(this.oauthClientId!.trim())}`,
          `secret := ${JSON.stringify(this.oauthSecret)}`
        );
        if (this.additionalScope.trim()) {
          queryFields.push(
            `additional_scope := ${JSON.stringify(
              this.additionalScope.trim()
            )}`
          );
        }
      } else if (provider.kind === "Local") {
        if (
          this.selectedProviderType === "ext::auth::WebAuthnProviderConfig"
        ) {
          queryFields.push(
            `relying_party_origin := ${JSON.stringify(
              this.webauthnRelyingOrigin
            )}`
          );
        }
        if (
          this.selectedProviderType === "ext::auth::WebAuthnProviderConfig" ||
          this.selectedProviderType ===
            "ext::auth::EmailPasswordProviderConfig"
        ) {
          queryFields.push(
            `require_verification := ${
              this.requireEmailVerification ? "true" : "false"
            }`
          );
        }
        if (
          this.selectedProviderType === "ext::auth::MagicLinkProviderConfig" &&
          this.tokenTimeToLive.trim() !== ""
        ) {
          queryFields.push(
            `token_time_to_live := <std::duration>${JSON.stringify(
              this.tokenTimeToLive
            )}`
          );
        }
        if (
          state.hasVerificationMethod &&
          (this.selectedProviderType === "ext::auth::WebAuthnProviderConfig" ||
            this.selectedProviderType ===
              "ext::auth::EmailPasswordProviderConfig" ||
            this.selectedProviderType ===
              "ext::auth::MagicLinkProviderConfig") &&
          this.useCodeVerificationMethod
        ) {
          queryFields.push(
            `verification_method := ext::auth::VerificationMethod.Code`
          );
        }
        if (
          state.hasMagicLinkAutoSignup &&
          this.selectedProviderType === "ext::auth::MagicLinkProviderConfig"
        ) {
          queryFields.push(
            `auto_signup := ${this.enableAutoSignup ? "true" : "false"}`
          );
        }
      }

      await conn.execute(
        `configure current database
          insert ${this.selectedProviderType} {
            ${queryFields.join(",\n")}
          }`
      );
      await state.refreshConfig();
      state.cancelDraftProvider();
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

@model("AuthAdmin/DraftWebhookConfig")
export class DraftWebhookConfig extends Model({
  url: prop<string | null>(null).withSetter(),
  events: prop(() => arraySet<WebhookEvent>()),
  signing_key: prop<string | null>(null).withSetter(),
}) {
  @computed
  get urlError() {
    if (this.url == null) return null;
    if (this.url.trim() === "") return "Webhook URL is required";
    try {
      new URL(this.url);
    } catch {
      return "URL is invalid";
    }
    return getParent<AuthAdminState>(this)?.webhookUrls.has(this.url)
      ? "A webhook already exists with this URL"
      : null;
  }

  @computed
  get eventsError() {
    return this.events.size < 1
      ? "At least one webhook event is required"
      : null;
  }

  @computed
  get formValid(): boolean {
    return (
      this.url != null && this.urlError == null && this.eventsError == null
    );
  }

  @observable
  updating = false;

  @observable
  error: string | null = null;

  @action
  async addWebhook() {
    if (!this.formValid) return;

    const conn = connCtx.get(this)!;
    const state = getParent<AuthAdminState>(this)!;

    this.updating = true;
    this.error = null;

    try {
      await conn.execute(
        `configure current database
          insert ext::auth::WebhookConfig {
            url := ${JSON.stringify(this.url)},
            events := {${[...this.events.values()]
              .map((val) => `"${val}"`)
              .join(", ")}},
            ${
              this.signing_key
                ? `signing_secret_key := ${JSON.stringify(this.signing_key)}`
                : ""
            }
          }`
      );
      await state.refreshConfig();
      state.cancelDraftWebhook();
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
