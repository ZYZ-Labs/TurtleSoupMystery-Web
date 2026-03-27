<template>
  <v-row>
    <v-col cols="12" lg="7">
      <v-card class="glass-card">
        <v-card-title class="section-title px-6 pt-6">AI 连接与模型配置</v-card-title>
        <v-card-text class="pt-4">
          <v-form @submit.prevent="handleSave">
            <v-row>
              <v-col cols="12">
                <v-text-field
                  v-model="form.baseUrl"
                  label="Ollama 地址"
                  hint="例如 http://192.168.1.10:11434 或 http://host.docker.internal:11434"
                  persistent-hint
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model.number="form.timeoutMs"
                  label="超时时间（毫秒）"
                  type="number"
                  min="1000"
                  max="120000"
                />
              </v-col>
              <v-col cols="12" md="6">
                <v-btn class="mt-md-2" color="secondary" block :loading="checking" @click.prevent="handleCheck">
                  检测连接并拉取模型
                </v-btn>
              </v-col>
            </v-row>

            <v-divider class="my-4" />

            <v-row>
              <v-col cols="12">
                <div class="text-subtitle-1 font-weight-bold mb-2">汤底生成模型</div>
              </v-col>
              <v-col cols="12" md="4">
                <v-select
                  v-model="form.generationProvider"
                  :items="providerItems"
                  item-title="title"
                  item-value="value"
                  label="供应商"
                />
              </v-col>
              <v-col cols="12" md="4">
                <v-select
                  v-model="form.generationModelCategory"
                  :items="categoryItems"
                  item-title="title"
                  item-value="value"
                  label="模型分类"
                />
              </v-col>
              <v-col cols="12" md="4">
                <v-select
                  v-model="form.generationModel"
                  :items="generationModelItems"
                  item-title="title"
                  item-value="value"
                  label="生成模型"
                  :disabled="!generationModelItems.length"
                  hint="生成过程会走流式传输，但只在服务端聚合，不向前端展示汤底分片。"
                  persistent-hint
                />
              </v-col>
            </v-row>

            <v-row class="mt-2">
              <v-col cols="12">
                <div class="text-subtitle-1 font-weight-bold mb-2">文本校验模型</div>
              </v-col>
              <v-col cols="12" md="4">
                <v-select
                  v-model="form.validationProvider"
                  :items="providerItems"
                  item-title="title"
                  item-value="value"
                  label="供应商"
                />
              </v-col>
              <v-col cols="12" md="4">
                <v-select
                  v-model="form.validationModelCategory"
                  :items="categoryItems"
                  item-title="title"
                  item-value="value"
                  label="模型分类"
                />
              </v-col>
              <v-col cols="12" md="4">
                <v-select
                  v-model="form.validationModel"
                  :items="validationModelItems"
                  item-title="title"
                  item-value="value"
                  label="校验模型"
                  :disabled="!validationModelItems.length"
                  hint="问答判定和最终猜测都会使用这套模型，底层同样改成流式调用。"
                  persistent-hint
                />
              </v-col>
            </v-row>

            <div class="d-flex flex-wrap ga-3 mt-4">
              <v-btn color="primary" type="submit" :loading="saving">保存配置</v-btn>
            </div>
          </v-form>
        </v-card-text>
      </v-card>
    </v-col>

    <v-col cols="12" lg="5">
      <v-card class="glass-card mb-4">
        <v-card-title class="section-title px-6 pt-6">当前状态</v-card-title>
        <v-card-text class="pt-4">
          <div class="d-flex align-center justify-space-between mb-3">
            <span class="text-medium-emphasis">连接状态</span>
            <v-chip :color="statusColor" variant="flat">{{ statusLabel }}</v-chip>
          </div>
          <div class="d-flex align-center justify-space-between mb-3">
            <span class="text-medium-emphasis">生成模型</span>
            <span>{{ config?.generationModel || '未配置' }}</span>
          </div>
          <div class="d-flex align-center justify-space-between mb-3">
            <span class="text-medium-emphasis">校验模型</span>
            <span>{{ config?.validationModel || '未配置' }}</span>
          </div>
          <div class="d-flex align-center justify-space-between mb-3">
            <span class="text-medium-emphasis">模型数量</span>
            <span>{{ config?.availableModels.length ?? 0 }}</span>
          </div>
          <div class="d-flex align-center justify-space-between">
            <span class="text-medium-emphasis">最近检测</span>
            <span>{{ formatDateTime(config?.lastCheckedAt) }}</span>
          </div>
          <v-alert v-if="config?.lastError" type="error" variant="tonal" class="mt-4">
            {{ config.lastError }}
          </v-alert>
        </v-card-text>
      </v-card>

      <v-card class="glass-card">
        <v-card-title class="section-title px-6 pt-6">分类说明</v-card-title>
        <v-card-text class="pt-4">
          <v-list density="comfortable">
            <v-list-item>“平衡”适合一般对话和稳定输出。</v-list-item>
            <v-list-item>“推理”优先挑带 reasoning / r1 / qwq 特征的模型。</v-list-item>
            <v-list-item>“轻量”优先小参数模型，适合资源紧张时使用。</v-list-item>
            <v-list-item>“多模态”主要识别视觉类模型；本项目目前仍以文本玩法为主。</v-list-item>
            <v-list-item>校验模型与生成模型分开后，可以让出题更稳、判题更克制。</v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { checkOllamaConnection, fetchOllamaConfig, saveOllamaConfig } from '@/api/services';
import { extractErrorMessage } from '@/lib/errors';
import { formatBytes, formatDateTime } from '@/lib/format';
import { useUiStore } from '@/stores/ui';
import type { AIProvider, ModelCategory, OllamaConfig, OllamaModel } from '@/types/api';

const ui = useUiStore();
const config = ref<OllamaConfig | null>(null);
const checking = ref(false);
const saving = ref(false);

const providerItems = [{ title: 'Ollama（局域网）', value: 'ollama' satisfies AIProvider }];
const categoryItems = [
  { title: '全部', value: 'all' satisfies ModelCategory },
  { title: '平衡', value: 'balanced' satisfies ModelCategory },
  { title: '推理', value: 'reasoning' satisfies ModelCategory },
  { title: '轻量', value: 'lightweight' satisfies ModelCategory },
  { title: '多模态', value: 'multimodal' satisfies ModelCategory },
  { title: '其他', value: 'other' satisfies ModelCategory }
];

const form = reactive({
  baseUrl: '',
  timeoutMs: 30000,
  generationProvider: 'ollama' as AIProvider,
  generationModelCategory: 'all' as ModelCategory,
  generationModel: '',
  validationProvider: 'ollama' as AIProvider,
  validationModelCategory: 'all' as ModelCategory,
  validationModel: ''
});

const emptyConfig: OllamaConfig = {
  baseUrl: '',
  timeoutMs: 30000,
  generationProvider: 'ollama',
  generationModelCategory: 'all',
  generationModel: '',
  validationProvider: 'ollama',
  validationModelCategory: 'all',
  validationModel: '',
  availableModels: [],
  lastCheckedAt: null,
  lastStatus: 'idle',
  lastError: null
};

function categoryLabel(category: Exclude<ModelCategory, 'all'>) {
  return {
    balanced: '平衡',
    reasoning: '推理',
    lightweight: '轻量',
    multimodal: '多模态',
    other: '其他'
  }[category];
}

function pickModel(category: ModelCategory, selected: string, models: OllamaModel[]) {
  const normalizedSelected = selected.trim();
  const scoped = category === 'all' ? models : models.filter((model) => model.category === category);

  if (normalizedSelected && scoped.some((model) => model.name === normalizedSelected || model.model === normalizedSelected)) {
    return normalizedSelected;
  }

  if (scoped.length > 0) {
    return scoped[0]?.name || scoped[0]?.model || '';
  }

  if (normalizedSelected && models.some((model) => model.name === normalizedSelected || model.model === normalizedSelected)) {
    return normalizedSelected;
  }

  return models[0]?.name || models[0]?.model || '';
}

function toModelItems(category: ModelCategory) {
  const models = config.value?.availableModels ?? [];
  const scoped = category === 'all' ? models : models.filter((model) => model.category === category);

  return scoped.map((item) => ({
    title: `${item.name} · ${categoryLabel(item.category)} · ${item.parameterSize || formatBytes(item.size)}`,
    value: item.name
  }));
}

const generationModelItems = computed(() => toModelItems(form.generationModelCategory));
const validationModelItems = computed(() => toModelItems(form.validationModelCategory));

const statusLabel = computed(() => {
  return {
    idle: '未检测',
    connected: '已连接',
    error: '异常'
  }[config.value?.lastStatus ?? 'idle'];
});

const statusColor = computed(() => {
  return {
    idle: 'warning',
    connected: 'success',
    error: 'error'
  }[config.value?.lastStatus ?? 'idle'];
});

function syncForm(source: OllamaConfig) {
  form.baseUrl = source.baseUrl;
  form.timeoutMs = source.timeoutMs;
  form.generationProvider = source.generationProvider;
  form.generationModelCategory = source.generationModelCategory;
  form.generationModel = source.generationModel;
  form.validationProvider = source.validationProvider;
  form.validationModelCategory = source.validationModelCategory;
  form.validationModel = source.validationModel;
}

function ensureModelSelections() {
  const models = config.value?.availableModels ?? [];
  form.generationModel = pickModel(form.generationModelCategory, form.generationModel, models);
  form.validationModel = pickModel(form.validationModelCategory, form.validationModel || form.generationModel, models);
}

async function loadConfig() {
  try {
    config.value = await fetchOllamaConfig();
    syncForm(config.value);
    ensureModelSelections();
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  }
}

async function handleCheck() {
  checking.value = true;

  try {
    const result = await checkOllamaConnection(form.baseUrl, form.timeoutMs);
    const models = result.models;

    config.value = {
      ...(config.value ?? emptyConfig),
      baseUrl: result.normalizedBaseUrl,
      timeoutMs: form.timeoutMs,
      generationProvider: form.generationProvider,
      generationModelCategory: form.generationModelCategory,
      generationModel: pickModel(form.generationModelCategory, form.generationModel, models),
      validationProvider: form.validationProvider,
      validationModelCategory: form.validationModelCategory,
      validationModel: pickModel(form.validationModelCategory, form.validationModel || form.generationModel, models),
      availableModels: models,
      lastCheckedAt: new Date().toISOString(),
      lastStatus: result.reachable ? 'connected' : 'error',
      lastError: result.reachable ? null : result.message
    };

    syncForm(config.value);
    ensureModelSelections();
    ui.notify(result.message, result.reachable ? 'success' : 'warning');
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  } finally {
    checking.value = false;
  }
}

async function handleSave() {
  saving.value = true;

  try {
    config.value = await saveOllamaConfig({
      baseUrl: form.baseUrl,
      timeoutMs: form.timeoutMs,
      generationProvider: form.generationProvider,
      generationModelCategory: form.generationModelCategory,
      generationModel: form.generationModel,
      validationProvider: form.validationProvider,
      validationModelCategory: form.validationModelCategory,
      validationModel: form.validationModel
    });

    syncForm(config.value);
    ensureModelSelections();
    ui.notify('AI 配置已保存。', 'success');
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  } finally {
    saving.value = false;
  }
}

watch(
  () => [form.generationModelCategory, config.value?.availableModels.length ?? 0],
  () => {
    form.generationModel = pickModel(form.generationModelCategory, form.generationModel, config.value?.availableModels ?? []);
  }
);

watch(
  () => [form.validationModelCategory, config.value?.availableModels.length ?? 0, form.generationModel],
  () => {
    form.validationModel = pickModel(
      form.validationModelCategory,
      form.validationModel || form.generationModel,
      config.value?.availableModels ?? []
    );
  }
);

onMounted(() => {
  void loadConfig();
});
</script>
