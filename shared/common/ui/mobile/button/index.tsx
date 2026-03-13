import cn from "@dbsof/common/utils/classNames";
import {PropsWithChildren} from "react";
import styles from "./button.module.scss";

type ButtonProps = {
  label: string;
  icon?: JSX.Element;
  className?: string;
  disabled?: boolean;
} & (
  | {
      Element: (
        props: PropsWithChildren<{
          className?: string;
          disabled?: boolean;
        }>
      ) => JSX.Element;
    }
  | {
      Element?: "button";
      onClick: () => void;
    }
);

const Button = ({
  label,
  icon,
  className,
  Element = "button",
  ...props
}: ButtonProps) => (
  <Element className={cn(styles.button, className)} {...props}>
    {icon}
    {label}
  </Element>
);

export default Button;
