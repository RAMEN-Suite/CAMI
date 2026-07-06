<script setup lang="ts">
import { ref } from "vue";
import Fieldset from "primevue/fieldset";
import { AnnotationNode, NodeStatusObject } from "../models/types";
import { isAnnotationNode } from "../utils/helper/helper";
import AnnotationTreeNode from "./AnnotationTreeNode.vue";

const nodes = defineModel<NodeStatusObject[]>({ required: true });

const props = defineProps<{
  mode: "edit" | "view";
}>();

const sectionIsCollapsed = ref<boolean>(false);

function isNotDeleted(node: NodeStatusObject): boolean {
  return node.meta.status !== "deleted" && node.meta.status !== "removed";
}
</script>

<template>
  <Fieldset
    legend="Annotations"
    :toggleable="true"
    :toggle-button-props="{
      title: `${sectionIsCollapsed ? 'Expand' : 'Collapse'} annotations`,
    }"
    @toggle="sectionIsCollapsed = !sectionIsCollapsed"
  >
    <template #toggleicon>
      <span :class="`pi pi-chevron-${sectionIsCollapsed ? 'down' : 'up'}`"></span>
    </template>

    <template v-for="(node, index) in nodes" :key="node.node.data.uuid">
      <AnnotationTreeNode
        v-if="isNotDeleted(node) && isAnnotationNode(node)"
        v-model="nodes![index] as NodeStatusObject<AnnotationNode>"
        :mode="props.mode"
      />
    </template>
  </Fieldset>
</template>

<style scoped></style>
