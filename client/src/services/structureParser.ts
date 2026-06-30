import { IAnnotation } from "../models/IAnnotation";
import { AnnotationNode, NodeDto } from "../models/types";
import { useGuidelinesStore } from "../store/guidelines";
// import {
//   AnnotationSegment,
//   ListItemSegment,
//   ListSegment,
//   StructureSegment,
//   TableCellSegment,
//   TableRowSegment,
//   TableSegment,
//   ViewSegment,
// } from '../../models/annotations/ViewSegments';
// import { InlineParser } from './InlineParser';
// import {
//   ResolvedAnnotation,
//   StructuredAnnotation,
// } from '../../models/annotations/ResolvedAnnotation';

type StructuredAnnotation = IAnnotation;

export interface TextInterval {
  startIndex: number;
  endIndex: number;
}

export interface TextInterval {
  startIndex: number;
  endIndex: number;
}

interface StructureNode {
  annotation: IAnnotation;
  children: StructureNode[];
}

const { getStructuralAnnotationConfigs } = useGuidelinesStore();

export class StructureParser {
  private readonly structures: StructuredAnnotation[];
  // private readonly inlineAnnotations: ResolvedAnnotation[];
  private readonly tree: StructureNode[] = [];
  private structuralAnnotationTypes: Set<string>;

  public constructor(
    private readonly text: string,
    annotations: NodeDto<AnnotationNode>[],
  ) {
    this.structuralAnnotationTypes = new Set(getStructuralAnnotationConfigs().map((c) => c.type));

    this.structures = annotations
      .filter((a: NodeDto<AnnotationNode>) => this.structuralAnnotationTypes.has(a.node.data.type))
      .map((a) => a.node.data);

    this.structures.sort(this.compare);

    for (const annotation of this.structures) {
      const node: StructureNode = { annotation, children: [] };
      const parent: StructureNode | undefined = this.getParent(this.tree, annotation);

      if (parent) parent.children.push(node);
      else this.tree.push(node);
    }

    this.sortTree(this.tree);

    console.log("Structure tree:", this.tree);
  }

  // public parse(
  //   interval: TextInterval = { startIndex: 0, endIndex: this.text.length },
  //   nodes: StructureNode[] = this.tree,
  // ): ViewSegment[] {
  //   const segments: ViewSegment[] = [];
  //   const sources: Source[] = this.getSources(interval, nodes);
  //   let cursor: number = interval.start;

  //   for (const source of sources) {
  //     const sourceInterval: TextInterval = this.getSourceInterval(source);

  //     if (sourceInterval.start < cursor) continue;
  //     if (cursor < sourceInterval.start)
  //       segments.push(...this.getSegments({ start: cursor, end: sourceInterval.start }));

  //     const segment: ViewSegment | undefined = this.getViewSegment(source);
  //     if (segment) segments.push(segment);

  //     cursor = sourceInterval.end;
  //   }

  //   if (cursor < interval.end)
  //     segments.push(...this.getSegments({ start: cursor, end: interval.end }));
  //   return segments;
  // }

  // private getSources(interval: TextInterval, nodes: StructureNode[]): Source[] {
  //   const sources: Source[] = [];

  //   const affectedRootLayouts: Source[] = this.structures.filter(
  //     (annotation: StructuredAnnotation): boolean => {
  //       return this.isAffectedRootLayout(annotation, interval);
  //     },
  //   );

  //   const affectedNodes: Source[] = nodes.filter((node: StructureNode): boolean => {
  //     return this.contains(interval, node.annotation);
  //   });

  //   sources.push(...affectedRootLayouts, ...affectedNodes);
  //   return sources.sort((a: Source, b: Source): number =>
  //     this.compare(this.getSourceInterval(a), this.getSourceInterval(b)),
  //   );
  // }

  // private getSourceInterval(source: Source): TextInterval {
  //   return this.isStructureNode(source) ? source.annotation : source;
  // }

  // private getSegments(interval: TextInterval): AnnotationSegment[] {
  //   const text: string = this.text.slice(interval.start, interval.end);
  //   const annotations: ResolvedAnnotation[] = [];

  //   for (const annotation of this.inlineAnnotations) {
  //     if (!this.contains(interval, annotation)) continue;

  //     const start: number = annotation.start - interval.start;
  //     const end: number = annotation.end - interval.start;
  //     annotations.push({ ...annotation, start, end });
  //   }

  //   return new InlineParser(text, annotations).parse();
  // }

  // private getViewSegment(source: Source): ViewSegment | undefined {
  //   if (this.isStructureNode(source)) return this.getStructureSegment(source);

  //   switch (source.definition.role) {
  //     case 'table':
  //       return this.getTableSegment(source);

  //     case 'list':
  //       return this.getListSegment(source);

  //     default:
  //       return undefined;
  //   }
  // }

  // private getStructureSegment(node: StructureNode): StructureSegment {
  //   const children: ViewSegment[] = this.parse(node.annotation, node.children);
  //   return { kind: 'structure', annotation: node.annotation, children };
  // }

  // private getTableSegment(table: StructuredAnnotation): TableSegment {
  //   const rows: TableRowSegment[] = [];

  //   for (const row of this.getChildren(table, 'table-row')) {
  //     const cells: TableCellSegment[] = [];

  //     for (const cell of this.getChildren(row, 'table-cell')) {
  //       const children: ViewSegment[] = this.parse(cell, this.getNodesIn(cell));
  //       cells.push({ kind: 'table-cell', annotation: cell, children });
  //     }

  //     rows.push({ kind: 'table-row', annotation: row, cells });
  //   }

  //   return { kind: 'table', annotation: table, rows };
  // }

  // private getListSegment(list: StructuredAnnotation): ListSegment {
  //   const items: ListItemSegment[] = [];

  //   for (const item of this.getChildren(list, 'list-item')) {
  //     const children: ViewSegment[] = this.parse(item, this.getNodesIn(item));
  //     items.push({ kind: 'list-item', annotation: item, children });
  //   }

  //   return { kind: 'list', annotation: list, items };
  // }

  // private getChildren(
  //   parent: StructuredAnnotation,
  //   role: StructuredAnnotation['definition']['role'],
  // ): StructuredAnnotation[] {
  //   const children: StructuredAnnotation[] = [];

  //   for (const annotation of this.structures) {
  //     if (annotation.definition.role !== role) continue;
  //     if (!this.contains(parent, annotation)) continue;
  //     if (this.getDirectParent(annotation)?.uuid !== parent.uuid) continue;
  //     children.push(annotation);
  //   }

  //   return children.sort(this.compare);
  // }

  private getDirectParent(annotation: StructuredAnnotation): StructuredAnnotation | undefined {
    let parent: StructuredAnnotation | undefined;

    for (const candidate of this.structures) {
      if (candidate.uuid === annotation.uuid) continue;
      if (!this.contains(candidate, annotation)) continue;
      if (!parent || this.contains(parent, candidate)) parent = candidate;
    }

    return parent;
  }

  private getNodesIn(interval: TextInterval): StructureNode[] {
    return this.tree.filter((node: StructureNode): boolean => this.contains(interval, node.annotation));
  }

  private getParent(nodes: StructureNode[], annotation: StructuredAnnotation): StructureNode | undefined {
    const node: StructureNode | undefined = nodes.find((c: StructureNode): boolean => this.contains(c.annotation, annotation));
    return node ? this.getParent(node.children, annotation) ?? node : undefined;
  }

  private sortTree(nodes: StructureNode[]): void {
    nodes.sort((a: StructureNode, b: StructureNode): number => this.compare(a.annotation, b.annotation));
    for (const node of nodes) this.sortTree(node.children);
  }

  private contains(parent: TextInterval, child: TextInterval): boolean {
    return parent.startIndex <= child.startIndex && parent.endIndex >= child.endIndex;
  }

  private compare(a: TextInterval, b: TextInterval): number {
    if (a.startIndex !== b.startIndex) return a.startIndex - b.startIndex;
    return b.endIndex - a.endIndex;
  }

  // private isAffectedRootLayout(structure: StructuredAnnotation, interval: TextInterval): boolean {
  //   return (
  //     (structure.definition.role === 'table' || structure.definition.role === 'list') &&
  //     this.contains(interval, structure)
  //   );
  // }

  // private isStructureNode(source: Source): source is StructureNode {
  //   return 'children' in source;
  // }

  // private isVisibleStructure(annotation: ResolvedAnnotation): annotation is StructuredAnnotation {
  //   return (
  //     annotation.definition.layer === 'structure' && annotation.definition.behavior !== 'hidden'
  //   );
  // }
}
