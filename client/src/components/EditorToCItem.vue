<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue';
import { ToCItem } from '../models/types';
import { MenuItem, MenuItemCommandEvent } from 'primevue/menuitem';
import { Menu } from 'primevue';
import Button from 'primevue/button';
import { useAppStore } from '../store/app';
import Popover from 'primevue/popover';
import Tag from 'primevue/tag';

const props = defineProps<{
  item: ToCItem;
}>();

const emit = defineEmits<{
  (e: 'itemClick', node: ToCItem): void;
}>();

function handleNodeClick() {
  emit('itemClick', props.item);
}

const { addToastMessage } = useAppStore();

const displayedText = computed<string>(
  () =>
    (props.item as ToCItem).data.text.slice(0, 10) +
    (props.item.data.text.length > 10 ? '...' : ''),
);

const menu = useTemplateRef('menu');
const items = ref<MenuItem>([
  {
    items: [
      {
        label: 'Edit',
        icon: 'pi pi-pencil',
        command: handleMenuItemClick,
      },
      {
        label: 'Delete',
        icon: 'pi pi-trash',
        command: handleMenuItemClick,
      },
      {
        label: 'Insert node',
        command: handleMenuItemClick,
      },
      {
        label: 'Change node',
        command: handleMenuItemClick,
      },
    ],
  },
]);
const currentSemanticBlockData = ref<{ uuid: string; type: string } | null>(null);

function toggle(event: PointerEvent) {
  menu.value.toggle(event);
}

function handleMenuItemClick(e: MenuItemCommandEvent) {
  addToastMessage({
    severity: 'info',
    summary: `${e.item.label} clicked`,
    life: 2000,
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

const infoIcon = useTemplateRef('block-info-popover');
const semanticBlockPills = useTemplateRef('semantic-block-popover');

const displayedLabel = computed<string>(() => {
  const item: ToCItem = props.item;

  if (item.data.nodeType === 'heading') {
    return `h-${item.data._annotationData.level}`;
  } else if (item.data.nodeType === 'paragraph') {
    return 'p';
  } else {
    return item.data._annotationData.type;
  }
});
</script>

<template>
  <div class="flex align-items-center">
    <div
      class="type-container ml-1 flex align-items-center gap-2 flex-grow-1"
      @click="handleNodeClick"
    >
      <span> {{ displayedLabel }} </span>
      <small :title="props.item.data.text" class="font-italic">
        {{ displayedText }}
      </small>
    </div>
    <div class="block-labels-container ml-1">
      <span v-for="(annotation, index) in props.item.data._semanticBlocks" :key="index">
        <Tag
          severity="secondary"
          value="Secondary"
          rounded
          @click="toggleSemanticBlockDataPopover(Number(index), $event)"
        >
          {{ annotation.type }}
        </Tag>
        <!-- <span class="annotation-label text-xs px-1 py-0.5 rounded bg-gray-200">{{}}</span> -->
      </span>
    </div>
    <div class="action-container ml-2">
      <!-- <Button
        type="button"
        icon="pi pi-ellipsis-v"
        class="p-1"
        size="small"
        rounded
        severity="secondary"
        @click="toggle"
        aria-haspopup="true"
        aria-controls="overlay_menu"
      /> -->
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
  <Menu ref="menu" id="overlay_menu" :model="items" :popup="true" />
  <Popover ref="semantic-block-popover">
    <pre>{{ JSON.stringify(currentSemanticBlockData, null, 2) }}</pre>
  </Popover>
  <Popover ref="block-info-popover">
    <pre
      >{{ JSON.stringify(props.item.data, null, 2) }}
  </pre
    >
  </Popover>
</template>
