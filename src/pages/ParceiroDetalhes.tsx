import { useParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { ParceiroPerfil } from "@/components/ParceiroPerfil";

const ParceiroDetalhes = () => {
  const { id } = useParams();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 sm:px-6 py-8 pt-20 lg:pt-24">
        {id ? <ParceiroPerfil userId={id} /> : <p className="text-destructive">Parceiro não encontrado.</p>}
      </main>
    </div>
  );
};

export default ParceiroDetalhes;
