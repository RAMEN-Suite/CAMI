<script setup lang="ts">
import { inject } from 'vue';
import Fieldset from 'primevue/fieldset';
import { Annotation, AnnotationType, PropertyConfig } from '../models/types';
import { useGuidelinesStore } from '../store/guidelines';
import FormPropertiesSection from './FormPropertiesSection.vue';
import AnnotationTypeIcon from './AnnotationTypeIcon.vue';
import AnnotationFormAdditionalNodesSection from './AnnotationFormAdditionalNodesSection.vue';

const dialogRef: any = inject('dialogRef');
const annotation: Annotation = dialogRef.value.data.annotation;

const { getAnnotationConfig, getAnnotationFields } = useGuidelinesStore();
const config: AnnotationType = getAnnotationConfig(annotation.node.data.type);
const propertyFields: PropertyConfig[] = getAnnotationFields(annotation.node.data.type);
</script>

<template>
  <div class="semantic-block-details">
    <div class="flex items-center gap-2 mb-3">
      <div class="icon-container">
        <AnnotationTypeIcon
          :annotationType="annotation.node.data.subType ?? annotation.node.data.type"
        />
      </div>
      <span class="font-bold">{{ annotation.node.data.subType ?? annotation.node.data.type }}</span>
    </div>
    <Fieldset legend="Properties" :toggleable="false">
      <FormPropertiesSection v-model="annotation.node.data" :fields="propertyFields" mode="view" />
    </Fieldset>
    <AnnotationFormAdditionalNodesSection
      v-if="config.hasEntities === true"
      v-model="annotation.connectedNodes"
      mode="view"
      :annotation-config="config"
    />
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
