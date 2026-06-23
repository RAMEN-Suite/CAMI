import { computed, readonly, ref } from 'vue';
import { useAnnotationStore } from './annotations';
import { useCharactersStore } from './characters';
import { areSetsEqual } from '../utils/helper/helper';
import { CommandData, CommandType, RedrawModeOptions } from '../models/types';
import { useTextStore } from './text';

const { text, initialText } = useTextStore();
const {
  snippetCharacters,
  initialSnippetCharacters,
  annotateCharacters,
  deleteCharactersBetweenUuids,
  deleteWordAfterUuid,
  deleteWordBeforeUuid,
  insertCharactersBetweenUuids,
  removeAnnotationFromCharacters,
  replaceCharactersBetweenUuids,
} = useCharactersStore();
const {
  initialSnippetAnnotations,
  snippetAnnotations,
  addAnnotation,
  deleteAnnotation,
  expandAnnotation,
  shiftAnnotationLeft,
  shiftAnnotationRight,
  shrinkAnnotation,
} = useAnnotationStore();

const keepTextOnPagination = ref<boolean>(false);
const newRangeAnchorUuid = ref<string | null>(null);

// This is currently only used for restoring the range after a redraw action is canceled
const lastRangeSnapshot = ref<Range>(null);

const redrawMode = ref<RedrawModeOptions | null>(null);
const isRedrawMode = computed<boolean>(() => redrawMode.value?.direction === 'on');
const isContentEditable = computed<boolean>(() => !isRedrawMode.value);

/**
 * Store for editor state and operations (caret placement, change detection etc.). When the component is unmounted,
 * the store is reset.
 */
export function useEditorStore() {
  /**
   * Initializes the editor.
   *
   * Currently does nothing anymore since responsibilities have been given to Tiptap, but might be worth to keep it
   * since this is the app-wide initialization logic.
   *
   * @return {void} No return value.
   */
  function initializeEditor(): void {}

  /**
   * Creates a snapshot of the current window selection range and clears the selection.
   * Used for creating a snapshot when redraw mode is toggled on to restore it later if the redraw action is canceled.
   *
   * @returns {void} This function does not return any value.
   */
  function createRangeSnapshotAndClear(): void {
    const currentSelection: Selection = window.getSelection();

    lastRangeSnapshot.value = currentSelection?.getRangeAt(0);
    currentSelection?.removeAllRanges();
  }

  function execCommand(command: CommandType, data: CommandData): void {
    const { annotation, characters, leftUuid, rightUuid } = data;

    let newCaretPosition: string | null = null;

    if (command === 'insertText') {
      const { changeSet } = insertCharactersBetweenUuids(leftUuid, characters);
      newCaretPosition = changeSet[changeSet.length - 1]?.data.uuid;
    } else if (command === 'replaceText') {
      const { changeSet } = replaceCharactersBetweenUuids(leftUuid, rightUuid, characters);
      newCaretPosition = changeSet[changeSet.length - 1]?.data.uuid;
    } else if (command === 'deleteWordBefore') {
      const { leftBoundary } = deleteWordBeforeUuid(rightUuid);
      newCaretPosition = leftBoundary;
    } else if (command === 'deleteWordAfter') {
      const { rightBoundary } = deleteWordAfterUuid(leftUuid);
      newCaretPosition = rightBoundary;
    } else if (command === 'deleteText') {
      const { leftBoundary } = deleteCharactersBetweenUuids(leftUuid, rightUuid);
      newCaretPosition = leftBoundary;
    } else if (command === 'createAnnotation') {
      addAnnotation(annotation);
      const { changeSet } = annotateCharacters(characters, annotation);
      newCaretPosition = changeSet[changeSet.length - 1]?.data.uuid;
    } else if (command === 'deleteAnnotation') {
      deleteAnnotation(annotation.data.properties.uuid);
      const { changeSet } = removeAnnotationFromCharacters(annotation.data.properties.uuid);
      newCaretPosition = changeSet[changeSet.length - 1]?.data.uuid;
    } else if (command === 'redrawAnnotation') {
      removeAnnotationFromCharacters(annotation.data.properties.uuid);
      const { changeSet } = annotateCharacters(characters, annotation);
      newCaretPosition = changeSet[changeSet.length - 1]?.data.uuid;
    } else if (command === 'shiftAnnotationLeft') {
      const { changeSet } = shiftAnnotationLeft(annotation);
      newCaretPosition = changeSet[changeSet.length - 1]?.data.uuid;
    } else if (command === 'shiftAnnotationRight') {
      const { changeSet } = shiftAnnotationRight(annotation);
      newCaretPosition = changeSet[changeSet.length - 1]?.data.uuid;
    } else if (command === 'expandAnnotation') {
      const { changeSet } = expandAnnotation(annotation);
      newCaretPosition = changeSet[changeSet.length - 1]?.data.uuid;
    } else if (command === 'shrinkAnnotation') {
      const { changeSet } = shrinkAnnotation(annotation);
      newCaretPosition = changeSet[changeSet.length - 1]?.data.uuid;
    }

    setNewRangeAnchorUuid(newCaretPosition);
  }

  /**
   * Places the caret at the specified position within the editor.
   *
   * If a new range anchor UUID is provided, the caret is placed at the corresponding element.
   * Otherwise, the caret is placed at the first span element within the #text container, or at the #text container itself if no span element is found.
   *
   * Called by an `onUpdated` hook in the `EditorText` component.
   *
   * @return {void}
   */
  function placeCaret(): void {
    const range: Range = document.createRange();
    let element: HTMLDivElement | HTMLSpanElement | null;
    let offset: 0 | 1 = 1;

    if (newRangeAnchorUuid.value) {
      element = document.getElementById(newRangeAnchorUuid.value) as HTMLSpanElement;
    } else {
      element = document.querySelector('#text > span') as HTMLSpanElement;

      // Offset needs to be zero since the caret should be placed BEFORE the first matched span element
      if (element) {
        offset = 0;
      }

      // If no span element is found (=no text), place the caret at the #text container
      if (!element) {
        element = document.querySelector('#text') as HTMLDivElement;
      }
    }

    // This is the case when newRangeAnchorUuid points to a character that was deleted after cancel -> span can't be matched
    // TODO: Fix this? (Set range anchor to first/last span in text, ...)
    if (!element) {
      return;
    }

    range.setStart(element, offset);
    range.setEnd(element, offset);
    range.collapse(true);

    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  }

  function hasUnsavedChanges(): boolean {
    // Compare text labels
    // TODO: This needs to be adjusted as soon as labels can be edited
    if (!areSetsEqual(new Set(initialText.value.nodeLabels), new Set(text.value.nodeLabels))) {
      return true;
    }

    // Compare characters length
    if (snippetCharacters.value.length !== initialSnippetCharacters.value.length) {
      return true;
    }

    // Compare annotations array length
    if (
      snippetAnnotations.value.filter(a => a.status !== 'deleted').length !==
      initialSnippetAnnotations.value.length
    ) {
      console.log('Annotation length has changed.');
      return true;
    }

    // Compare characters by uuid to see if the text has changed
    for (let i = 0; i < snippetCharacters.value.length; i++) {
      if (snippetCharacters.value[i].data.uuid !== initialSnippetCharacters.value[i].data.uuid) {
        return true;
      }
    }

    // Compare annotations of characters to see if annotation ranges have changed
    for (let i = 0; i < snippetCharacters.value.length; i++) {
      const annotationsAreEqual: boolean = areSetsEqual(
        new Set(snippetCharacters.value[i].annotations.map(a => a.uuid)),
        new Set(initialSnippetCharacters.value[i].annotations.map(a => a.uuid)),
      );

      if (!annotationsAreEqual) {
        return true;
      }
    }

    // Check annotation status and data
    for (const a of snippetAnnotations.value.values()) {
      const entityUuids: Set<string> = new Set(a.data.entities.map(m => m.data.uuid));
      const initialEntityUuids: Set<string> = new Set(a.initialData.entities.map(m => m.data.uuid));

      const initialAdditionalTextUuids: Set<string> = new Set(
        a.initialData.additionalTexts.map(at => at.annotation.uuid),
      );

      const additionalTextUuids: Set<string> = new Set(
        a.data.additionalTexts.map(at => at.annotation.uuid),
      );

      if (
        a.status === 'deleted' ||
        a.status === 'created' ||
        JSON.stringify(a.data.properties) !== JSON.stringify(a.initialData.properties) ||
        !areSetsEqual(entityUuids, initialEntityUuids) ||
        !areSetsEqual(initialAdditionalTextUuids, additionalTextUuids)
      ) {
        console.log(`Annotation with UUID ${a.data.properties.uuid} has a changed status or data.`);
        return true;
      }
    }

    return false;
  }

  function resetEditor(): void {
    toggleRedrawMode({ direction: 'off', cause: 'success' });
    setNewRangeAnchorUuid(null);
  }

  /**
   * Restores the selection range snapshot that was created when redraw mode was toggled on.
   *
   * Called when the redraw mode is toggled off and the selection range should be restored to its original state.
   * The function waits for the next animation frame to ensure that the selection range is restored after the `placeCaret` function
   * is called by the editor's `onUpdated` hook.
   *
   * @returns {void} This function does not return any value.
   */
  function restoreRangeSnapshot(): void {
    setTimeout(() => {
      const currentSelection: Selection | null = window.getSelection();

      currentSelection?.removeAllRanges();
      currentSelection?.addRange(lastRangeSnapshot.value);
    }, 0);
  }

  /**
   * Sets the UUID of the character whose span will be the range start after the next selection change.
   *
   * Called after each text operation. The `placeCaret` function will use this variable to set the caret to the specified element.
   *
   * @param {string | null | undefined} uuid - The UUID of the character or `null`/`undefined`.
   * @returns {void} No return value.
   */
  function setNewRangeAnchorUuid(uuid: string | null | undefined): void {
    newRangeAnchorUuid.value = uuid ?? null;
  }

  /**
   * Toggles the redraw mode on or off.
   *
   * If the direction is 'on', it takes a snapshot of the current selection range and clears it.
   * If the direction is 'off', it restores the last range snapshot if the mode was actively canceled or sets the snapshot
   * to `null` otherwise (i. e. when the editor component was unmounted after page leave).
   *
   * @param {RedrawModeOptions} options - An object containing the direction of the redraw mode and the cause of the mode change.
   */
  function toggleRedrawMode(options: RedrawModeOptions): void {
    if (options?.direction === 'on') {
      createRangeSnapshotAndClear();

      redrawMode.value = options;
    } else {
      redrawMode.value = null;

      if (options?.cause === 'cancel') {
        restoreRangeSnapshot();
      } else {
        lastRangeSnapshot.value = null;
      }
    }
  }

  return {
    isContentEditable,
    isRedrawMode,
    redrawMode: readonly(redrawMode),
    newRangeAnchorUuid: readonly(newRangeAnchorUuid),
    keepTextOnPagination,
    lastRangeSnapshot,
    execCommand,
    hasUnsavedChanges,
    initializeEditor,
    placeCaret,
    resetEditor,
    setNewRangeAnchorUuid,
    toggleRedrawMode,
  };
}
