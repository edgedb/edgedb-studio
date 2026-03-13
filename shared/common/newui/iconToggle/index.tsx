import cn from "@dbsof/common/utils/classNames";

import styles from "./iconToggle.module.scss";

export interface IconToggleProps<OptionKey extends string | number> {
  className?: string;
  options: {
    key: OptionKey;
    label: string;
    icon: JSX.Element;
    disabled?: boolean;
  }[];
  selectedOption: OptionKey;
  onSelectOption: (key: OptionKey) => void;
  disabled?: boolean;
}

export function IconToggle<OptionKey extends string | number = any>({
  className,
  options,
  selectedOption,
  onSelectOption,
  disabled,
}: IconToggleProps<OptionKey>) {
  return (
    <div className={cn(styles.iconToggle, className, {[styles.disabled]: !!disabled})}>
      {options.map((option) => (
        <div
          key={option.key}
          className={cn(styles.option, {
            [styles.selected]: option.key === selectedOption,
            [styles.disabled]: !!option.disabled,
          })}
          onClick={() => onSelectOption(option.key)}
        >
          {option.icon}
          <div className={styles.label}>{option.label}</div>
        </div>
      ))}
    </div>
  );
}
