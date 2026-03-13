import {PropsWithChildren, createContext, useContext} from "react";

import cn from "@dbsof/common/utils/classNames";

import {CrossIcon} from "@dbsof/common/newui/icons";
import {Button} from "@dbsof/common/newui";

import styles from "./shared.module.scss";

export const ExtendedViewerContext = createContext<{
  closeExtendedView: (editedData?: any) => void;
}>(null!);

export function HeaderBar({children}: PropsWithChildren<{}>) {
  const {closeExtendedView} = useContext(ExtendedViewerContext);

  return (
    <div className={styles.headerBar}>
      <div className={styles.actions}>{children}</div>
      <button
        className={styles.closeButton}
        onClick={() => closeExtendedView()}
      >
        <CrossIcon />
      </button>
    </div>
  );
}

export function ToggleButton({
  className,
  icon,
  children,
  onClick,
  active,
}: PropsWithChildren<{
  className?: string;
  icon: JSX.Element;
  onClick: () => void;
  active?: boolean;
}>) {
  return (
    <Button
      kind="outline"
      rightIcon={icon}
      className={cn(styles.toggleButton, className, {
        [styles.active]: !!active,
      })}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
