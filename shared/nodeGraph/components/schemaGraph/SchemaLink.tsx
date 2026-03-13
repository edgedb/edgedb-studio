import {Fragment} from "react";
import {observer} from "mobx-react-lite";

import styles from "./schemaGraph.module.scss";
import {useSchemaState} from "../../state/provider";
import cn from "@dbsof/common/utils/classNames";
import {SchemaGraphLinkType, SchemaGraphRoute} from "../../core/interfaces";

interface SchemaLinkProps {
  route: SchemaGraphRoute;
}

export default observer(function SchemaLink({route}: SchemaLinkProps) {
  const schemaState = useSchemaState();

  const isInheritLink = route.link.type === SchemaGraphLinkType.inherit;

  const isVisible =
    schemaState.graph.debugShowAllLinks ||
    schemaState.graph.focusedNode ||
    route.link.source.id === schemaState.selectedObjectName;

  const isSelected =
    schemaState.selectedObjectName === route.link.source.id &&
    schemaState.selectedLinkName === route.link.name;

  return (
    <g
      className={cn(
        styles.link,
        isInheritLink ? styles.inherit : null,
        isVisible ? styles.visible : null,
        schemaState.graph.hideAllLinks ? styles.hideAll : null,
        isSelected ? styles.selected : null
      )}
    >
      {route.paths.map((path, i) => (
        <Fragment key={i}>
          <path d={path} />
          {!isInheritLink ? (
            <path
              className={styles.linkClickTarget}
              d={path}
              onClick={() =>
                schemaState.selectLink(route.link.source.id, route.link.name)
              }
            />
          ) : null}
        </Fragment>
      ))}
    </g>
  );
});
