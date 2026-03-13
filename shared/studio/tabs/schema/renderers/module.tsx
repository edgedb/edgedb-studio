import {useEffect, useRef, useState} from "react";
import {observer} from "mobx-react-lite";

import cn from "@dbsof/common/utils/classNames";

import {SchemaModule, SchemaTextView} from "../state/textView";
import {useSchemaTextState} from "../textView";

import {Keyword, Punc} from "./utils";

import styles from "../textView.module.scss";

export function ModuleRenderer({
  type,
  isSticky,
}: {
  type: SchemaModule;
  isSticky?: boolean;
}) {
  if (!type.isEnd && !isSticky) return null;

  const ref = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    if (ref.current && isSticky) {
      const observer = new IntersectionObserver(
        ([e]) => {
          if (
            e.rootBounds &&
            e.boundingClientRect.top < e.rootBounds.height / 2
          ) {
            setIsStuck(e.intersectionRatio < 1);
          }
        },
        {threshold: [1]}
      );

      observer.observe(ref.current);

      return () => {
        observer.disconnect();
      };
    }
  }, [ref.current]);

  return (
    <div
      className={cn(styles.moduleItem, {
        [styles.stickyHeader]: !!isSticky,
        [styles.isStuck]: isStuck,
      })}
      style={{
        paddingLeft: 18 + 17 * type.depth + "px",
        ...(isSticky
          ? {
              zIndex: 100 - type.depth,
              top: 31 * type.depth - 1 + "px",
            }
          : {}),
      }}
    >
      {isSticky ? (
        <div
          ref={ref}
          className={styles.stickySentinel}
          style={{
            top: -31 * type.depth + "px",
          }}
        />
      ) : null}
      {type.isEnd ? (
        <Punc>{"};"}</Punc>
      ) : (
        <>
          <Keyword>module</Keyword> {type.module} <Punc>{"{"}</Punc>
        </>
      )}
    </div>
  );
}

function ModuleHeader({
  state,
  module,
  index,
  parentOffset,
}: {
  state: SchemaTextView;
  module: SchemaModule;
  index: number;
  parentOffset: number;
}) {
  const start = (state.listRef as any)._getItemStyle(module.startIndex);
  const end = (state.listRef as any)._getItemStyle(module.endIndex);

  return (
    <div
      className={cn(styles.listItem, styles.moduleWrapper)}
      style={{
        marginTop: index === 0 ? start.top - parentOffset : 42 + "px",
        height: end.top - start.top + "px",
      }}
    >
      <ModuleRenderer type={module} isSticky />
      {module.submodules?.map((mod, i) => (
        <ModuleHeader
          key={i}
          state={state}
          module={mod}
          index={i}
          parentOffset={start.top + 42}
        />
      ))}
    </div>
  );
}

export const ModuleHeaders = observer(function ModuleHeaders({}: {
  // dummy prop to trigger rerender since
  // `observer` isn't reactive to change in list height
  _rerender: any;
}) {
  const state = useSchemaTextState();

  if (!state.listRef) {
    return null;
  }

  const modules = state.renderListItems.modulesList;

  return (
    <>
      {modules.map((mod, i) => (
        <ModuleHeader
          key={i}
          state={state}
          module={mod}
          index={i}
          parentOffset={0}
        />
      ))}
    </>
  );
});
