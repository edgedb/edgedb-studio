import cn from "@dbsof/common/utils/classNames";
import styles from "./infoTooltip.module.scss";

export interface InfoTooltipProps {
  className?: string;
  message: string | JSX.Element;
}

export function InfoTooltip({message, className}: InfoTooltipProps) {
  return (
    <div className={cn(styles.infoTooltip, className)}>
      <InfoIcon />
      <div className={styles.tooltip}>{message}</div>
    </div>
  );
}

function InfoIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 8.8H12.008M12 15.2V12M20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
