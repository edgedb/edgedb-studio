import {lazy, Suspense} from "react";

import {Item, ItemType} from "@dbsof/inspector/buildItem";
import {JsonViewer} from "./jsonViewer";
import {TextViewer} from "./textViewer";

import styles from "./shared.module.scss";
import {HeaderBar, ExtendedViewerContext} from "./shared";
import Spinner from "@dbsof/common/ui/spinner";

export {ExtendedViewerContext};

const PostgisViewer = lazy(() => import("./postgisViewer"));
const HexViewer = lazy(() => import("./hexViewer"));

type Renderer = (props: {data: any}) => React.ReactNode;

export const extendedViewerRenderers: {
  [key: string]: Renderer;
} = {
  "std::str": TextViewer,
  "std::bytes": HexViewer,
  "std::json": JsonViewer,
  "ext::postgis::geometry": PostgisViewer,
  "ext::postgis::geography": PostgisViewer,
  "ext::postgis::box2d": PostgisViewer,
  "ext::postgis::box3d": PostgisViewer,
};

export const extendedViewerIds = new Set(Object.keys(extendedViewerRenderers));

export interface ExtendedViewerRendererProps {
  item?: Item;
}

export function ExtendedViewerRenderer({item}: ExtendedViewerRendererProps) {
  if (item?.type === ItemType.Scalar) {
    const Renderer = extendedViewerRenderers[item.codec.getKnownTypeName()];

    if (Renderer) {
      return (
        <Suspense
          fallback={<Spinner className={styles.lazyLoading} size={20} />}
        >
          <Renderer data={(item.parent as any).data[item.index]} />
        </Suspense>
      );
    }
  }

  return (
    <div className={styles.noViewer}>
      <HeaderBar />
      <div className={styles.message}>No extended viewer for this type</div>
    </div>
  );
}
