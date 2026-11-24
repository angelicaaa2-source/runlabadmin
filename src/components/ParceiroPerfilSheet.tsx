import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ParceiroPerfil } from "@/components/ParceiroPerfil";

interface ParceiroPerfilSheetProps {
  userId: string | null;
  userName?: string;
  onClose: () => void;
}

/** Painel lateral com o perfil do parceiro (mesmo conteúdo da página /parceiros/:id), aberto pelo nome nas listas. */
export const ParceiroPerfilSheet = ({ userId, userName, onClose }: ParceiroPerfilSheetProps) => (
  <Sheet open={userId !== null} onOpenChange={(open) => !open && onClose()}>
    <SheetContent
      side="right"
      data-painel-parceiro
      className="w-full sm:max-w-[1100px] overflow-y-auto bg-background border-border p-8"
    >
      <SheetHeader className="mb-4">
        <SheetTitle className="text-foreground">{userName || "Parceiro"}</SheetTitle>
        <SheetDescription className="sr-only">Dados, comissões e repasses do parceiro</SheetDescription>
      </SheetHeader>
      {userId && <ParceiroPerfil userId={userId} modo="painel" />}
    </SheetContent>
  </Sheet>
);
