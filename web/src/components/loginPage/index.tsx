import {useEffect, useState} from "react";
import {useForm} from "react-hook-form";

import {getHTTPSCRAMAuth} from "@dbsof/platform/client";
import {cryptoUtils} from "@dbsof/platform/client";

import {
  ModalPanel,
  ArrowRightIcon,
  ModalContent,
  TextInput,
  SubmitButton,
  InfoIcon,
} from "@dbsof/common/newui";

import {serverUrl, setAuthToken} from "../../state/models/app";
import {Logo} from "../header";

import styles from "./loginPage.module.scss";

const httpSCRAMAuth = getHTTPSCRAMAuth(cryptoUtils);

const isLocalhost = (() => {
  try {
    return new URL(serverUrl).hostname === "localhost";
  } catch {
    // ignore
  }
  return false;
})();

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const {register, handleSubmit, formState, setFocus} = useForm<{
    username: string;
    password: string;
  }>({mode: "onChange"});

  useEffect(
    () => {
      setFocus("username");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const onSubmit = handleSubmit(async ({username, password}) => {
    setError(null);
    try {
      const authToken = await httpSCRAMAuth(serverUrl, username, password);
      setAuthToken(username, authToken);
    } catch (err) {
      console.error(err);
      setError("Login failed: username or password may be incorrect");
    }
  });

  return (
    <div className={styles.loginPage}>
      <Logo className={styles.logo} />

      <ModalPanel
        className={styles.loginPanel}
        title="Welcome to Studio UI"
        onSubmit={onSubmit}
        formError={error}
        footerButtons={
          <SubmitButton
            kind="primary"
            loading={formState.isSubmitting}
            disabled={!formState.isValid || formState.isSubmitting}
            rightIcon={<ArrowRightIcon />}
          >
            Login
          </SubmitButton>
        }
      >
        <ModalContent className={styles.formContent}>
          {isLocalhost ? (
            <div className={styles.loginInfo}>
              <InfoIcon />
              <div>
                <span>It looks like you're running Studio locally.</span>
                <br /> If you created this instance using the Studio CLI, the
                easiest way to login is by running your platform's UI launcher
                command from your project directory.
              </div>
            </div>
          ) : null}
          <TextInput
            label="Username"
            {...register("username", {
              required: "Username is required",
            })}
            error={formState.errors.username?.message}
          />
          <TextInput
            label="Password"
            type="password"
            {...register("password", {
              required: "Password is required",
            })}
            error={formState.errors.password?.message}
          />
        </ModalContent>
      </ModalPanel>
    </div>
  );
}
