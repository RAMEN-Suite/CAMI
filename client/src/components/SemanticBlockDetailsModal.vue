<script setup lang="ts">
import { inject, ref, toValue } from "vue";
import Fieldset from "primevue/fieldset";
import { Annotation, AnnotationType, PropertyConfig } from "../models/types";
import { useGuidelinesStore } from "../store/guidelines";
import FormPropertiesSection from "./FormPropertiesSection.vue";
import AnnotationTypeIcon from "./AnnotationTypeIcon.vue";
import AnnotationFormAdditionalNodesSection from "./AnnotationFormAdditionalNodesSection.vue";
import Button from "primevue/button";
import { cloneDeep } from "../utils/helper/helper.ts";
import { DynamicDialogInstance } from "primevue/dynamicdialogoptions";
import { Ref } from "vue";

const dialogRef = inject<Ref<DynamicDialogInstance>>("dialogRef");

if (!dialogRef) {
  throw new Error("dialogRef not provided - component must be used inside a DynamicDialog");
}

const annotation = ref<Annotation>(cloneDeep(dialogRef.value.data.annotation));

const { getAnnotationConfig, getAnnotationFields } = useGuidelinesStore();
const config: AnnotationType = getAnnotationConfig(annotation.value.node.data.type);
const propertyFields: PropertyConfig[] = getAnnotationFields(annotation.value.node.data.type);

const emit = defineEmits<(e: "submit", data: Annotation) => void>();

function handleUpdateClick(): void {
  annotation.value.meta.status = "modified";

  emit("submit", toValue(annotation));
  closeModal();
}

function closeModal(): void {
  dialogRef?.value?.close();
}
</script>

<template>
  <div class="container flex flex-column gap-3 semantic-block-details">
    <div class="flex items-center gap-2 mb-3">
      <div class="icon-container">
        <AnnotationTypeIcon :annotation-type="annotation.node.data.subType ?? annotation.node.data.type" />
      </div>
      <span class="font-bold">{{ annotation.node.data.subType ?? annotation.node.data.type }}</span>
    </div>
    <Fieldset legend="Properties" :toggleable="false">
      <FormPropertiesSection v-model="annotation.node.data" :fields="propertyFields" mode="edit" />
    </Fieldset>
  </div>
  <div class="flex justify-content-center gap-2 mt-4 w-full">
    <Button label="Update" icon="pi pi-check" title="Update annotation" @click="handleUpdateClick" />
  </div>
</template>

<style scoped>
.semantic-block-details {
  padding: 0.25rem;
}

.icon-container {
  width: 20px;
  height: 20px;
}
</style>
