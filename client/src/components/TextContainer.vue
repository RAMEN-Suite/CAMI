<script setup lang="ts">
import { NodeDto, NodeStatusObject, TextNode } from "../models/types";
import Card from "primevue/card";
import NodeTag from "./NodeTag.vue";
import Button from "primevue/button";
import MultiSelect from "primevue/multiselect";
import Textarea from "primevue/textarea";
import { useGuidelinesStore } from "../store/guidelines";
import { computed } from "vue";
import { useBookmarks } from "../composables/useBookmarks";
import NodeStatusBadge from "./NodeStatusBadge.vue";
import { filterBaseNodeLabel } from "../utils/helper/helper.ts";

const props = defineProps<{
  status: "existing" | "temporary";
  text: NodeStatusObject<TextNode>;
  mode: "view" | "edit";
}>();

const emit = defineEmits<(e: "textAdded" | "textRemoved", text: NodeDto<TextNode>) => void>();

const { getAvailableContentLabels } = useGuidelinesStore();
const { bookmarks, toggleBookmark } = useBookmarks();

// Writable computed since "Collection" should be stripped from all visual displays/selection options
// Adjusting styling in the `Multiselect` was not possible since chip items don't provide context
const contentNodeLabels = computed<string[]>({
  get: () => filterBaseNodeLabel(props.text.node.nodeLabels),
  set: (labels: string[]) => (props.text.node.nodeLabels = ["Content", ...filterBaseNodeLabel(labels)]),
});

const isBookmarked = computed<boolean>(() => {
  return bookmarks.value.some((b) => b.data.data.uuid === props.text?.node.data.uuid);
});

function handleBookmarkAction() {
  toggleBookmark({ data: props.text.node, type: "text" });
}

const PREVIEW_LENGTH: number = 300;

const displayedText = computed<string>(
  () => props.text.node.data.text?.slice(0, PREVIEW_LENGTH) + (props.text.node.data.text?.length > PREVIEW_LENGTH ? "..." : ""),
);

function handleRemoveText() {
  emit("textRemoved", props.text);
}

function handleAddTextClick() {
  emit("textAdded", props.text);
}

/**
 * Handles a click event on the Card component, which will the corresponding text in a new tab. The click event is ignored
 * if the click target is part of the MultiSelect component, to prevent interference with label editing.
 *
 * @param {PointerEvent} event - The click event.
 * @returns {void} This function does not return any value.
 */
function handleClickContainer(event: PointerEvent): void {
  // Temporary texts can not be opened in the editor, obviously
  if (props.status === "temporary") {
    return;
  }

  // TODO: Change this when multiselect is moved to its own component
  if ((event.target as HTMLElement).closest(".multiselect")) {
    return;
  }

  window.open(`/contents/${props.text.node.data.uuid}`, "_blank", "noopener noreferrer");
}
</script>

<template>
  <Card
    class="my-2 text-left"
    :pt="{
      root: {
        style: {
          border: '1px solid gray',
          cursor: 'pointer',
        },
      },
      body: {
        style: {
          padding: '15px',
        },
      },
    }"
    @click="handleClickContainer"
  >
    <template #title>
      <div class="header">
        <div class="button-pane flex justify-content-end align-items-center">
          <NodeStatusBadge :status="props.text.meta.status" :style="{ marginRight: 'auto' }" />

          <Button
            v-if="props.status === 'existing'"
            type="button"
            severity="secondary"
            :icon="`pi pi-bookmark${isBookmarked ? '-fill' : ''}`"
            size="small"
            :title="isBookmarked ? 'Remove text from bookmarks' : 'Add text to bookmarks'"
            :pt="{
              icon: {
                style: isBookmarked ? { color: 'var(--p-primary-color)' } : {},
              },
            }"
            @click.stop="handleBookmarkAction"
          />
          <Button
            v-if="mode === 'edit' && props.status !== 'temporary'"
            type="button"
            icon="pi pi-times"
            severity="danger"
            outlined
            size="small"
            title="Remove text"
            @click.stop="handleRemoveText"
          />
        </div>
        <div class="node-labels-container">
          <template v-if="mode === 'view'">
            <NodeTag v-for="label in contentNodeLabels" :key="label" :content="label" type="Content" />
          </template>
          <!-- eslint-disable vue/no-mutating-props -- TODO: Avoid working directly on props in template: Requires more refactoring though -->
          <template v-if="mode === 'edit'">
            <MultiSelect
              v-model="contentNodeLabels"
              size="small"
              :options="getAvailableContentLabels()"
              display="chip"
              placeholder="Content labels"
              class="multiselect text-center"
              :filter="false"
              :pt="{
                root: {
                  title: `Select Content labels`,
                },
              }"
            >
              <template #chip="{ value }">
                <NodeTag type="Content" :content="value" class="mr-1" />
              </template>
            </MultiSelect>
          </template>
        </div>
      </div>
    </template>

    <template #content>
      <div v-if="props.status === 'existing'">
        <div class="text" title="Open text in Editor">
          {{ displayedText }}
        </div>
      </div>
      <div v-else>
        <Textarea v-model="text.node.data.text" class="w-full" placeholder="Add text" />
      </div>
    </template>

    <template #footer>
      <div class="flex justify-content-center gap-2">
        <Button
          v-if="props.status === 'temporary'"
          class="w-2"
          icon="pi pi-check"
          title="Add new text to Collection"
          @click.stop="handleAddTextClick"
        />

        <Button
          v-if="props.status === 'temporary'"
          severity="secondary"
          outlined
          class="w-2"
          icon="pi pi-times"
          title="Discard text draft"
          @click.stop="handleRemoveText"
        />
      </div>
    </template>
  </Card>
</template>

<style scoped>
.text a {
  color: inherit;
  display: block;
}

*:has(.text):hover {
  background-color: #efefef;
  transition: background-color 0.2s;
}
</style>
