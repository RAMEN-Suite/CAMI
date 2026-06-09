import { Attribute, Extension, GlobalAttributes } from '@tiptap/vue-3';
import { getDefaultValueForProperty } from '../../../utils/helper/helper';
import { Annotation, AnnotationType, PropertyConfig } from '../../../models/types';
import { useGuidelinesStore } from '../../../store/guidelines';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    annotationAttributes: {
      addSemanticBlockLabel: (annotation: Annotation, from: number, to: number) => ReturnType;
    };
  }
}

const { structuralAnnotationConfigs } = useGuidelinesStore();

// Built-in structural tiptap node types. For these, the tiptap node type name == the neo4j type.
// Custom types all use 'customBlock' as tiptap nodeType regardless of their neo4j type name.
const BUILTIN_STRUCTURAL_NODE_TYPES = [
  'paragraph',
  'heading',
  'hardBreak',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
  'bulletList',
  'listItem',
] as const;

type BuiltinNodeType = (typeof BUILTIN_STRUCTURAL_NODE_TYPES)[number];

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
          'data-semantic-block-types': attributes._semanticBlocks.map(b => b.type).join(','),
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

  addGlobalAttributes() {
    const builtinAttrs: GlobalAttributes = BUILTIN_STRUCTURAL_NODE_TYPES.map(typeName => {
      const config = structuralAnnotationConfigs.value.find(
        (c: AnnotationType) => c.type === typeName,
      );

      return {
        types: [typeName as BuiltinNodeType],
        attributes: {
          ...(config ? createCustomAttributes(config) : {}),
          ...createDefaultAttrs(typeName),
        },
      };
    });

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
    };
  },
});
