import { createContext, useContext, useState, ReactNode } from "react";
import { scrollTabIntoView } from "@/lib/scrollTabIntoView";

type TabType = "detalhes" | "inscricoes" | "ranking";

interface CompeticaoDetalheTabContextType {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
}

const CompeticaoDetalheTabContext = createContext<CompeticaoDetalheTabContextType | undefined>(undefined);

export const useCompeticaoDetalheTab = () => {
  const context = useContext(CompeticaoDetalheTabContext);
  if (!context) {
    throw new Error("useCompeticaoDetalheTab must be used within CompeticaoDetalheTabProvider");
  }
  return context;
};

export const CompeticaoDetalheTabProvider = ({ children }: { children: ReactNode }) => {
  const [activeTab, setActiveTab] = useState<TabType>("detalhes");

  return (
    <CompeticaoDetalheTabContext.Provider value={{ activeTab, setActiveTab }}>
      {children}
    </CompeticaoDetalheTabContext.Provider>
  );
};

export const CompeticaoDetalheTabs = () => {
  const { activeTab, setActiveTab } = useCompeticaoDetalheTab();

  return (
    <div className="mb-6 sm:mb-8">
      <div className="flex items-center border-b border-border overflow-x-auto no-scrollbar">
        <button
          onClick={(e) => { setActiveTab("detalhes"); scrollTabIntoView(e); }}
          className={`flex-1 shrink-0 whitespace-nowrap px-3 pb-3 sm:pb-4 text-base sm:text-lg font-medium transition-colors relative ${
            activeTab === "detalhes"
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Detalhes da competição
          {activeTab === "detalhes" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
        
        <button
          onClick={(e) => { setActiveTab("inscricoes"); scrollTabIntoView(e); }}
          className={`flex-1 shrink-0 whitespace-nowrap px-3 pb-3 sm:pb-4 text-base sm:text-lg font-medium transition-colors relative ${
            activeTab === "inscricoes"
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Inscrições
          {activeTab === "inscricoes" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>

        <button
          onClick={(e) => { setActiveTab("ranking"); scrollTabIntoView(e); }}
          className={`flex-1 shrink-0 whitespace-nowrap px-3 pb-3 sm:pb-4 text-base sm:text-lg font-medium transition-colors relative ${
            activeTab === "ranking"
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Ranking
          {activeTab === "ranking" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
      </div>
    </div>
  );
};
