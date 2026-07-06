<script setup lang="ts">
import { InputText, Button, useDialog } from "primevue";
import { useCollectionManagerStore } from "../store/collectionManager";
import CollectionItem from "./CollectionItem.vue";
import { useRouter } from "vue-router";
import { MenuItem } from "primevue/menuitem";

import { CollectionNode, NodeSearchParams, ColumnEntry, PaginationData, PaginationResult, NodeDto } from "../models/types";
import { useGuidelinesStore } from "../store/guidelines";
import MultiSelect from "primevue/multiselect";
import Menu from "primevue/menu";
import { computed, onMounted, ref, useTemplateRef, watch } from "vue";
import OverlayBadge from "primevue/overlaybadge";
import { useSearchParams } from "../composables/useSearchParams";
import { useAppStore } from "../store/app";
import { useEventListener, useInfiniteScroll } from "@vueuse/core";
import CreateCollectionModal from "./CreateCollectionModal.vue";

const props = defineProps<{
  index: number;
  parentUuid: string | null;
}>();

const router = useRouter();

const { api, addToastMessage, createModalInstance, destroyModalInstance } = useAppStore();
const dialog: ReturnType<typeof useDialog> = useDialog();

const { getAvailableCollectionLabels } = useGuidelinesStore();
const { activeCollection, canNavigate, levels, createNewUrlPath, setMode } = useCollectionManagerStore();
const { searchParams, updateSearchParams } = useSearchParams({ scope: "Collection", rowCount: 25 });

const addMenu = useTemplateRef<InstanceType<typeof Menu>>("add-menu");

const addMenuItems: MenuItem[] = [
  { label: "New", icon: "pi pi-file-plus", command: () => openCreateCollectionModal("new") },
  {
    label: "Existing",
    icon: "pi pi-search",
    command: () => openCreateCollectionModal("existing"),
    visible: props.index !== 0,
  },
];

const availableCollectionLabels = getAvailableCollectionLabels();

const columnPagination = ref<PaginationData>(null);

const column = useTemplateRef<HTMLDivElement>("column");
const scrollPane = useTemplateRef<HTMLDivElement>("scroll-pane");
const resizer = useTemplateRef<HTMLDivElement>("resizer");

const areAllLabelsSelected = computed<boolean>(() => searchParams.value.nodeLabels.length === availableCollectionLabels.length);

const initialDataAreFetched = ref<boolean>(false);
// The useInfiniteScroll composable has its own loading state management, but it does not work
// well with the initial data fetching logic. Therefore, an component wide loading state is used.
const isLoading = ref<boolean>(false);

useEventListener(resizer, "mousedown", startResize);
useEventListener(window, "mouseup", endResize);

// TODO: Use reset method as soon vueUse package version is updated
useInfiniteScroll(scrollPane, fetchMoreData, {
  distance: searchParams.value.rowCount,
  canLoadMore: () => {
    // Prevent parallel loading
    if (isLoading.value) {
      return false;
    }

    // Initial data fetching should come from the component lifecycle
    if (!initialDataAreFetched.value) {
      return false;
    }

    // If no cursor available, nothing more to load (obviously)
    if (columnPagination.value?.nextCursor === null) {
      return false;
    }

    return true;
  },
});

watch(searchParams, handleSearchParamsChange, {
  deep: true,
});

watch(() => props.parentUuid, handleParentUuidChange, {
  immediate: true,
});

onMounted(() => {
  scrollToColumn();
});

function addData(data: NodeDto<CollectionNode>[]) {
  const columnEntries: ColumnEntry[] = data.map((c) => {
    return {
      data: {
        node: c.node,
        connectedNodes: [],
      },
      status: "existing",
    };
  });

  levels.value[props.index].collections.push(...columnEntries);
}

function endResize() {
  window.removeEventListener("mousemove", handleResize);
}

async function fetchData(): Promise<PaginationResult<NodeDto<CollectionNode>[]>> {
  const { data, pagination } = await api.getChildCollections(props.parentUuid, {
    filters: searchParams.value,
    cursor: columnPagination.value?.nextCursor,
  });

  return { data, pagination };
}

async function fetchInitialData(): Promise<void> {
  setIsLoading(true);

  const { data, pagination } = await fetchData();
  replaceData(data);
  setPagination(pagination);

  initialDataAreFetched.value = true;

  setIsLoading(false);
}

async function fetchMoreData(): Promise<void> {
  setIsLoading(true);

  const { data, pagination } = await fetchData();

  const filteredData: NodeDto<CollectionNode>[] = removeDuplicatesAfterFetching(data);

  addData(filteredData);
  setPagination(pagination);

  setIsLoading(false);
}

function openCreateCollectionModal(mode: "new" | "existing") {
  if (!canNavigate.value) {
    showUnsavedChangesWarning();
    return;
  }

  const parentCollection: CollectionNode | null =
    props.index > 0 ? levels.value[props.index - 1]?.activeCollection?.node ?? null : null;

  //TODO: this is a hack, should be removed
  if (parentCollection && !parentCollection.nodeLabels.includes("Collection")) {
    parentCollection.nodeLabels.push("Collection");
  }

  createModalInstance(
    dialog.open(CreateCollectionModal, {
      props: {
        modal: true,
        closable: false,
        header: mode === "new" ? "Create new Collection" : "Add existing Collection",
        style: { width: "420px" },
      },
      data: { mode, parentCollection },
      emits: {
        onSuccess: async (createdCollection: NodeDto<CollectionNode>) => {
          // Should not be the case, but still
          if (!createdCollection) {
            return;
          }

          // Create new item and add it to beginning of list (should be visible directly)
          const columnItem: ColumnEntry = {
            data: createdCollection,
            status: "existing",
          };

          levels.value[props.index].collections.unshift(columnItem);

          // Update route when new collection was created (created collection must be in focus and children displayed)
          await router.push({
            query: { path: createNewUrlPath(createdCollection.node.data.uuid, props.index) },
          });

          addToastMessage({
            severity: "success",
            summary: "Operation successful",
            detail: "",
            life: 2000,
          });

          setMode("view");

          // Close modal
          destroyModalInstance();
        },
      },
      onClose: destroyModalInstance,
    }),
  );
}

function toggleAddMenu(event: Event) {
  addMenu.value?.toggle(event);
}

function handleChangeSortOrderClick() {
  resetPagination();
  updateSearchParams({
    sortDirection: searchParams.value.sortDirection === "asc" ? "desc" : "asc",
  });
}

async function handleParentUuidChange() {
  resetPagination();
  await fetchInitialData();

  initialDataAreFetched.value = true;
}

async function handleItemSelected(uuid: string): Promise<void> {
  if (!canNavigate.value) {
    showUnsavedChangesWarning();
    return;
  }

  const isAlreadyActiveInEditPane: boolean = uuid === activeCollection.value?.collection.node.data.uuid;

  // Nothing happens, return
  if (isAlreadyActiveInEditPane) {
    return;
  }

  await updateUrlPath(uuid, props.index);
}

function handleNodeLabelsChange(selectedLabels: string[]) {
  const data: NodeSearchParams = {
    nodeLabels: selectedLabels,
  };

  updateSearchParams(data);
}

async function handleRefreshClick() {
  if (isLoading.value) {
    return;
  }

  setIsLoading(true);
  setPagination(null);

  const { data, pagination } = await fetchData();
  replaceData(data);
  setPagination(pagination);

  initialDataAreFetched.value = true;

  setIsLoading(false);
}

function handleResize(event: MouseEvent) {
  if (!column.value) {
    return;
  }

  const newWidth: number = event.clientX - column.value.getBoundingClientRect().left;
  column.value.style.width = `${newWidth}px`;
}

function handleSearchInputChange(newInput: string | undefined) {
  const data: NodeSearchParams = {
    searchInput: newInput ?? "",
  };

  updateSearchParams(data, { immediate: false });
}

async function handleSearchParamsChange(): Promise<void> {
  resetPagination();
  await fetchInitialData();
}

/**
 * Removes collections from the given data that already exist in the current column. Called after fetching more data on scrolling.
 *
 * A duplicate is the case when the user created a new collection which gets added on top of the list for UX reasons.
 * When data are fetched alphabetically, it might be loaded again.
 *
 * @param {NodeDto<CollectionNode>[]} data - The collection data to filter.
 * @returns {NodeDto<CollectionNode>[]} The filtered data.
 */
function removeDuplicatesAfterFetching(data: NodeDto<CollectionNode>[]): NodeDto<CollectionNode>[] {
  const existingUuids = new Set<string>(levels.value[props.index].collections.map((c: ColumnEntry) => c.data.node.data.uuid));

  const filteredData: NodeDto<CollectionNode>[] = data.filter((c) => !existingUuids.has(c.node.data.uuid));

  return filteredData;
}

function replaceData(data: NodeDto<CollectionNode>[]) {
  levels.value[props.index].collections = data.map((c) => {
    return {
      data: c,
      status: "existing",
    };
  });
}

function resetPagination(): void {
  setPagination(null);
}

function setPagination(newPagination: PaginationData) {
  columnPagination.value = newPagination;
}

function showUnsavedChangesWarning() {
  addToastMessage({
    severity: "warn",
    summary: "You have unsaved changes.",
    detail: "Please save or discard your changes before selecting other collections.",
    life: 3000,
  });
}

async function updateUrlPath(uuid: string, index: number): Promise<void> {
  await router.push({ query: { path: createNewUrlPath(uuid, index) } });
}

function scrollToColumn() {
  column.value?.scrollIntoView({ behavior: "smooth" });
}

function setIsLoading(state: boolean) {
  isLoading.value = state;
}

function startResize() {
  window.addEventListener("mousemove", handleResize);
}
</script>

<template>
  <div ref="column" class="column flex flex-column p-1">
    <div class="header flex gap-1">
      <InputText
        size="small"
        class="w-full"
        :model-value="searchParams.searchInput"
        spellcheck="false"
        placeholder="Filter by label"
        title="Filter Collections by label"
        @update:model-value="handleSearchInputChange"
      />
      <MultiSelect
        :model-value="searchParams.nodeLabels"
        :options="availableCollectionLabels"
        dropdown-icon="pi pi-filter"
        :filter="false"
        title="Select node labels to filter"
        class="flex-shrink-0"
        :pt="{
          root: {
            style: {
              height: '100%',
            },
          },
          dropdownIcon: 'pi pi-filter',
          labelContainer: {
            style: {
              display: 'none',
            },
          },
        }"
        @update:model-value="handleNodeLabelsChange"
      >
        <template #dropdownicon>
          <OverlayBadge v-if="!areAllLabelsSelected" severity="danger">
            <i class="pi pi-filter-fill" />
          </OverlayBadge>
        </template>
      </MultiSelect>
      <Button size="small" severity="secondary" icon="pi pi-refresh" title="Refresh data" @click="handleRefreshClick" />
      <Button
        size="small"
        severity="secondary"
        icon="pi pi-sort-alpha-down"
        title="Change sort"
        @click="handleChangeSortOrderClick"
      />
    </div>
    <div ref="scroll-pane" class="content">
      <CollectionItem
        v-for="collection of levels[props.index].collections"
        :key="collection.data.node.data.uuid"
        :collection="collection"
        :is-active="levels[props.index].activeCollection?.node.data.uuid === collection.data.node.data.uuid"
        @item-selected="handleItemSelected"
      ></CollectionItem>
      <div v-if="isLoading && levels[props.index].collections.length > 0" class="text-center" title="More data are loading...">
        <span class="pi pi-spin pi-spinner"></span>
      </div>
    </div>
    <div class="count text-xs text-right pr-3">
      {{ levels[props.index].collections.length }}/{{ columnPagination?.totalRecords }}
    </div>
    <div class="footer flex justify-content-center">
      <Button
        size="small"
        severity="secondary"
        icon="pi pi-plus"
        class="w-full"
        label="Add Collection"
        title="Add Collection"
        @click="toggleAddMenu"
      />
      <Menu ref="add-menu" :model="addMenuItems" :popup="true" />
    </div>
  </div>
  <div ref="resizer" class="resizer" title="Hold down mouse and drag to resize column">
    <div class="handle"></div>
  </div>
</template>

<style scoped>
.column {
  display: flex;
  width: 200px;
}

.resizer {
  padding: 10px 0;
  background-color: var(--p-splitter-gutter-background);
  width: 7px;
  cursor: col-resize;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  .handle {
    width: 3px;
    border-radius: 5px;
    background-color: rgb(143, 143, 143);
    height: 50px;
  }
}

.header > * {
  min-width: 0;
}

.content {
  overflow-y: auto;
  overflow-x: hidden;
  flex-grow: 1;
  scrollbar-width: thin;
  scrollbar-gutter: stable;
}

.cursor-item {
  background-color: orange;
  font-size: 0.75rem;
}
</style>
