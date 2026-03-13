import {useEffect, useRef} from "react";
import {action, makeObservable, observable, runInAction} from "mobx";

import cn from "@dbsof/common/utils/classNames";

import {
  EditorValue,
  PrimitiveType,
  isEditorValueValid,
  newPrimitiveValue,
  parseEditorValue,
  valueToEditorValue,
} from "./utils";
import {ArrayEditor, getInputComponent} from ".";
import {EmptySetIcon} from "../../icons";

import styles from "./dataEditor.module.scss";
import {observer} from "mobx-react-lite";

export type EditValue =
  | {valid: true; value: any}
  | {valid: false; value: EditorValue};

export class DataEditorState {
  constructor(
    public readonly cellId: string,
    public readonly type: PrimitiveType,
    public readonly isRequired: boolean,
    public readonly isMulti: boolean,
    value: any,
    isEditorValue: boolean,
    public readonly onClose: (discard: boolean) => void
  ) {
    makeObservable(this);

    const _init = (_value: any) =>
      runInAction(() => {
        if (isEditorValue) {
          this.value = _value;
        } else {
          this.value =
            _value != null
              ? isMulti
                ? _value.map((val: any) => valueToEditorValue(val, type))
                : valueToEditorValue(_value, type)
              : isRequired
              ? isMulti
                ? []
                : newPrimitiveValue(type)[0]
              : null;
        }

        this.hasError =
          this.value === null
            ? false
            : isMulti
            ? (this.value as EditorValue[]).some(
                (v: any) => !isEditorValueValid(v, type)
              )
            : !isEditorValueValid(this.value, type);

        this.loaded = true;
      });

    if (value instanceof Promise) {
      value.then((_value) => _init(_value));
    } else {
      _init(value);
    }
  }

  @observable
  loaded = false;

  isEdited = false;

  @observable.ref value: EditorValue | null = null;
  @action setValue(val: EditorValue | null) {
    this.value = val;
    this.isEdited = true;
  }

  @observable hasError: boolean = false;
  @action setError(err: boolean) {
    this.hasError = err;
  }

  getEditValue(): EditValue {
    if (this.hasError) {
      return {valid: false, value: this.value!};
    } else {
      return {valid: true, value: this._getParsedVal()};
    }
  }

  private _getParsedVal() {
    if (this.value == null) {
      return null;
    }
    if (this.isMulti) {
      return this.isRequired && !(this.value as EditorValue[]).length
        ? null
        : (this.value as EditorValue[]).map((v: any) =>
            parseEditorValue(v, this.type)
          );
    } else {
      const typename =
        this.type.schemaType === "Scalar"
          ? (this.type.knownBaseType ?? this.type).name
          : null;
      return !this.isRequired &&
        typeof this.value === "string" &&
        this.value.trim() === "" &&
        !(typename === "std:str" || typename === "std::json")
        ? null
        : parseEditorValue(this.value, this.type);
    }
  }
}

export interface DataEditorProps {
  state: DataEditorState;
  style?: any;
}

export const DataEditor = observer(function DataEditor({
  state,
  style,
}: DataEditorProps) {
  const inputRef = useRef<HTMLElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus({preventScroll: true});
    }
    const clickListener = (e: MouseEvent) => {
      if (!editorRef.current?.contains(e.target as Node)) {
        state.onClose(false);
      }
    };
    window.addEventListener("click", clickListener, {capture: true});

    const keyListener = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        state.onClose(true);
        return;
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        state.onClose(false);
        return;
      }
    };
    editorRef.current?.addEventListener("keydown", keyListener, {
      capture: true,
    });

    return () => {
      window.removeEventListener("click", clickListener, {capture: true});
      editorRef.current?.removeEventListener("keydown", keyListener, {
        capture: true,
      });
    };
  }, []);

  const Input = state.isMulti
    ? ArrayEditor
    : getInputComponent(state.type, !state.isRequired);

  return (
    <div
      ref={editorRef}
      className={cn(styles.dataEditor, {
        [styles.showBackground]:
          state.value === null &&
          !state.isMulti &&
          state.type.schemaType !== "Scalar",
      })}
      style={style}
    >
      <Input
        ref={inputRef}
        type={state.type as any}
        isMulti={state.isMulti}
        depth={0}
        allowEmptyPrimitive={!state.isRequired}
        value={(state.value ?? (state.isMulti ? [] : null)) as any}
        onChange={(val: any, err: boolean) => {
          state.setValue(val);
          state.setError(err);
        }}
      />

      {!state.isRequired ? (
        <div className={styles.actions}>
          <div
            className={cn(styles.action, styles.emptySetAction)}
            onClick={() => {
              state.setValue(null);
              state.setError(false);
              state.onClose(false);
            }}
          >
            <EmptySetIcon />
          </div>
        </div>
      ) : null}
    </div>
  );
});
