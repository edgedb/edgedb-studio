import {
  Model,
  model,
  modelAction,
  Frozen,
  frozen,
  createContext,
  prop,
} from "mobx-keystone";
import {observable, computed, action, autorun} from "mobx";
import {Text} from "@codemirror/state";

import {Language} from "@dbsof/platform/client";

import {
  deserializeResolvedParameter,
  extractSQLQueryParameters,
  ResolvedParameter,
  SerializedResolvedParameter,
  serializeResolvedParameter,
} from "./extractQueryParameters";

import {dbCtx} from "../../../state/database";
import {
  EditorValue,
  newPrimitiveValue,
  parseEditorValue,
} from "../../../components/dataEditor/utils";
import {connCtx} from "../../../state";

export type {ResolvedParameter};

export type SerializedParamsData = {
  [key: string]: {
    typeName: string;
    value: EditorValue;
    disabled: boolean;
    type?: SerializedResolvedParameter;
  };
};

export const paramsQueryCtx = createContext<Text | null>();

@model("Repl/QueryParamsEditor")
export class QueryParamsEditor extends Model({
  lang: prop<Language>(),
}) {
  @observable
  panelHeight = 160;

  @action
  setPanelHeight(height: number) {
    this.panelHeight = height;
  }

  @observable.shallow
  paramDefs = new Map<string, ResolvedParameter>();

  @observable
  paramData = new Map<
    string,
    {
      disabled: boolean;
      data: Map<string, {value: Frozen<EditorValue>; hasError: boolean}>;
    }
  >();

  @computed
  get mixedParamsError() {
    let hasPositionalParam: boolean | null = null;
    for (const [paramName] of this.paramDefs) {
      const isPositional = /^\d+$/.test(paramName);
      if (hasPositionalParam === null) {
        hasPositionalParam = isPositional;
      }
      if (isPositional !== hasPositionalParam) {
        return true;
      }
    }
    return false;
  }

  @computed
  get currentParams() {
    return [...this.paramDefs.values()].reduce((data, param) => {
      if (param.error === null) {
        const paramData = this.paramData.get(param.name)!;
        const type =
          param.type.schemaType === "Scalar" ? "__scalar__" : param.type.name;

        data[param.name] = {
          data: paramData.data.get(type)!,
          disabled: paramData.disabled,
        };
      }
      return data;
    }, {} as {[key: string]: {data: {value: Frozen<EditorValue>; hasError: boolean}; disabled: boolean}});
  }

  @computed
  get hasErrors() {
    return [...this.paramDefs.values()].some((param) => {
      if (param.error !== null) {
        return true;
      }
      const data = this.currentParams[param.name];

      return !data.disabled && (!data.data || data.data.hasError);
    });
  }

  onAttachedToRootStore() {
    const disposer = autorun(() => this._extractQueryParameters(), {
      delay: 200,
    });

    return () => {
      disposer();
    };
  }

  _currentFetchParamsTask: AbortController | null = null;
  async _extractQueryParameters() {
    this._currentFetchParamsTask?.abort();

    const schemaScalars = dbCtx.get(this)!.schemaData?.scalars;
    const query = paramsQueryCtx.get(this)?.toString();

    if (!schemaScalars || query == null) return;

    const conn = connCtx.get(this)!;
    this._currentFetchParamsTask = new AbortController();
    const params = await extractSQLQueryParameters(
      query,
      schemaScalars,
      conn,
      this._currentFetchParamsTask.signal
    );
    if (params) {
      this.updateCurrentParams(params);
    }
  }

  @action
  updateCurrentParams(params: Map<string, ResolvedParameter>) {
    for (const [key, param] of params) {
      if (!this.paramData.has(key)) {
        this.paramData.set(key, {data: new Map(), disabled: false});
      }
      if (param.error === null) {
        const type =
          param.type.schemaType === "Scalar" ? "__scalar__" : param.type.name;
        const data = this.paramData.get(key)!.data;
        if (!data.has(type)) {
          const [value, hasError] = newPrimitiveValue(param.type);
          data.set(type, {
            value: frozen(value),
            hasError,
          });
        }
      }
    }
    this.paramDefs = params;
  }

  @action
  setDisabled(name: string, disabled: boolean) {
    this.paramData.get(name)!.disabled = disabled;
  }

  @action
  setParamValue(name: string, value: EditorValue, hasError: boolean) {
    const paramDef = this.paramDefs.get(name)!;
    if (paramDef.error == null) {
      const type =
        paramDef.type.schemaType === "Scalar"
          ? "__scalar__"
          : paramDef.type.name;
      const paramData = this.paramData.get(name)!.data.get(type)!;
      paramData.value = frozen(value);
      paramData.hasError = hasError;
    }
  }

  //

  getQueryArgs() {
    const entries = [...this.paramDefs.entries()];
    const isPositional = entries.every(([name]) => /^\d+$/.test(name));
    return entries.length
      ? entries.reduce(
          (args, [name, paramDef]) => {
            if (paramDef.error === null) {
              const param = this.currentParams[name]!;
              (args as any)[name] = param.disabled
                ? null
                : parseEditorValue(param.data.value.data, paramDef.type);
            }
            return args;
          },
          isPositional ? ([] as any[]) : ({} as {[key: string]: any})
        )
      : undefined;
  }

  serializeParamsData(): SerializedParamsData | null {
    const paramDefs = this.paramDefs;

    if (!paramDefs.size) {
      return null;
    }

    const data: SerializedParamsData = {};

    for (const [name, param] of paramDefs.entries()) {
      if (param.error === null) {
        const paramData = this.currentParams[name];

        data[name] = {
          typeName: param.type.name,
          disabled: paramData.disabled,
          value: paramData.data.value.data,
          type: serializeResolvedParameter(param),
        };
      }
    }

    return data;
  }

  @action
  restoreParamsData(
    _paramsData?: SerializedParamsData | Frozen<SerializedParamsData> | null
  ) {
    this.clear();

    if (_paramsData) {
      const paramsData = (
        _paramsData.data && typeof _paramsData.data.disabled !== "boolean"
          ? _paramsData.data
          : _paramsData
      ) as SerializedParamsData;

      const params = Object.entries(paramsData);
      if (params[0]?.[1].type != null) {
        // serialised params data has param defs, so use those
        const schemaScalars = dbCtx.get(this)!.schemaData?.scalars;
        if (!schemaScalars) return;
        const deserializedParams = new Map<string, ResolvedParameter>();
        for (const [name, param] of params) {
          deserializedParams.set(
            name,
            deserializeResolvedParameter(param.type!, schemaScalars)
          );
        }
        this.updateCurrentParams(deserializedParams);
      } else {
        // should be a query statement so this is not async
        this._extractQueryParameters();
      }

      for (const [name, paramDef] of this.paramDefs.entries()) {
        if (paramDef.error === null) {
          const data = paramsData[name];

          if (data && data.typeName === paramDef.type.name) {
            const paramData = this.paramData.get(name)!;
            const type =
              paramDef.type.schemaType === "Scalar"
                ? "__scalar__"
                : paramDef.type.name;

            paramData.disabled = data.disabled;
            let error = false;
            try {
              parseEditorValue(data.value, paramDef.type);
            } catch {
              error = true;
            }
            paramData.data.set(type, {
              value: frozen(data.value),
              hasError: error,
            });
          }
        }
      }
    }
  }

  @modelAction
  clear() {
    this.paramDefs.clear();
    this.paramData.clear();
  }
}
