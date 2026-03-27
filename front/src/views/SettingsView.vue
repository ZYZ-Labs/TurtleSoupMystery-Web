<template>
  <v-row>
    <v-col cols="12" lg="5">
      <v-card class="glass-card mb-4">
        <v-card-title class="d-flex align-center justify-space-between flex-wrap ga-3 px-6 pt-6">
          <div class="section-title">供应商列表</div>
          <v-btn variant="outlined" @click="handleNewSupplier">新增供应商</v-btn>
        </v-card-title>
        <v-card-text class="pt-4">
          <v-list v-if="config?.suppliers.length" density="comfortable" lines="two">
            <v-list-item
              v-for="supplier in config.suppliers"
              :key="supplier.supplierId"
              :active="supplier.supplierId === selectedSupplierId"
              rounded="lg"
              @click="selectSupplier(supplier.supplierId)"
            >
              <v-list-item-title>{{ supplier.label }}</v-list-item-title>
              <v-list-item-subtitle>{{ supplier.baseUrl || '未配置地址' }}</v-list-item-subtitle>
              <template #append>
                <v-chip size="small" :color="statusColor(supplier.lastStatus)" variant="flat">
                  {{ statusLabel(supplier.lastStatus) }}
                </v-chip>
              </template>
            </v-list-item>
          </v-list>
          <v-alert v-else type="info" variant="tonal">还没有供应商，先在这里添加一个 Ollama 供应商。</v-alert>
        </v-card-text>
      </v-card>

      <v-card class="glass-card">
        <v-card-title class="section-title px-6 pt-6">
          {{ selectedSupplierId ? '编辑供应商' : '新增供应商' }}
        </v-card-title>
        <v-card-text class="pt-4">
          <v-form @submit.prevent="handleSaveSupplier">
            <v-row>
              <v-col cols="12">
                <v-text-field v-model="supplierForm.label" label="供应商名称" />
              </v-col>
              <v-col cols="12" md="4">
                <v-select
                  v-model="supplierForm.provider"
                  :items="providerItems"
                  item-title="title"
                  item-value="value"
                  label="供应商类型"
                />
              </v-col>
              <v-col cols="12" md="8">
                <v-text-field
                  v-model="supplierForm.baseUrl"
                  label="Ollama 地址"
                  hint="例如 http://192.168.1.10:11434"
                  persistent-hint
                />
              </v-col>
              <v-col cols="12">
                <v-text-field
                  v-model.number="supplierForm.timeoutMs"
                  label="超时时间（毫秒）"
                  type="number"
                  min="1000"
                  max="120000"
                />
              </v-col>
            </v-row>

            <div class="d-flex flex-wrap ga-3 mt-2">
              <v-btn color="primary" type="submit" :loading="savingSupplier">保存供应商</v-btn>
              <v-btn
                variant="outlined"
                color="secondary"
                :disabled="!selectedSupplierId"
                :loading="refreshingSupplierId === selectedSupplierId"
                @click.prevent="selectedSupplierId && handleRefreshSupplier(selectedSupplierId)"
              >
                刷新模型
              </v-btn>
              <v-btn variant="text" :disabled="!selectedSupplierId" @click.prevent="handleNewSupplier">清空</v-btn>
              <v-btn
                variant="text"
                color="error"
                :disabled="!selectedSupplierId"
                :loading="deletingSupplier"
                @click.prevent="handleDeleteSupplier"
              >
                删除供应商
              </v-btn>
            </div>

            <v-alert v-if="selectedSupplier?.lastError" type="error" variant="tonal" class="mt-4">
              {{ selectedSupplier.lastError }}
            </v-alert>
          </v-form>
        </v-card-text>
      </v-card>
    </v-col>

    <v-col cols="12" lg="7">
      <v-card class="glass-card mb-4">
        <v-card-title class="section-title px-6 pt-6">运行时模型选择</v-card-title>
        <v-card-text class="pt-4">
          <v-form @submit.prevent="handleSaveRuntime">
            <v-row>
              <v-col cols="12">
                <div class="text-subtitle-1 font-weight-bold mb-2">汤底生成</div>
              </v-col>
              <v-col cols="12" md="4">
                <v-select
                  v-model="runtimeForm.generationSupplierId"
                  :items="supplierItems"
                  item-title="title"
                  item-value="value"
                  label="供应商"
                  hint="切换后会自动刷新该供应商模型。"
                  persistent-hint
                />
              </v-col>
              <v-col cols="12" md="4">
                <v-select
                  v-model="runtimeForm.generationModelCategory"
                  :items="categoryItems"
                  item-title="title"
                  item-value="value"
                  label="模型分类"
                />
              </v-col>
              <v-col cols="12" md="4">
                <v-select
                  v-model="runtimeForm.generationModel"
                  :items="generationModelItems"
                  item-title="title"
                  item-value="value"
                  label="生成模型"
                  :disabled="!generationModelItems.length"
                />
              </v-col>
            </v-row>

            <v-row class="mt-2">
              <v-col cols="12">
                <div class="text-subtitle-1 font-weight-bold mb-2">文本校验</div>
              </v-col>
              <v-col cols="12" md="4">
                <v-select
                  v-model="runtimeForm.validationSupplierId"
                  :items="supplierItems"
                  item-title="title"
                  item-value="value"
                  label="供应商"
                  hint="切换后会自动刷新该供应商模型。"
                  persistent-hint
                />
              </v-col>
              <v-col cols="12" md="4">
                <v-select
                  v-model="runtimeForm.validationModelCategory"
                  :items="categoryItems"
                  item-title="title"
                  item-value="value"
                  label="模型分类"
                />
              </v-col>
              <v-col cols="12" md="4">
                <v-select
                  v-model="runtimeForm.validationModel"
                  :items="validationModelItems"
                  item-title="title"
                  item-value="value"
                  label="校验模型"
                  :disabled="!validationModelItems.length"
                />
              </v-col>
            </v-row>

            <div class="d-flex flex-wrap ga-3 mt-4">
              <v-btn color="primary" type="submit" :loading="savingRuntime">保存运行配置</v-btn>
            </div>
          </v-form>
        </v-card-text>
      </v-card>

      <v-card class="glass-card">
        <v-card-title class="section-title px-6 pt-6">当前摘要</v-card-title>
        <v-card-text class="pt-4">
          <div class="d-flex align-center justify-space-between mb-3">
            <span class="text-medium-emphasis">供应商数量</span>
            <span>{{ config?.suppliers.length ?? 0 }}</span>
          </div>
          <div class="d-flex align-center justify-space-between mb-3">
            <span class="text-medium-emphasis">生成供应商</span>
            <span>{{ generationSupplier?.label || '未选择' }}</span>
          </div>
          <div class="d-flex align-center justify-space-between mb-3">
            <span class="text-medium-emphasis">生成模型</span>
            <span>{{ runtimeForm.generationModel || '未选择' }}</span>
          </div>
          <div class="d-flex align-center justify-space-between mb-3">
            <span class="text-medium-emphasis">校验供应商</span>
            <span>{{ validationSupplier?.label || '未选择' }}</span>
          </div>
          <div class="d-flex align-center justify-space-between">
            <span class="text-medium-emphasis">校验模型</span>
            <span>{{ runtimeForm.validationModel || '未选择' }}</span>
          </div>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  createOllamaSupplier,
  deleteOllamaSupplier,
  fetchOllamaConfig,
  refreshOllamaSupplierModels,
  saveOllamaRuntimeConfig,
  updateOllamaSupplier
} from '@/api/services';
import { extractErrorMessage } from '@/lib/errors';
import { formatBytes } from '@/lib/format';
import { useUiStore } from '@/stores/ui';
import type { AIProvider, ConnectionStatus, ModelCategory, OllamaConfig, OllamaModel, OllamaSupplier } from '@/types/api';

const ui = useUiStore();
const config = ref<OllamaConfig | null>(null);
const selectedSupplierId = ref('');
const savingSupplier = ref(false);
const deletingSupplier = ref(false);
const refreshingSupplierId = ref('');
const savingRuntime = ref(false);

const providerItems = [{ title: 'Ollama（局域网）', value: 'ollama' satisfies AIProvider }];
const categoryItems = [
  { title: '全部', value: 'all' satisfies ModelCategory },
  { title: '平衡', value: 'balanced' satisfies ModelCategory },
  { title: '推理', value: 'reasoning' satisfies ModelCategory },
  { title: '轻量', value: 'lightweight' satisfies ModelCategory },
  { title: '多模态', value: 'multimodal' satisfies ModelCategory },
  { title: '其他', value: 'other' satisfies ModelCategory }
];

const supplierForm = reactive({
  label: '',
  provider: 'ollama' as AIProvider,
  baseUrl: '',
  timeoutMs: 30000
});

const runtimeForm = reactive({
  generationSupplierId: '',
  generationModelCategory: 'all' as ModelCategory,
  generationModel: '',
  validationSupplierId: '',
  validationModelCategory: 'all' as ModelCategory,
  validationModel: ''
});

const selectedSupplier = computed(() =>
  config.value?.suppliers.find((supplier) => supplier.supplierId === selectedSupplierId.value) ?? null
);

const generationSupplier = computed(() =>
  config.value?.suppliers.find((supplier) => supplier.supplierId === runtimeForm.generationSupplierId) ?? null
);

const validationSupplier = computed(() =>
  config.value?.suppliers.find((supplier) => supplier.supplierId === runtimeForm.validationSupplierId) ?? null
);

const supplierItems = computed(() =>
  (config.value?.suppliers ?? []).map((supplier) => ({
    title: supplier.label,
    value: supplier.supplierId
  }))
);

function categoryLabel(category: Exclude<ModelCategory, 'all'>) {
  return {
    balanced: '平衡',
    reasoning: '推理',
    lightweight: '轻量',
    multimodal: '多模态',
    other: '其他'
  }[category];
}

function statusLabel(status: ConnectionStatus) {
  return {
    idle: '未检测',
    connected: '已连接',
    error: '异常'
  }[status];
}

function statusColor(status: ConnectionStatus) {
  return {
    idle: 'warning',
    connected: 'success',
    error: 'error'
  }[status];
}

function modelsForSupplier(supplierId: string, category: ModelCategory) {
  const supplier = config.value?.suppliers.find((item) => item.supplierId === supplierId);
  const models = supplier?.availableModels ?? [];
  return category === 'all' ? models : models.filter((model) => model.category === category);
}

function pickModel(supplierId: string, category: ModelCategory, selected: string) {
  const supplierModels = modelsForSupplier(supplierId, category);
  const normalizedSelected = selected.trim();

  if (normalizedSelected && supplierModels.some((model) => model.name === normalizedSelected || model.model === normalizedSelected)) {
    return normalizedSelected;
  }

  if (supplierModels.length > 0) {
    return supplierModels[0]?.name || supplierModels[0]?.model || '';
  }

  return '';
}

function toModelItems(models: OllamaModel[]) {
  return models.map((item) => ({
    title: `${item.name} · ${categoryLabel(item.category)} · ${item.parameterSize || formatBytes(item.size)}`,
    value: item.name
  }));
}

const generationModelItems = computed(() =>
  toModelItems(modelsForSupplier(runtimeForm.generationSupplierId, runtimeForm.generationModelCategory))
);

const validationModelItems = computed(() =>
  toModelItems(modelsForSupplier(runtimeForm.validationSupplierId, runtimeForm.validationModelCategory))
);

function syncSupplierForm(supplier: OllamaSupplier | null) {
  supplierForm.label = supplier?.label ?? '';
  supplierForm.provider = supplier?.provider ?? 'ollama';
  supplierForm.baseUrl = supplier?.baseUrl ?? '';
  supplierForm.timeoutMs = supplier?.timeoutMs ?? 30000;
}

function syncRuntimeForm(source: OllamaConfig) {
  runtimeForm.generationSupplierId = source.generationSupplierId;
  runtimeForm.generationModelCategory = source.generationModelCategory;
  runtimeForm.generationModel = source.generationModel;
  runtimeForm.validationSupplierId = source.validationSupplierId;
  runtimeForm.validationModelCategory = source.validationModelCategory;
  runtimeForm.validationModel = source.validationModel;
}

function ensureRuntimeSelections() {
  runtimeForm.generationModel = pickModel(
    runtimeForm.generationSupplierId,
    runtimeForm.generationModelCategory,
    runtimeForm.generationModel
  );
  runtimeForm.validationModel = pickModel(
    runtimeForm.validationSupplierId,
    runtimeForm.validationModelCategory,
    runtimeForm.validationModel
  );
}

function selectSupplier(supplierId: string) {
  selectedSupplierId.value = supplierId;
  syncSupplierForm(config.value?.suppliers.find((supplier) => supplier.supplierId === supplierId) ?? null);
}

function handleNewSupplier() {
  selectedSupplierId.value = '';
  syncSupplierForm(null);
}

async function loadConfig() {
  try {
    config.value = await fetchOllamaConfig();
    syncRuntimeForm(config.value);
    ensureRuntimeSelections();

    if (config.value.suppliers.length > 0) {
      selectSupplier(config.value.suppliers[0]?.supplierId ?? '');
    } else {
      handleNewSupplier();
    }
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  }
}

async function handleSaveSupplier() {
  savingSupplier.value = true;

  try {
    const previousIds = new Set(config.value?.suppliers.map((supplier) => supplier.supplierId) ?? []);
    config.value = selectedSupplierId.value
      ? await updateOllamaSupplier(selectedSupplierId.value, supplierForm)
      : await createOllamaSupplier(supplierForm);

    syncRuntimeForm(config.value);
    ensureRuntimeSelections();

    if (selectedSupplierId.value) {
      selectSupplier(selectedSupplierId.value);
    } else {
      const createdSupplier =
        config.value.suppliers.find((supplier) => !previousIds.has(supplier.supplierId)) ??
        config.value.suppliers.at(-1) ??
        null;

      if (createdSupplier) {
        selectSupplier(createdSupplier.supplierId);
      }
    }

    ui.notify('供应商已保存。', 'success');
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  } finally {
    savingSupplier.value = false;
  }
}

async function handleRefreshSupplier(supplierId: string, showToast = true) {
  if (!supplierId || refreshingSupplierId.value === supplierId) {
    return;
  }

  refreshingSupplierId.value = supplierId;

  try {
    const previousRuntime = {
      generationSupplierId: runtimeForm.generationSupplierId,
      generationModelCategory: runtimeForm.generationModelCategory,
      generationModel: runtimeForm.generationModel,
      validationSupplierId: runtimeForm.validationSupplierId,
      validationModelCategory: runtimeForm.validationModelCategory,
      validationModel: runtimeForm.validationModel
    };

    config.value = await refreshOllamaSupplierModels(supplierId);
    runtimeForm.generationSupplierId = previousRuntime.generationSupplierId;
    runtimeForm.generationModelCategory = previousRuntime.generationModelCategory;
    runtimeForm.generationModel = previousRuntime.generationModel;
    runtimeForm.validationSupplierId = previousRuntime.validationSupplierId;
    runtimeForm.validationModelCategory = previousRuntime.validationModelCategory;
    runtimeForm.validationModel = previousRuntime.validationModel;
    ensureRuntimeSelections();

    if (selectedSupplierId.value === supplierId) {
      selectSupplier(supplierId);
    }

    if (showToast) {
      ui.notify('模型列表已刷新。', 'success');
    }
  } catch (error) {
    if (showToast) {
      ui.notify(extractErrorMessage(error), 'error');
    }
  } finally {
    refreshingSupplierId.value = '';
  }
}

async function handleDeleteSupplier() {
  if (!selectedSupplierId.value) {
    return;
  }

  const supplier = selectedSupplier.value;
  const confirmed = window.confirm(`确定要删除供应商 ${supplier?.label ?? ''} 吗？`);

  if (!confirmed) {
    return;
  }

  deletingSupplier.value = true;

  try {
    config.value = await deleteOllamaSupplier(selectedSupplierId.value);
    syncRuntimeForm(config.value);
    ensureRuntimeSelections();

    if (config.value.suppliers.length > 0) {
      selectSupplier(config.value.suppliers[0]?.supplierId ?? '');
    } else {
      handleNewSupplier();
    }

    ui.notify('供应商已删除。', 'success');
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  } finally {
    deletingSupplier.value = false;
  }
}

async function handleSaveRuntime() {
  savingRuntime.value = true;

  try {
    config.value = await saveOllamaRuntimeConfig({
      generationSupplierId: runtimeForm.generationSupplierId,
      generationModelCategory: runtimeForm.generationModelCategory,
      generationModel: runtimeForm.generationModel,
      validationSupplierId: runtimeForm.validationSupplierId,
      validationModelCategory: runtimeForm.validationModelCategory,
      validationModel: runtimeForm.validationModel
    });

    syncRuntimeForm(config.value);
    ensureRuntimeSelections();
    ui.notify('运行配置已保存。', 'success');
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  } finally {
    savingRuntime.value = false;
  }
}

watch(
  () => runtimeForm.generationSupplierId,
  (supplierId, previousSupplierId) => {
    runtimeForm.generationModel = pickModel(supplierId, runtimeForm.generationModelCategory, runtimeForm.generationModel);

    if (supplierId && supplierId !== previousSupplierId) {
      void handleRefreshSupplier(supplierId, false);
    }
  }
);

watch(
  () => runtimeForm.validationSupplierId,
  (supplierId, previousSupplierId) => {
    runtimeForm.validationModel = pickModel(supplierId, runtimeForm.validationModelCategory, runtimeForm.validationModel);

    if (supplierId && supplierId !== previousSupplierId) {
      void handleRefreshSupplier(supplierId, false);
    }
  }
);

watch(
  () => runtimeForm.generationModelCategory,
  () => {
    runtimeForm.generationModel = pickModel(
      runtimeForm.generationSupplierId,
      runtimeForm.generationModelCategory,
      runtimeForm.generationModel
    );
  }
);

watch(
  () => runtimeForm.validationModelCategory,
  () => {
    runtimeForm.validationModel = pickModel(
      runtimeForm.validationSupplierId,
      runtimeForm.validationModelCategory,
      runtimeForm.validationModel
    );
  }
);

onMounted(() => {
  void loadConfig();
});
</script>
