"use client";

import {MouseEventHandler} from "react";

import cn from "@dbsof/common/utils/classNames";

import Spinner from "../spinner";

import styles from "./button.module.scss";

const isMac = navigator.platform.toLowerCase().includes("mac");

interface ButtonProps {
  className?: string;
  label: string | JSX.Element;
  shortcut?: string | JSX.Element;
  macShortcut?: string | JSX.Element;
  icon?: JSX.Element;
  leftIcon?: boolean;
  size?: "small" | "large";
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  loading?: boolean;
  style?: "round" | "square";
}

export default function Button({
  className,
  label,
  shortcut,
  macShortcut,
  icon,
  leftIcon,
  size,
  onClick,
  disabled,
  loading,
  style,
}: ButtonProps) {
  const _shortcut = isMac ? macShortcut : shortcut;

  const _icon = loading ? (
    <Spinner size={14} angle={135} strokeWidth={1.5} period={1.5} />
  ) : (
    icon
  );

  return (
    <button
      type="button"
      className={cn(styles.button, className, {
        [styles.largeButton]: size === "large",
        [styles.squareButton]: style === "square",
        [styles.leftIcon]: !!leftIcon,
      })}
      onClick={onClick}
      disabled={disabled}
    >
      <div className={styles.inner}>
        {leftIcon ? _icon : null}
        <span>
          {label}
          {_shortcut ? (
            <span className={styles.shortcut}>{_shortcut}</span>
          ) : null}
        </span>
        {!leftIcon ? _icon : null}
      </div>
    </button>
  );
}
