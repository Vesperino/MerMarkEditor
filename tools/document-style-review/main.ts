import { createApp } from 'vue';
import Review from './Review.vue';
import { vTooltip } from '../../src/directives/tooltip';
import '../../src/styles/main.css';
createApp(Review).directive('tooltip', vTooltip).mount('#app');
