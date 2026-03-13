import {useMemo} from "react";

import {SchemaObjectType} from "@dbsof/common/schemaData";
import {Select, SelectItem, SelectItems} from "@dbsof/common/ui/select";

export function sortObjectTypes(objectTypes: SchemaObjectType[]) {
  const user: SchemaObjectType[] = [];
  const exts: SchemaObjectType[] = [];
  for (const type of objectTypes) {
    if (type.module.startsWith("ext::")) {
      exts.push(type);
    } else {
      user.push(type);
    }
  }
  return [
    ...user.sort((a, b) => a.name.localeCompare(b.name)),
    ...exts.sort((a, b) => a.name.localeCompare(b.name)),
  ];
}

export function ObjectTypeSelect({
  className,
  fullScreen,
  fullScreenTitle,
  objectTypes,
  selectedObjectType,
  action,
}: {
  className?: string;
  fullScreen?: boolean;
  fullScreenTitle?: string;
  objectTypes: SchemaObjectType[];
  selectedObjectType: SchemaObjectType;
  action: (objectType: SchemaObjectType) => void;
}) {
  const objectSelectItems = useMemo(() => {
    type groupMap = Map<string, {items: SelectItem[]; groups: groupMap}>;
    const groups: groupMap = new Map();
    for (const objectType of objectTypes) {
      let current = {groups: groups} as {
        items: SelectItem[];
        groups: groupMap;
      };
      for (const mod of objectType.module.split("::")) {
        if (!current.groups.has(mod)) {
          current.groups.set(mod, {
            items: [],
            groups: new Map(),
          });
        }
        current = current.groups.get(mod)!;
      }
      current.items.push({
        id: objectType,
        label: objectType.shortName,
        fullLabel: objectType.name,
      });
    }
    const flattenMap = (groups: groupMap): SelectItems["groups"] => {
      return [...groups.entries()].map(([name, group]) => ({
        label: `${name}::`,
        items: group.items,
        groups: group.groups.size ? flattenMap(group.groups) : undefined,
      }));
    };
    const flattenedGroups = flattenMap(groups)!;
    return flattenedGroups.length === 1 &&
      flattenedGroups[0].label === "default::"
      ? flattenedGroups[0]
      : {
          items: [],
          groups: flattenedGroups,
        };
  }, [objectTypes]);

  return (
    <Select<SchemaObjectType>
      className={className}
      fullScreen={fullScreen}
      fullScreenTitle={fullScreenTitle}
      title={
        !Array.isArray(objectSelectItems) ? (
          <>
            <span style={{opacity: 0.65}}>{selectedObjectType.module}::</span>
            {selectedObjectType.shortName}
          </>
        ) : undefined
      }
      items={objectSelectItems}
      selectedItemId={selectedObjectType}
      onChange={(item) => action(item.id)}
      searchable
      shortcutKey="p"
    />
  );
}
