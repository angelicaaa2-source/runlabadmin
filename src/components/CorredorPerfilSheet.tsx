import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CorredorPerfil } from "@/components/CorredorPerfil";

interface CorredorPerfilSheetProps {
  userId: string | null;
  userName?: string;
  onClose: () => void;
}

/** Painel lateral com o perfil do corredor (mesmo conteúdo da página /corredores/:id), aberto pelo nome nas listas. */
export const CorredorPerfilSheet = ({ userId, userName, onClose }: CorredorPerfilSheetProps) => (
  <Sheet open={userId !== null} onOpenChange={(open) => !open && onClose()}>
    <SheetContent
      side="right"
      data-painel-corredor
      className="w-full sm:max-w-[1100px] overflow-y-auto bg-background border-border p-8"
    >
      <SheetHeader className="mb-4">
        <SheetTitle className="text-foreground">{userName || "Corredor"}</SheetTitle>
        <SheetDescription className="sr-only">Perfil, contato e históricos do corredor</SheetDescription>
      </SheetHeader>
      {userId && <CorredorPerfil userId={userId} modo="painel" />}
    </SheetContent>
  </Sheet>
);
