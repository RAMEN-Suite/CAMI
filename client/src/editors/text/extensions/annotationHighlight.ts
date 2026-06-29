import { Extension } from "@tiptap/core";
import { EditorState, Plugin, PluginKey, Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view";
import { ANNOTATION_DECORATION_KEY } from "./annotationDecoration";
import { Node } from "@tiptap/pm/model";

type ToggleDirection = "on" | "off";

type HighlightOptions = {
  displayType: "range" | "zeroPoint" | "block" | "semanticBlock";
};

type HighlightMeta = {
  uuid: string;
  options: HighlightOptions;
  direction: ToggleDirection;
};

type Range = {
  from: number;
  to: number;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    annotationHighlight: {
      toggleAnnotationHighlight: (direction: ToggleDirection, uuid: string, options: HighlightOptions) => ReturnType;
    };
  }
}

export const ANNOTATION_HIGHLIGHT_KEY = new PluginKey("annotationHighlight");

/**
 * Builds the decoration set used to highlight the annotation with the given uuid.
 *
 * Currently consists of only one decoration, but might change if semantic blocks/building blocks are implemented.
 *
 * @param {EditorState} editorState The editor state to read the document and decorations from
 * @param {string} uuid The uuid of the annotation to highlight
 * @param {HighlightOptions} options The highlight options
 * @returns {DecorationSet} The decoration set for the annotation, or an empty set if it cannot be built
 */
function buildDecorationSet(editorState: EditorState, uuid: string, options: HighlightOptions): DecorationSet {
  if (!options) {
    return DecorationSet.empty;
  }

  const doc: Node = editorState.doc;
  const displayType = options.displayType;

  let range: Range | null = null;

  if (displayType === "range") {
    range = findDecorationBoundariesByUuid(uuid, editorState);
  } else if (displayType === "zeroPoint") {
    range = findNodeBoundariesByUuid(editorState.doc, uuid);
  }

  if (!range) {
    console.error(`Annotation with uuid ${uuid} not found`);

    return DecorationSet.empty;
  }

  const { from, to } = range;

  const decoration: Decoration = createDecoration(from, to);

  // TODO: Implement other display types (blocks, semantic blocks)

  return DecorationSet.create(doc, [decoration]);
}

/**
 * Creates an inline highlight decoration spanning the given range.
 *
 * @param {number} from The start position of the decoration
 * @param {number} to The end position of the decoration
 * @returns {Decoration} An inline decoration that wraps the range in a highlighted span
 */
function createDecoration(from: number, to: number): Decoration {
  return Decoration.inline(
    from,
    to,
    {
      nodeName: "span",
      class: "highlight",
    },
    { inclusiveEnd: true },
  );
}

/**
 * Finds the annotation decoration matching the given uuid and returns its range.
 *
 * If multiple decorations share the uuid, the first one's range is returned.
 *
 * @param {string} uuid The uuid of the annotation to look up
 * @param {EditorState} editorState The editor state holding the annotation decoration plugin
 * @returns {Range | null} The range of the matching decoration, or null if none is found
 */
function findDecorationBoundariesByUuid(uuid: string, editorState: EditorState): Range | null {
  const annotationDecos: Decoration[] =
    ANNOTATION_DECORATION_KEY.getState(editorState)?.all?.find(undefined, undefined, (spec: any) => spec._uuid === uuid) ?? [];

  if (annotationDecos.length === 0) {
    return null;
  }

  if (annotationDecos.length > 1) {
    // Even if multiple decorations exist, a highlight should happen. Errors should be handles somewhere else
    console.warn(
      `Multiple decorations (${annotationDecos.length}) of annotation with uuid ${uuid} found. 
      The first one found is highlighted.
      `,
    );
  }

  return {
    from: annotationDecos[0].from,
    to: annotationDecos[0].to,
  };
}

/**
 * Finds the last node carrying the given uuid attribute and returns its document range.
 *
 * @param {Node} doc The root document node to search
 * @param {string} uuid The uuid to match against each node's `uuid` attribute
 * @returns {Range | null} The from/to range of the matching node, or null if not found
 */
function findNodeBoundariesByUuid(doc: Node, uuid: string): Range | null {
  let result: Range | null = null;

  doc.descendants((node, pos) => {
    if (node.attrs.uuid === uuid) {
      result = {
        from: pos,
        to: pos + node.nodeSize,
      };
    }
  });

  return result;
}

export const AnnotationHighlight = Extension.create({
  name: "annotationHighlight",

  addCommands() {
    return {
      toggleAnnotationHighlight:
        (direction: ToggleDirection, uuid: string, options: HighlightOptions) =>
        ({ tr, dispatch }) => {
          const meta: HighlightMeta = { direction, uuid, options };

          tr.setMeta(ANNOTATION_HIGHLIGHT_KEY, meta);

          dispatch?.(tr);

          return true;
        },
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: ANNOTATION_HIGHLIGHT_KEY,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr: Transaction, pluginState, oldEditorState) {
            const meta: HighlightMeta | undefined = tr.getMeta(ANNOTATION_HIGHLIGHT_KEY);

            if (!meta) {
              return pluginState;
            }

            if (meta.direction === "off") {
              return DecorationSet.empty;
            } else {
              if (!meta.options) {
                return DecorationSet.empty;
              }

              const { uuid, options } = meta;

              return buildDecorationSet(oldEditorState, uuid, options);
            }
          },
        },
        props: {
          decorations(state): DecorationSet {
            return this.getState(state) ?? DecorationSet.empty;
          },
        },
        view() {
          return {
            update: (view: EditorView, prevState: EditorState) => {
              const prevDecos: Decoration[] = ANNOTATION_HIGHLIGHT_KEY.getState(prevState).find();
              const currDecos: Decoration[] = ANNOTATION_HIGHLIGHT_KEY.getState(view.state).find();

              // Only scroll on the off->on transition (empty -> non-empty).
              if (prevDecos.length > 0 || currDecos.length === 0) {
                return;
              }

              const domNode: Element | null = view.dom.querySelector(".highlight");

              if (!domNode) {
                console.warn("Could not find dom node to scroll into view. Maybe the class name has changed.");
                return;
              }

              domNode.scrollIntoView({ behavior: "smooth", block: "center" });
            },
          };
        },
      }),
    ];
  },
});
