import 'vue-router';
import { CollectionNode, NodeAncestry, NodeDto } from './models/types';

declare module 'vue-router' {
  /**
   * Extended type for vue-router's `meta` field.
   */
  interface RouteMeta {
    collection?: NodeDto<CollectionNode>;
    ancestryPaths?: NodeAncestry[];
  }
}
