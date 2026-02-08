<script setup lang="ts">
import { useI18n } from '../i18n';
import { diagramCategories } from '../data/diagramTemplates';

const { t } = useI18n();

defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'select', code: string): void;
}>();

const selectTemplate = (code: string) => {
  emit('select', code);
  emit('close');
};
</script>

<template>
  <div v-if="show" class="template-modal-overlay" @click.self="emit('close')">
    <div class="template-modal">
      <div class="modal-header">
        <h3>{{ t.mermaidDiagramTemplates }}</h3>
        <button @click="emit('close')" class="btn-close">&times;</button>
      </div>
      <div class="modal-content">
        <div v-for="cat in diagramCategories" :key="cat.categoryKey" class="template-category">
          <h4>{{ t[cat.categoryKey as keyof typeof t] }}</h4>
          <div class="category-templates">
            <button
              v-for="tmpl in cat.templates"
              :key="tmpl.name"
              @click="selectTemplate(tmpl.code)"
              class="btn-template-large"
            >
              {{ tmpl.name }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.template-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--overlay-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.template-modal {
  background: var(--dialog-bg);
  border-radius: 12px;
  width: 90%;
  max-width: 800px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px var(--shadow-lg);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-primary);
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  color: var(--text-primary);
}

.btn-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-close:hover {
  background: var(--border-primary);
  color: var(--text-primary);
}

.modal-content {
  padding: 20px;
  overflow-y: auto;
}

.template-category {
  margin-bottom: 24px;
}

.template-category:last-child {
  margin-bottom: 0;
}

.template-category h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-primary);
}

.category-templates {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
}

.btn-template-large {
  padding: 12px 16px;
  font-size: 13px;
  border-radius: 8px;
  cursor: pointer;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  color: var(--text-secondary);
  text-align: center;
  transition: all 0.2s;
}

.btn-template-large:hover {
  background: var(--hover-bg);
  border-color: var(--border-secondary);
  color: var(--text-primary);
}
</style>
