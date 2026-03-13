import {action, computed, observable, runInAction} from "mobx";
import {model, Model} from "mobx-keystone";

import {
  getNameOfSchemaType,
  SchemaType,
  escapeName,
  SchemaObjectType,
} from "@dbsof/common/schemaData";
import {
  EditValue,
  DataEditorState,
} from "../../../components/dataEditor/editor";
import {PrimitiveType} from "../../../components/dataEditor";

import {connCtx, dbCtx} from "../../../state";
import {ObjectPropertyField, DataInspector} from ".";

enum EditKind {
  UpdateProperty,
  UpdateLink,
  InsertObject,
  DeleteObject,
}

interface UpdatePropertyEdit {
  kind: EditKind.UpdateProperty;
  objectId: string;
  objectTypeName: string;
  escapedObjectTypeName: string;
  fieldName: string;
  value: EditValue;
}

export enum UpdateLinkChangeKind {
  Add,
  Remove,
  Set,
}
interface UpdateLinkChange {
  kind: UpdateLinkChangeKind;
  id: string;
  typename: string;
}

interface UpdateLinkEdit {
  kind: EditKind.UpdateLink;
  objectId: string | number;
  objectTypeName: string;
  escapedObjectTypeName: string;
  fieldName: string;
  escapedFieldName: string;
  linkTypeName: string;
  escapedLinkTypeName: string;
  setNull: boolean;
  changes: Map<string, UpdateLinkChange>;
  inserts: Set<InsertObjectEdit>;
}

export interface InsertObjectEdit {
  kind: EditKind.InsertObject;
  id: number;
  objectTypeName: string;
  escapedObjectTypeName: string;
  data: {[fieldName: string]: string | number | EditValue | undefined};
}

interface DeleteObjectEdit {
  kind: EditKind.DeleteObject;
  objectId: string;
  objectTypeName: string;
  escapedObjectTypeName: string;
}

let insertEditId = 0;

@model("DataEditingManager")
export class DataEditingManager extends Model({}) {
  @observable
  propertyEdits: Map<string, UpdatePropertyEdit> = new Map();

  @observable.ref
  activePropertyEdit: DataEditorState | null = null;

  @observable
  linkEdits: Map<string, UpdateLinkEdit> = new Map();

  @observable
  insertEdits: Map<number, InsertObjectEdit> = new Map();

  @observable
  deleteEdits: Map<string, DeleteObjectEdit> = new Map();

  @computed
  get hasPendingEdits(): boolean {
    return (
      this.propertyEdits.size > 0 ||
      this.linkEdits.size > 0 ||
      this.insertEdits.size > 0 ||
      this.deleteEdits.size > 0
    );
  }

  @action
  startEditingCell(
    objectId: string | number,
    objectTypeName: string,
    field: ObjectPropertyField,
    valueGetter: () => any
  ) {
    const cellId = `${objectId}__${field.name}`;

    const editValue = this.propertyEdits.get(cellId)?.value;

    const state = new DataEditorState(
      cellId,
      field.schemaType as PrimitiveType,
      field.required && (typeof objectId === "string" || !field.default),
      field.multi,
      editValue ? editValue.value : valueGetter(),
      editValue != null && !editValue.valid,
      (discard) => {
        if (!discard && state.isEdited) {
          this._updateCellEdit(
            objectId,
            objectTypeName,
            field.name,
            state.getEditValue()
          );
        }
        this._finishEditingCell();
      }
    );
    this.activePropertyEdit = state;
  }

  @action
  _updateCellEdit(
    objectId: string | number,
    objectTypeName: string,
    fieldName: string,
    value: EditValue
  ) {
    if (typeof objectId === "string") {
      const cellId = `${objectId}__${fieldName}`;
      if (!this.propertyEdits.has(cellId)) {
        this.propertyEdits.set(cellId, {
          kind: EditKind.UpdateProperty,
          objectId,
          objectTypeName,
          escapedObjectTypeName: escapeName(objectTypeName, true),
          fieldName,
          value,
        });
      } else {
        this.propertyEdits.get(cellId)!.value = value;
      }
    } else {
      this.insertEdits.get(objectId)!.data[fieldName] = value;
    }
  }

  @action
  _finishEditingCell() {
    this.activePropertyEdit = null;
  }

  @action
  clearPropertyEdit(objectId: string | number, fieldName: string) {
    const cellId = `${objectId}__${fieldName}`;
    if (this.activePropertyEdit?.cellId === cellId) {
      this.activePropertyEdit = null;
    }
    if (typeof objectId === "string") {
      this.propertyEdits.delete(cellId);
    } else {
      this.insertEdits.get(objectId)!.data[fieldName] = undefined;
    }
  }

  @action
  createNewRow(objectTypeName: string, dataInspState: DataInspector) {
    const insertId = insertEditId++;
    this.insertEdits.set(insertId, {
      kind: EditKind.InsertObject,
      id: insertId,
      objectTypeName,
      escapedObjectTypeName: escapeName(objectTypeName, true),
      data: {
        id: insertId,
        __tname__: objectTypeName,
      },
    });

    const parentObject = dataInspState.parentObject;
    if (parentObject?.editMode) {
      this.toggleLinkInsert(
        parentObject.id,
        parentObject.subtypeName ?? parentObject.objectTypeName,
        parentObject.fieldName,
        dataInspState.objectType!,
        this.insertEdits.get(insertId)!,
        !parentObject.isMultiLink
      );
    }
  }

  @action
  removeInsertedRow(insertedRow: InsertObjectEdit) {
    this.insertEdits.delete(insertedRow.id);

    for (const [linkId, linkEdit] of this.linkEdits) {
      linkEdit.inserts.delete(insertedRow);

      this._cleanUpLinkEdit(linkId);
    }
  }

  @action
  toggleRowDelete(objectId: string, objectTypeName: string) {
    if (this.deleteEdits.has(objectId)) {
      this.deleteEdits.delete(objectId);
    } else {
      this.deleteEdits.set(objectId, {
        kind: EditKind.DeleteObject,
        objectId,
        objectTypeName,
        escapedObjectTypeName: escapeName(objectTypeName, true),
      });
    }
  }

  _cleanUpLinkEdit(linkId: string) {
    const linkEdit = this.linkEdits.get(linkId)!;

    if (linkEdit.changes.size === 0 && linkEdit.inserts.size === 0) {
      this.linkEdits.delete(linkId);
    }
  }

  @action
  setLinkNull(
    objectId: string | number,
    objectTypeName: string,
    fieldName: string,
    linkType: SchemaObjectType
  ) {
    const linkId = `${objectId}__${fieldName}`;

    this.linkEdits.set(linkId, {
      kind: EditKind.UpdateLink,
      objectId,
      objectTypeName,
      escapedObjectTypeName: escapeName(objectTypeName, true),
      fieldName,
      escapedFieldName: escapeName(fieldName, false),
      ...getLinkTypeName(linkType),
      setNull: true,
      changes: new Map(),
      inserts: new Set(),
    });
  }

  @action
  addLinkUpdate(
    objectId: string | number,
    objectTypeName: string,
    fieldName: string,
    linkType: SchemaObjectType,
    kind: UpdateLinkChangeKind,
    linkObjectId: string,
    linkObjectTypename: string
  ) {
    const linkId = `${objectId}__${fieldName}`;

    if (!this.linkEdits.has(linkId)) {
      this.linkEdits.set(linkId, {
        kind: EditKind.UpdateLink,
        objectId,
        objectTypeName,
        escapedObjectTypeName: escapeName(objectTypeName, true),
        fieldName,
        escapedFieldName: escapeName(fieldName, false),
        ...getLinkTypeName(linkType),
        setNull: false,
        changes: new Map(),
        inserts: new Set(),
      });
    }

    const edits = this.linkEdits.get(linkId)!;
    const linkChanges = edits.changes;

    if (kind === UpdateLinkChangeKind.Set) {
      linkChanges.clear();
      edits.inserts.clear();
      edits.setNull = false;
    }

    linkChanges.set(linkObjectId, {
      id: linkObjectId,
      kind,
      typename: linkObjectTypename,
    });
  }

  @action
  removeLinkUpdate(
    objectId: string | number,
    fieldName: string,
    linkObjectId: string
  ) {
    const linkId = `${objectId}__${fieldName}`;

    const linkEdit = this.linkEdits.get(linkId);

    linkEdit?.changes.delete(linkObjectId);

    this._cleanUpLinkEdit(linkId);
  }

  @action
  clearLinkEdits(linkId: string) {
    this.linkEdits.delete(linkId);
  }

  @action
  toggleLinkInsert(
    objectId: string | number,
    objectTypeName: string,
    fieldName: string,
    linkType: SchemaObjectType,
    insertedRow: InsertObjectEdit,
    setLink: boolean = false
  ) {
    const linkId = `${objectId}__${fieldName}`;

    if (!this.linkEdits.has(linkId)) {
      this.linkEdits.set(linkId, {
        kind: EditKind.UpdateLink,
        objectId,
        objectTypeName,
        escapedObjectTypeName: escapeName(objectTypeName, true),
        fieldName,
        escapedFieldName: escapeName(fieldName, false),
        ...getLinkTypeName(linkType),
        setNull: false,
        changes: new Map(),
        inserts: new Set(),
      });
    }

    const linkEdit = this.linkEdits.get(linkId)!;

    if (setLink) {
      linkEdit.inserts.clear();
      linkEdit.changes.clear();
      linkEdit.setNull = false;
    }

    if (linkEdit.inserts.has(insertedRow)) {
      linkEdit.inserts.delete(insertedRow);
    } else {
      linkEdit.inserts.add(insertedRow);
    }

    this._cleanUpLinkEdit(linkId);
  }

  @action
  clearAllPendingEdits() {
    this.propertyEdits.clear();
    this.activePropertyEdit = null;
    this.linkEdits.clear();
    this.insertEdits.clear();
    this.deleteEdits.clear();
  }

  @action
  cleanupPendingEdits() {
    const schemaData = dbCtx.get(this)!.schemaData!;

    for (const [key, propEdit] of this.propertyEdits) {
      if (!schemaData.objectsByName.has(propEdit.objectTypeName)) {
        this.propertyEdits.delete(key);
      }
    }
    for (const [key, linkEdit] of this.linkEdits) {
      if (!schemaData.objectsByName.has(linkEdit.objectTypeName)) {
        this.linkEdits.delete(key);
      }
    }
    for (const [key, insertEdit] of this.insertEdits) {
      if (!schemaData.objectsByName.has(insertEdit.objectTypeName)) {
        this.insertEdits.delete(key);
      }
    }
    for (const [key, deleteEdit] of this.deleteEdits) {
      if (!schemaData.objectsByName.has(deleteEdit.objectTypeName)) {
        this.deleteEdits.delete(key);
      }
    }
  }

  generateStatements() {
    const schemaData = dbCtx.get(this)!.schemaData!;

    const statements: {code: string; varName: string; error?: string}[] = [];
    const params: {[key: string]: {type: SchemaType; value: any}} = {};

    const deletedIds = new Set(this.deleteEdits.keys());

    function generatePropUpdate(
      objectTypeName: string,
      propName: string,
      val: EditValue
    ) {
      const type =
        schemaData.objectsByName.get(objectTypeName)?.properties[propName];
      return `${escapeName(propName, false)} := ${generateParamExpr(
        schemaData.types.get(type!.target!.id)!,
        val,
        params,
        type!.cardinality === "Many"
      )}`;
    }

    const updateEdits = new Map<
      string,
      {
        objectTypeName: string;
        escapedObjectTypeName: string;
        props: UpdatePropertyEdit[];
        links: UpdateLinkEdit[];
      }
    >();
    const insertLinkEdits = new Map<number, UpdateLinkEdit[]>();

    for (const edit of [
      ...this.propertyEdits.values(),
      ...this.linkEdits.values(),
    ]) {
      if (typeof edit.objectId === "string") {
        if (!this.deleteEdits.has(edit.objectId)) {
          if (!updateEdits.has(edit.objectId)) {
            updateEdits.set(edit.objectId, {
              objectTypeName: edit.objectTypeName,
              escapedObjectTypeName: edit.escapedObjectTypeName,
              props: [],
              links: [],
            });
          }
          if (edit.kind === EditKind.UpdateProperty) {
            updateEdits.get(edit.objectId)!.props.push(edit);
          } else {
            updateEdits.get(edit.objectId)!.links.push(edit);
          }
        }
      } else {
        if (!insertLinkEdits.has(edit.objectId)) {
          insertLinkEdits.set(edit.objectId, []);
        }
        insertLinkEdits.get(edit.objectId)!.push(edit as UpdateLinkEdit);
      }
    }

    const inserts = new Map<
      number,
      {id: number; statement: string; deps: Set<number>; error?: string}
    >();
    for (const insertEdit of this.insertEdits.values()) {
      const fields: string[] = [];
      const deps: number[] = [];
      let invalidFields: string[] = [];

      const type = schemaData.objectsByName.get(insertEdit.objectTypeName)!;

      for (const [key, val] of Object.entries(insertEdit.data)) {
        if (key === "id" || key === "__tname__") continue;
        fields.push(
          generatePropUpdate(insertEdit.objectTypeName, key, val as EditValue)
        );
        if ((val as EditValue).valid === false) {
          invalidFields.push(key);
        }
      }

      const linkEdits = insertLinkEdits.get(insertEdit.id) ?? [];

      for (const linkEdit of linkEdits) {
        const linkUpdate = generateLinkUpdate(
          linkEdit,
          deletedIds,
          deps,
          true
        );
        if (linkUpdate) {
          fields.push(linkUpdate);
        }
      }

      const setLinks = new Set(
        linkEdits.map((linkEdit) => linkEdit.fieldName)
      );
      const missingFields = [
        ...Object.values(type.properties).filter(
          (prop) =>
            prop.required &&
            !prop.default &&
            !(
              prop.target?.schemaType === "Scalar" && prop.target.isSequence
            ) &&
            !prop.expr &&
            insertEdit.data[prop.name] == null
        ),
        ...Object.values(type.links).filter(
          (link) =>
            link.required &&
            !link.default &&
            !link.expr &&
            !setLinks.has(link.name)
        ),
      ];

      inserts.set(insertEdit.id, {
        id: insertEdit.id,
        statement: `insert ${insertEdit.escapedObjectTypeName} {${
          fields.length ? `\n  ${fields.join(",\n  ")}\n` : ""
        }}`,
        deps: new Set(deps),
        error: missingFields.length
          ? `Values are missing for required fields: ${missingFields
              .map((field) => `'${field.name}'`)
              .join(", ")}`
          : invalidFields.length
          ? `Invalid input in fields: ${invalidFields.join(", ")}`
          : undefined,
      });
    }
    for (const insert of topoSort(inserts)) {
      statements.push({
        varName: `insert${insert.id}`,
        code: insert.statement,
        error: insert.error,
      });
    }

    let updateCount = 1;
    for (const [objectId, edits] of updateEdits) {
      const editLines: string[] = [];
      const invalidFields: string[] = [];

      const type = schemaData.objectsByName.get(edits.objectTypeName)!;

      for (const propEdit of edits.props) {
        editLines.push(
          generatePropUpdate(
            propEdit.objectTypeName,
            propEdit.fieldName,
            propEdit.value
          )
        );
        if (propEdit.value.valid === false) {
          invalidFields.push(propEdit.fieldName);
        }
      }
      for (const linkEdit of edits.links) {
        const linkUpdate = generateLinkUpdate(
          linkEdit,
          deletedIds,
          undefined,
          type.links[linkEdit.fieldName]!.cardinality === "One"
        );
        if (linkUpdate) {
          editLines.push(linkUpdate);
        }
      }

      if (editLines.length) {
        statements.push({
          varName: `update${updateCount++}`,
          code: `update ${edits.escapedObjectTypeName}
filter .id = <uuid>'${objectId}'
set {
  ${editLines.join(",\n  ")}
}`,
          error: invalidFields.length
            ? `Invalid input in fields: ${invalidFields.join(", ")}`
            : undefined,
        });
      }
    }

    let deleteCount = 1;
    for (const deleteEdit of this.deleteEdits.values()) {
      statements.push({
        varName: `delete${deleteCount++}`,
        code: `delete ${deleteEdit.escapedObjectTypeName} filter .id = <uuid>'${deleteEdit.objectId}'`,
      });
    }

    return {statements, params};
  }

  @action
  async commitPendingEdits() {
    const conn = connCtx.get(this)!;

    this.activePropertyEdit = null;

    const {statements, params} = this.generateStatements();
    const query = generateQueryFromStatements(statements);

    await conn.query(
      query,
      Object.keys(params).length
        ? Object.keys(params).reduce((args, key) => {
            args[key] = params[key].value;
            return args;
          }, {} as {[key: string]: any})
        : undefined
    );

    runInAction(() => this.propertyEdits.clear());
  }
}

function getLinkTypeName(type: SchemaObjectType): {
  linkTypeName: string;
  escapedLinkTypeName: string;
} {
  if (type.unionOf) {
    return {
      linkTypeName: `{${type.unionOf.map((utype) => utype.name).join(", ")}}`,
      escapedLinkTypeName: `{${type.unionOf
        .map((utype) => utype.escapedName)
        .join(", ")}}`,
    };
  }
  return {
    linkTypeName: type.name,
    escapedLinkTypeName: type.escapedName,
  };
}

export function generateQueryFromStatements(
  statements: {varName: string; code: string}[]
) {
  return `with\n${statements
    .map(
      ({varName, code}) =>
        `${varName} := assert_exists((${code}),` +
        ` message := '${varName} was blocked by access policy')`
    )
    .join(",\n")}
select ${
    statements.length === 1
      ? statements[0].varName
      : `{\n  ${statements.map(({varName}) => varName).join(",\n  ")}\n}`
  }`;
}

function generateLinkUpdate(
  linkEdits: UpdateLinkEdit,
  deletedIds: Set<string>,
  deps?: number[],
  forceLinkSet?: boolean
): string | null {
  if (linkEdits.setNull) {
    return `${escapeName(linkEdits.fieldName, false)} := <${
      linkEdits.escapedLinkTypeName
    }>{}`;
  }

  const links: string[] = [];
  let op = ":=";
  const changes = [...linkEdits.changes.values()].filter(
    (change) =>
      !(change.kind === UpdateLinkChangeKind.Add && deletedIds.has(change.id))
  );
  let addCount = 0,
    removeCount = 0;
  for (const change of changes) {
    if (change.kind === UpdateLinkChangeKind.Add) {
      addCount += 1;
    } else if (change.kind === UpdateLinkChangeKind.Remove) {
      removeCount += 1;
    }
  }
  if (addCount + linkEdits.inserts.size > 0 && removeCount > 0) {
    links.push(
      `(select .${
        linkEdits.escapedFieldName
      } filter .id not in <uuid>{${changes
        .filter((change) => change.kind === UpdateLinkChangeKind.Remove)
        .map(({id}) => `'${id}'`)
        .join(", ")}})`,
      `(select detached ${
        linkEdits.escapedLinkTypeName
      } filter .id in <uuid>{${changes
        .filter((change) => change.kind === UpdateLinkChangeKind.Add)
        .map(({id}) => `'${id}'`)
        .join(", ")}})`
    );
  } else {
    op =
      !forceLinkSet && changes.length === addCount + removeCount
        ? removeCount && !linkEdits.inserts.size
          ? "-="
          : "+="
        : ":=";
    if (changes.length) {
      links.push(
        `(select detached ${linkEdits.escapedLinkTypeName} filter .id ${
          changes.length === 1
            ? `= <uuid>'${changes[0].id}'`
            : `in <uuid>{${changes.map(({id}) => `'${id}'`).join(", ")}}`
        })`
      );
    }
  }
  if (linkEdits.inserts.size) {
    deps?.push(...[...linkEdits.inserts.values()].map(({id}) => id));
    links.push(
      ...[...linkEdits.inserts.values()].map(({id}) => `insert${id}`)
    );
  }

  if (links.length === 0) {
    return null;
  }

  return `${escapeName(linkEdits.fieldName, false)} ${op} ${
    links.length > 1
      ? `distinct {\n    ${links.join(",\n    ")}\n  }`
      : links[0]
  }`;
}

function generateParamExpr(
  type: SchemaType,
  _data: EditValue,
  params: {[key: string]: {type: SchemaType; value: any}},
  multi: boolean
) {
  if (!_data.valid) {
    const paramName = `p${Object.keys(params).length}`;
    params[paramName] = {type, value: _data.value};
    return `<_invalid>$${paramName}`;
  }

  const data = _data.value;

  if (multi && data !== null && data.length) {
    return `{${(data as any[])
      .map((item) => _generateParamExpr(type, item, params))
      .join(", ")}}`;
  }

  return _generateParamExpr(type, data, params);
}

function _generateParamExpr(
  type: SchemaType,
  data: any,
  params: {[key: string]: {type: SchemaType; value: any}}
): string {
  if (data === null) {
    return `<${getNameOfSchemaType(type)[1]}>{}`;
  }

  if (
    type.schemaType === "Scalar" ||
    type.schemaType === "Range" ||
    type.schemaType === "Multirange"
  ) {
    const paramName = `p${Object.keys(params).length}`;
    params[paramName] = {type, value: data};
    return `<${type.name}>$${paramName}`;
  }
  if (type.schemaType === "Array") {
    if (type.elementType.schemaType === "Scalar") {
      const paramName = `p${Object.keys(params).length}`;
      params[paramName] = {type, value: data};
      return `<array<${type.elementType.name}>>$${paramName}`;
    } else {
      return `[${(data as any[])
        .map((item) => _generateParamExpr(type.elementType, item, params))
        .join(", ")}]`;
    }
  }
  if (type.schemaType === "Tuple") {
    return `(${type.elements
      .map((element, i) =>
        _generateParamExpr(element.type, data[element.name ?? i], params)
      )
      .join(", ")}${type.elements.length === 1 ? "," : ""})`;
  }

  throw new Error(`Couldn't create expr for param type: ${type.name}`);
}

interface TopoItem<T extends any> {
  deps: Set<T>;
}
function topoSort<ID extends any, T extends TopoItem<ID>>(
  items: Map<ID, T>
): T[] {
  const sorted: T[] = [];

  const unvisited = new Set(items.values());
  const visiting = new Set<T>();

  for (const item of unvisited) {
    visit(item);
  }

  function visit(item: T) {
    if (!unvisited.has(item)) {
      return;
    }

    if (visiting.has(item)) {
      throw new Error("Cyclic dependency");
    }

    visiting.add(item);

    for (const depId of item.deps) {
      visit(items.get(depId)!);
    }

    visiting.delete(item);
    unvisited.delete(item);

    sorted.push(item);
  }

  return sorted;
}
