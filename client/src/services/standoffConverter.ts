import {
  ApiJson,
  TiptapNode,
  TiptapJson,
  NodeDto,
  NodeStatusObject,
  AnnotationNode,
} from '../models/types';
import { useGuidelinesStore } from '../store/guidelines';

const { BUILTIN_STRUCTURAL_TYPES_SET, getStructuralAnnotationConfigs, isZeroPoint } =
  useGuidelinesStore();

type Anno = NodeStatusObject<AnnotationNode>;

type StructureNode = {
  node: [type: string, startIndex: number, endIndex: number];
  children: StructureNode[];
};

export default class StandoffConverter {
  // Built-in structural annotations (paragraph, heading, table, …) — form the TipTap tree.
  private structuralAnnotations: Map<string, Anno> = new Map();
  // Custom structural annotations (closer, address, addrLine, …) — attached as _semanticBlocks
  // Semantic blocks on the built-in nodes that contain them (e.g. closer, div, ...), never form tree nodes.
  private semanticBlockAnnotations: Map<string, Anno> = new Map();
  // Content annotations (person, place, …) — rendered as decorations.
  private inlineAnnotations: Map<string, Anno> = new Map();

  private standoffJson: ApiJson;
  private tiptapJson: TiptapJson | null = null;
  private structuralAnnotationTypes: Set<string>;
  private usedUuids: Set<string> = new Set();

  // Leaf block types: always produce inline content, never recurse into structural children.
  private static readonly LEAF_BLOCK_TYPES = new Set(['paragraph', 'heading']);

  // Types that are always handled inline and must never appear as block children.
  private static readonly EXCLUDED_FROM_BLOCK_CHILDREN = new Set(['hardBreak']);

  constructor(newStandoffJson: ApiJson) {
    this.standoffJson = newStandoffJson;
    this.structuralAnnotationTypes = new Set(getStructuralAnnotationConfigs().map(c => c.type));

    this.convertStandoffToTipTap();
  }

  public getData(): {
    annotations: Map<string, Anno>;
    structuralAnnotations: Map<string, Anno>;
    tipTapJson: TiptapJson;
  } {
    // Merge built-in structural + label annotations so the annotation panel can display and
    // edit all structural annotations regardless of whether they form tree nodes or labels.
    const allStructural = new Map<string, Anno>([
      ...this.structuralAnnotations,
      ...this.semanticBlockAnnotations,
    ]);

    return {
      annotations: this.inlineAnnotations,
      structuralAnnotations: allStructural,
      tipTapJson: this.tiptapJson as TiptapJson,
    };
  }

  private createNodeStatusObjectFromRawData(rawNode: NodeDto): Anno {
    return {
      node: rawNode.node as AnnotationNode,
      connectedNodes: rawNode.connectedNodes.map(n => this.createNodeStatusObjectFromRawData(n)),
      meta: { status: 'unchanged' },
    };
  }

  private createAnnotationUuidMaps(): void {
    const statusObjects: Anno[] = this.standoffJson.annotations.map(a =>
      this.createNodeStatusObjectFromRawData(a),
    );

    for (const a of statusObjects) {
      const type = a.node.data.type;
      if (BUILTIN_STRUCTURAL_TYPES_SET.has(type)) {
        this.structuralAnnotations.set(a.node.data.uuid, a);
      } else if (this.structuralAnnotationTypes.has(type)) {
        // Custom structural (isBlock:true, not a built-in) → label
        this.semanticBlockAnnotations.set(a.node.data.uuid, a);
      } else {
        this.inlineAnnotations.set(a.node.data.uuid, a);
      }
    }
  }

  // Returns the `contains` list for the given type if non-empty, or null otherwise.
  // Null means "no filter" — the node either has no declared children or is a leaf.
  private getContainsList(type: string): string[] | null {
    const config = getStructuralAnnotationConfigs().find(c => c.type === type);
    const list = config?.contains;

    return list && list.length > 0 ? list : null;
  }

  // Returns the immediate structural children within [startIndex, endIndex] for the parent type.
  // When the parent type has a `contains` list, only types in that list are candidates.
  // This resolves co-equal built-in ranges (e.g. tableCell and paragraph both at [40,60]):
  // tableRow.contains=['tableCell'] → only tableCell is a candidate for tableRow.
  private findDirectChildren(
    parentType: string,
    startIndex: number,
    endIndex: number,
    allStructural: Anno[],
  ): Anno[] {
    const containsList = this.getContainsList(parentType);

    const candidates = allStructural.filter(
      a =>
        !this.usedUuids.has(a.node.data.uuid) &&
        !StandoffConverter.EXCLUDED_FROM_BLOCK_CHILDREN.has(a.node.data.type) &&
        a.node.data.startIndex >= startIndex &&
        a.node.data.endIndex <= endIndex &&
        (containsList === null || containsList.includes(a.node.data.type)),
    );

    return candidates
      .filter(
        child =>
          !candidates.some(
            b =>
              b.node.data.uuid !== child.node.data.uuid &&
              b.node.data.startIndex <= child.node.data.startIndex &&
              b.node.data.endIndex >= child.node.data.endIndex,
          ),
      )
      .sort((a, b) => a.node.data.startIndex - b.node.data.startIndex);
  }

  private createTextNode(startIndex: number, endIndex: number): TiptapNode[] {
    const text: string = this.standoffJson.text.slice(startIndex, endIndex + 1);
    return text ? [{ type: 'text', text }] : [];
  }

  // Builds the inline content of a leaf structural node, interleaving text with
  // zero-point atom nodes and hard breaks, all sorted by position.
  private createLeafContent(startIndex: number, endIndex: number): TiptapNode[] {
    type InlineEntry = { pos: number; node: TiptapNode };

    const inRange = (a: Anno) =>
      a.node.data.startIndex >= startIndex && a.node.data.startIndex <= endIndex;

    const zeroPointEntries: InlineEntry[] = [...this.inlineAnnotations.values()]
      .filter(a => isZeroPoint(a.node) && inRange(a))
      .map(a => ({
        pos: a.node.data.startIndex,
        node: {
          type: 'zeroPointAnnotation',
          attrs: { uuid: a.node.data.uuid, annotationData: a.node, type: a.node.data.type },
        },
      }));

    const hardBreakEntries: InlineEntry[] = [...this.structuralAnnotations.values()]
      .filter(a => a.node.data.type === 'hardBreak' && inRange(a))
      .map(a => ({
        pos: a.node.data.startIndex,
        node: {
          type: 'hardBreak',
          attrs: {
            uuid: a.node.data.uuid,
            _annotationData: { ...a.node.data },
          },
        },
      }));

    const inlineNodes = [...zeroPointEntries, ...hardBreakEntries].sort((a, b) => a.pos - b.pos);

    if (inlineNodes.length === 0) {
      return this.createTextNode(startIndex, endIndex);
    }

    const nodes: TiptapNode[] = [];
    let cursor = startIndex;

    for (const { pos, node } of inlineNodes) {
      if (cursor <= pos) {
        nodes.push(...this.createTextNode(cursor, pos));
      }
      nodes.push(node);
      cursor = pos + 1;
    }

    if (cursor <= endIndex) {
      nodes.push(...this.createTextNode(cursor, endIndex));
    }

    return nodes;
  }

  private hasText(startIndex: number, endIndex: number): boolean {
    return this.standoffJson.text.slice(startIndex, endIndex + 1).trim().length > 0;
  }

  private syntheticParagraph(
    startIndex: number,
    endIndex: number,
    content: TiptapNode[],
  ): TiptapNode {
    const uuid = crypto.randomUUID();
    return {
      type: 'paragraph',
      attrs: {
        uuid,
        _annotationData: { type: 'paragraph', uuid, startIndex, endIndex },
      },
      content,
    };
  }

  // Splits a gap range [gapStart, gapEnd] at label annotation boundaries so that each
  // resulting sub-range can become its own synthetic paragraph and receive the correct labels.
  // Without this, a single large synthetic paragraph would span the entire gap and no label
  // annotation (which starts mid-gap) would satisfy the "label fully contains node" filter.
  private splitGapBySemanticBlocks(
    gapStart: number,
    gapEnd: number,
  ): { start: number; end: number }[] {
    const boundaries = new Set<number>([gapStart, gapEnd + 1]);

    for (const la of this.semanticBlockAnnotations.values()) {
      const s = la.node.data.startIndex;
      const e = la.node.data.endIndex;
      if (s <= gapEnd && e >= gapStart) {
        if (s >= gapStart) boundaries.add(s);
        if (e + 1 <= gapEnd + 1) boundaries.add(e + 1);
      }
    }

    const sorted = [...boundaries].sort((a, b) => a - b);
    const result: { start: number; end: number }[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      result.push({ start: sorted[i], end: sorted[i + 1] - 1 });
    }
    return result;
  }

  private createSyntheticParagraphsForGap(gapStart: number, gapEnd: number): TiptapNode[] {
    if (gapStart > gapEnd) return [];
    const nodes: TiptapNode[] = [];
    for (const { start, end } of this.splitGapBySemanticBlocks(gapStart, gapEnd)) {
      if (this.hasText(start, end)) {
        nodes.push(this.syntheticParagraph(start, end, this.createLeafContent(start, end)));
      }
    }
    return nodes;
  }

  private buildStructuralNode(annotation: Anno, allStructural: Anno[]): TiptapNode {
    const { startIndex, endIndex, type } = annotation.node.data;

    const attrs: Record<string, any> = {
      uuid: annotation.node.data.uuid,
      _annotationData: { ...annotation.node.data },
    };

    if (type === 'heading') attrs.level = annotation.node.data.level ?? 1;
    if (type === 'tableCell' || type === 'tableHeader') {
      attrs.colspan = annotation.node.data.colspan ?? 1;
      attrs.rowspan = annotation.node.data.rowspan ?? 1;
    }

    if (StandoffConverter.LEAF_BLOCK_TYPES.has(type)) {
      return { type, attrs, content: this.createLeafContent(startIndex, endIndex) };
    }

    const directChildren = this.findDirectChildren(type, startIndex, endIndex, allStructural);
    directChildren.forEach(c => this.usedUuids.add(c.node.data.uuid));

    const content: TiptapNode[] = [];
    let cursor: number = startIndex;

    for (const child of directChildren) {
      const gapEnd: number = child.node.data.startIndex - 1;
      if (cursor <= gapEnd) {
        content.push(...this.createSyntheticParagraphsForGap(cursor, gapEnd));
      }
      content.push(this.buildStructuralNode(child, allStructural));
      cursor = child.node.data.endIndex + 1;
    }

    if (cursor <= endIndex) {
      content.push(...this.createSyntheticParagraphsForGap(cursor, endIndex));
    }

    if (content.length === 0) {
      content.push(this.syntheticParagraph(startIndex, endIndex, []));
    }

    return { type, attrs, content };
  }

  // Finds top-level built-in structural annotations — those not contained by any other
  // built-in annotation, using `contains`-aware co-equal resolution.
  // A node is "contained by" b if b strictly wraps it, OR b is co-equal and explicitly lists
  // this node's type in its `contains` config (making this node a structural child of b).
  private findTopLevelAnnotations(allStructural: Anno[]): Anno[] {
    return allStructural
      .filter(
        a =>
          !StandoffConverter.EXCLUDED_FROM_BLOCK_CHILDREN.has(a.node.data.type) &&
          !allStructural.some(
            b =>
              b.node.data.uuid !== a.node.data.uuid &&
              b.node.data.startIndex <= a.node.data.startIndex &&
              b.node.data.endIndex >= a.node.data.endIndex &&
              (b.node.data.startIndex < a.node.data.startIndex ||
                b.node.data.endIndex > a.node.data.endIndex ||
                (this.getContainsList(b.node.data.type) ?? []).includes(a.node.data.type)),
          ),
      )
      .sort((a, b) => a.node.data.startIndex - b.node.data.startIndex);
  }

  // Post-build pass: attaches custom label annotations to every built-in tree node whose
  // range they cover. Labels are sorted outermost-first (widest range first).
  // Full annotation data including UUID is stored so the editor can look up and edit each one.
  private attachLabels(nodes: TiptapNode[]): void {
    const labelAnnos = [...this.semanticBlockAnnotations.values()];
    if (labelAnnos.length === 0) return;
    this.attachLabelsToNodes(nodes, labelAnnos);
  }

  private attachLabelsToNodes(nodes: TiptapNode[], labelAnnos: Anno[]): void {
    for (const node of nodes) {
      if (node.type === 'text') continue;
      const s = node.attrs?._annotationData?.startIndex as number | undefined;
      const e = node.attrs?._annotationData?.endIndex as number | undefined;
      if (s !== undefined && e !== undefined) {
        const labels = labelAnnos
          .filter(a => a.node.data.startIndex <= s && a.node.data.endIndex >= e)
          .sort(
            (a, b) =>
              b.node.data.endIndex -
              b.node.data.startIndex -
              (a.node.data.endIndex - a.node.data.startIndex),
          )
          .map(a => ({ uuid: a.node.data.uuid, type: a.node.data.type }));
        if (labels.length > 0) {
          node.attrs!._semanticBlocks = labels;
        }
      }
      if (node.content?.length) {
        this.attachLabelsToNodes(node.content, labelAnnos);
      }
    }
  }

  private toStructureNode(node: TiptapNode): StructureNode {
    const types = [
      node.attrs?._annotationData?.type ?? node.type,
      ...(node.attrs?._semanticBlocks ?? []).map((a: any) => a.type),
    ].join(',');
    return {
      node: [
        types,
        (node.attrs?._annotationData?.startIndex as number) ?? 0,
        (node.attrs?._annotationData?.endIndex as number) ?? 0,
      ],
      children: (node.content ?? [])
        .filter(c => c.type !== 'text')
        .map(c => this.toStructureNode(c)),
    };
  }

  public convertStandoffToTipTap(): void {
    this.createAnnotationUuidMaps();

    const allStructural: Anno[] = [...this.structuralAnnotations.values()];

    // console.log(
    //   'Structural annotations (built-ins): ',
    //   allStructural
    //     .toSorted((a, b) => a.node.data.startIndex - b.node.data.startIndex)
    //     .map(n => [n.node.data.type, n.node.data.startIndex, n.node.data.endIndex]),
    // );

    const topLevelAnnos = this.findTopLevelAnnotations(allStructural);
    topLevelAnnos.forEach(a => this.usedUuids.add(a.node.data.uuid));

    console.log(
      'Top level: ',
      topLevelAnnos.map(n => [n.node.data.type, n.node.data.startIndex, n.node.data.endIndex]),
    );

    const docContent: TiptapNode[] = [];
    let cursor = 0;

    for (const node of topLevelAnnos) {
      const gapEnd: number = node.node.data.startIndex - 1;
      if (cursor <= gapEnd) {
        docContent.push(...this.createSyntheticParagraphsForGap(cursor, gapEnd));
      }
      docContent.push(this.buildStructuralNode(node, allStructural));
      cursor = node.node.data.endIndex + 1;
    }

    const textEnd: number = this.standoffJson.text.length - 1;
    if (cursor <= textEnd) {
      docContent.push(...this.createSyntheticParagraphsForGap(cursor, textEnd));
    }

    // Attach custom structural annotations as labels on the built-in tree nodes.
    this.attachLabels(docContent);

    this.tiptapJson = { type: 'doc', content: docContent };

    // console.log(
    //   'Structure tree:',
    //   JSON.stringify(
    //     docContent.map(n => this.toStructureNode(n)),
    //     null,
    //     2,
    //   ),
    // );
  }
}
