<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";
import { Annotation, ToCItem } from "../models/types";
import { MenuItem, MenuItemCommandEvent } from "primevue/menuitem";
import { Menu } from "primevue";
import Button from "primevue/button";
import ConfirmPopup from "primevue/confirmpopup";
import { useAppStore } from "../store/app";
import { useConfirm } from "primevue/useconfirm";
import { useDialog } from "primevue";
import Popover from "primevue/popover";
import Tag from "primevue/tag";
import { useTiptapStore } from "../store/tiptap";
import SemanticBlockDetailsModal from "./SemanticBlockDetailsModal.vue";

const props = defineProps<{
  item: ToCItem;
}>();

const emit = defineEmits<{
  (e: "itemClick", node: ToCItem): void;
}>();

const { addToastMessage, createModalInstance, destroyModalInstance } = useAppStore();
const { tiptap, structuralAnnotations } = useTiptapStore();
const confirm = useConfirm();
const dialog = useDialog();

const currentSemanticBlockData = ref<{ uuid: string; type: string } | null>(null);

const semanticBlockTag = useTemplateRef("pill-menu");

const structureBlockMenuItems = ref<MenuItem>([
  {
    items: [
      {
        label: "Edit",
        icon: "pi pi-pencil",
        command: handleMenuItemClick,
      },
      {
        label: "Delete",
        icon: "pi pi-trash",
        command: handleMenuItemClick,
      },
      {
        label: "Insert node",
        command: handleMenuItemClick,
      },
      {
        label: "Change node",
        command: handleMenuItemClick,
      },
    ],
  },
]);

const semanticBlockMenuItems = computed<MenuItem[]>(() => [
  {
    items: [
      {
        label: "Details",
        icon: "pi pi-info-circle",
        command: handleDetailsClick,
      },
      {
        label: "Delete",
        icon: "pi pi-trash",
        command: handleDeleteClick,
      },
    ],
  },
]);

function handleMenuItemClick(e: MenuItemCommandEvent) {
  addToastMessage({
    severity: "info",
    summary: `${e.item.label} clicked`,
    life: 2000,
  });
}

function handleNodeClick() {
  emit("itemClick", props.item);
}

function handleSemanticBlockToggle(block: { uuid: string; type: string }, event: MouseEvent): void {
  currentSemanticBlockData.value = block;

  semanticBlockTag.value?.toggle(event);
}

function handleDetailsClick(): void {
  if (!currentSemanticBlockData.value) {
    return;
  }

  const annotation: Annotation | undefined = structuralAnnotations.value?.get(currentSemanticBlockData.value.uuid);

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
        header: `${annotation.node.data.subType ?? annotation.node.data.type} — Details`,
        style: { width: "28rem" },
      },
      data: { annotation },
      onClose: destroyModalInstance,
    }),
  );
}

function handleDeleteClick(e: MenuItemCommandEvent): void {
  if (!currentSemanticBlockData.value) {
    return;
  }

  const { uuid, type } = currentSemanticBlockData.value;

  confirm.require({
    target: e.originalEvent.currentTarget as HTMLElement,
    message: `Do you want to remove "${type}"" from the selection?`,
    icon: "pi pi-exclamation-triangle",
    rejectProps: {
      label: "Cancel",
      severity: "secondary",
      outlined: true,
      title: "Cancel",
    },
    acceptProps: {
      label: "Delete",
      severity: "danger",
      title: "Delete semantic block",
    },
    accept: () => {
      tiptap.value?.commands.removeSemanticBlock(uuid);
    },
    reject: () => {},
  });
}

function toggleBlockDataPopover(event: MouseEvent): void {
  infoIcon.value?.toggle(event);
}

function toggleSemanticBlockDataPopover(index: number, event: MouseEvent): void {
  const clickedData = props.item.data._semanticBlocks[index];

  if (clickedData.uuid !== currentSemanticBlockData.value?.uuid) {
    currentSemanticBlockData.value = clickedData;
    semanticBlockPills.value?.show(event);
  } else {
    semanticBlockPills.value?.toggle(event);
  }
}

const infoIcon = useTemplateRef("block-info-popover");
const semanticBlockPills = useTemplateRef("semantic-block-popover");

const displayedLabel = computed<string>(() => {
  const item: ToCItem = props.item;

  if (item.data.nodeType === "heading") {
    return `h-${item.data._annotationData.level}`;
  } else if (item.data.nodeType === "paragraph") {
    return "p";
  } else {
    return item.data._annotationData.type;
  }
});
</script>

<template>
  <div class="flex align-items-center">
    <div class="type-container ml-1 flex align-items-center gap-2 flex-grow-1" @click="handleNodeClick">
      <span> {{ displayedLabel }} </span>
      <!-- <small :title="props.item.data.text" class="font-italic">
        {{ displayedText }}
      </small> -->
    </div>
    <div class="block-labels-container ml-1">
      <span v-for="(annotation, index) in props.item.data._semanticBlocks" :key="index">
        <Tag
          severity="secondary"
          :pt="{ root: { style: 'padding: 0.05rem 0.3rem; line-height: 1.3;' } }"
          :style="{ fontWeight: 'normal', fontSize: '0.8rem' }"
          rounded
          @click="handleSemanticBlockToggle(annotation, $event)"
        >
          {{ annotation.type }}
        </Tag>
      </span>
    </div>
    <div class="action-container ml-2">
      <Button
        icon="pi pi-info-circle"
        size="small"
        severity="secondary"
        class="ml-2"
        title="Click to show preview of entity data"
        @click="toggleBlockDataPopover"
      ></Button>
    </div>
  </div>
  <Menu ref="menu" id="overlay_menu" :model="structureBlockMenuItems" :popup="true" dismissable closeOnEscape />
  <Menu ref="pill-menu" :model="semanticBlockMenuItems" :popup="true" dismissable closeOnEscape />
  <ConfirmPopup />
  <Popover ref="block-info-popover" dismissable closeOnEscape>
    <pre
      >{{ JSON.stringify(props.item.data, null, 2) }}
  </pre
    >
  </Popover>
</template>
