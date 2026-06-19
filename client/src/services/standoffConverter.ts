import {
  ApiJson,
  TiptapNode,
  TiptapJson,
  NodeDto,
  NodeStatusObject,
  AnnotationNode,
} from '../models/types';
import { useGuidelinesStore } from '../store/guidelines';

type Anno = NodeStatusObject<AnnotationNode>;

/** Helper for text ranges, used during creation of gap paragraphs when indices are orphaned
 * (not part of any block annotation)
 */
type Range = { start: number; end: number };

const {
  getStructuralAnnotationConfigs,
  isZeroPoint,
  getEditorRole,
  getTypeByEditorRole,
  getPriorityForType,
  isBuiltinStructuralType,
} = useGuidelinesStore();

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

  /** Leaf block types: always produce inline content, never recurse into structural children.*/
  private static readonly LEAF_BLOCK_TYPES = new Set(['paragraph', 'heading']);

  // Types that are always handled inline and must never appear as block children.
  private static readonly EXCLUDED_FROM_BLOCK_CHILDREN = new Set(['hardBreak']);

  constructor(newStandoffJson: ApiJson) {
    console.log('standoff json: ', newStandoffJson);
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

  /**
   * Sets up the stores for the different annotation categories (structural, inline, semantic block). These stores are used for all
   * the subsequent parsing steps and will be exported to the editor when the document is ready.
   *
   * @returns {void} - This function does not return a value. All the data are set directly into the variables.
   */
  private createAnnotationUuidMaps(): void {
    const statusObjects: Anno[] = this.standoffJson.annotations.map(a =>
      this.createNodeStatusObjectFromRawData(a),
    );

    console.log(
      statusObjects
        .filter(a1 => isBuiltinStructuralType(a1.node.data.type))
        .toSorted((a, b) => {
          if (a.node.data.startIndex === b.node.data.startIndex) {
            return b.node.data.endIndex - a.node.data.endIndex;
          } else {
            return a.node.data.startIndex - b.node.data.startIndex;
          }
        })
        .map(a => {
          const { startIndex, endIndex, type } = a.node.data;

          return [startIndex, endIndex, type];
        }),
    );

    for (const a of statusObjects) {
      const type: string = a.node.data.type;

      if (isBuiltinStructuralType(type)) {
        // True structural (either tiptap name or mapped custom annotation)
        this.structuralAnnotations.set(a.node.data.uuid, a);
      } else if (this.structuralAnnotationTypes.has(type)) {
        // Custom structural (isBlock:true, not a built-in) -> semantic label on building block
        this.semanticBlockAnnotations.set(a.node.data.uuid, a);
      } else {
        // Just a normal range annotation
        this.inlineAnnotations.set(a.node.data.uuid, a);
      }

      // if (type === 'lb') {
      //   this.structuralAnnotations.set(a.node.data.uuid, a);
      // }

      // if (!this.structuralAnnotationTypes.has(type)) {
      //   this.inlineAnnotations.set(a.node.data.uuid, a);
      // }
    }
  }

  // Returns the `contains` list for the given type if non-empty, or null otherwise.
  // Null means "no filter" — the node either has no declared children or is a leaf.
  private getContainsList(type: string): string[] | null {
    const config = getStructuralAnnotationConfigs().find(c => c.type === type);
    const list = config?.contains;

    return list && list.length > 0 ? list : null;
  }

  // Strict, acyclic "ancestor candidate" relation: returns true when `outer` should wrap `inner`
  // in the tree. For ranges of different size the larger wraps the smaller. For CO-EQUAL ranges
  // (e.g. a single-item list where bulletList, listItem and paragraph all share [29,33]) a symmetric
  // `contains`-based test would make each "contain" the other and drop all of them, so we instead
  // break ties deterministically: lower `priority` number wins (outer container types have lower
  // priority, e.g. bulletList 40 < listItem 50 < paragraph 80), then uuid as a final tiebreak so
  // identical-range duplicates resolve to exactly one survivor instead of mutually annihilating.

  /**
   * Co-equal ranges (e.g. a single-item list: `bulletList`/`listItem`/`paragraph` all sharing
   * `startIndex` and `endIndex`) are resolved deterministically by `contains`, so the outermost type survives as the
   * top-level node and the rest become its descendants instead of all being dropped.
   *
   * @param outer
   * @param inner
   * @returns
   */
  private contains(outer: Anno, inner: Anno): boolean {
    if (outer.node.data.uuid === inner.node.data.uuid) {
      return false;
    }

    const outerStart: number = outer.node.data.startIndex;
    const outerEnd: number = outer.node.data.endIndex;
    const innerStart: number = inner.node.data.startIndex;
    const innerEnd: number = inner.node.data.endIndex;

    // `outer` must cover `inner`.
    if (outerStart > innerStart || outerEnd < innerEnd) {
      return false;
    }

    // Strictly larger range -> unambiguously the ancestor.
    if (outerStart < innerStart || outerEnd > innerEnd) {
      return true;
    }

    // Co-equal range: order by priority (lower = more outer), then uuid for a stable strict order.
    const outerPrio: number = getPriorityForType(outer.node.data.type);
    const innerPrio: number = getPriorityForType(inner.node.data.type);

    if (outerPrio !== innerPrio) {
      return outerPrio < innerPrio;
    }

    return outer.node.data.uuid < inner.node.data.uuid;
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
        !StandoffConverter.EXCLUDED_FROM_BLOCK_CHILDREN.has(getEditorRole(a.node.data.type)) &&
        a.node.data.startIndex >= startIndex &&
        a.node.data.endIndex <= endIndex &&
        (containsList === null || containsList.includes(getEditorRole(a.node.data.type))),
    );

    return candidates
      .filter(child => !candidates.some(b => this.contains(b, child)))
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
      .filter(a => getEditorRole(a.node.data.type) === 'hardBreak' && inRange(a))
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
    const uuid: string = crypto.randomUUID();
    const paragraphType = getTypeByEditorRole('paragraph');
    return {
      type: 'paragraph',
      attrs: {
        uuid,
        _annotationData: { type: paragraphType, uuid, startIndex, endIndex },
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

  // Whether the given (built-in) container type may hold a `paragraph` as a direct child.
  // Drives gap handling: containers like listItem/tableCell accept synthetic paragraphs,
  // while tableRow/table/bulletList do NOT (their content is restricted to cells/rows/items),
  // so orphan gap text inside them must be clamped into an adjacent child instead.
  private parentAllowsParagraph(parentType: string): boolean {
    const containsList = this.getContainsList(parentType);

    // No declared children → treated as permissive (leaf types never reach gap-filling anyway).
    if (containsList === null) {
      return true;
    }

    return containsList.includes('paragraph');
  }

  /**
   * Emits paragraphs for a gap into `content`, preserving EVERY character of [gapStart, gapEnd].
   * The gap is split at semantic-block boundaries so each text run becomes its own paragraph and
   * receives the correct semantic labels. Used only when the parent accepts paragraphs.
   *
   * @param content
   * @param gapStart
   * @param gapEnd
   * @returns
   */
  private appendGapParagraphs(content: TiptapNode[], gapStart: number, gapEnd: number): void {
    if (gapStart > gapEnd) {
      return;
    }

    const subRanges: Range[] = this.splitGapBySemanticBlocks(gapStart, gapEnd);

    let leadingBuffer: Range[] = [];
    let lastParagraph: TiptapNode | null = null;

    for (const { start, end } of subRanges) {
      // TODO: Why the white-space check?
      if (!this.hasText(start, end)) {
        // Whitespace-only run: merge into the previous paragraph, or buffer it for the next one.
        if (lastParagraph) {
          this.clampTextIntoNode(lastParagraph, start, end, 'append');
        } else {
          leadingBuffer.push({ start, end });
        }

        continue;
      }

      const paragraph: TiptapNode = this.syntheticParagraph(
        start,
        end,
        this.createLeafContent(start, end),
      );

      // Flush buffered leading whitespace into the front of this paragraph (ascending order).
      for (let i = leadingBuffer.length - 1; i >= 0; i--) {
        this.clampTextIntoNode(paragraph, leadingBuffer[i].start, leadingBuffer[i].end, 'prepend');
      }
      leadingBuffer = [];

      content.push(paragraph);
      lastParagraph = paragraph;
    }

    // The gap held no real text at all (e.g. inter-block whitespace).
    if (leadingBuffer.length > 0) {
      if (content.length > 0) {
        // Attach to the previous sibling block already in `content`.
        const prev: TiptapNode = content[content.length - 1];

        for (const ws of leadingBuffer) {
          this.clampTextIntoNode(prev, ws.start, ws.end, 'append');
        }
      } else {
        // Leading whitespace at the very start with no siblings: keep it in its own paragraph.
        const first: Range = leadingBuffer[0];
        const last: Range = leadingBuffer[leadingBuffer.length - 1];

        content.push(
          this.syntheticParagraph(
            first.start,
            last.end,
            this.createLeafContent(first.start, last.end),
          ),
        );
      }
    }
  }

  // Places the text+atoms of [start, end] into a single existing block node, descending into the
  // deepest text-accepting leaf (e.g. into a tableCell's last/first paragraph). Updates the
  // `_annotationData` range of every node on the path so index maps stay consistent.
  // `mode` controls whether the content is appended (end of block) or prepended (start of block).
  private clampTextIntoNode(
    node: TiptapNode,
    start: number,
    end: number,
    mode: 'append' | 'prepend' = 'append',
  ): void {
    if (start > end) {
      return;
    }

    if (node.attrs?._annotationData) {
      const data = node.attrs._annotationData;

      if (mode === 'append') {
        data.endIndex = Math.max(data.endIndex ?? end, end);
      } else {
        data.startIndex = Math.min(data.startIndex ?? start, start);
      }
    }

    const leaf = this.createLeafContent(start, end);

    // Leaf block (paragraph/heading): the text lives here directly.
    if (this.isLeafContainer(node.type)) {
      node.content = node.content ?? [];

      if (mode === 'append') {
        node.content.push(...leaf);
      } else {
        node.content.unshift(...leaf);
      }

      return;
    }

    // Container: descend into the appropriate block child.
    const blockChildren = (node.content ?? []).filter(
      c => c.type !== 'text' && c.type !== 'hardBreak' && c.type !== 'zeroPointAnnotation',
    );

    if (blockChildren.length === 0) {
      // Nothing to descend into (degenerate). Attach directly as a last resort.
      node.content = node.content ?? [];

      if (mode === 'append') {
        node.content.push(...leaf);
      } else {
        node.content.unshift(...leaf);
      }

      return;
    }

    const target = mode === 'append' ? blockChildren[blockChildren.length - 1] : blockChildren[0];

    this.clampTextIntoNode(target, start, end, mode);
  }

  private warnClamp(
    start: number,
    end: number,
    parentType: string,
    where: 'previous' | 'next',
  ): void {
    console.warn(
      `[standoffConverter] Clamped orphan gap [${start},${end}] into the ${where} child of ` +
        `<${parentType}>. This text belongs to no structural child — likely incorrect source ` +
        `indices in the imported data. (Candidate for a future refactor.)`,
    );
  }

  private buildStructuralNode(annotation: Anno, allStructural: Anno[]): TiptapNode {
    const { startIndex, endIndex, type } = annotation.node.data;
    const tiptapType: string = getEditorRole(type);

    const attrs: Record<string, any> = {
      uuid: annotation.node.data.uuid,
      _annotationData: { ...annotation.node.data },
    };

    if (tiptapType === 'heading') {
      attrs.level = annotation.node.data.level ?? 1;
    }

    if (tiptapType === 'tableCell' || tiptapType === 'tableHeader') {
      attrs.colspan = annotation.node.data.colspan ?? 1;
      attrs.rowspan = annotation.node.data.rowspan ?? 1;
    }

    // Is heading or paragraph -> can only hold text
    if (this.isLeafContainer(tiptapType)) {
      return { type: tiptapType, attrs, content: this.createLeafContent(startIndex, endIndex) };
    }

    const directChildren: Anno[] = this.findDirectChildren(
      type,
      startIndex,
      endIndex,
      allStructural,
    );

    directChildren.forEach(c => this.usedUuids.add(c.node.data.uuid));

    // Does this container accept paragraphs directly? If not (tableRow, table, bulletList), gap
    // text cannot become a synthetic paragraph and must be clamped into an adjacent child.
    const allowsParagraph: boolean = this.parentAllowsParagraph(type);

    const childNodes: TiptapNode[] = [];

    let cursor: number = startIndex;
    // Holds a leading gap that has no previous sibling yet, so it can be prepended to the next child.
    let pendingLeadingGap: Range | null = null;

    for (const child of directChildren) {
      const gapEnd: number = child.node.data.startIndex - 1;

      if (cursor <= gapEnd) {
        if (allowsParagraph) {
          this.appendGapParagraphs(childNodes, cursor, gapEnd);
        } else if (childNodes.length > 0) {
          this.clampTextIntoNode(childNodes[childNodes.length - 1], cursor, gapEnd, 'append');
          this.warnClamp(cursor, gapEnd, type, 'previous');
        } else {
          // No previous sibling to clamp into — defer until the next child is built.
          pendingLeadingGap = { start: cursor, end: gapEnd };
        }
      }

      const childNode: TiptapNode = this.buildStructuralNode(child, allStructural);

      if (pendingLeadingGap) {
        this.clampTextIntoNode(
          childNode,
          pendingLeadingGap.start,
          pendingLeadingGap.end,
          'prepend',
        );
        this.warnClamp(pendingLeadingGap.start, pendingLeadingGap.end, type, 'next');
        pendingLeadingGap = null;
      }

      childNodes.push(childNode);
      cursor = child.node.data.endIndex + 1;
    }

    if (cursor <= endIndex) {
      if (allowsParagraph) {
        this.appendGapParagraphs(childNodes, cursor, endIndex);
      } else if (childNodes.length > 0) {
        this.clampTextIntoNode(childNodes[childNodes.length - 1], cursor, endIndex, 'append');
        this.warnClamp(cursor, endIndex, type, 'previous');
      } else {
        // Degenerate container with text but no children: keep the text rather than drop it.
        this.warnClamp(cursor, endIndex, type, 'next');
        childNodes.push(
          this.syntheticParagraph(cursor, endIndex, this.createLeafContent(cursor, endIndex)),
        );
      }
    }

    if (childNodes.length === 0) {
      // Zero-width container (no text, no children). Emit a minimal empty paragraph.
      childNodes.push(this.syntheticParagraph(startIndex, endIndex, []));
    }

    return { type: tiptapType, attrs, content: childNodes };
  }

  /** Checks if annotation of given type can be a top-level document node. Reads from the class attribute that
   * holds all the excluded types (currently only `hardBreak` - unlikely to change in the future).
   *
   * @param {string} type - The type of the annotation.
   * @returns {boolean} `true` if the annotation can be a top-level node, `false` otherwise.
   */
  private isAllowedAtTopLevel(type: string): boolean {
    return !StandoffConverter.EXCLUDED_FROM_BLOCK_CHILDREN.has(getEditorRole(type));
  }

  /**
   * Checks if the node is a leaf container, i.e. a node that cannot have any children. Reads from the class attribute that
   * holds all the leaf-container-only types (currently only `heading` and `paragraph`).
   *
   * @param {string} tiptapType - The internal type of the Tiptap node (`heading`, `bulletList` etc.)
   * @returns {boolean} `true` if the node is a leaf container, `false` otherwise
   */
  private isLeafContainer(tiptapType: string): boolean {
    return StandoffConverter.LEAF_BLOCK_TYPES.has(tiptapType);
  }

  /**
   * Finds top-level built-in structural annotations - those not wrapped by any other built-in annotation.
   * Used for creating the top document level from where the recursive children creation will start.
   *
   * @param allStructural - All built-in structural annotations
   * @returns {Anno[]} Top-level built-in structural annotations, sorted by start index
   */
  private findTopLevelAnnotations(allStructural: Anno[]): Anno[] {
    const topLevelBlocks: Anno[] = allStructural.filter(
      a =>
        this.isAllowedAtTopLevel(a.node.data.type) && !allStructural.some(b => this.contains(b, a)),
    );

    return topLevelBlocks.sort((a, b) => a.node.data.startIndex - b.node.data.startIndex);
  }

  // Post-build pass: attaches custom label annotations to every built-in tree node whose
  // range they cover. Labels are sorted outermost-first (widest range first).
  // Full annotation data including UUID is stored so the editor can look up and edit each one.
  private attachLabels(nodes: TiptapNode[]): void {
    const labelAnnos = [...this.semanticBlockAnnotations.values()];
    if (labelAnnos.length === 0) {
      return;
    }
    this.attachLabelsToNodes(nodes, labelAnnos);
  }

  private attachLabelsToNodes(nodes: TiptapNode[], labelAnnos: Anno[]): void {
    for (const node of nodes) {
      if (node.type === 'text') {
        continue;
      }
      const s = node.attrs?._annotationData?.startIndex as number | undefined;
      const e = node.attrs?._annotationData?.endIndex as number | undefined;
      if (s !== undefined && e !== undefined) {
        // Overlap (not strict containment): a label applies to a node if their ranges intersect.
        // Robust to paragraphs whose range was extended by merged boundary whitespace, and still
        // correct for labels spanning several blocks (each block they overlap gets the label).
        const labels = labelAnnos
          .filter(a => a.node.data.startIndex <= e && a.node.data.endIndex >= s)
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

  // Concatenates every text node of the built document in document order.
  private collectDocText(nodes: TiptapNode[], acc: { text: string }): void {
    for (const node of nodes) {
      if (node.type === 'text') {
        acc.text += node.text ?? '';
      } else if (node.content?.length) {
        this.collectDocText(node.content, acc);
      }
    }
  }

  // Dev guard for the core invariant: the document's plain text MUST equal the standoff text
  // exactly (every character, once, in order). If it doesn't, decorations and saved indices will
  // silently drift, so we surface the first divergence loudly.
  private assertTextInvariant(): void {
    const acc = { text: '' };
    this.collectDocText(this.tiptapJson?.content ?? [], acc);

    if (acc.text !== this.standoffJson.text) {
      const expected = this.standoffJson.text;
      let i = 0;
      while (i < expected.length && i < acc.text.length && expected[i] === acc.text[i]) {
        i++;
      }

      console.error(
        `[standoffConverter] TEXT INVARIANT VIOLATED: document text (len ${acc.text.length}) ` +
          `does not match standoff text (len ${expected.length}). First divergence at index ${i}: ` +
          `expected ${JSON.stringify(expected.slice(i, i + 30))} ` +
          `but got ${JSON.stringify(acc.text.slice(i, i + 30))}. ` +
          `Decorations and saved annotation indices will be misaligned.`,
      );
    }
  }

  public convertStandoffToTipTap(): void {
    this.createAnnotationUuidMaps();

    const allStructural: Anno[] = [...this.structuralAnnotations.values()];
    const topLevelAnnos: Anno[] = this.findTopLevelAnnotations(allStructural);

    topLevelAnnos.forEach(a => this.usedUuids.add(a.node.data.uuid));

    // console.log(
    //   'Top level: ',
    //   topLevelAnnos.map(n => [n.node.data.type, n.node.data.startIndex, n.node.data.endIndex]),
    // );

    const docContent: TiptapNode[] = [];

    let cursor: number = 0;

    for (const node of topLevelAnnos) {
      const gapEnd: number = node.node.data.startIndex - 1;

      // Document root always accepts paragraphs.
      if (cursor <= gapEnd) {
        this.appendGapParagraphs(docContent, cursor, gapEnd);
      }

      docContent.push(this.buildStructuralNode(node, allStructural));

      cursor = node.node.data.endIndex + 1;
    }

    const textEnd: number = this.standoffJson.text.length - 1;

    if (cursor <= textEnd) {
      this.appendGapParagraphs(docContent, cursor, textEnd);
    }

    // Attach custom structural annotations as labels on the built-in tree nodes.
    this.attachLabels(docContent);

    this.tiptapJson = { type: 'doc', content: docContent };

    this.assertTextInvariant();
  }
}
