import { Play } from "@phosphor-icons/react";
import type { FeaturedItem } from "./phone/PhoneFeatured";
import { Icon } from "./Icon";
import { Button } from "./Button";
import { startPlaySource } from "../lib/playSource";
import { useNavigation } from "../stores/navigation";

export function HomeFeature({ item }: { item: FeaturedItem }) {
  const navigate = useNavigation(state => state.navigate);
  return <section className="home-feature" aria-label="Featured recommendation">
    <button type="button" onClick={() => navigate(item.target)} className="home-feature-open">
      {item.thumb && <img loading="lazy" decoding="async" src={item.thumb} alt="" className="home-feature-art" />}
      <span className="home-feature-copy"><span className="home-eyebrow">Picked for you</span><span className="home-feature-title">{item.title}</span>{item.subtitle && <span className="home-feature-subtitle">{item.subtitle}</span>}</span>
    </button><Button variant="primary" onClick={() => void startPlaySource(item.source)}><Icon icon={Play} /><span className="ml-2">Play</span></Button>
  </section>;
}
