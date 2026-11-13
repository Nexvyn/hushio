import ReactDOM from "react-dom/client";
import { Agentation } from "agentation";
import { Mesurer } from "mesurer";

export function mountDevTools() {
  const container = document.createElement("div");
  container.id = "devtools";
  container.style.position = "relative";
  container.style.zIndex = "2147483000";
  container.style.isolation = "isolate";
  document.body.appendChild(container);
  ReactDOM.createRoot(container).render(
    <>
      <Agentation />
      <Mesurer shortcutsEnabled={false} />
    </>,
  );
}
