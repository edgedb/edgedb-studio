import {useEffect, useRef, useState} from "react";

import cn from "@dbsof/common/utils/classNames";

import Button from "../button";

import styles from "./switcherButton.module.scss";

interface SwitcherButtonProps<T extends string | number> {
  className?: string;
  items: {
    id: T;
    label: string;
    icon: JSX.Element;
  }[];
  selected: T;
  onChange: (id: T) => void;
}

export default function SwitcherButton<T extends string | number>({
  className,
  items,
  selected,
  onChange,
}: SwitcherButtonProps<T>) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupOpen, setPopupOpen] = useState(false);

  useEffect(() => {
    if (popupOpen) {
      const listener = (e: MouseEvent) => {
        if (!popupRef.current?.contains(e.target as Node)) {
          setPopupOpen(false);
        }
      };

      window.addEventListener("click", listener, {capture: true});

      return () => {
        window.removeEventListener("click", listener, {capture: true});
      };
    }
  }, [popupOpen]);

  const selectedItem = items.find((item) => item.id === selected);

  return (
    <div className={cn(styles.switcherButton, className)}>
      <Button
        label={
          <div className={styles.switcherLabel}>
            {items.map((item, i) => (
              <div
                key={i}
                className={item === selectedItem ? styles.selected : undefined}
              >
                {item.label}
              </div>
            ))}
          </div>
        }
        icon={selectedItem?.icon}
        leftIcon
        onClick={() => setPopupOpen(true)}
      />
      {popupOpen ? (
        <div ref={popupRef} className={styles.popup}>
          {items.map((item) => (
            <div
              key={item.id}
              className={cn(styles.item, {
                [styles.selectedItem]: item.id === selected,
              })}
              onClick={() => {
                setPopupOpen(false);
                onChange(item.id);
              }}
            >
              {item.label}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
