import { ref, Ref } from 'vue';
import { EditorSettings } from '../models/types';

const DEFAULT_SETTINGS: EditorSettings = {
  blockDecorations: {
    outline: true,
    baseType: true,
    semanticTypes: false,
  },
};

// Module-level singleton so every consumer (the block-decoration extension, the
// settings popover, ...) shares one reactive instance. Not persisted for now e.g. in local storage -
// the defaults are applied fresh on every app load.
const settings: Ref<EditorSettings> = ref<EditorSettings>(structuredClone(DEFAULT_SETTINGS));

/**
 * Store for editor settings. Currently only used for adding/removing decorations in tiptap.
 * Might be refactored later into different, domain-specific stores...
 *
 * @returns
 */
export function useEditorSettingsStore(): { settings: Ref<EditorSettings> } {
  return {
    settings,
  };
}
