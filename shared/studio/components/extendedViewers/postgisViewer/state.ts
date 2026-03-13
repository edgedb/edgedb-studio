import {action, computed, observable, reaction, runInAction} from "mobx";
import {model, Model, modelAction, prop} from "mobx-keystone";

import maplibregl from "maplibre-gl";
// @ts-ignore
import maplibreglWorkerUrl from "maplibre-gl/dist/maplibre-gl-csp-worker?url";
import {lightLayers, darkLayers} from "./styles/layers";

import {Theme} from "@dbsof/common/hooks/useTheme";
import {assertNever} from "@dbsof/common/utils/assertNever";

import * as PostGIS from "@dbsof/platform/client";
import * as geojson from "./editableGeom/geojsonTypes";
import {
  EditableGeometry,
  Geometry,
  MultiGeometry,
  LineString,
  PlainPoint,
  Point,
  Polygon,
  Box,
} from "./editableGeom/types";
import {convertToEditableGeometry, GeomMapping} from "./editableGeom/convert";
import {
  getBoundingBoxFeature,
  getSelectableChildGeoms,
  groupGeomsByParent,
  pointInBounds,
  polygonsIntersect,
} from "./editableGeom/utils";

// @ts-ignore
import controlPointImage from "./controlPoint.png";

maplibregl.setWorkerUrl(maplibreglWorkerUrl);

export const ListItemRowHeight = 32;

export type LineButtonMode = "line" | "circular";
export type PolyButtonMode = "polygon" | "triangle";
export type EditingMode = "point" | LineButtonMode | PolyButtonMode | "ring";

export type GeomAction = "group-multi" | "group-collection" | "ungroup";

const modeShortcuts = new Map<string, EditingMode | null>([
  ["v", null],
  ["p", "point"],
  ["l", "line"],
  ["c", "circular"],
  ["s", "polygon"],
  ["t", "triangle"],
  ["r", "ring"],
]);
const actionShortcuts = new Map<
  string,
  {action: GeomAction; ctrlcmd?: boolean; shift?: boolean; altopt?: boolean}[]
>([
  [
    "g",
    [
      {action: "group-multi", ctrlcmd: true},
      {action: "group-collection", ctrlcmd: true, altopt: true},
    ],
  ],
  ["u", [{action: "ungroup", ctrlcmd: true}]],
]);

export function createPostgisEditorState(
  data: PostGIS.Geometry | PostGIS.Box2D | PostGIS.Box3D | null,
  editable: boolean,
  theme: Theme
): PostgisEditor {
  const state = new PostgisEditor({readonly: !editable, theme});

  state._setData(data);

  state.mapElRef = state.mapElRef.bind(state);
  state._updateLineEditMousePoint =
    state._updateLineEditMousePoint.bind(state);

  return state;
}

export const MIN_M_RADIUS = 2;
export const MAX_M_RADIUS = 12;

const DRAG_THRESHOLD = 3;

const DATA_SOURCE = "query-data";
const EDITING_SOURCE = "editing-data";
const SELECTION_SOURCE = "selection-controls";

const LAYER_DATA_POINTS = "layer-data-points";
const LAYER_DATA_RENDER_LINES = "layer-data-render-lines";
const LAYER_DATA_LINES = "layer-data-lines";
const LAYER_DATA_BG = "layer-data-bg";
const LAYER_DATA_BBOX = "layer-data-bbox";

const LAYER_EDIT_POINTS = "layer-edit-points";
const LAYER_EDIT_CONTROL_POINTS = "layer-edit-control-points";
const LAYER_EDIT_RENDER_LINES = "layer-edit-render-lines";
const LAYER_EDIT_LINES = "layer-edit-lines";
const LAYER_EDIT_PENDING_LINES = "layer-edit-pending-lines";
const LAYER_EDIT_BG = "layer-edit-bg";

const emptyDataSource: geojson.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const BASE_COLOUR = "#007cbf";
const SELECTED_COLOUR = "#a565cd";

@model("PostgisEditor")
export class PostgisEditor extends Model({
  readonly: prop<boolean>(),
  theme: prop<Theme>(),

  sidePanelHeight: prop(0).withSetter(),
  sidePanelScrollTop: prop(0).withSetter(),
  sidePanelWidth: prop(420).withSetter(),
}) {
  @computed.struct
  get visibleListItemIndexes(): [number, number] {
    return [
      Math.max(0, Math.floor(this.sidePanelScrollTop / ListItemRowHeight) - 3),
      Math.ceil(
        (this.sidePanelScrollTop + this.sidePanelHeight) / ListItemRowHeight
      ) + 3,
    ];
  }

  @observable.ref
  data: Geometry | Box | null = null;

  @observable
  hasZ: boolean = false;

  @observable
  hasM: boolean = false;

  @action
  toggleHasZ() {
    this.hasZ = !this.hasZ;
    this.isEdited = true;
  }

  @action
  toggleHasM() {
    this.hasM = !this.hasM;
    this.isEdited = true;
  }

  @observable.ref
  minMaxM: [number, number] = [0, 0];

  @action
  updateMinMaxM() {
    let min = Infinity;
    let max = -Infinity;
    for (const geom of this.geomMapping.getAllGeoms()) {
      if (geom instanceof Point) {
        const m = geom.m ?? 0;
        min = m < min ? m : min;
        max = m > max ? m : max;
      }
    }
    if (min !== this.minMaxM[0] || max !== this.minMaxM[1]) {
      this.minMaxM = [min, max];
    }
  }

  @observable
  srid: number | null = null;

  @observable
  isEdited = false;

  @action
  setEdited() {
    this.isEdited = true;
  }

  @observable
  cleanupEmptyGeom = true;

  @action
  toggleCleanupEmptyGeom() {
    this.cleanupEmptyGeom = !this.cleanupEmptyGeom;
  }

  geomMapping: GeomMapping = new GeomMapping();

  get geojsonData(): geojson.FeatureCollection {
    return {
      type: "FeatureCollection",
      features: this.data?.geojson ?? [],
    };
  }

  @action
  _setData(data: PostGIS.Geometry | PostGIS.Box2D | PostGIS.Box3D | null) {
    if (data) {
      const {geometry, mapping, hasZ, hasM, srid} =
        convertToEditableGeometry(data);

      this.data = geometry;
      this.geomMapping = mapping;
      this.hasZ = hasZ;
      this.hasM = hasM;
      this.srid = srid;

      if (hasM) {
        this.updateMinMaxM();
      }
    } else {
      this.data = null;
      this.geomMapping.clear();
    }

    this._updateMapDataSource();
  }

  @observable.ref
  map: maplibregl.Map | null = null;

  @computed
  get layers(): maplibregl.LayerSpecification[] {
    const BG_COLOUR = this.theme === Theme.dark ? "#0c0c0c" : "#ffffff";
    const INACTIVE_COLOUR = this.theme === Theme.dark ? "#5a5a5a" : "#9c9c9c";
    const MAIN_COLOUR = this.editingGeom ? INACTIVE_COLOUR : BASE_COLOUR;

    return [
      ...(this.theme === Theme.dark ? darkLayers : lightLayers),
      {
        id: LAYER_DATA_BG,
        source: DATA_SOURCE,
        type: "fill",
        filter: ["all", ["==", "$type", "Polygon"], ["!=", "isBoxType", true]],
        paint: {
          "fill-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            SELECTED_COLOUR,
            MAIN_COLOUR,
          ],
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "editing"], false],
            0,
            0.4,
          ],
        },
      },
      {
        id: LAYER_DATA_RENDER_LINES,
        source: DATA_SOURCE,
        type: "line",
        filter: ["!=", "isBoxType", true],
        paint: {
          "line-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            SELECTED_COLOUR,
            MAIN_COLOUR,
          ],
          "line-width": 1.5,
          "line-opacity": [
            "case",
            ["boolean", ["feature-state", "editing"], false],
            0,
            0.6,
          ],
        },
      },
      {
        id: LAYER_DATA_LINES,
        source: DATA_SOURCE,
        type: "line",
        filter: ["!=", "isBoxType", true],
        paint: {
          "line-width": 10,
          "line-opacity": 0,
        },
      },
      {
        id: LAYER_DATA_POINTS,
        source: DATA_SOURCE,
        type: "circle",
        filter: ["==", "$type", "Point"],
        paint: {
          "circle-radius":
            this.hasM && this.minMaxM[0] != this.minMaxM[1]
              ? [
                  "interpolate",
                  ["linear"],
                  ["get", "mag"],
                  this.minMaxM[0],
                  MIN_M_RADIUS,
                  this.minMaxM[1],
                  MAX_M_RADIUS,
                ]
              : 5,
          "circle-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            SELECTED_COLOUR,
            BG_COLOUR,
          ],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            BG_COLOUR,
            MAIN_COLOUR,
          ],
          "circle-opacity": [
            "case",
            ["boolean", ["feature-state", "editing"], false],
            0,
            1,
          ],
          "circle-stroke-opacity": [
            "case",
            ["boolean", ["feature-state", "editing"], false],
            0,
            1,
          ],
        },
      },
      {
        id: LAYER_DATA_BBOX,
        source: DATA_SOURCE,
        type: "line",
        filter: ["get", "isBoxType"],
        paint: {
          "line-color": BASE_COLOUR,
          "line-width": 1.5,
          "line-opacity": 0.6,
          "line-dasharray": [4, 2],
        },
      },
      // editing layers
      {
        id: LAYER_EDIT_BG,
        source: EDITING_SOURCE,
        type: "fill",
        filter: ["==", "$type", "Polygon"],
        paint: {
          "fill-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            SELECTED_COLOUR,
            BASE_COLOUR,
          ],
          "fill-opacity": 0.4,
        },
      },
      {
        id: LAYER_EDIT_RENDER_LINES,
        source: EDITING_SOURCE,
        type: "line",
        filter: ["!=", ["get", "pendingLine"], true],
        paint: {
          "line-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            SELECTED_COLOUR,
            BASE_COLOUR,
          ],
          "line-width": 1.5,
          "line-opacity": 0.6,
        },
      },
      {
        id: LAYER_EDIT_LINES,
        source: DATA_SOURCE,
        type: "line",
        filter: ["!=", ["get", "pendingLine"], true],
        paint: {
          "line-width": 10,
          "line-opacity": 0,
        },
      },
      {
        id: LAYER_EDIT_PENDING_LINES,
        source: EDITING_SOURCE,
        type: "line",
        filter: ["get", "pendingLine"],
        paint: {
          "line-color": SELECTED_COLOUR,
          "line-width": 1.5,
          "line-opacity": 0.6,
          "line-dasharray": [2, 1],
        },
      },
      {
        id: LAYER_EDIT_CONTROL_POINTS,
        source: EDITING_SOURCE,
        type: "symbol",
        filter: ["get", "isControlPoint"],
        layout: {
          "icon-image": "control-point-icon",
          "icon-allow-overlap": true,
        },
      },
      {
        id: LAYER_EDIT_POINTS,
        source: EDITING_SOURCE,
        type: "circle",
        filter: [
          "all",
          ["==", "$type", "Point"],
          ["!=", "isControlPoint", true],
        ],
        paint: {
          "circle-radius": 5,
          "circle-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            SELECTED_COLOUR,
            BG_COLOUR,
          ],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            BG_COLOUR,
            BASE_COLOUR,
          ],
        },
      },
      // selection
      {
        id: "selection-bounding-box",
        source: SELECTION_SOURCE,
        type: "line",
        filter: ["get", "selectionBoundingBox"],
        paint: {
          "line-color": SELECTED_COLOUR,
          "line-width": 1,
          "line-opacity": 0.6,
          "line-dasharray": [4, 2],
        },
      },
    ];
  }

  _mapElRef: HTMLDivElement | null = null;
  mapElRef(el: HTMLDivElement | null) {
    this._mapElRef = el;
    if (el) {
      this._initMap(el);
    }
  }

  _initMap(el: HTMLDivElement) {
    const map = new maplibregl.Map({
      container: el,
      style: {
        version: 8,
        glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
        sprite: "https://tiles.openfreemap.org/sprites/ofm_f384/ofm",
        sources: {
          openmaptiles: {
            type: "vector",
            url: "https://tiles.openfreemap.org/planet",
          },
          [DATA_SOURCE]: {
            type: "geojson",
            data: this.geojsonData as any,
          },
          [EDITING_SOURCE]: {
            type: "geojson",
            data: emptyDataSource as any,
          },
          [SELECTION_SOURCE]: {
            type: "geojson",
            data: {type: "FeatureCollection", features: []},
          },
        },
        layers: this.layers,
      },
      center: [0, 0],
      zoom: 1,
      attributionControl: {compact: true},
      boxZoom: false,
      clickTolerance: DRAG_THRESHOLD,
    });
    // map.showPadding = true;
    // map.showTileBoundaries = true;
    map.setPadding({right: 12, top: 0, bottom: 0, left: 0});
    if (this.data?.bounds) {
      map.fitBounds(this.data.bounds.bounds, {
        padding: 80,
        animate: false,
        maxZoom: 18,
      });
    }

    map
      .loadImage(controlPointImage)
      .then((image) =>
        map.addImage("control-point-icon", image.data, {pixelRatio: 3})
      );

    map.once("load", () => {
      runInAction(() => (this.map = map));
      this._initEvents(map);
    });
  }

  @modelAction
  setTheme(theme: Theme) {
    this.theme = theme;
  }

  @computed
  get cursor() {
    return this.activeLineEdit || this.editingMode ? "crosshair" : null;
  }

  init() {
    const layersUpdateDisposer = reaction(
      () => this.map != null && this.layers,
      (layers) => {
        if (layers) {
          this.map!.setStyle({
            ...this.map!.getStyle(),
            layers,
          });
        }
      }
    );

    const selectionUpdateDisposer = reaction(
      () => this.map != null && [...this.selectedGeoms],
      () => this._updateSelectionSource()
    );

    const cursorUpdateDisposer = reaction(
      () => this.cursor,
      (cursor) => {
        if (this.map) {
          this.map.getCanvas().style.cursor = cursor ?? "";
        }
      }
    );

    const keyListener = (ev: KeyboardEvent) => {
      if (ev.key === "Enter" && this.selectedGeoms.size === 1) {
        const geom = [...this.selectedGeoms][0];
        if (
          geom.kind === "Box" ||
          geom.kind === "Point" ||
          geom.kind === "CompoundCurve" ||
          geom.kind === "CurvePolygon"
        ) {
          return;
        }

        ev.preventDefault();
        ev.stopPropagation();
        this.startEditingGeom(geom);
      } else if (
        !this.readonly &&
        (ev.key === "Delete" || ev.key === "Backspace") &&
        this.selectedGeoms.size > 0
      ) {
        ev.preventDefault();
        this.setEdited();

        const groupedGeoms = groupGeomsByParent(this.selectedGeoms);

        this.deselectAllGeoms();

        for (const [parent, geoms] of groupedGeoms) {
          if (!parent) {
            this.data = null;
            this.geomMapping.clear();
            this._updateMapDataSource();
          } else if (parent instanceof MultiGeometry) {
            parent.removeGeoms(geoms, this.geomMapping);
            this._updateEditingSource();
          } else if (parent instanceof LineString) {
            parent.removePoints(geoms, this.geomMapping);
            this._updateEditingSource();
          }
        }
      } else {
        const modeShortcut = modeShortcuts.get(ev.key);
        if (modeShortcut !== undefined) {
          ev.preventDefault();
          if (this.availableModes.has(modeShortcut)) {
            this.setEditingMode(modeShortcut);
          }
        } else {
          const actionShortcut = actionShortcuts.get(ev.key);
          if (actionShortcut) {
            const shift = ev.shiftKey;
            // todo: handle windows keys
            const ctrlcmd = ev.metaKey;
            const altopt = ev.altKey;
            for (const shortcut of actionShortcut) {
              if (
                shift === (shortcut.shift ?? false) &&
                ctrlcmd === (shortcut.ctrlcmd ?? false) &&
                altopt === (shortcut.altopt ?? false)
              ) {
                ev.preventDefault();
                this.applyGeomAction(shortcut.action);
                break;
              }
            }
          }
        }
      }
    };
    window.addEventListener("keydown", keyListener);

    const escListener = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        if (this.activeLineEdit) {
          this.endLineEdit();
        } else if (this.editingGeom) {
          this.endEditingGeom();
        }
      }
    };
    window.addEventListener("keydown", escListener, {capture: true});

    return () => {
      layersUpdateDisposer();
      selectionUpdateDisposer();
      cursorUpdateDisposer();
      window.removeEventListener("keydown", keyListener);
      window.removeEventListener("keydown", escListener, {capture: true});
    };
  }

  _updateMapDataSource() {
    if (!this.map) return;
    // console.log("updating data source", this.geojsonData);
    (this.map.getSource(DATA_SOURCE) as maplibregl.GeoJSONSource).setData(
      this.geojsonData as any
    );
  }

  _updateEditingSource() {
    if (!this.map) return;
    // console.log("updating editing source", this.editingGeojsonData);
    (this.map.getSource(EDITING_SOURCE) as maplibregl.GeoJSONSource).setData(
      this.editingGeojsonData as any
    );
  }

  _updateSelectionSource() {
    if (!this.map) return;
    (this.map.getSource(SELECTION_SOURCE) as maplibregl.GeoJSONSource).setData(
      {
        type: "FeatureCollection",
        features:
          this.editingGeom === null ||
          this.editingGeom instanceof MultiGeometry
            ? (getBoundingBoxFeature(this.selectedGeoms) as any)
            : [],
      }
    );
  }

  fitToBounds() {
    if (this.map && this.data?.bounds) {
      this.map.fitBounds(this.data.bounds.bounds, {
        padding: 80,
        animate: true,
        maxZoom: 18,
      });
    }
  }

  // _updateLayers(metadata: Metadata) {
  //   if (!this.map) return;
  //   if (this.data instanceof Geometry) {
  //     const pointsCircleRadius: maplibregl.DataDrivenPropertyValueSpecification<number> =
  //       this.data.hasM && ;
  //     (
  //       this.layers.find(
  //         (layer) => layer.id === LAYER_DATA_POINTS
  //       ) as maplibregl.CircleLayerSpecification
  //     ).paint!["circle-radius"] = pointsCircleRadius;
  //     this.map.setPaintProperty(
  //       LAYER_DATA_POINTS,
  //       "circle-radius",
  //       pointsCircleRadius
  //     );
  //   }
  // }

  @observable.shallow
  selectedGeoms = new Set<Geometry | Box>();

  @observable.ref
  editingGeom: EditableGeometry | null = null;

  get editingGeojsonData(): geojson.FeatureCollection {
    return this.editingGeom
      ? {
          type: "FeatureCollection",
          features: this.editingGeom.editingGeojson(this.activeLineEdit),
        }
      : emptyDataSource;
  }

  @action
  updatePointCoord(point: Point, index: 0 | 1 | 2, value: number) {
    this.isEdited = true;
    point.point[index] = value;
    point.parent?.recalculateBounds();
    if (this.editingGeom) {
      this._updateEditingSource();
    } else {
      this._updateMapDataSource();
    }
  }

  @action
  updatePointMValue(point: Point, value: number) {
    this.isEdited = true;
    point.m = value;
    // update data
    this.updateMinMaxM();
  }

  @observable
  editingMode: EditingMode | null = null;

  @observable
  selectedLineButtonMode: LineButtonMode = "line";

  @observable
  selectedPolyButtonMode: PolyButtonMode = "polygon";

  @computed
  get availableModes() {
    if (this.data instanceof Box) {
      return new Set([]);
    }
    const modes: (EditingMode | null)[] = [null];
    if (this.editingGeom == null) {
      modes.push("point", "line", "circular", "polygon", "triangle");
    } else if (this.editingGeom instanceof MultiGeometry) {
      if (this.editingGeom.kind === "MultiPolygon") {
        modes.push("polygon");
      } else if (this.editingGeom.kind === "MultiLineString") {
        modes.push("line");
      } else if (this.editingGeom.kind === "MultiPoint") {
        modes.push("point");
      } else {
        modes.push("point", "line", "circular", "polygon", "triangle");
      }
    } else if (
      this.editingGeom instanceof Polygon &&
      this.editingGeom.kind !== "Triangle"
    ) {
      modes.push("ring");
    }
    return new Set(modes);
  }

  @action
  setEditingMode(mode: EditingMode | null) {
    this.editingMode = mode;
    if (mode === "line" || mode === "circular") {
      this.selectedLineButtonMode = mode;
    }
    if (mode === "polygon" || mode === "triangle") {
      this.selectedPolyButtonMode = mode;
    }
  }

  @computed
  get availableGeomActions() {
    const actions: GeomAction[] = [];
    if (this.selectedGeoms.size === 1) {
      const geom = [...this.selectedGeoms][0];
      if (
        geom instanceof MultiGeometry &&
        !(geom.kind === "GeometryCollection" && this.data === geom)
      ) {
        actions.push("ungroup");
      }
    } else if (
      this.selectedGeoms.size > 1 &&
      (this.editingGeom === null ||
        this.editingGeom.kind === "GeometryCollection")
    ) {
      actions.push("group-collection");
      const geomKinds = new Set<Geometry["kind"] | "Box">();
      for (const geom of this.selectedGeoms) {
        geomKinds.add(geom.kind);
      }
      if (geomKinds.size === 1) {
        const kind = [...geomKinds][0];
        if (kind === "Polygon" || kind === "LineString" || kind === "Point") {
          actions.push("group-multi");
        }
      }
    }
    return new Set(actions);
  }

  @action
  applyGeomAction(action: GeomAction) {
    if (!this.availableGeomActions.has(action)) return;
    this.isEdited = true;
    if (action === "ungroup") {
      const geom = [...this.selectedGeoms][0] as Geometry;
      this.deselectAllGeoms();
      const childGeoms = (geom as MultiGeometry).geoms;
      this.geomMapping.removeGeom(geom.id);
      let geomParent = geom.parent;
      if (!(geomParent instanceof MultiGeometry)) {
        geomParent = this.geomMapping.addGeom(
          (id) => new MultiGeometry(id, "GeometryCollection", childGeoms)
        );
        this.data = geomParent;
      } else {
        geomParent.replaceGeoms([geom], childGeoms);
      }
    } else if (action === "group-multi" || action === "group-collection") {
      const geoms = [...this.selectedGeoms] as Geometry[];
      this.deselectAllGeoms();
      const parentGeom = this.editingGeom as MultiGeometry;
      const newKind =
        action === "group-collection"
          ? "GeometryCollection"
          : geoms[0].kind === "Polygon"
          ? "MultiPolygon"
          : geoms[0].kind === "LineString"
          ? "MultiLineString"
          : "MultiPoint";
      const newGeom = this.geomMapping.addGeom(
        (id) => new MultiGeometry(id, newKind, geoms)
      );
      parentGeom.replaceGeoms(geoms, [newGeom]);
    }
    if (this.editingGeom) {
      this._updateEditingSource();
    } else {
      this._updateMapDataSource();
    }
  }

  @observable.shallow
  activeLineEdit: {
    line: LineString;
    prepend: boolean;
    pendingPoints: PlainPoint[];
    mousePoint: PlainPoint;
  } | null = null;

  @action
  startLineEdit(edit: this["activeLineEdit"]) {
    this.isEdited = true;
    this.activeLineEdit = edit;
    window.addEventListener("mousemove", this._updateLineEditMousePoint);
  }

  @action
  _updateLineEditMousePoint(ev: MouseEvent) {
    if (!this.activeLineEdit) return;

    const mousePoint = this._mousePosToPoint(ev);
    let mouseLatlng = this.map!.unproject(mousePoint).toArray();

    if (!this.activeLineEdit.pendingPoints.length) {
      const line = this.activeLineEdit.line;
      const snapPoints = [line.points[0].point];
      if (line.points.length > 1) {
        snapPoints.push(line.points[line.points.length - 1].point);
      }
      for (const point of snapPoints) {
        const p = this.map!.project([point[0], point[1]]);
        if ((mousePoint.x - p.x) ** 2 + (mousePoint.y - p.y) ** 2 <= 50) {
          mouseLatlng = [point[0], point[1]];
          break;
        }
      }
    }

    this.activeLineEdit.mousePoint = mouseLatlng;
    this._updateEditingSource();
  }

  @action
  updateActiveLineEdit() {
    if (!this.activeLineEdit) return;
    const edit = this.activeLineEdit;
    const updatedEdit = edit.line.addPoint(edit, this.geomMapping);
    if (updatedEdit) {
      this.activeLineEdit = {
        line: edit.line,
        ...updatedEdit,
      };
      this._updateEditingSource();
    } else {
      this.endLineEdit();
    }
  }

  @action
  endLineEdit() {
    window.removeEventListener("mousemove", this._updateLineEditMousePoint);
    this.activeLineEdit?.line.finaliseEditing(this.geomMapping);
    this.activeLineEdit = null;
    this._updateEditingSource();
  }

  _getEventGeom(
    ev: maplibregl.MapMouseEvent & {
      features?: maplibregl.MapGeoJSONFeature[];
    }
  ) {
    const feature = ev.features?.[0];
    if (typeof feature?.id != "number") return null;

    const geom = this.geomMapping.getGeom(feature.id);
    if (!geom) {
      throw new Error(`failed to find geom for id: ${feature.id}`);
    }
    return geom;
  }

  _findGeomParent(geom: Geometry | Box) {
    while (geom.parent) {
      if (geom.parent === this.editingGeom) {
        break;
      }
      geom = geom.parent;
    }
    return geom;
  }

  _mousePosToPoint(ev: MouseEvent) {
    const mapRect = this.map!.getCanvas().getBoundingClientRect();
    return new maplibregl.Point(
      ev.clientX - mapRect.x,
      ev.clientY - mapRect.y
    );
  }

  _initEvents(map: maplibregl.Map) {
    let mouseState:
      | ((
          | {
              geom: Geometry | Box;
              editSource: boolean;
              lastLatLng: [number, number];
            }
          | {geom: null}
        ) & {startPos: maplibregl.Point; dragging: boolean; shiftKey: boolean})
      | null = null;

    for (const {editSource, layers} of [
      {
        editSource: false,
        layers: [LAYER_DATA_BG, LAYER_DATA_LINES, LAYER_DATA_POINTS],
      },
      {
        editSource: true,
        layers: [
          LAYER_EDIT_BG,
          LAYER_EDIT_LINES,
          LAYER_EDIT_POINTS,
          LAYER_EDIT_CONTROL_POINTS,
        ],
      },
    ]) {
      const handler = (
        ev: maplibregl.MapMouseEvent & {
          features?: maplibregl.MapGeoJSONFeature[];
        }
      ) => {
        if (editSource !== (this.editingGeom != null)) return;

        const geom = this._getEventGeom(ev);

        if (geom) {
          if (
            this.editingGeom &&
            !this.editingGeom.featureIds.includes(geom.id)
          ) {
            return;
          }

          mouseState = {
            geom,
            editSource,
            startPos: ev.point,
            lastLatLng: ev.lngLat.toArray(),
            dragging: false,
            shiftKey: ev.originalEvent.shiftKey,
          };
        }
      };
      for (const layer of layers) {
        map.on("mousedown", layer, handler);
      }
    }

    const mouseMoveHandler = (ev: MouseEvent) => {
      if (!mouseState) return;

      // console.log("mousemove");

      const mousePoint = this._mousePosToPoint(ev);
      if (!mouseState.dragging) {
        if (
          (mouseState.startPos.x - mousePoint.x) ** 2 +
            (mouseState.startPos.y - mousePoint.y) ** 2 >=
          DRAG_THRESHOLD ** 2
        ) {
          // dragging started
          mouseState.dragging = true;
          // console.log("dragstart");

          // if line edit tool active ignore drag start actions
          if (this.activeLineEdit) {
            window.removeEventListener("mousemove", mouseMoveHandler, {
              capture: true,
            });
            return;
          }

          if (mouseState.shiftKey) {
            // shift key + drag = box selection
            this.startDragSelection(mouseState.startPos);
          } else if (!this.readonly && mouseState.geom) {
            // started dragging on geometry
            if (
              this.selectedGeoms.has(mouseState.geom) ||
              this.selectedGeoms.has(this._findGeomParent(mouseState.geom))
            ) {
              // dragging started on selected geom so continue
            } else if (
              mouseState.geom instanceof Point &&
              mouseState.geom.logicalParent == this.editingGeom
            ) {
              // dragging started on point allowed without being first selected
              this.deselectAllGeoms();
              this.selectGeom(mouseState.geom);
            } else {
              // dragging on non selected geometry so ignore further mousemove
              window.removeEventListener("mousemove", mouseMoveHandler, {
                capture: true,
              });
              return;
            }
          } else {
            // dragging on map or readonly so ignore further mousemove
            window.removeEventListener("mousemove", mouseMoveHandler, {
              capture: true,
            });
            return;
          }
        } else {
          // mouse hasn't moved enough to consider dragging started
          return;
        }
      }

      // dragging active so prevent default map drag
      ev.stopPropagation();

      if (this.dragSelectionBounds) {
        this.onDragSelection(mousePoint);
      } else if (mouseState.geom) {
        const lngLat = this.map!.unproject(mousePoint);
        const diff = [
          lngLat.lng - mouseState.lastLatLng[0],
          lngLat.lat - mouseState.lastLatLng[1],
        ] as [number, number];
        mouseState.lastLatLng = lngLat.toArray();
        runInAction(() => {
          this.isEdited = true;
          for (const geom of this.selectedGeoms) {
            geom.translate(diff);
          }
        });
        this._updateSelectionSource();
        if (this.editingGeom) {
          this._updateEditingSource();
        } else {
          this._updateMapDataSource();
        }
      }
    };

    const mouseUpHandler = (_ev: MouseEvent) => {
      window.removeEventListener("mousemove", mouseMoveHandler, {
        capture: true,
      });

      // console.log("mouseup", mouseState);

      if (!mouseState) return;

      if (mouseState.dragging) {
        if (this.dragSelectionBounds) {
          // finish dragging box selection
          this.endDragSelection();
        } else if (mouseState.geom) {
          // finish dragging geometry
          [...this.selectedGeoms][0]?.parent?.recalculateBounds();
        }
      } else {
        // it was a click instead of drag
        if (this.activeLineEdit) {
          this.updateActiveLineEdit();
        } else if (this.editingMode) {
          this.deselectAllGeoms();
          this.startGeomInsert(
            this.editingMode,
            map.unproject(mouseState.startPos)
          );
        } else if (mouseState.geom) {
          const geomParent = this._findGeomParent(mouseState.geom);
          if (mouseState.shiftKey) {
            this.toggleGeomSelection(geomParent);
          } else {
            this.deselectAllGeoms();
            this.selectGeom(geomParent);
          }
        } else {
          this.deselectAllGeoms();
        }
      }
      mouseState = null;
    };

    map.on("mousedown", (ev) => {
      // console.log("mousedown", mouseState);
      if (!mouseState) {
        mouseState = {
          startPos: ev.point,
          dragging: false,
          shiftKey: ev.originalEvent.shiftKey,
          geom: null,
        };
      }

      window.addEventListener("mousemove", mouseMoveHandler, {capture: true});
      window.addEventListener("mouseup", mouseUpHandler, {once: true});
    });
  }

  @action
  selectGeom(geom: Geometry | Box) {
    if (this.selectedGeoms.has(geom)) {
      return;
    }
    for (const id of geom.featureIds) {
      this.map!.setFeatureState(
        {
          source: this.editingGeom ? EDITING_SOURCE : DATA_SOURCE,
          id,
        },
        {selected: true}
      );
    }
    this.selectedGeoms.add(geom);
  }

  @action
  toggleGeomSelection(geom: Geometry | Box) {
    if (this.selectedGeoms.has(geom)) {
      for (const id of geom.featureIds) {
        this.map!.removeFeatureState(
          {
            source: this.editingGeom ? EDITING_SOURCE : DATA_SOURCE,
            id,
          },
          "selected"
        );
      }
      this.selectedGeoms.delete(geom);
    } else {
      for (const id of geom.featureIds) {
        this.map!.setFeatureState(
          {
            source: this.editingGeom ? EDITING_SOURCE : DATA_SOURCE,
            id,
          },
          {selected: true}
        );
      }
      this.selectedGeoms.add(geom);
    }
  }

  @action
  deselectAllGeoms() {
    for (const geom of this.selectedGeoms) {
      for (const id of geom.featureIds) {
        this.map!.removeFeatureState(
          {
            source: this.editingGeom ? EDITING_SOURCE : DATA_SOURCE,
            id,
          },
          "selected"
        );
      }
    }
    this.selectedGeoms.clear();
  }

  dragSelectItemBounds:
    | {geom: Geometry | Box; bounds: PlainPoint | PlainPoint[]}[]
    | null = null;

  @observable
  dragSelectionBounds: [PlainPoint, PlainPoint] | null = null;

  @action
  startDragSelection(startPoint: maplibregl.Point) {
    const map = this.map!;
    const mapWidth = map.getCanvas().clientWidth;
    const mapHeight = map.getCanvas().clientHeight;
    const corners = [
      map.unproject([0, 0]),
      map.unproject([mapWidth, 0]),
      map.unproject([0, mapHeight]),
      map.unproject([mapWidth, mapHeight]),
    ];
    const lngs = corners.map((p) => p.lng);
    const lats = corners.map((p) => p.lat);
    const boundsMin: PlainPoint = [Math.min(...lngs), Math.min(...lats)];
    const boundsMax: PlainPoint = [Math.max(...lngs), Math.max(...lats)];

    const selectItems: (typeof this)["dragSelectItemBounds"] = [];

    const items = this.editingGeom
      ? getSelectableChildGeoms(this.editingGeom)
      : this.data
      ? [this.data]
      : [];
    for (const item of items) {
      if (
        item instanceof Point &&
        pointInBounds(item.point, boundsMin, boundsMax)
      ) {
        const projected = map.project([item.point[0], item.point[1]]);
        selectItems.push({geom: item, bounds: [projected.x, projected.y]});
      } else if (item.bounds && item.bounds.overlaps([boundsMin, boundsMax])) {
        selectItems.push({
          geom: item,
          bounds: [
            item.bounds.bounds[0],
            [item.bounds.bounds[1][0], item.bounds.bounds[0][1]],
            item.bounds.bounds[1],
            [item.bounds.bounds[0][0], item.bounds.bounds[1][1]],
          ]
            .map((p) => map.project(p as [number, number]))
            .map((p) => [p.x, p.y] as PlainPoint),
        });
      }
    }

    this.deselectAllGeoms();
    this.dragSelectItemBounds = selectItems;
    this.dragSelectionBounds = [
      [startPoint.x, startPoint.y],
      [startPoint.x, startPoint.y],
    ];
  }

  @action
  onDragSelection(mousePoint: maplibregl.Point) {
    if (
      this.dragSelectionBounds === null ||
      this.dragSelectItemBounds === null
    )
      return;
    this.dragSelectionBounds[1] = [mousePoint.x, mousePoint.y];

    const xMin = Math.min(this.dragSelectionBounds[0][0], mousePoint.x);
    const xMax = Math.max(this.dragSelectionBounds[0][0], mousePoint.x);
    const yMin = Math.min(this.dragSelectionBounds[0][1], mousePoint.y);
    const yMax = Math.max(this.dragSelectionBounds[0][1], mousePoint.y);

    const bounds: PlainPoint[] = [
      [xMin, yMin],
      [xMax, yMin],
      [xMax, yMax],
      [xMin, yMax],
    ];
    for (const item of this.dragSelectItemBounds) {
      const inBounds =
        item.geom instanceof Point
          ? pointInBounds(item.bounds as PlainPoint, bounds[0], bounds[2])
          : polygonsIntersect(item.bounds as PlainPoint[], bounds);
      if (inBounds !== this.selectedGeoms.has(item.geom)) {
        this.toggleGeomSelection(item.geom);
      }
    }
  }

  @action
  endDragSelection() {
    this.dragSelectionBounds = null;
    this.dragSelectItemBounds = null;
  }

  @action
  startEditingGeom(geom: EditableGeometry) {
    this.deselectAllGeoms();
    if (this.editingGeom) {
      for (const id of this.editingGeom.featureIds) {
        this.map!.removeFeatureState({source: DATA_SOURCE, id}, "editing");
      }
    }
    this.editingGeom = geom;
    this._updateEditingSource();
    for (const id of geom.featureIds) {
      this.map!.setFeatureState(
        {
          source: DATA_SOURCE,
          id,
        },
        {editing: true}
      );
    }
  }

  @action
  endEditingGeom() {
    this.deselectAllGeoms();
    this.editingMode = null;
    this.endLineEdit();
    if (this.editingGeom?.parent instanceof MultiGeometry) {
      this.editingGeom.parent.updateGeojson();
    }
    this._updateMapDataSource();
    this.map!.removeFeatureState({source: DATA_SOURCE});
    this.editingGeom = null;
    this._updateEditingSource();
  }

  _insertGeom(newGeom: Geometry) {
    if (!this.data) {
      this.data = newGeom;
      return null;
    } else if (this.editingGeom instanceof MultiGeometry) {
      this.editingGeom.insertGeom(newGeom);
      return this.editingGeom;
    } else {
      const containerGeom = this.geomMapping.addGeom(
        (id) =>
          new MultiGeometry(id, "GeometryCollection", [
            this.data as Geometry,
            newGeom,
          ])
      );
      this.data = containerGeom;
      return containerGeom;
    }
  }

  @action
  startGeomInsert(mode: EditingMode, lnglat: maplibregl.LngLat) {
    const newPoint = this.geomMapping.addGeom(
      (id) => new Point(id, [lnglat.lng, lnglat.lat], null)
    );
    switch (mode) {
      case "point":
        {
          const updated = this._insertGeom(newPoint);
          if (updated === this.editingGeom) {
            this._updateEditingSource();
          } else if (updated) {
            this.startEditingGeom(updated);
          }
          this.editingMode = null;
        }
        break;
      case "line":
      case "circular":
        {
          const newLine = this.geomMapping.addGeom(
            (id) =>
              new LineString(
                id,
                mode === "circular" ? "CircularString" : "LineString",
                [newPoint]
              )
          );
          this._insertGeom(newLine);
          this.startLineEdit({
            line: newLine,
            prepend: false,
            pendingPoints: [],
            mousePoint: [lnglat.lng, lnglat.lat],
          });
          this.startEditingGeom(newLine);
          this.editingMode = null;
        }
        break;
      case "polygon":
      case "triangle":
        {
          const ring = this.geomMapping.addGeom(
            (id) => new LineString(id, "LineString", [newPoint], true)
          );
          const poly = this.geomMapping.addGeom(
            (id) =>
              new Polygon(id, mode === "triangle" ? "Triangle" : "Polygon", [
                ring,
              ])
          );
          this._insertGeom(poly);
          this.startLineEdit({
            line: ring,
            prepend: false,
            pendingPoints: [],
            mousePoint: [lnglat.lng, lnglat.lat],
          });
          this.startEditingGeom(poly);
          this.editingMode = null;
        }
        break;
      case "ring":
        {
          if (!this.editingGeom || !(this.editingGeom instanceof Polygon)) {
            return;
          }
          const ring = this.geomMapping.addGeom(
            (id) => new LineString(id, "LineString", [newPoint], true)
          );
          this.editingGeom.addRing(ring);
          this.startLineEdit({
            line: ring,
            prepend: false,
            pendingPoints: [],
            mousePoint: [lnglat.lng, lnglat.lat],
          });
          this.editingMode = null;
        }
        break;
      default:
        assertNever(mode);
    }

    this._updateMapDataSource();
  }
}
