import {
  Bounds,
  EditableGeometry,
  Geometry,
  LineString,
  MultiGeometry,
  PlainPoint,
  Point,
  Polygon,
  Box,
} from "./types";
import * as geojson from "./geojsonTypes";
import {assertNever} from "@dbsof/common/utils/assertNever";

export function getBoundingBoxFeature(
  geoms: Set<Geometry | Box>
): geojson.Feature[] {
  if (geoms.size === 0) return [];
  let bounds: Bounds | null = null;
  for (const geom of geoms) {
    if (!geom.bounds || (geoms.size === 1 && geom instanceof Point)) continue;
    if (!bounds) {
      bounds = geom.bounds.copy();
    } else {
      bounds.join(geom.bounds);
    }
  }
  if (!bounds) return [];
  return [
    {
      type: "Feature",
      properties: {selectionBoundingBox: true},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [bounds.bounds[0][0], bounds.bounds[0][1]],
            [bounds.bounds[0][0], bounds.bounds[1][1]],
            [bounds.bounds[1][0], bounds.bounds[1][1]],
            [bounds.bounds[1][0], bounds.bounds[0][1]],
            [bounds.bounds[0][0], bounds.bounds[0][1]],
          ],
        ],
      },
    },
  ];
}

export function groupGeomsByParent(geoms: Set<Geometry | Box>) {
  const groups = new Map<Geometry | null, Geometry[]>();
  for (const geom of geoms) {
    if (geom instanceof Box) continue;
    if (!groups.has(geom.parent)) {
      groups.set(geom.parent, []);
    }
    groups.get(geom.parent)!.push(geom);
  }
  return groups;
}

export function getSelectableChildGeoms(geom: EditableGeometry): Geometry[] {
  if (geom instanceof MultiGeometry) {
    return geom.geoms;
  }
  if (geom instanceof Polygon) {
    return geom.rings
      .flatMap((ring) => ring.points)
      .filter((p) => !p.controlPoint);
  }
  if (geom instanceof LineString) {
    return geom.points.filter((p) => !p.controlPoint);
  }
  // if (geom instanceof CompoundCurve) {
  //   return geom._points.filter((p) => !p.controlPoint);
  // }
  // if (geom instanceof CurvePolygon) {
  //   return [];
  // }
  assertNever(geom);
}

export function pointInBounds(
  p: PlainPoint,
  min: PlainPoint,
  max: PlainPoint
): boolean {
  return !(p[0] < min[0] || p[0] > max[0] || p[1] < min[1] || p[1] > max[1]);
}

// Adapted from https://stackoverflow.com/questions/10962379/how-to-check-intersection-between-2-rotated-rectangles
export function polygonsIntersect(a: PlainPoint[], b: PlainPoint[]): boolean {
  let minA, maxA, projected, minB, maxB;
  for (const polygon of [a, b]) {
    for (let i1 = 0; i1 < polygon.length; i1++) {
      var i2 = (i1 + 1) % polygon.length;
      var normal = {
        x: polygon[i2][1] - polygon[i1][1],
        y: polygon[i1][0] - polygon[i2][0],
      };
      minA = maxA = null;
      for (let j = 0; j < a.length; j++) {
        projected = normal.x * a[j][0] + normal.y * a[j][1];
        if (minA === null || projected < minA) {
          minA = projected;
        }
        if (maxA === null || projected > maxA) {
          maxA = projected;
        }
      }
      minB = maxB = null;
      for (let j = 0; j < b.length; j++) {
        projected = normal.x * b[j][0] + normal.y * b[j][1];
        if (minB === null || projected < minB) {
          minB = projected;
        }
        if (maxB === null || projected > maxB) {
          maxB = projected;
        }
      }
      if (maxA! < minB! || maxB! < minA!) {
        return false;
      }
    }
  }
  return true;
}
