import cn from "@dbsof/common/utils/classNames";

import styles from "./fieldHeader.module.scss";

export interface FieldHeaderProps {
  className?: string;
  label?: string | JSX.Element;
  optional?: boolean;
  headerNote?: string;
}

export function FieldHeader({
  className,
  label,
  optional,
  headerNote,
}: FieldHeaderProps) {
  return (
    <div className={cn(styles.fieldHeader, className)}>
      {label}
      {optional ? <span className={styles.optional}>(optional)</span> : null}
      {headerNote ? (
        <span className={styles.headerNote}>{headerNote}</span>
      ) : null}
    </div>
  );
}
