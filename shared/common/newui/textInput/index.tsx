import {
  ForwardedRef,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  forwardRef,
} from "react";

import cn from "@dbsof/common/utils/classNames";

import {InfoIcon} from "../icons";
import {FieldHeader, FieldHeaderProps} from "../fieldHeader";

import styles from "./textInput.module.scss";

interface TextInputProps extends FieldHeaderProps {
  className?: string;
  error?: string | null;
  prefix?: string;
  suffixEl?: JSX.Element;
}

type ITextProps = {
  (
    props: {type: "textarea"} & TextInputProps &
      TextareaHTMLAttributes<HTMLTextAreaElement>
  ): React.ReactNode;
  (
    props: {type?: "text" | "password"} & TextInputProps &
      Omit<InputHTMLAttributes<HTMLInputElement>, "type">
  ): React.ReactNode;
};

export const TextInput: ITextProps = forwardRef(function TextInput(
  {
    className,
    type,
    label,
    optional,
    headerNote,
    error,
    prefix,
    suffixEl,
    ...props
  }: {type?: "text" | "password" | "textarea"} & TextInputProps,
  ref: ForwardedRef<HTMLInputElement & HTMLTextAreaElement>
) {
  const Input = type === "textarea" ? "textarea" : "input";

  return (
    <label className={cn(styles.textField, className)}>
      {label ? (
        <FieldHeader
          label={label}
          optional={optional}
          headerNote={headerNote}
        />
      ) : null}
      <div
        className={cn(styles.inputWrapper, {[styles.hasError]: error != null})}
      >
        {prefix ? <span className={styles.prefix}>{prefix}</span> : null}
        <Input
          ref={ref as any}
          type={type ?? "text"}
          {...props}
          style={{
            paddingLeft: prefix
              ? `calc(${prefix.length}ch + 12px)`
              : undefined,
          }}
        />
        {suffixEl}
        {error != null ? (
          <div className={styles.error}>
            <InfoIcon />
            <div>{error}</div>
          </div>
        ) : null}
      </div>
    </label>
  );
});
