import { Search, SlidersHorizontal, Download, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ExportDialog } from "@/components/ExportDialog";
import { CorredoresFilterDialog } from "@/components/CorredoresFilterDialog";
import { PushNotificationSheet } from "@/components/PushNotificationSheet";
import { useState, useCallback, useEffect } from "react";
import { useCorredoresFilters } from "@/contexts/CorredoresFilterContext";
import { downloadCorredoresCsv } from "@/lib/exportCorredoresCsv";
import { toast } from "sonner";

export const CorredoresActions = () => {
  const { filters, setFilters } = useCorredoresFilters();
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [pushSheetOpen, setPushSheetOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(filters.search ?? "");
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    setSearchInput(filters.search ?? "");
  }, [filters.search]);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      setFilters((prev) => ({ ...prev, search: value || undefined }));
    },
    [setFilters]
  );

  const handleExport = useCallback(async (_format: string) => {
    setExporting(true);
    try {
      await downloadCorredoresCsv(filters);
      toast.success("Exportação concluída", { description: "O CSV foi baixado." });
      setExportDialogOpen(false);
    } catch {
      toast.error("Erro ao exportar");
    } finally {
      setExporting(false);
    }
  }, [filters]);

  return (
    <>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4 mb-6 lg:mb-10">
        <div className="relative w-full lg:flex-1 lg:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar corredor..."
            className="pl-10 bg-card border-border"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 lg:gap-3">
          <Button
            variant="secondary"
            className="px-2.5 gap-1.5 sm:px-4 sm:gap-2"
            onClick={() => setFilterDialogOpen(true)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtrar
          </Button>
          <span className="hidden lg:inline text-muted-foreground">|</span>
          <Button
            variant="secondary"
            className="px-2.5 gap-1.5 sm:px-4 sm:gap-2"
            onClick={() => setExportDialogOpen(true)}
          >
            <Download className="h-4 w-4" />
            Exportar
          </Button>
          <Button
            variant="outline"
            className="border-primary text-primary hover:bg-primary hover:text-primary-foreground px-2.5 gap-1.5 sm:px-4 sm:gap-2"
            onClick={() => setPushSheetOpen(true)}
          >
            <Send className="h-4 w-4" />
            Enviar push
          </Button>
        </div>
      </div>

      <ExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        onExport={handleExport}
        exporting={exporting}
      />
      <CorredoresFilterDialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen} />
      <PushNotificationSheet open={pushSheetOpen} onOpenChange={setPushSheetOpen} targetAudience="Corredor" />
    </>
  );
};
