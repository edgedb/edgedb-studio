import {PropsWithChildren} from "react";

import cn from "@dbsof/common/utils/classNames";

import styles from "./errorPage.module.scss";

interface ErrorPageProps {
  className?: string;
  title: string;
  actions?: JSX.Element;
}

export function ErrorPage({
  className,
  title,
  children,
  actions,
}: PropsWithChildren<ErrorPageProps>) {
  return (
    <div className={cn(className, styles.errorPage)}>
      <div className={styles.errorBlock}>
        <div className={styles.title}>{title}</div>
        {children}
      </div>
      <div className={styles.errorActions}>{actions}</div>
    </div>
  );
}
