import { DeepReadonly } from 'vue';
import type { BuiltinStructuralType } from '../models/types';

/**
 * Tiptap-native attribute owned by a loaded editor extension (`heading` -> `level`,
 * `tableCell` -> `colspan`/`rowspan`). Derived from the {@link EDITOR_OWNED_ATTRIBUTES} union.
 */
export type BuiltinEditorAttribute = (typeof EDITOR_OWNED_ATTRIBUTES)[number];

/**
 * Default mapping between built-in structural annotation types/attributes and their (optional) project-specific override.
 * Exists because a project might want to use names from a namespace like TEI for the built-in elements, like
 * ["p"](https://www.tei-c.org/release/doc/tei-p5-doc/en/html/ref-p.html) for paragraph annotations
 * or [`rows`](https://www.tei-c.org/release/doc/tei-p5-doc/en/html/ref-att.tableDecoration.html#tei_att.rows)
 * and [`cols`](https://www.tei-c.org/release/doc/tei-p5-doc/en/html/ref-att.tableDecoration.html#tei_att.cols)
 * as rowspan/colspan properties in tableCell annotations.
 *
 * @see {@link DEFAULT_ANNOTATION_MAPPING} for default values
 * @example
 * // Tiptap defaults as keys, project-specific overrides as values
 * typeByRole: {
 *    paragraph: 'p',
 *    hardBreak: 'lb',
 * },
 * attrByRole: {
 *    tableRow: {
 *        colspan: 'cols',
 *        rowspan: 'rows',
 *    },
 * },
 */
export type AnnotationMapping = DeepReadonly<{
  /** Mapping from built-in structural types to project-specific types
   * @example
   * { paragraph: 'p', hardBreak: 'lb' }
   */
  typeByRole: Partial<Record<BuiltinStructuralType, string>>;
  /** Mapping from built-in structural types to project-specific attributes
   * @example
   * attrByRole: {
   *    tableRow: {
   *        colspan: 'cols',
   *        rowspan: 'rows',
   *    },
   * },
   */
  attrByRole: Partial<
    Record<BuiltinStructuralType, Partial<Record<BuiltinEditorAttribute, string>>>
  >;
}>;

/**
 * Tiptap-native attributes owned by the loaded editor extensions (`heading` -> `level`,
 * `tableCell` -> `colspan`/`rowspan`). Single source of truth for both the runtime membership set and
 * the {@link BuiltinEditorAttribute} union — add a new editor-owned attribute here only.
 */
export const EDITOR_OWNED_ATTRIBUTES = ['level', 'colspan', 'rowspan'] as const;

/**
 * Default mapping between builtin structural annotations and their (optional) project-specific override
 * TODO: This should be empty, the config should be injected on app load
 */
export const DEFAULT_ANNOTATION_MAPPING: AnnotationMapping = {
  typeByRole: {
    paragraph: 'p',
    hardBreak: 'lb',
  },
  attrByRole: {
    tableRow: {
      colspan: 'cols',
      rowspan: 'rows',
    },
  },
};
