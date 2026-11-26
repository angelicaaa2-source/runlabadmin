import { Search, SlidersHorizontal, Download, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ExportDialog } from "@/components/ExportDialog";
import { CampeonatosFilterDialog } from "@/components/CampeonatosFilterDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export const CampeonatosActions = () => {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  return <>
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4 mb-6 lg:mb-10">
      <div className="relative w-full lg:flex-1 lg:max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar campeonato..." className="pl-10 bg-card border-border" />
      </div>
      
      <div className="flex flex-wrap items-center gap-2 lg:gap-3">
        <Button variant="secondary" onClick={() => setFilterDialogOpen(true)}>
          <SlidersHorizontal className="h-4 w-4 mr-2" />
          Filtrar
        </Button>
        
        <Button variant="secondary" onClick={() => setExportDialogOpen(true)}>
          <Download className="h-4 w-4 mr-2" />
          Exportar
        </Button>
        {hasPermission("competicoes.add") && (
          <>
            <span className="hidden lg:inline text-muted-foreground">|</span>
            <Button 
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => navigate("/gestao-competicoes/cadastrar-campeonato")}
            >
              <Plus className="h-4 w-4 mr-2" />
              Cadastrar campeonato
            </Button>
          </>
        )}
      </div>
    </div>

    <ExportDialog open={exportDialogOpen} onOpenChange={setExportDialogOpen} />
    <CampeonatosFilterDialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen} />
    </>;
};