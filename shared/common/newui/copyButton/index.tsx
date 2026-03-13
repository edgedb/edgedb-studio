import {useEffect, useState} from "react";
import cn from "@dbsof/common/utils/classNames";

import {CheckIcon, CopyIcon} from "../icons";

import styles from "./copyButton.module.scss";
import {Button} from "../button";

export interface CopyButtonProps {
  className?: string;
  content: string | (() => string);
  label?: string;
  mini?: boolean;
}

export function CopyButton({
  className,
  content,
  label,
  mini,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 1000);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [copied]);

  const onCopy = () => {
    navigator.clipboard?.writeText(
      typeof content === "string" ? content : content()
    );
    setCopied(true);
  };

  return mini ? (
    <div
      className={cn(styles.miniCopyButton, className, {
        [styles.copied]: copied,
      })}
      onClick={onCopy}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </div>
  ) : (
    <Button
      className={cn(styles.copyButton, className, {[styles.copied]: copied})}
      onClick={onCopy}
      leftIcon={copied ? <CheckIcon /> : <CopyIcon />}
    >
      {copied ? "Copied!" : label ?? "Copy"}
    </Button>
  );
}
