import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";

export type QuickLink = {
  name: string;
  href: string;
  icon: React.ComponentType<{ size?: number }>;
  color: string; // tailwind bg-* class
  group: "Vendas" | "Armazém" | "Administração";
  count?: number;
};

const groupGradient: Record<QuickLink["group"], string> = {
  Vendas: "from-orange-500 to-red-500",
  "Armazém": "from-emerald-600 to-green-600",
  "Administração": "from-indigo-600 to-blue-600",
};

export function QuickNav({ links }: { links: QuickLink[] }) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const map: Record<string, QuickLink[]> = {};
    links.forEach((l) => {
      if (!map[l.group]) map[l.group] = [];
      map[l.group].push(l);
    });
    return map;
  }, [links]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    const out: Record<string, QuickLink[]> = {};
    Object.keys(groups).forEach((g) => {
      const items = groups[g].filter((l) => l.name.toLowerCase().includes(q));
      if (items.length) out[g] = items;
    });
    return out;
  }, [groups, query]);

  return (
    <div className="space-y-4">
      {/* Header with search */}
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar módulos..."
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
      </Card>

      {/* Groups */}
      {Object.keys(filtered).map((group) => (
        <div key={group} className="space-y-2">
          <div className={`rounded-lg bg-gradient-to-r ${groupGradient[group as QuickLink["group"]]} px-3 py-2 text-white shadow-sm`}>
            <div className="text-sm font-semibold tracking-wide">{group}</div>
          </div>
          <Card className="p-2">
            <div className="grid grid-cols-2 gap-2">
              {filtered[group].map((l) => (
                <Link key={l.name} href={l.href} className="group block">
                  <div className="flex items-center gap-2 rounded-lg border border-transparent bg-gray-50 p-2 transition-colors hover:border-primary/20 hover:bg-white">
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${l.color} text-white shadow-sm`}>
                      <l.icon size={18} />
                    </span>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-800 group-hover:text-primary">
                        {l.name}
                      </div>
                      {typeof l.count === "number" && (
                        <div className="text-xs text-gray-500">{l.count} itens</div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      ))}
    </div>
  );
}
