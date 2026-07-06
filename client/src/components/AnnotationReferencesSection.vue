<script setup lang="ts">
import { ref, useTemplateRef } from "vue";
import Fieldset from "primevue/fieldset";
import EntityCard from "./EntityCard.vue";
import CollectionCard from "./CollectionCard.vue";
import TextCard from "./TextCard.vue";
import { BaseNodeLabel, CollectionNode, EntityNode, NodeStatusObject, TextNode } from "../models/types";
import { isCollectionNode, isContentNode, isEntityNode } from "../utils/helper/helper";
import Button from "primevue/button";
import Menu from "primevue/menu";
import AddNodeModal from "./AddNodeModal.vue";
import { useAppStore } from "../store/app";
import { useDialog } from "primevue/usedialog";

const nodes = defineModel<NodeStatusObject[]>({ required: true });

const props = defineProps<{
  mode: "edit" | "view";
}>();

const { createModalInstance, destroyModalInstance } = useAppStore();
const dialog: ReturnType<typeof useDialog> = useDialog();

const sectionIsCollapsed = ref<boolean>(false);

const menu = useTemplateRef<InstanceType<typeof Menu>>("menu");

function startAddingNode(nodeLabel: BaseNodeLabel): void {
  createModalInstance(
    dialog.open(AddNodeModal, {
      props: {
        modal: true,
        closable: true,
        closeOnEscape: false,
        style: { width: "40rem", height: "30rem" },
        closeButtonProps: {
          severity: "secondary",
          title: "Cancel",
          style: { width: "30px", height: "30px" },
          rounded: true,
        },
        header: `Add a ${nodeLabel} node`,
        pt: {
          headerActions: { style: "margin-left: auto" },
        },
      },
      data: {
        baseNodeLabel: nodeLabel,
      },
      emits: {
        onSubmit: (node: NodeStatusObject) => {
          addNode(node);
          destroyModalInstance();
        },
      },
      onClose: destroyModalInstance,
    }),
  );
}

function addNode(node: NodeStatusObject): void {
  nodes.value.push(node);
}

function handleRemoveNode(node: NodeStatusObject<CollectionNode | EntityNode | TextNode>): void {
  nodes.value = nodes.value.filter((n) => n.node.data.uuid !== node.node.data.uuid);
}

/**
 * Checks if the passed node is a reference node (Entity/Collection/Content) and not an Annotation node
 * (Annotations) are handled by {@link AnnotationAnnotationsSection}.
 *
 * @param node - The node to check.
 * @returns `True` if the node is a reference node, `false` otherwise.
 */
function isReference(node: NodeStatusObject): boolean {
  return isEntityNode(node) || isCollectionNode(node) || isContentNode(node);
}

function isNotDeleted(node: NodeStatusObject): boolean {
  return node.meta.status !== "deleted" && node.meta.status !== "removed";
}

const nodeOptions = ref([
  {
    label: "Reference types",
    items: [
      {
        label: "Collection",
        command: () => startAddingNode("Collection"),
      },
      {
        label: "Entity",
        command: () => startAddingNode("Entity"),
      },
      {
        label: "Content",
        command: () => startAddingNode("Content"),
      },
    ],
  },
]);

function handleAddNodeClick(event: PointerEvent): void {
  menu.value?.toggle(event);
}
</script>

<template>
  <Fieldset
    legend="References"
    :toggleable="true"
    :toggle-button-props="{
      title: `${sectionIsCollapsed ? 'Expand' : 'Collapse'} references`,
    }"
    @toggle="sectionIsCollapsed = !sectionIsCollapsed"
  >
    <template #toggleicon>
      <span :class="`pi pi-chevron-${sectionIsCollapsed ? 'down' : 'up'}`"></span>
    </template>

    <template v-for="(node, index) in nodes" :key="node.node.data.uuid">
      <template v-if="isNotDeleted(node) && isReference(node)">
        <EntityCard
          v-if="isEntityNode(node)"
          v-model="nodes![index] as NodeStatusObject<EntityNode>"
          :mode="props.mode"
          @remove-node="handleRemoveNode(node)"
        />
        <TextCard
          v-else-if="isContentNode(node)"
          v-model="nodes![index] as NodeStatusObject<TextNode>"
          :mode="props.mode"
          @remove-node="handleRemoveNode(node)"
        />
        <CollectionCard
          v-else-if="isCollectionNode(node)"
          v-model="nodes![index] as NodeStatusObject<CollectionNode>"
          :mode="props.mode"
          @remove-node="handleRemoveNode(node)"
        />
      </template>
    </template>

    <Button
      v-if="props.mode === 'edit'"
      type="button"
      label="Add Reference"
      icon="pi pi-plus"
      class="w-full"
      severity="secondary"
      aria-haspopup="true"
      aria-controls="references_overlay_menu"
      title="Add new reference"
      @click="handleAddNodeClick"
    />
    <Menu id="references_overlay_menu" ref="menu" :model="nodeOptions" :popup="true" />
  </Fieldset>
</template>

<style scoped></style>
