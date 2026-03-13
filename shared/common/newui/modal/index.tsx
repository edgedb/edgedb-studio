import {forwardRef, HTMLAttributes, PropsWithChildren} from "react";

import cn from "@dbsof/common/utils/classNames";

import styles from "./modal.module.scss";
import {CrossIcon, WarningIcon} from "../icons";

export interface ModalProps extends ModalFooterProps {
  className?: string;
  title: string;
  subheading?: string | JSX.Element;
  headerButtons?: JSX.Element;
  onClose?: () => void;
  noCloseOnOverlayClick?: boolean;
  onSubmit?: () => void;
}

export interface ModalFooterProps {
  formError?: string | JSX.Element | null;
  footerButtons?: JSX.Element;
  footerDetails?: JSX.Element;
  footerExtra?: JSX.Element;
}

export const ModalPanel = forwardRef<
  HTMLDivElement | HTMLFormElement,
  PropsWithChildren<
    | ({noHeader?: false} & Omit<ModalProps, "noCloseOnOverlayClick">)
    | ({
        noHeader: true;
        title?: undefined;
        subheading?: undefined;
        headerButtons?: undefined;
        onClose?: undefined;
      } & Omit<
        ModalProps,
        "noCloseOnOverlayClick" | "title" | "subheading" | "onClose"
      >)
  >
>(function _ModalPanel(
  {
    className,
    noHeader,
    title,
    subheading,
    headerButtons,
    onClose,
    onSubmit,
    children,
    ...footerProps
  },
  ref
) {
  const El = onSubmit ? "form" : "div";

  return (
    <El
      ref={ref as any}
      className={cn(styles.modal, className)}
      onSubmit={
        onSubmit
          ? (e) => {
              e.preventDefault();
              onSubmit();
            }
          : undefined
      }
      autoComplete="off"
    >
      {!noHeader ? (
        <div className={styles.header}>
          <div className={styles.headings}>
            <div className={styles.title}>{title}</div>
            {subheading ? (
              <div className={styles.subheading}>{subheading}</div>
            ) : null}
          </div>
          {headerButtons}
          {onClose ? (
            <div className={styles.closeButton} onClick={onClose}>
              <CrossIcon />
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
      <ModalFooter {...footerProps} />
    </El>
  );
});

export function ModalFooter({
  formError,
  footerDetails,
  footerButtons,
  footerExtra,
}: ModalFooterProps) {
  return (
    <>
      {formError ? (
        <div className={styles.formError}>
          <div className={styles.formErrorContent}>
            <WarningIcon />
            <div>{formError}</div>
          </div>
        </div>
      ) : null}
      {footerButtons || footerDetails ? (
        <div className={styles.footer}>
          {footerExtra}
          <div className={styles.footerMain}>
            <div className={styles.footerDetails}>{footerDetails}</div>
            {footerButtons}
          </div>
        </div>
      ) : null}
    </>
  );
}

export function ModalOverlay({
  noCloseOnOverlayClick,
  onClose,
  children,
}: PropsWithChildren<Pick<ModalProps, "noCloseOnOverlayClick" | "onClose">>) {
  return (
    <div
      className={styles.modalOverlay}
      onClick={
        onClose && !noCloseOnOverlayClick
          ? (e) => {
              if (e.target === e.currentTarget) {
                onClose!();
              }
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

export const Modal = forwardRef<
  HTMLDivElement | HTMLFormElement,
  PropsWithChildren<ModalProps>
>(function _Modal({noCloseOnOverlayClick, ...props}, ref) {
  return (
    <ModalOverlay
      noCloseOnOverlayClick={noCloseOnOverlayClick}
      onClose={props.onClose}
    >
      <ModalPanel ref={ref} {...props} />
    </ModalOverlay>
  );
});

export function ModalContent({
  className,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return <div className={cn(styles.content, className)} {...props} />;
}
