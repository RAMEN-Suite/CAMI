import { TreeNode } from 'primevue/treenode';
import { IAnnotation } from './IAnnotation';
import ICharacter from './ICharacter';
import { ICollection } from './ICollection';
import { IEntity } from './IEntity';
import { IText } from './IText';
import type { BuiltinEditorAttribute } from '../config/editor';
import type { AnnotationMapping } from '../config/editor';

export type AdditionalText = {
  annotation: IAnnotation;
  text: TextNode;
};

/** A status object for nodes in the frontend and for API requests */
export type NodeStatusObject<
  T extends Node<BaseNodeData> = AnnotationNode | EntityNode | CollectionNode | TextNode,
> = {
  node: T;
  connectedNodes: NodeStatusObject<T>[];
  meta: {
    status: NodeStatus;
    [key: string]: unknown;
  };
};

/**
 * A status field for nodes in the frontend and for API requests. Is accessed during editing
 * (to display the current edit state) and before saving to tell the backend how to process the data.
 */
export type NodeStatus = 'added' | 'removed' | 'created' | 'deleted' | 'modified' | 'unchanged';

export type Annotation = NodeStatusObject<AnnotationNode>;

export type AnnotationNode = Node<IAnnotation>;

/** A node object for retrieving data */
export type NodeDto<
  T extends Node<BaseNodeData> = AnnotationNode | EntityNode | CollectionNode | TextNode,
> = {
  node: T;
  connectedNodes: NodeDto[];
};

export interface AnnotationData {
  additionalTexts: AdditionalText[];
  entities: EntityNode[];
  properties: IAnnotation;
}

export type AnnotationType = {
  category: string; // CAMI
  defaultSelected: boolean; // CAMI
  isZeroPoint?: boolean; // CAMI and NORI
  hasAdditionalTexts?: boolean; // Derived from NORI
  hasEntities?: boolean; // Derived from NORI
  entityNodes?: string[]; // Derived from NORI
  properties?: PropertyConfig[]; // NORI
  shortcut: string[]; // CAMI
  text: string; // CAMI
  type: string; // NORI -> discriminator, also property there
  isBlock?: boolean; // CAMI
  contains?: string[]; // CAMI -> only for builtin structural elements
  topLevel?: boolean; // CAMI -> deprecated, but keep for now
  priority?: number; // CAMI
};

export type AnnotationReference = {
  isFirstCharacter: boolean;
  isLastCharacter: boolean;
  subType: string | null;
  type: string;
  uuid: string;
};

export type AnnotationConfigEntity = {
  category: string;
  nodeLabel: string;
};

export type ApiJson = {
  text: string;
  annotations: NodeDto[];
};

export type BuiltinStructuralType =
  | 'paragraph'
  | 'heading'
  | 'hardBreak'
  | 'table'
  | 'tableRow'
  | 'tableCell'
  | 'tableHeader'
  | 'bulletList'
  | 'listItem';

// Editor-framework facts live in `config/editor` (imported above). Re-exported here for convenience
// so existing model-type importers keep working.
export type { BuiltinEditorAttribute };
export type { AnnotationMapping };

export type TiptapMark = {
  type: string;
  attrs: Record<string, any>;
};

export type AllowedTiptapNodeTypes = string;

export type TiptapNode = {
  type: AllowedTiptapNodeTypes;
  attrs?: Record<string, any>;
  content?: TiptapNode[];
  marks?: TiptapMark[];
  text?: string;
};

export type TiptapJson = TiptapNode;

export type BaseNodeData = {
  uuid: string;
};

/** Base node labels in RAMEN */
export type BaseNodeLabel = 'Annotation' | 'Character' | 'Collection' | 'Entity' | 'Content';

export type Bookmark = {
  data: CollectionNode | TextNode;
  type: 'collection' | 'text';
  createdAt: string; // ISO 8601 string
  updatedAt: string; // ISO 8601 string
};

export type Character = {
  data: ICharacter;
  annotations: AnnotationReference[];
};

export type CharacterPostData = {
  characters: ICharacter[];
  text: string;
  textUuid: string;
  uuidEnd: string;
  uuidStart: string;
};

export type CollectionNode = Node<ICollection>;

export type CollectionAccessObject = {
  annotations: NodeDto<AnnotationNode>[];
  collection: NodeDto<CollectionNode>;
  texts: NodeDto<TextNode>[];
};

export type CollectionAccessStatusObject = {
  collection: NodeStatusObject<CollectionNode>;
  texts: NodeStatusObject<TextNode>[];
  annotations: NodeStatusObject[];
};

export type CollectionCreationData = CollectionAccessObject & {
  parentCollection: CollectionNode | null;
};

export type CollectionNetworkActionType = 'move' | 'reference' | 'dereference' | 'delete';

export type CollectionPostData = {
  data: CollectionAccessObject;
  initialData: CollectionAccessObject;
};

export type CollectionPreview = {
  collection: CollectionNode;
  nodeCounts: {
    annotations: number;
    texts: number;
    collections: number;
  };
};

export type EditorSettings = {
  blockDecorations: {
    outline: boolean;
    baseType: boolean;
    semanticTypes: boolean;
  };
};

export type NodeSearchParams = {
  searchInput?: string;
  nodeLabels?: string[];
  offset?: number;
  rowCount?: number;
  sortDirection?: 'asc' | 'desc';
};

export type EntityNode = Node<IEntity>;

export type HistoryStack = HistoryRecord[];

export type HistoryRecord = {
  caretPosition: string | null;
  timestamp: Date;
  data: {
    afterEndCharacter: Character | null;
    annotations: Annotation[];
    beforeStartCharacter: Character | null;
    characters: Character[];
  };
};

export type IndexMap = Map<string, { startIndex: number; endIndex: number }>;

export type ColumnEntry = {
  data: NodeDto<CollectionNode>;
  status: 'existing' | 'temporary';
};

export type Level = {
  collections: ColumnEntry[];
  activeCollection: NodeDto<CollectionNode> | null;
  parentUuid: string | null;
};

export type MalformedAnnotation = {
  reason: 'indexOutOfBounds' | 'unconfiguredType';
  data: StandoffAnnotation;
};

export type NetworkPostData = {
  type: CollectionNetworkActionType;
  nodes: (CollectionNode | TextNode)[];
  origin: CollectionNode | null;
  target: CollectionNode | null;
};

export type Node<T = AnnotationNode | CollectionNode | EntityNode | TextNode> = {
  data: T;
  nodeLabels: string[];
};

export type NodeAncestry = NodeDto<CollectionNode>[];

export type PaginationData = {
  limit: number;
  offset?: number | null;
  order: string;
  search: string;
  totalRecords: number;
  nextCursor?: CursorData | null;
};

export type CursorData = {
  label: string;
  uuid: string;
};

export type PaginationResult<T> = {
  data: T;
  pagination: PaginationData;
};

export type PropertyConfig = {
  /** folioEnd, label, websiteUrl */
  name: string; // CAMI -> name to display. Or remove kompletely, type is type
  /** data type (raw string, dropdown, multiple options) */
  type: PropertyConfigDataType; // NORI
  /** required or optional */
  required: boolean; // NORI
  /** Editable by user */
  editable: boolean; // CAMI
  /** Visible by user */
  visible: boolean; // CAMI;
  /** Render as normal input or textarea? */
  template?: PropertyConfigStringTemplate; // CAMI;
  // The rest here is cami
  /* Only relevant if type is "array" */
  items?: Partial<PropertyConfig>;
  minItems?: number;
  maxItems?: number;
  /* Only relevant if type is "number"/"integer" */
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  /* Only relevant if type is "string" */
  minLength?: number;
  maxLength?: number;
  options?: string[] | number[] /* Options if type is dropdown */;
};

export type PropertyConfigDataType =
  | 'array'
  | 'boolean'
  | 'date'
  | 'date-time'
  | 'integer'
  | 'number'
  | 'string'
  | 'time';

export type PropertyConfigStringTemplate = 'input' | 'textarea';

export type RedrawModeOptions = {
  direction: 'on' | 'off';
  cause?: 'success' | 'cancel';
  annotationUuid?: string;
};

export type StandoffAnnotation = {
  [key: string]: any;
  startIndex: number;
  endIndex: number;
  text: string;
  type: string;
  subType?: string | number;
};

export type StandoffJson = {
  annotations: StandoffAnnotation[];
  text: string;
};

export type TextNode = Node<IText>;
// TODO: Remove TextNode (or remove IText) -> ContentNode will be default
export type ContentNode = Node<IText>;

export type TextAccessObject = {
  collection: CollectionNode | null;
  paths: NodeAncestry[];
  text: TextNode;
};

/**
 * Type for updating text + annotations.
 */
export type TextUpdateDto = {
  text: NodeStatusObject<TextNode>;
  annotations: Annotation[];
};

export type TextOperationResult = {
  leftBoundary?: string | null;
  rightBoundary?: string | null;
  changeSet?: Character[];
};

export type ToCItem = TreeNode & {
  data: {
    nodeSize: number;
    nodeType: string;
    /** Canonical (project-configured) annotation type, derived from the live node, not _annotationData. */
    type: string;
    /** Heading level when the node is a heading; read from the live native attr. */
    level?: number;
    pos: number;
    text: string;
    _annotationData: Record<string, any>;
    _semanticBlocks: { uuid: string; annotationType: string }[] | null;
  };
  children: ToCItem[];
};
