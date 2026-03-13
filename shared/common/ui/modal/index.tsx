import {
  forwardRef,
  InputHTMLAttributes,
  PropsWithChildren,
  useState,
} from "react";

import cn from "@dbsof/common/utils/classNames";

import {Select, SelectProps} from "../select";
import {CloseIcon} from "../icons";

import styles from "./modal.module.scss";

interface ModalOverlayProps {
  onOverlayClick?: () => void;
}

export function ModalOverlay({
  onOverlayClick,
  children,
}: PropsWithChildren<ModalOverlayProps>) {
  return (
    <div
      className={styles.modalOverlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onOverlayClick?.();
        }
      }}
    >
      {children}
    </div>
  );
}

interface ModalProps {
  title: string;
  actions?: JSX.Element;
  error?: string;
  progress?: string;
  close?: () => void;
  contentClass?: string;
}

export function Modal({
  title,
  actions,
  progress,
  close,
  children,
  contentClass,
}: PropsWithChildren<ModalProps>) {
  const [showProgress, setShowProgress] = useState(false);

  return (
    <div className={styles.modalCard}>
      <div className={styles.modalHeader}>
        <div className={styles.modalTitle}>{title}</div>
        {close ? (
          <CloseIcon className={styles.modalClose} onClick={close} />
        ) : null}
      </div>
      <div className={cn(styles.modalContent, contentClass)}>{children}</div>
      {progress ? (
        <>
          <div
            className={styles.modalProgressToggle}
            onClick={() => setShowProgress(!showProgress)}
          >
            {showProgress ? "Hide" : "Show"} Output
          </div>
          {showProgress ? (
            <pre className={styles.modalProgress}>{progress}</pre>
          ) : null}
        </>
      ) : null}
      <div className={styles.modalActions}>{actions}</div>
      {/* {error ? (
        <ErrorMessage className={styles.modalError} error={error} />
      ) : null} */}
    </div>
  );
}

interface ModalTextFieldProps {
  type?: "text" | "password";
  label: string;
  error?: string;
}
export const ModalTextField = forwardRef(function ModalTextField(
  {
    type,
    label,
    error,
    className,
    ...props
  }: ModalTextFieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, "type">,
  ref
) {
  return (
    <label className={cn(styles.modalField, className)}>
      <span>{label}</span>
      <input
        className={cn({[styles.fieldError]: !!error})}
        ref={ref as any}
        type={type ?? "text"}
        {...props}
      />
      {error ? <span className={styles.errorMessage}>{error}</span> : null}
    </label>
  );
});

type ModalSelectFieldProps<T = any> = SelectProps<T> & {
  label: string;
};

export function ModalSelectField<T>({
  label,
  ...selectProps
}: ModalSelectFieldProps<T>) {
  return (
    <label className={styles.modalField}>
      <span>{label}</span>
      <Select className={styles.select} {...selectProps} />
    </label>
  );
}

interface ModalCheckboxFieldProps {
  label: string;
}
export const ModalCheckboxField = forwardRef(function ModalCheckboxField(
  {
    label,
    className,
    disabled,
    ...props
  }: ModalCheckboxFieldProps &
    Omit<InputHTMLAttributes<HTMLInputElement>, "type">,
  ref
) {
  return (
    <label
      className={cn(styles.modalField, styles.checkboxField, className, {
        [styles.disabled]: !!disabled,
      })}
    >
      <input type="checkbox" ref={ref as any} disabled={disabled} {...props} />
      <span>{label}</span>
    </label>
  );
});
