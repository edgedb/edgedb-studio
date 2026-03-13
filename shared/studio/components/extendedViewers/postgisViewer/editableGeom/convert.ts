import * as PostGIS from "@dbsof/platform/client";
import {
  Geometry,
  Point,
  Polygon,
  LineString,
  MultiGeometry,
  CompoundCurve,
  pointsEqual,
  CurvePolygon,
  Box,
} from "./types";
import {assertNever} from "@dbsof/common/utils/assertNever";

export function convertToEditableGeometry(
  geom: PostGIS.Geometry | PostGIS.Box2D | PostGIS.Box3D
): {
  geometry: Geometry | Box;
  mapping: GeomMapping;
  hasZ: boolean;
  hasM: boolean;
  srid: number | null;
} {
  const ctx: ConvertCtx = {
    mapping: new GeomMapping(),
    sharedPoints: null,
  };
  if (geom instanceof PostGIS.Geometry) {
    const geometry = _convert(geom as PostGIS.AnyGeometry, ctx);
    return {
      geometry,
      mapping: ctx.mapping,
      hasZ: geom.hasZ,
      hasM: geom.hasM,
      srid: geom.srid,
    };
  } else {
    return {
      geometry: ctx.mapping.addGeom(
        (id) =>
          new Box(
            id,
            ctx.mapping.addGeom((id) => new Point(id, [...geom.min], null)),
            ctx.mapping.addGeom((id) => new Point(id, [...geom.max], null))
          )
      ),
      mapping: ctx.mapping,
      hasM: false,
      hasZ: geom.min[2] != null,
      srid: null,
    };
  }
}

export class GeomMapping {
  private idCounter = 1;
  private mapping = new Map<number, Geometry | Box>();

  constructor() {}

  addGeom<T extends Geometry | Box>(makeGeom: (id: number) => T): T {
    const id = this.idCounter++;
    const geom = makeGeom(id);
    this.mapping.set(id, geom);
    return geom;
  }

  getGeom(id: number) {
    return this.mapping.get(id) ?? null;
  }

  getAllGeoms() {
    return this.mapping.values();
  }

  removeGeom(id: number) {
    this.mapping.delete(id);
  }

  clear() {
    this.mapping.clear();
    this.idCounter = 0;
  }
}

interface ConvertCtx {
  mapping: GeomMapping;
  sharedPoints: Map<string, Point> | null;
}

function makePoint(
  ctx: ConvertCtx,
  p: PostGIS.Point,
  controlPoint: boolean
): Point {
  const coords = ctx.sharedPoints ? [p.x, p.y, p.z, p.m].join(",") : null;
  let point = ctx.sharedPoints?.get(coords!);
  if (!point) {
    point = ctx.mapping.addGeom(
      (id) =>
        new Point(
          id,
          p.z != null ? [p.x, p.y, p.z] : [p.x, p.y],
          p.m,
          controlPoint,
          Number.isNaN(p.x)
        )
    );
    ctx.sharedPoints?.set(coords!, point);
  }
  return point;
}

function makeMultiGeom(
  ctx: ConvertCtx,
  geom:
    | PostGIS.MultiPoint
    | PostGIS.MultiLineString
    | PostGIS.MultiPolygon
    | PostGIS.GeometryCollection,
  kind:
    | "MultiPoint"
    | "MultiLineString"
    | "MultiPolygon"
    | "GeometryCollection"
    | "PolyhedralSurface"
    | "TIN"
    | "MultiCurve"
    | "MultiSurface",
  sharedPoints: boolean
): MultiGeometry {
  if (sharedPoints) {
    ctx = {...ctx, sharedPoints: new Map()};
  }
  return ctx.mapping.addGeom(
    (id) =>
      new MultiGeometry(
        id,
        kind,
        geom.geometries.map((poly) => _convert(poly, ctx) as Polygon)
      )
  );
}

function _convert(geom: PostGIS.AnyGeometry, ctx: ConvertCtx): Geometry {
  if (geom instanceof PostGIS.Point) {
    return makePoint(ctx, geom, false);
  }

  if (geom instanceof PostGIS.LineString) {
    const isCircularString = geom instanceof PostGIS.CircularString;
    const isClosed =
      geom.points.length > 1 &&
      geom.points[0].equals(geom.points[geom.points.length - 1]);
    return ctx.mapping.addGeom(
      (id) =>
        new LineString(
          id,
          isCircularString ? "CircularString" : "LineString",
          (isClosed ? geom.points.slice(0, -1) : geom.points).map((p, i) =>
            makePoint(ctx, p, isCircularString && i % 2 === 1)
          ),
          isClosed
        )
    );
  }

  if (geom instanceof PostGIS.CompoundCurve) {
    return ctx.mapping.addGeom((id) => {
      const lines: LineString[] = [];
      let firstPoint: Point | null = null;
      let lastPoint: Point | null = null;
      for (const line of geom.geometries) {
        const isCircularString = line instanceof PostGIS.CircularString;
        const lineString = ctx.mapping.addGeom(
          (id) =>
            new LineString(
              id,
              isCircularString ? "CircularString" : "LineString",
              line.points.map((p, i) =>
                i === 0 && lastPoint
                  ? lastPoint
                  : makePoint(ctx, p, isCircularString && i % 2 === 1)
              )
            )
        );
        lastPoint = lineString.points.length
          ? lineString.points[lineString.points.length - 1]
          : lastPoint;
        firstPoint =
          !firstPoint && lineString.points.length
            ? lineString.points[0]
            : firstPoint;
        lines.push(lineString);
      }
      return new CompoundCurve(
        id,
        lines,
        firstPoint != null &&
          lastPoint != null &&
          firstPoint !== lastPoint &&
          pointsEqual(firstPoint.point, lastPoint.point)
      );
    });
  }

  if (geom instanceof PostGIS.Polygon) {
    return ctx.mapping.addGeom(
      (id) =>
        new Polygon(
          id,
          geom instanceof PostGIS.Triangle ? "Triangle" : "Polygon",
          geom.rings.map((ring) => _convert(ring, ctx) as LineString)
        )
    );
  }

  if (geom instanceof PostGIS.MultiPoint) {
    return makeMultiGeom(ctx, geom, "MultiPoint", false);
  }
  if (geom instanceof PostGIS.MultiLineString) {
    return makeMultiGeom(ctx, geom, "MultiLineString", false);
  }
  if (geom instanceof PostGIS.MultiPolygon) {
    const kind =
      geom instanceof PostGIS.PolyhedralSurface
        ? "PolyhedralSurface"
        : geom instanceof PostGIS.TriangulatedIrregularNetwork
        ? "TIN"
        : "MultiPolygon";
    return makeMultiGeom(ctx, geom, kind, kind !== "MultiPolygon");
  }
  if (geom instanceof PostGIS.GeometryCollection) {
    return makeMultiGeom(ctx, geom, "GeometryCollection", false);
  }
  if (geom instanceof PostGIS.CurvePolygon) {
    return ctx.mapping.addGeom(
      (id) =>
        new CurvePolygon(
          id,
          geom.geometries.map(
            (ring) => _convert(ring, ctx) as LineString | CompoundCurve
          )
        )
    );
  }
  if (geom instanceof PostGIS.MultiCurve) {
    return makeMultiGeom(ctx, geom, "MultiCurve", false);
  }
  if (geom instanceof PostGIS.MultiSurface) {
    return makeMultiGeom(ctx, geom, "MultiSurface", false);
  }

  assertNever(
    geom,
    `unhandled geometry type: ${(geom as any).constructor.name}`
  );
}

export function convertFromEditableGeometry(
  geom: Geometry | Box | null,
  state: {hasZ: boolean; hasM: boolean; srid: number | null}
): PostGIS.Geometry | PostGIS.Box2D | PostGIS.Box3D | null {
  if (!geom) return null;
  if (geom instanceof Box) {
    return geom.min.point[2] == null
      ? new PostGIS.Box2D(
          [...geom.min.point] as [number, number],
          [...geom.max.point] as [number, number]
        )
      : new PostGIS.Box3D(
          [...geom.min.point] as [number, number, number],
          [...geom.max.point] as [number, number, number]
        );
  }
  return _unconvert(geom, [state.hasZ, state.hasM, state.srid]);
}

type UnconvertArgs = [
  boolean, // hasZ
  boolean, // hasM
  number | null // srid
];

function _unconvert(geom: Geometry, args: UnconvertArgs): PostGIS.AnyGeometry {
  const kind = geom.kind;
  switch (kind) {
    case "Point":
      return new PostGIS.Point(
        geom.point[0],
        geom.point[1],
        args[0] ? geom.point[2] ?? (geom.isEmpty ? NaN : 0) : null,
        args[1] ? geom.m ?? (geom.isEmpty ? NaN : 0) : null,
        args[2]
      );
    case "LineString":
    case "CircularString":
      return new (
        kind === "CircularString" ? PostGIS.CircularString : PostGIS.LineString
      )(
        (geom.isClosed ? [...geom.points, geom.points[0]] : geom.points).map(
          (p) => _unconvert(p, args)
        ) as PostGIS.Point[],
        ...args
      );
    case "Polygon":
    case "Triangle":
      return new (kind === "Triangle" ? PostGIS.Triangle : PostGIS.Polygon)(
        geom.rings.map((ring) =>
          _unconvert(ring, args)
        ) as PostGIS.LineString[],
        ...args
      );
    case "MultiPoint":
      return new PostGIS.MultiPoint(
        geom.geoms.map((geom) => _unconvert(geom, args) as PostGIS.Point),
        ...args
      );
    case "MultiLineString":
      return new PostGIS.MultiLineString(
        geom.geoms.map((geom) =>
          _unconvert(geom, args)
        ) as PostGIS.LineString[],
        ...args
      );
    case "MultiPolygon":
      return new PostGIS.MultiPolygon(
        geom.geoms.map((geom) => _unconvert(geom, args) as PostGIS.Polygon),
        ...args
      );
    case "GeometryCollection":
      return new PostGIS.GeometryCollection(
        geom.geoms.map((geom) => _unconvert(geom, args)),
        ...args
      );
    case "PolyhedralSurface":
      return new PostGIS.PolyhedralSurface(
        geom.geoms.map((geom) => _unconvert(geom, args) as PostGIS.Polygon),
        ...args
      );
    case "TIN":
      return new PostGIS.TriangulatedIrregularNetwork(
        geom.geoms.map((geom) => _unconvert(geom, args) as PostGIS.Triangle),
        ...args
      );
    case "CompoundCurve":
      return new PostGIS.CompoundCurve(
        geom.lines.map(
          (line) =>
            _unconvert(line, args) as
              | PostGIS.LineString
              | PostGIS.CircularString
        ),
        ...args
      );
    case "CurvePolygon":
      return new PostGIS.CurvePolygon(
        geom.rings.map(
          (ring) =>
            _unconvert(ring, args) as
              | PostGIS.LineString
              | PostGIS.CircularString
              | PostGIS.CompoundCurve
        ),
        ...args
      );
    case "MultiCurve":
      return new PostGIS.MultiCurve(
        geom.geoms.map(
          (geom) =>
            _unconvert(geom, args) as
              | PostGIS.LineString
              | PostGIS.CircularString
              | PostGIS.CompoundCurve
        ),
        ...args
      );
    case "MultiSurface":
      return new PostGIS.MultiSurface(
        geom.geoms.map(
          (geom) =>
            _unconvert(geom, args) as PostGIS.Polygon | PostGIS.CurvePolygon
        ),
        ...args
      );
    default:
      assertNever(kind, `Unhandled geom kind: ${kind}`);
  }
}
