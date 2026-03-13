import {PropsWithChildren, useEffect, useRef, useState} from "react";

import cn from "@dbsof/common/utils/classNames";
import {ChevronDownIcon} from "@dbsof/common/newui";

import styles from "./horizontalCardList.module.scss";

interface HorizontalCardListProps {
  className?: string;
  listClassName?: string;
  scrollBy?: number;
}

export function HorizontalCardList({
  className,
  listClassName,
  scrollBy = 120,
  children,
}: PropsWithChildren<HorizontalCardListProps>) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowLeft, setOverflowLeft] = useState(false);
  const [overflowRight, setOverflowRight] = useState(false);

  useEffect(() => {
    if (ref.current) {
      const listener = () => {
        if (!ref.current) return;
        if (ref.current.scrollLeft > 0 !== overflowLeft) {
          setOverflowLeft(!overflowLeft);
        }
        if (
          ref.current.scrollLeft + ref.current.clientWidth <
            ref.current.scrollWidth !==
          overflowRight
        ) {
          setOverflowRight(!overflowRight);
        }
      };
      listener();
      ref.current.addEventListener("scroll", listener);
      const observer = new ResizeObserver(listener);
      observer.observe(ref.current);

      return () => {
        ref.current?.removeEventListener("scroll", listener);
        observer.disconnect();
      };
    }
  }, [overflowLeft, overflowRight, children]);

  return (
    <div
      className={cn(styles.horizontalCardList, className, {
        [styles.overflowLeft]: overflowLeft,
        [styles.overflowRight]: overflowRight,
      })}
    >
      <div
        className={styles.scrollLeftButton}
        onClick={() => {
          ref.current?.scrollBy({left: -scrollBy, behavior: "smooth"});
        }}
      >
        <div>
          <ChevronDownIcon />
        </div>
      </div>

      <div ref={ref} className={cn(styles.scrollWrapper, listClassName)}>
        {children}
      </div>
      <div
        className={styles.scrollRightButton}
        onClick={() => {
          ref.current?.scrollBy({left: scrollBy, behavior: "smooth"});
        }}
      >
        <div>
          <ChevronDownIcon />
        </div>
      </div>
    </div>
  );
}
