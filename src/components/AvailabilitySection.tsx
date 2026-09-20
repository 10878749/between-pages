import { useEffect, useState } from "react";
import { ArrowUpRight, BookOpen, ShoppingBag, Search } from "lucide-react";
import type { Book } from "../data/types";
import {
  getAvailability,
  type AvailabilityResult,
} from "../lib/providers/availability";
import { providerSearch } from "../lib/providers/providerSearch";
export function AvailabilitySection({ book }: { book: Book }) {
  const [result, setResult] = useState<AvailabilityResult>({
      links: providerSearch(book),
      status: "empty",
    }),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    getAvailability(book).then((data) => {
      if (active) {
        setResult(data);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [book]);
  const groups = [
    {
      title: "去读",
      icon: BookOpen,
      filter: (p: string) => ["微信读书", "Google Books"].includes(p),
    },
    {
      title: "去买",
      icon: ShoppingBag,
      filter: (p: string) => ["当当", "京东"].includes(p),
    },
    {
      title: "再找找",
      icon: Search,
      filter: (p: string) => p === "Open Library",
    },
  ];
  return (
    <section className="availability">
      <span className="eyebrow">把相遇，变成阅读</span>
      <h2>想继续吗？</h2>
      <p className="muted" role="status">
        {loading
          ? "正在找找线上入口，搜索入口已备好。"
          : result.status === "found"
            ? "找到了一些入口，选你习惯的方式。"
            : "暂时没找到已确认的线上入口，可以直接搜索书名。"}
      </p>
      <div className="provider-groups">
        {groups.map((g) => (
          <div key={g.title}>
            <h3>
              <g.icon size={16} />
              {g.title}
            </h3>
            {result.links
              .filter((l) => g.filter(l.provider))
              .map((l, i) => (
                <a
                  key={l.url + i}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {l.label}
                  <ArrowUpRight size={15} />
                  {l.verified && (
                    <small>已查询{l.region ? ` · ${l.region}` : ""}</small>
                  )}
                </a>
              ))}
          </div>
        ))}
      </div>
      <p className="provider-note">
        链接将在新标签页打开。可用情况可能因地区、版本与平台权限而不同。
      </p>
    </section>
  );
}
