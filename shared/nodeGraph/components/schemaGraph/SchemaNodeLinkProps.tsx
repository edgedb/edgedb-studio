import {observer} from "mobx-react-lite";

import styles from "./schemaGraph.module.scss";
import {useSchemaState} from "../../state/provider";

import cn from "@dbsof/common/utils/classNames";
import {stripModuleName} from "@dbsof/common/utils/moduleNames";

import {SchemaGraphNodeType, SchemaGraphNode} from "../../core/interfaces";

export default observer(function SchemaNodeLinkProps(props: {
  node: SchemaGraphNode;
}) {
  const schemaState = useSchemaState();

  if (props.node.type !== SchemaGraphNodeType.linkprop) return null;

  const {source, name: linkName} = props.node.link;

  const schemaLink = schemaState
    .objects!.get(source.id)!
    .links.find((link) => link.name === linkName)!;

  const isVisible =
    !schemaState.graph.hideAllLinks &&
    (schemaState.graph.focusedNode ||
      schemaState.graph.debugShowAllLinks ||
      source.id === schemaState.selectedObjectName);

  const isSelected =
    schemaState.selectedObjectName === source.id &&
    schemaState.selectedLinkName === linkName;

  const linkprops = schemaLink.properties.map((prop) => {
    return (
      <div className={styles.row} key={prop.name}>
        <div>@{prop.name}</div>
        <div className={styles.targettype}>
          {stripModuleName(prop.targetName)}
        </div>
      </div>
    );
  });

  return (
    <div
      className={cn(
        styles.linkprops,
        isVisible ? styles.visible : null,
        isSelected ? styles.selected : null
      )}
      onClick={() => schemaState.selectLink(source.id, linkName)}
    >
      {linkprops}
    </div>
  );
});
