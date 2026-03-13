import {SchemaGraphNode} from "../../core/interfaces";

export interface ISchemaNodeProps {
  node: SchemaGraphNode;
  onDragHandleStart: (event: React.MouseEvent) => void;
}
