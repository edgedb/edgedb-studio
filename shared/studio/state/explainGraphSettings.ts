import {computed} from "mobx";
import {Model, model, prop, modelAction} from "mobx-keystone";

export enum graphType {
  area = "area",
  flame = "flame",
}

export enum graphUnit {
  time = "time",
  cost = "cost",
}

const userGraphTypeStorageKey = "dbsofUserGraphTypeChoice";

@model("ExplainGraphSettings")
export class ExplainGraphSettings extends Model({
  graphType: prop<graphType>(),
  graphUnit: prop(graphUnit.time).withSetter(),
  userUnitChoice: prop<graphUnit | null>(null).withSetter(),
}) {
  @computed
  get _isTimeGraph() {
    return this.graphUnit === graphUnit.time;
  }

  @computed
  get isAreaGraph() {
    return this.graphType === graphType.area;
  }

  @modelAction
  setGraphType(type: graphType) {
    this.graphType = type;
    localStorage.setItem(userGraphTypeStorageKey, JSON.stringify(type));
  }
}

let userStoredTypeChoice = graphType.area;

try {
  const storedVal = localStorage.getItem(userGraphTypeStorageKey);
  if (storedVal) {
    userStoredTypeChoice =
      JSON.parse(storedVal) === graphType.flame
        ? graphType.flame
        : graphType.area;
  }
} catch {
  // ignore errors
}

const explainGraphSettings = new ExplainGraphSettings({
  graphType: userStoredTypeChoice,
});

export {explainGraphSettings};
