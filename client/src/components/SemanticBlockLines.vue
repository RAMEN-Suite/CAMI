<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick, useTemplateRef } from "vue";
import { useEventListener } from "@vueuse/core";
import { useTiptapStore } from "../store/tiptap";
import type { Annotation, SemanticBlockRange } from "../models/types";
import { MenuItem } from "primevue/menuitem";
import { useAppStore } from "../store/app";
import { useDialog } from "primevue";
import SemanticBlockDetailsModal from "./SemanticBlockDetailsModal.vue";
import { Menu } from "primevue";

interface PositionedLine {
  uuid: string;
  type: string;
  /** px from the top of the scroll container's content origin */
  top: number;
  height: number;
  /** parallel-column index so overlapping ranges don't collide */
  column: number;
}

const { tiptap, semanticBlockRanges, structuralAnnotations } = useTiptapStore();
const { createModalInstance, destroyModalInstance } = useAppStore();
const dialog = useDialog();
const menuItems = ref<MenuItem[]>([]);

const menu = useTemplateRef("menu");

// Layout constants -------------------------------------------
const LINE_WIDTH: number = 5;
// Horizontal gap between two parallel lines.
const COLUMN_GAP: number = 2;
// Horizontal stride per column.
const COLUMN_WIDTH: number = LINE_WIDTH + COLUMN_GAP;
// px from the editor's left edge to the first (leftmost) column.
const GUTTER_START: number = 4;
// px gap kept between the last line and the start of the text.
const GUTTER_END: number = 8;
// CSS custom property the editor pane reads for its dynamic left padding.
const GUTTER_VAR = "--semantic-gutter";
// --------------------------------------------------------------------------

const lines = ref<PositionedLine[]>([]);
// The `#editor` Teleport target is rendered by `<editor-content>` only once the
// editor is created (after mount). We must not mount the Teleport before it
// exists, so gate on the element actually being in the DOM rather than on the
// `tiptap` ref alone (which flips truthy in the same flush, before `#editor` is
// patched in).
const targetReady = ref(false);

// Track the last hovered line by uuid (not by object) so the label keeps the
// correct geometry after a recompute swaps the line objects.
const hoveredUuid = ref<string | null>(null);
const lastHovered = computed<PositionedLine | null>(() => lines.value.find((line) => line.uuid === hoveredUuid.value) ?? null);

/** Absolute x (px) of a column's left edge inside the gutter. */
function columnLeft(column: number): number {
  return GUTTER_START + column * COLUMN_WIDTH;
}

// Label sits directly above the top of the hovered line.
const labelStyle = computed(() => {
  if (!lastHovered.value) {
    return {};
  }

  return {
    top: `${lastHovered.value.top}px`,
    left: `${columnLeft(lastHovered.value.column)}px`,
  };
});

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
 * Reserve exactly enough left padding on the editor pane to fit the columns,
 * via a CSS variable. Column count depends only on document positions (not on
 * pixel layout), so widening the gutter never changes the column count and
 * cannot loop. Returns `true` when the value actually changed (i.e. the text
 * will reflow and geometry must be re-measured afterwards).
 */
function applyGutter(editorEl: HTMLElement, maxColumn: number): boolean {
  const width: number = maxColumn < 0 ? 0 : columnLeft(maxColumn) + LINE_WIDTH + GUTTER_END;
  const value = `${width}px`;

  if (editorEl.style.getPropertyValue(GUTTER_VAR) === value) {
    return false;
  }

  editorEl.style.setProperty(GUTTER_VAR, value);
  return true;
}

/** Measure pixel geometry for every range against the current editor layout. */
function measure(editorEl: HTMLElement, columns: Map<string, number>): void {
  const editor = tiptap.value;

  if (!editor) {
    lines.value = [];
    return;
  }

  const editorTop: number = editorEl.getBoundingClientRect().top;
  const scrollTop: number = editorEl.scrollTop;

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

function updateAnnotation(updated: Annotation) {
  const uuid: string = updated.node.data.uuid;

  const annotationEntry: Annotation | undefined = structuralAnnotations.value?.get(uuid);

  if (!annotationEntry) {
    return;
  }

  structuralAnnotations.value?.set(uuid, updated);
}

function handleDetailsClick(line: PositionedLine): void {
  const annotation: Annotation | undefined = structuralAnnotations.value?.get(line.uuid);

  if (!annotation) {
    return;
  }

  createModalInstance(
    dialog.open(SemanticBlockDetailsModal, {
      props: {
        modal: true,
        closable: true,
        closeOnEscape: true,
        dismissableMask: true,
        header: `Annotation details`,
        style: { width: "28rem" },
        pt: {
          pcCloseButton: { root: { title: "Close" } },
        },
      },

      data: { annotation },
      emits: {
        onSubmit: (updated: Annotation) => {
          updateAnnotation(updated);
          destroyModalInstance();
        },
      },
      onClose: destroyModalInstance,
    }),
  );
}

function handleDeleteClick(line: PositionedLine): void {
  tiptap.value?.commands.removeSemanticBlock(line.uuid);
}

function buildMenuItems(line: PositionedLine) {
  menuItems.value = [
    {
      items: [
        {
          label: "Edit",
          icon: "pi pi-pencil",
          title: "Show and edit details",
          command: () => handleDetailsClick(line),
        },
        {
          label: "Delete",
          icon: "pi pi-trash",
          title: "Delete annotation",
          command: () => handleDeleteClick(line),
        },
      ],
    },
  ];
}

/**
 * Turn the document-position ranges into positioned lines. Columns (and thus
 * the gutter width) are derived first since they are layout-independent; the
 * gutter is applied, and geometry is measured once the (possible) reflow from
 * that padding change has settled.
 */
function recompute(): void {
  const editorEl: HTMLElement | null = document.getElementById("editor");

  if (!tiptap.value || !editorEl) {
    lines.value = [];
    return;
  }

  const columns: Map<string, number> = assignColumns(semanticBlockRanges.value);
  const maxColumn: number = Math.max(-1, ...columns.values());

  const reflowed: boolean = applyGutter(editorEl, maxColumn);

  if (reflowed) {
    // Padding change shifts/wraps the text; measure on the next frame.
    requestAnimationFrame(() => measure(editorEl, columns));
  } else {
    measure(editorEl, columns);
  }
}

// Wait for the DOM/layout to settle before measuring.
function schedule(): void {
  nextTick(() => requestAnimationFrame(recompute));
}

function setHovered(line: PositionedLine): void {
  hoveredUuid.value = line.uuid;
}

function handleClick(line: PositionedLine): void {
  buildMenuItems(line);

  menu.value?.toggle(event);
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
      <!-- Type of the last hovered line, shown directly above its top edge. -->
      <div v-if="lastHovered" class="semantic-block-line__label" :style="labelStyle">
        {{ lastHovered.type }}
      </div>

      <div
        v-for="line in lines"
        :key="line.uuid"
        class="semantic-block-line"
        tabindex="0"
        :style="{
          top: `${line.top}px`,
          height: `${line.height}px`,
          left: `${columnLeft(line.column)}px`,
          width: `${LINE_WIDTH}px`,
        }"
        @mouseenter="setHovered(line)"
        @click="handleClick(line)"
      ></div>
    </div>
  </Teleport>
  <Menu
    ref="menu"
    :model="menuItems"
    :popup="true"
    dismissable
    close-on-escape
    :pt="{
      submenuLabel: { style: { display: 'none' } },
      item: ({ context }) => ({ title: context.item.title }),
    }"
  />
</template>

<style scoped>
/* ------------------ SEMANTIC BLOCK LINES ------------------ */

/*
 * Overlay teleported into #editor. It shares the scroll container's content
 * origin, so it scrolls together with the text and needs no scroll recompute.
 * The layer itself ignores pointer events so text below stays selectable; the
 * lines re-enable them.
 */
.semantic-block-lines-layer {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

/* A single vertical line spanning one semantic block's range. */
.semantic-block-line {
  position: absolute;
  border-radius: 2px;
  background-color: #c2c2c2;
  cursor: pointer;
  pointer-events: auto;
  transition: background-color 0.12s ease;
}

/* Darker on hover; siblings revert to default automatically. */
.semantic-block-line:hover {
  background-color: #5f5f5f;
}

/* Type label of the last hovered line, pinned directly above its top edge. */
.semantic-block-line__label {
  position: absolute;
  transform: translateY(-100%);
  padding: 1px 4px;
  border-radius: 0.25rem;
  background-color: #5f5f5f;
  color: white;
  font-size: 0.65rem;
  line-height: 1.2;
  white-space: nowrap;
  pointer-events: none;
  z-index: 1;
}
</style>
