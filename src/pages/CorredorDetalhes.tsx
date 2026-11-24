import { useParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { CorredorPerfil } from "@/components/CorredorPerfil";

const CorredorDetalhes = () => {
  const { id } = useParams();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-6 py-8 pt-24">
        {id ? <CorredorPerfil userId={id} /> : <p className="text-destructive">Corredor não encontrado.</p>}
      </main>
    </div>
  );
};

export default CorredorDetalhes;
