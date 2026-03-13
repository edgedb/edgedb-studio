import cn from "@dbsof/common/utils/classNames";

import styles from "./checkbox.module.scss";

export type CheckboxProps<Readonly extends boolean> = {
  className?: string;
  label?: string | JSX.Element;
  checked: boolean;
  disabled?: boolean;
  readOnly?: Readonly;
} & (Readonly extends true
  ? {
      onChange?: (checked: boolean) => void;
    }
  : {
      onChange: (checked: boolean) => void;
    });

export function Checkbox<Readonly extends boolean = false>({
  className,
  label,
  checked,
  onChange,
  disabled,
  readOnly,
}: CheckboxProps<Readonly>) {
  return (
    <label
      className={cn(styles.checkbox, className, {
        [styles.disabled]: !!disabled,
        [styles.readonly]: !!readOnly,
      })}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        disabled={disabled || readOnly}
      />
      <div className={styles.check} />
      {label}
    </label>
  );
}
