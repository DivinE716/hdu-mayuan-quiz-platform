"use client";

import AppLink from "@/components/AppLink";

interface ModuleCardProps {
  title: string;
  subtitle: string;
  count?: number;
  href: string;
  icon: string;
  colorClass: string;
}

export default function ModuleCard({
  title,
  subtitle,
  count,
  href,
  icon,
  colorClass,
}: ModuleCardProps) {
  return (
    <AppLink
      href={href}
      className="group relative flex flex-col gap-2 rounded-2xl p-5
                 bg-morandi-surface border border-morandi-muted/60
                 hover:shadow-lg hover:-translate-y-0.5
                 transition-all duration-200 cursor-pointer"
    >
      <div className="flex items-start justify-between">
        <span className="text-2xl">{icon}</span>
        {count !== undefined && (
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${colorClass}`}>
            {count} 题
          </span>
        )}
      </div>
      <div>
        <h3 className="text-base font-semibold text-morandi-text-main group-hover:text-morandi-primary transition-colors">
          {title}
        </h3>
        <p className="text-sm text-morandi-text-soft mt-0.5">{subtitle}</p>
      </div>
    </AppLink>
  );
}
