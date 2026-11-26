import { Search, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface RepassesActionsProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onExportClick: () => void;
}

export const RepassesActions = ({
  searchValue,
  onSearchChange,
  onExportClick,
}: RepassesActionsProps) => {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4 mb-6 lg:mb-10">
      <div className="relative w-full lg:flex-1 lg:max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar repasse..."
          className="pl-10 bg-card border-border"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <Button variant="secondary" className="self-start lg:self-auto" onClick={onExportClick}>
        <Download className="h-4 w-4 mr-2" />
        Exportar
      </Button>
    </div>
  );
};
