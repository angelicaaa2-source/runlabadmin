import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChevronDown, User, Key, Settings, FileText, LogOut, Menu } from "lucide-react";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useVendasNovasLoja } from "@/hooks/useVendasNovasLoja";
import runlabLogo from "@/assets/runlab-logo-new.png";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

type NavItem = {
  to: string;
  label: string;
  /** Mostra a bolinha verde de "tem coisa nova" ao lado do nome. */
  dot?: boolean;
  dotLabel?: string;
};

type AccountItem = {
  label: string;
  icon: typeof User;
  onSelect: () => void;
};

export const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { hasPermission } = usePermissions();
  const { data: vendasNovas = 0 } = useVendasNovasLoja(hasPermission("financeiro.view"));
  const [menuOpen, setMenuOpen] = useState(false);

  // Fecha o menu do celular sempre que a página muda.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  const displayName =
    profile?.full_name ||
    (user?.user_metadata?.full_name as string) ||
    (user?.user_metadata?.name as string) ||
    user?.email?.split("@")[0] ||
    "Usuário";
  const initials = displayName
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const avatarUrl =
    profile?.avatar_url ||
    (user?.user_metadata?.avatar_url as string) ||
    (user?.user_metadata?.picture as string) ||
    undefined;

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  const navItems: NavItem[] = [];
  if (hasPermission("financeiro.view")) {
    navItems.push(
      { to: "/financeiro", label: "Financeiro" },
      { to: "/cupons", label: "Cupons" },
      {
        to: "/checkout",
        label: "Checkout",
        dot: vendasNovas > 0,
        dotLabel: vendasNovas === 1 ? "1 venda nova a enviar" : `${vendasNovas} vendas novas a enviar`,
      },
    );
  }
  if (hasPermission("usuarios.view")) {
    navItems.push({ to: "/corredores", label: "Corredores" }, { to: "/parceiros", label: "Parceiros" });
  }
  if (hasPermission("competicoes.view")) {
    navItems.push({ to: "/gestao-competicoes", label: "Gestão de competições" });
  }

  // "/checkout" e "/loja-checkout" são a mesma tela.
  const isActive = (to: string) => {
    if (to === "/checkout") {
      return location.pathname === "/checkout" || location.pathname === "/loja-checkout";
    }
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  };

  const accountItems: AccountItem[] = [
    { label: "Minha conta", icon: User, onSelect: () => navigate("/minha-conta") },
    ...(hasPermission("acessos.view")
      ? [{ label: "Acessos", icon: Key, onSelect: () => navigate("/minha-conta?tab=acessos") }]
      : []),
    { label: "Configurações", icon: Settings, onSelect: () => navigate("/minha-conta?edit=true") },
    { label: "Termos e política", icon: FileText, onSelect: () => navigate("/minha-conta?tab=sobre") },
    { label: "Sair da conta", icon: LogOut, onSelect: () => handleLogout() },
  ];

  const renderDot = (item: NavItem) =>
    item.dot ? (
      <>
        <span
          className="absolute -right-2.5 -top-1 h-2 w-2 rounded-full bg-[#CCF725] ring-2 ring-background"
          aria-hidden="true"
        />
        <span className="sr-only">({item.dotLabel})</span>
      </>
    ) : null;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border px-4 sm:px-6 py-3 lg:py-4 w-full">
      <div className="flex items-center justify-between gap-4">
        <Link to={navItems[0]?.to ?? "/minha-conta"} className="shrink-0">
          <img src={runlabLogo} alt="RUNLAB" className="h-8 lg:h-10" />
        </Link>

        {/* Computador: menu em linha */}
        <nav className="hidden lg:flex gap-6 xl:gap-8">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "whitespace-nowrap text-muted-foreground transition-colors",
                isActive(item.to)
                  ? "text-primary font-medium border-b-2 border-primary pb-1 hover:text-primary"
                  : "hover:text-foreground",
              )}
            >
              <span className="relative">
                {item.label}
                {renderDot(item)}
              </span>
            </Link>
          ))}
        </nav>

        {/* Computador: menu da conta */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="hidden lg:flex items-center gap-3 cursor-pointer shrink-0">
              <Avatar className="h-10 w-10">
                <AvatarImage src={avatarUrl} alt={displayName} referrerPolicy="no-referrer" />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="hidden xl:flex flex-col">
                <span className="text-sm font-medium text-foreground">{displayName}</span>
                <span className="text-xs text-muted-foreground">{user?.email ?? "—"}</span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {accountItems.map((item) => (
              <DropdownMenuItem key={item.label} className="cursor-pointer" onClick={item.onSelect}>
                <item.icon className="h-4 w-4 mr-2" />
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Celular e tablet: botão que abre o menu lateral */}
        <button
          type="button"
          className="lg:hidden relative -mr-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground hover:bg-muted"
          onClick={() => setMenuOpen(true)}
          aria-label="Abrir menu"
        >
          <Menu className="h-6 w-6" />
          {vendasNovas > 0 && hasPermission("financeiro.view") && (
            <span
              className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#CCF725] ring-2 ring-background"
              aria-hidden="true"
            />
          )}
        </button>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right" className="w-[85vw] max-w-xs p-0 flex flex-col overflow-y-auto">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Páginas do painel e opções da sua conta</SheetDescription>

          <div className="flex items-center gap-3 px-5 pt-6 pb-5 pr-12 border-b border-border">
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarImage src={avatarUrl} alt={displayName} referrerPolicy="no-referrer" />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-foreground truncate">{displayName}</span>
              <span className="text-xs text-muted-foreground truncate">{user?.email ?? "—"}</span>
            </div>
          </div>

          <nav className="flex flex-col py-2">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  "flex items-center px-5 py-3.5 text-base transition-colors border-l-2",
                  isActive(item.to)
                    ? "border-primary text-primary font-medium bg-muted/40"
                    : "border-transparent text-foreground hover:bg-muted/40",
                )}
              >
                <span className="relative">
                  {item.label}
                  {renderDot(item)}
                </span>
              </Link>
            ))}
          </nav>

          <div className="mt-auto border-t border-border py-2">
            {accountItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  item.onSelect();
                }}
                className="flex w-full items-center gap-3 px-5 py-3 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
};
