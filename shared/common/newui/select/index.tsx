import cn from "@dbsof/common/utils/classNames";
import {
  Select as _Select,
  SelectProps as _SelectProps,
} from "@dbsof/common/ui/select";
export type {SelectItem, SelectItems} from "@dbsof/common/ui/select";

import styles from "./select.module.scss";

export type SelectProps<T = any> = _SelectProps<T> & {
  label?: string | JSX.Element;
  inputClassName?: string;
};

export function Select<T>({
  className,
  label,
  inputClassName,
  ...props
}: SelectProps<T>) {
  if (label != null) {
    return (
      <label className={cn(styles.selectField, className)}>
        <div className={styles.fieldHeader}>{label}</div>
        <_Select className={cn(styles.select, inputClassName)} {...props} />
      </label>
    );
  }
  return (
    <_Select
      className={cn(styles.select, className, inputClassName)}
      {...props}
    />
  );
}
