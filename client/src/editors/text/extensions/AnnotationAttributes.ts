import { Attribute, Extension, GlobalAttributes } from '@tiptap/vue-3';
import { getDefaultValueForProperty } from '../../../utils/helper/helper';
import { Annotation, AnnotationType, PropertyConfig } from '../../../models/types';
import { useGuidelinesStore } from '../../../store/guidelines';
import { Node } from '@tiptap/pm/model';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    annotationAttributes: {
      addSemanticBlockLabel: (annotation: Annotation, from: number, to: number) => ReturnType;
      removeSemanticBlock: (uuid: string) => ReturnType;
    };
  }
}

const { BUILTIN_STRUCTURAL_TYPES_SET, structuralAnnotationConfigs } = useGuidelinesStore();

// Returns {_annotationData, _semanticBlocks } attributes.
// _annotationData: full neo4j round-trip payload; default = { type } for built-ins, null for customBlock.
// _semanticBlocks: custom structural annotations (closer, address, …) that wrap this node's range,
//  stored as an array of full annotation data objects sorted outermost-first. null when none.
function createDefaultAttrs(defaultType: string | null): Record<string, Attribute> {
  return {
    _annotationData: {
      default: defaultType !== null ? { type: defaultType } : null,
      rendered: false,
    },
    _semanticBlocks: {
      default: [],
      renderHTML: attributes => {
        return {
          'data-semantic-block-types': attributes._semanticBlocks
            .map((b: { uuid: string; type: string }) => b.type)
            .join(','),
        };
      },
    },
  };
}

/**
 * Add per-type specific properties.
 *
 * @param config Configuration of the the annotation type
 * @returns
 */
function createCustomAttributes(config: AnnotationType): Record<string, Attribute> {
  let nodeAttrs: Record<string, Attribute> = {};

  const configuredFields: PropertyConfig[] = config?.properties ?? [];

  configuredFields.forEach((field: PropertyConfig) => {
    const defaultValue: any =
      field.required === true ? getDefaultValueForProperty(field.type) : null;

    const htmlDataKey: string = `data-${[field.name]}`;

    nodeAttrs[field.name] = {
      default: defaultValue,
      parseHTML: (el: HTMLElement) => el.getAttribute(field.name),
      renderHTML: (attrs: Record<string, any>) => ({ [htmlDataKey]: attrs[field.name] }),
    };
  });

  return nodeAttrs;
}

/**
 * On every doc change, the node type from the tiptap node must be transferred to `_annotationData.type`
 * since these are the actual neo4j node data. Is done on save too, but for ToC etc. this is useful.
 *
 * @param {Node} doc - The doc root
 */
function transferTiptapTypeToAnnotationType(doc: Node): void {
  doc.forEach(node => {
    if (node.isBlock && BUILTIN_STRUCTURAL_TYPES_SET.has(node.type.name)) {
      node.attrs._annotationData.type = node.type.name;
    }
  });
}

/**
 * Adds `_annotationData`, `_semanticBlocks` and per-property attributes to all structural node types.
 *
 * Their per-property data lives in `_annotationData`;
 * Built-in types (paragraph, heading, ...) use their own tiptap node type name and get
 * per-property attributes from the guidelines config so freshly created nodes are usable without a neo4j round-trip.
 *
 * Custom block/structural types (address, addrLine, closer, ...) live in the structural annotations store whose
 * uuid and type properties are derived to the tiptap node here
 */
export const AnnotationAttributes = Extension.create({
  name: 'annotationAttributes',

  onUpdate({ editor }) {
    transferTiptapTypeToAnnotationType(editor.state.doc);
  },
  addGlobalAttributes() {
    const builtinAttrs: GlobalAttributes = structuralAnnotationConfigs.value.map(
      (config: AnnotationType) => {
        const defaultAttrs: Record<string, Attribute> = createDefaultAttrs(config.type);
        const customAttrs: Record<string, Attribute> = createCustomAttributes(config);

        return {
          types: [config.editorRole ?? config.type],
          attributes: { ...defaultAttrs, ...customAttrs },
        };
      },
    );

    return [...builtinAttrs];
  },

  addCommands() {
    return {
      addSemanticBlockLabel:
        (newAnnotation: Annotation, from: number, to: number) =>
        ({ tr, dispatch }) => {
          tr.doc.nodesBetween(from, to, (node, pos) => {
            if (node.type.isText) {
              return;
            }

            const existing: { uuid: string; type: string }[] = node.attrs._semanticBlocks ?? [];
            const { uuid, type } = newAnnotation.node.data;
            const updated: { uuid: string; type: string }[] = [...existing, { uuid, type }];

            tr.setNodeAttribute(pos, '_semanticBlocks', updated);
          });

          dispatch?.(tr);

          return true;
        },
      removeSemanticBlock:
        (uuid: string) =>
        ({ tr, dispatch }) => {
          tr.doc.descendants((node, pos) => {
            if (node.type.isText) {
              return;
            }

            const existing: { uuid: string; type: string }[] = node.attrs._semanticBlocks ?? [];

            if (!existing.some(b => b.uuid === uuid)) {
              return;
            }

            // Do NOT set status to 'deleted' - this is determined during save preprocessing
            // when checked what annotations are in the document
            // annoEntry.meta.status = 'deleted';

            // Remove semantic block from node's `_semanticBlocks` array
            tr.setNodeAttribute(
              pos,
              '_semanticBlocks',
              existing.filter(b => b.uuid !== uuid),
            );
          });

          dispatch?.(tr);

          return true;
        },
    };
  },
});
