import { Search, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ExportDialog } from "@/components/ExportDialog";
import { useState } from "react";

export const RecebimentosActions = () => {
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

  return (
    <>
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4 mb-6 lg:mb-10">
      <div className="relative w-full lg:flex-1 lg:max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Buscar recebimento..." 
          className="pl-10 bg-card border-border"
        />
      </div>
      
      <Button 
        variant="secondary" 
        className="self-start lg:self-auto"
        onClick={() => setExportDialogOpen(true)}
      >
        <Download className="h-4 w-4 mr-2" />
        Exportar
      </Button>
    </div>

    <ExportDialog open={exportDialogOpen} onOpenChange={setExportDialogOpen} />
    </>
  );
};
