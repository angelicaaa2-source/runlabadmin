import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, SlidersHorizontal, Download, Plus } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

export const FinanceiroActions = () => {
  const { hasPermission } = usePermissions();
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4 mb-6 lg:mb-6">
      <div className="relative w-full lg:flex-1 lg:max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar transação..."
          className="pl-10 bg-input border-border text-foreground"
        />
      </div>
      
      <div className="flex flex-wrap items-center gap-2 lg:gap-3">
        <Button variant="ghost" className="text-muted-foreground hover:text-foreground gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          Filtrar
        </Button>
        
        <Button variant="ghost" className="text-muted-foreground hover:text-foreground gap-2">
          <Download className="h-4 w-4" />
          Exportar
        </Button>
        
        {hasPermission("financeiro.edit") && (
          <>
            <div className="hidden lg:block w-px h-6 bg-border" />
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
              <Plus className="h-4 w-4" />
              Nova transação
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
