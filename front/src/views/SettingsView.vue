<template>
  <v-row>
    <v-col cols="12" lg="7">
      <v-card class="glass-card">
        <v-card-title class="section-title px-6 pt-6">Ollama 连接设置</v-card-title>
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
                <v-select
                  v-model="form.defaultModel"
                  label="默认模型"
                  :items="modelItems"
                  item-title="title"
                  item-value="value"
                  :disabled="!modelItems.length"
                  hint="连通成功后会自动拉取模型列表"
                  persistent-hint
                />
              </v-col>
            </v-row>

            <div class="d-flex flex-wrap ga-3 mt-2">
              <v-btn color="secondary" :loading="checking" @click.prevent="handleCheck">检测连接并拉取模型</v-btn>
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
            <span class="text-medium-emphasis">默认模型</span>
            <span>{{ config?.defaultModel || '未配置' }}</span>
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
        <v-card-title class="section-title px-6 pt-6">部署提示</v-card-title>
        <v-card-text class="pt-4">
          <v-list density="comfortable">
            <v-list-item>如果 Ollama 跑在局域网其他机器上，优先填写它的内网 IP。</v-list-item>
            <v-list-item>如果站点在 Docker 里、Ollama 在宿主机上，可尝试 `host.docker.internal`。</v-list-item>
            <v-list-item>连通后模型下拉会自动刷新，保存时会把可用模型一起持久化。</v-list-item>
          </v-list>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { checkOllamaConnection, fetchOllamaConfig, saveOllamaConfig } from '@/api/services';
import { extractErrorMessage } from '@/lib/errors';
import { formatBytes, formatDateTime } from '@/lib/format';
import { useUiStore } from '@/stores/ui';
import type { OllamaConfig } from '@/types/api';

const ui = useUiStore();
const config = ref<OllamaConfig | null>(null);
const checking = ref(false);
const saving = ref(false);

const form = reactive({
  baseUrl: '',
  timeoutMs: 30000,
  defaultModel: ''
});

const modelItems = computed(() =>
  (config.value?.availableModels ?? []).map((item) => ({
    title: `${item.name} · ${item.parameterSize || formatBytes(item.size)}`,
    value: item.name
  }))
);

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
  form.defaultModel = source.defaultModel;
}

async function loadConfig() {
  try {
    config.value = await fetchOllamaConfig();
    syncForm(config.value);
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  }
}

async function handleCheck() {
  checking.value = true;

  try {
    const result = await checkOllamaConnection(form.baseUrl, form.timeoutMs);

    if (!form.defaultModel && result.models.length) {
      form.defaultModel = result.models[0].name;
    }

    config.value = {
      ...(config.value ?? {
        baseUrl: '',
        defaultModel: '',
        timeoutMs: 30000,
        availableModels: [],
        lastCheckedAt: null,
        lastStatus: 'idle',
        lastError: null
      }),
      baseUrl: result.normalizedBaseUrl,
      timeoutMs: form.timeoutMs,
      defaultModel: form.defaultModel,
      availableModels: result.models,
      lastCheckedAt: new Date().toISOString(),
      lastStatus: result.reachable ? 'connected' : 'error',
      lastError: result.reachable ? null : result.message
    };

    syncForm(config.value);
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
      defaultModel: form.defaultModel
    });

    syncForm(config.value);
    ui.notify('Ollama 配置已保存。', 'success');
  } catch (error) {
    ui.notify(extractErrorMessage(error), 'error');
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void loadConfig();
});
</script>
