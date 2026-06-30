<script setup lang="ts">
import { useTemplateRef, computed, ref, watchEffect } from "vue";
import { useGuidelinesStore } from "../store/guidelines";
import { capitalize } from "../utils/helper/helper";
import AnnotationButton from "./AnnotationButton.vue";
import { AnnotationType, NodeStatusObject, AnnotationNode, Annotation } from "../models/types";
import { useCreateAnnotation } from "../composables/useCreateAnnotation";
import { useFilterStore } from "../store/filter";
import ShortcutError from "../utils/errors/shortcut.error";
import AnnotationRangeError from "../utils/errors/annotationRange.error";
import { useAppStore } from "../store/app";
import { useDialog } from "primevue";
import AnnotationCreateModal from "./AnnotationCreateModal.vue";
import { useTiptapStore } from "../store/tiptap";
import { useValidateTextSelection } from "../composables/useValidateTextSelection";
import { Selection } from "@tiptap/pm/state";
import Button from "primevue/button";
import TableInsertPopover from "./TableInsertPopover.vue";
import Tabs from "primevue/tabs";
import TabList from "primevue/tablist";
import Tab from "primevue/tab";
import TabPanels from "primevue/tabpanels";
import TabPanel from "primevue/tabpanel";

const { isValid: isSelectionValid } = useValidateTextSelection();
const { groupedAnnotationTypes, annotationHasConstraints, getAnnotationConfig, isBuiltinStructuralType, isZeroPoint } =
  useGuidelinesStore();
const { addToastMessage, createModalInstance, destroyModalInstance } = useAppStore();
const { selectedOptions } = useFilterStore();
const { tiptap, annotations, structuralAnnotations } = useTiptapStore();
const { createTextAnnotation: createAnnotation } = useCreateAnnotation("Content");

const selectedTab = ref<"annotations" | "structure">("annotations");

const annotationCategories = computed(() =>
  Object.entries(groupedAnnotationTypes.value ?? {}).filter(([category]) => category !== "structure"),
);

const selectedCategory = ref<string>("");

watchEffect(() => {
  if (!selectedCategory.value && annotationCategories.value.length > 0) {
    selectedCategory.value = annotationCategories.value[0][0];
  }
});

const tablePopover = useTemplateRef<InstanceType<typeof TableInsertPopover>>("table-popover");
const dialog: ReturnType<typeof useDialog> = useDialog();

// Project-defined custom block types: isBlock:true entries that are not pre-configured built-ins.
// These get a generic wrapIn/lift toggle button rather than a dedicated tiptap command button.
const customStructureTypes = computed(() =>
  (groupedAnnotationTypes.value?.structure ?? []).filter((t) => t.isBlock && !isBuiltinStructuralType(t.type)),
);

/**
 * Checks if the annotation type is enabled by verifying if it is included in the selected options. If not, an `ShortcutError` is thrown.
 *
 * @throws {ShortcutError} If the annotation type is not enabled in the current filter settings.
 * @returns {boolean} True if the annotation type is enabled.
 */
function isAnnotationTypeEnabled(type: string): boolean {
  if (!selectedOptions.value.includes(type)) {
    throw new ShortcutError(
      `Annotations of type "${type}" are not enabled currently. Use the Filter component to enable the type.`,
    );
  }

  return true;
}

function handleInlineAnnotationButtonClick(data: { type: string; subType?: string | number }) {
  const selection: Selection | undefined = tiptap.value?.state.selection;

  if (!selection) {
    return;
  }

  try {
    const config: AnnotationType = getAnnotationConfig(data.type);

    isAnnotationTypeEnabled(data.type);
    isSelectionValid(selection, config);

    // Needs to be captured since modal opening collapses editor selection
    const capturedSelection = { from: selection.from, to: selection.to };

    const textInSelection: string = tiptap.value?.state.doc.textBetween(selection.from, selection.to) ?? "";

    const newAnnotationTemplate: NodeStatusObject<AnnotationNode> = createAnnotation({
      ...data,
      selectedText: textInSelection,
    });

    if (annotationHasConstraints(config)) {
      createModalInstance(
        dialog.open(AnnotationCreateModal, {
          props: {
            modal: true,
            closable: false,
            closeOnEscape: true,
            dismissableMask: true,
            style: { width: "25rem", height: "35rem" },
            pt: {
              content: {
                style: {
                  flexGrow: 1,
                },
              },
            },
          },
          data: {
            annotation: newAnnotationTemplate,
          },
          emits: {
            onSubmit: (editedAnnotationData: Annotation) => {
              addAnnotation(editedAnnotationData, capturedSelection);
              destroyModalInstance();
            },
          },
          onClose: destroyModalInstance,
        }),
      );
    } else {
      addAnnotation(newAnnotationTemplate, capturedSelection);
    }
  } catch (error: unknown) {
    if (error instanceof AnnotationRangeError) {
      addToastMessage({
        severity: "warn",
        summary: "Invalid selection",
        detail: error.message,
        life: 3000,
      });
    } else if (error instanceof ShortcutError) {
      addToastMessage({
        severity: "warn",
        summary: "Annotation type not enabled",
        detail: error.message,
        life: 3000,
      });
    } else {
      console.error("Unexpected error:", error);
    }
  } finally {
    tiptap.value
      ?.chain()
      .focus()
      .setTextSelection(selection.to ?? 0)
      .run();
  }
}

/**
 * Adds a new annotation to the store by executing the `createAnnotation` command.
 *
 * @param {Annotation} annotation - The annotation to add to the store.
 * @param {Object} selection - The selection object with `from` and `to` properties.
 * @returns {void} This function does not return any value.
 */
function addAnnotation(annotation: Annotation, selection: { from: number; to: number }): void {
  const { from, to } = selection;
  const isAnnoZeroPoint: boolean = isZeroPoint(annotation.node);

  // Add decoration or inline block, depeding on config
  if (isAnnoZeroPoint) {
    // TODO: Cursor is set before the inserted element, not after. Fix later
    tiptap.value?.commands.addZeroPointAnnotation(annotation.node, from);
  } else {
    tiptap.value?.commands.addAnnotationDecoration(annotation.node, from, to);
  }
  // Add to store
  annotations.value?.set(annotation.node.data.uuid, annotation);
}

function handleBlockAnnotationClick(data: { type: string; subType?: string | number }): void {
  const selection: Selection | undefined = tiptap.value?.state.selection;

  if (!selection) {
    return;
  }

  try {
    const config: AnnotationType = getAnnotationConfig(data.type);

    console.log(config);

    isAnnotationTypeEnabled(data.type);
    isSelectionValid(selection, config);

    // Needs to be captured since modal opening collapses editor selection
    const capturedSelection = { from: selection.from, to: selection.to };

    const textInSelection: string = tiptap.value?.state.doc.textBetween(capturedSelection.from, capturedSelection.to) ?? "";

    const newAnnotationTemplate: NodeStatusObject<AnnotationNode> = createAnnotation({
      ...data,
      selectedText: textInSelection,
    });

    // Add block annotation to all nodes in selection
    tiptap.value?.commands.addSemanticBlockLabel(newAnnotationTemplate, capturedSelection.from, capturedSelection.to);

    // Add to store
    structuralAnnotations.value?.set(newAnnotationTemplate.node.data.uuid, newAnnotationTemplate);
  } catch (error: unknown) {
    if (error instanceof AnnotationRangeError) {
      addToastMessage({
        severity: "warn",
        summary: "Invalid selection",
        detail: error.message,
        life: 3000,
      });
    } else if (error instanceof ShortcutError) {
      addToastMessage({
        severity: "warn",
        summary: "Annotation type not enabled",
        detail: error.message,
        life: 3000,
      });
    } else {
      console.error("Unexpected error:", error);
    }
  }
}
</script>

<template>
  <Tabs v-model:value="selectedTab">
    <TabList>
      <Tab value="annotations">Annotations</Tab>
      <Tab value="structure">Structure</Tab>
    </TabList>
    <TabPanels
      :pt="{
        root: {
          style: {
            paddingTop: 0,
            paddingLeft: 0,
            paddingRight: 0,
          },
        },
      }"
    >
      <TabPanel value="annotations">
        <Tabs v-model:value="selectedCategory">
          <TabList>
            <Tab v-for="[category, types] in annotationCategories" :key="category" :value="category">
              {{ capitalize(category) }} ({{ types.length }})
            </Tab>
          </TabList>
          <TabPanels>
            <TabPanel v-for="[category, types] in annotationCategories" :key="category" :value="category">
              <div class="buttons">
                <AnnotationButton
                  v-for="type in types"
                  :key="type.type"
                  :type="type.type"
                  :disabled="!selectedOptions.includes(type.type)"
                  :config="getAnnotationConfig(type.type)"
                  @clicked="handleInlineAnnotationButtonClick($event)"
                />
              </div>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </TabPanel>
      <TabPanel value="structure">
        <div class="flex flex-wrap gap-3">
          <Button
            v-tooltip.hover.top="{ value: 'h1', showDelay: 50 }"
            severity="secondary"
            :class="{ 'is-active': tiptap?.isActive('heading', { level: 1 }) }"
            @click="tiptap?.chain().focus().toggleHeading({ level: 1 }).run()"
          >
            H1
          </Button>
          <Button
            v-tooltip.hover.top="{ value: 'h2', showDelay: 50 }"
            severity="secondary"
            :class="{ 'is-active': tiptap?.isActive('heading', { level: 2 }) }"
            @click="tiptap?.chain().focus().toggleHeading({ level: 2 }).run()"
          >
            H2
          </Button>
          <Button
            v-tooltip.hover.top="{ value: 'h3', showDelay: 50 }"
            severity="secondary"
            :class="{ 'is-active': tiptap?.isActive('heading', { level: 3 }) }"
            @click="tiptap?.chain().focus().toggleHeading({ level: 3 }).run()"
          >
            H3
          </Button>
          <Button
            v-tooltip.hover.top="{ value: 'paragraph', showDelay: 50 }"
            severity="secondary"
            icon="pi pi-align-justify"
            :class="{ 'is-active': tiptap?.isActive('paragraph') }"
            @click="tiptap?.chain().focus().setNode('paragraph').run()"
          >
          </Button>
          <Button
            v-tooltip.hover.top="{ value: 'table', showDelay: 50 }"
            severity="secondary"
            icon="pi pi-table"
            :class="{ 'is-active': tiptap?.isActive('table') }"
            @click="tablePopover?.toggle($event)"
          >
          </Button>
          <Button
            v-for="blockType in customStructureTypes"
            :key="blockType.type"
            v-tooltip.hover.top="{ value: blockType.type, showDelay: 50 }"
            severity="secondary"
            :class="{ 'is-active': true }"
            @click="handleBlockAnnotationClick({ type: blockType.type })"
          >
            {{ blockType.type }}
          </Button>
        </div>
      </TabPanel>
    </TabPanels>
  </Tabs>

  <TableInsertPopover ref="table-popover" />
</template>

<style scoped>
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}
</style>
