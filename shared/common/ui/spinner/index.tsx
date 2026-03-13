import {CSSProperties} from "react";

import cn from "@dbsof/common/utils/classNames";

import styles from "./spinner.module.scss";

interface SpinnerProps {
  className?: string;
  size: number;
  strokeWidth?: number;
  angle?: number;
  period?: number;
}

export default function Spinner({
  className,
  size,
  strokeWidth = 2,
  angle = 90,
  period,
}: SpinnerProps) {
  const outerSize = size + strokeWidth * 2;
  const r = size / 2;
  const rad = angle * (Math.PI / 180);
  return (
    <svg
      viewBox={`${-strokeWidth} ${-strokeWidth} ${outerSize} ${outerSize}`}
      width={outerSize}
      height={outerSize}
      className={cn(styles.spinner, className)}
      style={
        {"--rotationPeriod": period ? `${period}s` : null} as CSSProperties
      }
    >
      <path
        d={`M ${r} 0 A ${r} ${r} 0 ${angle > 180 ? 1 : 0} 1 ${
          Math.sin(rad) * r + r
        } ${-Math.cos(rad) * r + r}`}
        fill="none"
        strokeWidth={strokeWidth}
        stroke="currentColor"
        strokeLinecap="round"
      />
    </svg>
  );
}
