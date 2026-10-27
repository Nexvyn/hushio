import { ImportMatched } from "../components/ImportMatched";
import { ImportPage } from "../components/ImportPage";
import { useNavigation } from "../stores/navigation";

export function MatchedPlaylistView() {
  const importId = useNavigation((state) => state.view.param);
  return importId ? <ImportMatched importId={importId} /> : <ImportPage />;
}
