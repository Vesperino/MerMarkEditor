import { createApp } from "vue";
import App from "./App.vue";
import { vTooltip } from "./directives/tooltip";
import "./styles/main.css";

createApp(App).directive('tooltip', vTooltip).mount("#app");
