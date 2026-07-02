import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Range } from "../../models/types";
import { Node } from "@tiptap/pm/model";

/**
 * Finds the annotation decoration matching the given uuid from the given decoration set and returns its range.
 *
 * If multiple decorations share the uuid, the first one's range is returned.
 *
 * @param {DecorationSet} decorationSet The decoration set to search
 * @param {string} uuid The uuid of the annotation to look up
 * @returns {Range | null} The range of the matching decoration, or null if none is found
 */
export function findDecorationBoundariesByUuid(decorationSet: DecorationSet, uuid: string): Range | null {
  const annotationDecos: Decoration[] = decorationSet.find(undefined, undefined, (spec: any) => spec._uuid === uuid) ?? [];

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
export function findNodeBoundariesByUuid(doc: Node, uuid: string): Range | null {
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

/**
 * Finds all semantic blocks carrying the given uuid and returns their combined document range.
 *
 * Scans the document tree for nodes containing the uuid in their `_semanticBlocks` attribute,
 * accumulating the range from the first matching block to the last.
 *
 * @param {Node} doc The root document node to search
 * @param {string} uuid The uuid to match within each node's `_semanticBlocks` array
 * @returns {Range | null} The from/to range spanning all matching blocks, or null if none found
 */
export function findSemanticBlockBoundariesByUuid(doc: Node, uuid: string): Range | null {
  let result: Range | null = null;

  doc.descendants((node, pos) => {
    // TODO: Hardcoded because of assignment mistake in standoff converter
    // (hardBreaks should not get a semanticBlocks attr since they are zero point annotations)
    if (node.type.name === "hardBreak") {
      return;
    }

    const semanticBlocks: { type: string; uuid: string }[] = node.attrs._semanticBlocks ?? [];

    const found: { type: string; uuid: string } | undefined = semanticBlocks.find((block) => block.uuid === uuid);

    if (found) {
      if (result) {
        result.to = pos + (node.nodeSize - 1);
      } else {
        result = {
          from: pos,
          to: pos + (node.nodeSize - 1),
        };
      }
    }
  });

  return result;
}
