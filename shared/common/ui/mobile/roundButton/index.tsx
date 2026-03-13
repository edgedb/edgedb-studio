import cn from "@dbsof/common/utils/classNames";
import {CrossIcon, RunIcon, CancelQueryIcon} from "../../icons";
import Spinner from "../../spinner";
import styles from "./roundButton.module.scss";

interface CloseButtonProps {
  onClick: () => void;
  className?: string;
}

export const CloseButton = ({onClick, className}: CloseButtonProps) => (
  <button
    onClick={onClick}
    className={cn(styles.container, styles.close, className)}
  >
    <CrossIcon />
  </button>
);

interface RunButtonProps {
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  isLoading?: boolean;
  onCancel?: () => void;
}

export const RunButton = ({
  onClick,
  className,
  disabled = false,
  isLoading = false,
  onCancel,
}: RunButtonProps) => (
  <button
    className={cn(styles.container, styles.run, className)}
    onClick={isLoading ? onCancel : onClick}
    disabled={disabled}
  >
    {isLoading ? (
      <>
        <Spinner size={26} />
        {onCancel ? <CancelQueryIcon /> : null}
      </>
    ) : (
      <RunIcon />
    )}
  </button>
);
