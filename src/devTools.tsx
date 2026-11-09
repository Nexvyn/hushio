import ReactDOM from "react-dom/client";
import { Agentation } from "agentation";

export function mountDevTools() {
  const container = document.createElement("div");
  container.id = "devtools";
  document.body.appendChild(container);
  ReactDOM.createRoot(container).render(<Agentation />);
}
