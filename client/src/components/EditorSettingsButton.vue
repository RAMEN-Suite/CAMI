<script setup lang="ts">
import { useTemplateRef } from 'vue';
import Popover from 'primevue/popover';
import Button from 'primevue/button';
import ToggleSwitch from 'primevue/toggleswitch';
import { useEditorSettingsStore } from '../store/editorSettings';

const { settings } = useEditorSettingsStore();

const popover = useTemplateRef<InstanceType<typeof Popover>>('popover');

function toggle(event: PointerEvent): void {
  popover.value?.toggle(event);
}
</script>

<template>
  <Button
    icon="pi pi-cog"
    severity="secondary"
    aria-label="View settings"
    title="View settings"
    class="w-2rem h-2rem ml-1"
    @click="toggle"
  />
  <Popover ref="popover">
    <div class="flex flex-column gap-3 p-2" style="min-width: 16rem">
      <span class="font-bold">Block decorations</span>

      <div class="flex align-items-center justify-content-between gap-3">
        <label for="deco-outline">Show block outlines</label>
        <ToggleSwitch v-model="settings.blockDecorations.outline" inputId="deco-outline" />
      </div>

      <div class="flex align-items-center justify-content-between gap-3">
        <label for="deco-base">Show block names</label>
        <ToggleSwitch v-model="settings.blockDecorations.baseType" inputId="deco-base" />
      </div>

      <div class="flex align-items-center justify-content-between gap-3">
        <label for="deco-semantic">Show semantic block names</label>
        <ToggleSwitch v-model="settings.blockDecorations.semanticTypes" inputId="deco-semantic" />
      </div>
    </div>
  </Popover>
</template>

<style scoped>
label {
  cursor: pointer;
}
</style>
