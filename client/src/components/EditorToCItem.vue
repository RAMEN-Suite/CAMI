<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";
import { ToCItem } from "../models/types";
import { MenuItem, MenuItemCommandEvent } from "primevue/menuitem";
import { Menu } from "primevue";
import Button from "primevue/button";
import ConfirmPopup from "primevue/confirmpopup";
import { useAppStore } from "../store/app";
import Popover from "primevue/popover";
import { ellipsize } from "../utils/helper/helper.ts";

const props = defineProps<{
  item: ToCItem;
}>();

const emit = defineEmits<(e: "itemClick", node: ToCItem) => void>();

const { addToastMessage } = useAppStore();
const menu = useTemplateRef("menu");
const menuItems = ref<MenuItem[]>([
  {
    items: [
      {
        label: "Edit",
        icon: "pi pi-pencil",
        title: "Edit attributes",
        command: handleMenuItemClick,
      },
      {
        label: "Delete",
        icon: "pi pi-trash",
        title: "Delete block",
        command: (e) => handleDeleteClick(e),
      },
    ],
  },
]);

const displayedText = computed<string>(() => ellipsize(props.item.data.text, 20));
const displayedLabel = computed<string>(() => {
  const item: ToCItem = props.item;

  if (item.data.nodeType === "heading") {
    return `h${item.data.level}`;
  } else if (item.data.nodeType === "paragraph") {
    return "p";
  } else {
    return item.data._annotationData.type;
  }
});

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

function handleDeleteClick(e: MenuItemCommandEvent): void {
  handleMenuItemClick(e);
}

function handleOptionButtonClick(event: MouseEvent): void {
  menu.value?.toggle(event);
}
</script>

<template>
  <div class="flex align-items-center gap-2">
    <div class="type-container ml-1 flex align-items-center gap-3 flex-grow-1" @click="handleNodeClick">
      <span> {{ displayedLabel }} </span>
      <small :title="props.item.data.text" class="font-italic">
        {{ displayedText }}
      </small>
    </div>
    <div class="action-container ml-2">
      <Button
        icon="pi pi-ellipsis-v"
        rounded
        :style="{
          width: '25px',
          height: '25px',
        }"
        size="small"
        severity="secondary"
        class="ml-2"
        title="Click to show preview of entity data"
        @click="handleOptionButtonClick"
      ></Button>
    </div>
  </div>
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
  <ConfirmPopup />
  <Popover ref="block-info-popover" dismissable close-on-escape>
    <pre
      >{{ JSON.stringify(props.item.data, null, 2) }}
  </pre
    >
  </Popover>
</template>
