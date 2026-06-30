<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from "vue";
import { useEventListener } from "@vueuse/core";
import { useTiptapStore } from "../store/tiptap";
import type { SemanticBlockRange } from "../models/types";

interface PositionedLine {
  uuid: string;
  type: string;
  /** px from the top of the scroll container's content origin */
  top: number;
  height: number;
  /** parallel-column index so overlapping ranges don't collide */
  column: number;
}

// Horizontal spacing between parallel lines. Must fit inside the gutter reserved
// via `.tiptap-editor-pane { padding-left }` in tiptap.css.
const COLUMN_WIDTH = 6;

const { tiptap, semanticBlockRanges } = useTiptapStore();

const lines = ref<PositionedLine[]>([]);
// The `#editor` Teleport target is rendered by `<editor-content>` only once the
// editor is created (after mount). We must not mount the Teleport before it
// exists, so gate on the element actually being in the DOM rather than on the
// `tiptap` ref alone (which flips truthy in the same flush, before `#editor` is
// patched in).
const targetReady = ref(false);

/** Re-check, after the DOM has flushed, whether the Teleport target exists. */
async function refreshTarget(): Promise<void> {
  await nextTick();
  targetReady.value = document.getElementById("editor") !== null;
}

/**
 * Assign each range a column so that two ranges which overlap in document
 * positions never share the same column (greedy interval colouring).
 */
function assignColumns(ranges: SemanticBlockRange[]): Map<string, number> {
  const columns = new Map<string, number>();
  // endPos currently occupying each column index
  const columnEnds: number[] = [];

  const sorted: SemanticBlockRange[] = [...ranges].sort((a, b) => a.startPos - b.startPos);

  for (const range of sorted) {
    let column: number = columnEnds.findIndex((end) => end <= range.startPos);

    if (column === -1) {
      column = columnEnds.length;
    }

    columnEnds[column] = range.endPos;
    columns.set(range.uuid, column);
  }

  return columns;
}

/**
 * Translate the document-position ranges into pixel geometry using the live
 * editor layout. Coordinates are expressed relative to the `#editor` scroll
 * container's content origin so the absolutely-positioned lines scroll along
 * with the text (no scroll recompute needed).
 */
function recompute(): void {
  const editor = tiptap.value;
  const editorEl: HTMLElement | null = document.getElementById("editor");

  if (!editor || !editorEl) {
    lines.value = [];
    return;
  }

  const editorTop: number = editorEl.getBoundingClientRect().top;
  const scrollTop: number = editorEl.scrollTop;
  const columns: Map<string, number> = assignColumns(semanticBlockRanges.value);

  const next: PositionedLine[] = [];

  for (const range of semanticBlockRanges.value) {
    try {
      const startCoords = editor.view.coordsAtPos(range.startPos);
      // Stay inside the last block so we get its bottom rather than the next line's top.
      const endCoords = editor.view.coordsAtPos(Math.max(range.startPos, range.endPos - 1));

      next.push({
        uuid: range.uuid,
        type: range.type,
        top: startCoords.top - editorTop + scrollTop,
        height: endCoords.bottom - startCoords.top,
        column: columns.get(range.uuid) ?? 0,
      });
    } catch {
      // A position can be transiently invalid mid-transaction; skip it this pass.
    }
  }

  lines.value = next;
}

// Wait for the DOM/layout to settle before measuring.
function schedule(): void {
  nextTick(() => requestAnimationFrame(recompute));
}

watch(tiptap, async (editor) => {
  if (!editor) {
    targetReady.value = false;
    return;
  }

  await refreshTarget();
  schedule();
});

// Ranges are reassigned on every doc change (store `computeSemanticBlockRanges`).
watch(semanticBlockRanges, schedule);

onMounted(async () => {
  await refreshTarget();
  schedule();
});

useEventListener(window, "resize", schedule);
</script>

<template>
  <Teleport v-if="targetReady" to="#editor">
    <div class="semantic-block-lines-layer">
      <div
        v-for="line in lines"
        :key="line.uuid"
        class="semantic-block-line"
        :style="{
          top: `${line.top}px`,
          height: `${line.height}px`,
          left: `${line.column * COLUMN_WIDTH}px`,
        }"
      >
        <span class="semantic-block-line__label">{{ line.type }}</span>
      </div>
    </div>
  </Teleport>
</template>
