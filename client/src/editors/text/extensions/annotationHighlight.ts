import { Extension } from "@tiptap/core";
import { EditorState, Plugin, PluginKey, Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view";
import { ANNOTATION_DECORATION_KEY } from "./annotationDecoration";
import { Node } from "@tiptap/pm/model";
import { findDecorationBoundariesByUuid, findNodeBoundariesByUuid } from "../../../utils/helper/tiptapHelper";
import { Range } from "../../../models/types";

type ToggleDirection = "on" | "off";

interface HighlightOptions {
  displayType: "range" | "zeroPoint" | "block" | "semanticBlock";
}

interface HighlightMeta {
  uuid: string;
  options: HighlightOptions;
  direction: ToggleDirection;
}

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
    const decorationSet: DecorationSet | undefined = ANNOTATION_DECORATION_KEY.getState(editorState)?.all;

    if (!decorationSet) {
      return DecorationSet.empty;
    }

    range = findDecorationBoundariesByUuid(decorationSet, uuid);
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
