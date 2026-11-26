import { useState } from "react";
import { scrollTabIntoView } from "@/lib/scrollTabIntoView";

interface PartnersTabsProps {
  activeTab: "partners" | "requests";
  onTabChange: (tab: "partners" | "requests") => void;
}

export const PartnersTabs = ({ activeTab, onTabChange }: PartnersTabsProps) => {
  return (
    <div className="mb-6 sm:mb-8">
      <div className="flex items-center border-b border-border overflow-x-auto no-scrollbar">
        <button
          onClick={(e) => { onTabChange("partners"); scrollTabIntoView(e); }}
          className={`flex-1 shrink-0 whitespace-nowrap px-3 pb-3 sm:pb-4 text-base sm:text-lg font-medium transition-colors relative ${
            activeTab === "partners"
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Parceiros
          {activeTab === "partners" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
        
        <button
          onClick={(e) => { onTabChange("requests"); scrollTabIntoView(e); }}
          className={`flex-1 shrink-0 whitespace-nowrap px-3 pb-3 sm:pb-4 text-base sm:text-lg font-medium transition-colors relative ${
            activeTab === "requests"
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Solicitações de novos parceiros
          {activeTab === "requests" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
      </div>
    </div>
  );
};
