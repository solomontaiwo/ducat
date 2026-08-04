import { Link, useLocation } from "../../router/RouterProvider";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

const Privacy = () => (
  <>
    <p>Ultimo aggiornamento: 4 agosto 2026.</p>
    <h2 className="text-lg font-semibold">Dati trattati</h2>
    <p>L’app memorizza email, nome visualizzato e transazioni inserite dall’utente. Tema, lingua e dati della modalità demo restano nel browser.</p>
    <h2 className="text-lg font-semibold">Finalità e fornitori</h2>
    <p>I dati servono esclusivamente a fornire autenticazione, gestione delle transazioni, statistiche ed export. Firebase Authentication, Firestore e Cloud Functions sono i servizi tecnici utilizzati.</p>
    <h2 className="text-lg font-semibold">Controllo dei dati</h2>
    <p>Dalla pagina Profilo è possibile esportare i dati, richiedere il reset della password, cambiare email ed eliminare definitivamente account e transazioni.</p>
    <h2 className="text-lg font-semibold">Contatti e titolare</h2>
    <p>Prima di un rilascio pubblico, il gestore deve inserire qui identità, contatti, base giuridica, tempi di conservazione e ogni informazione richiesta dalla normativa applicabile.</p>
  </>
);

const Terms = () => (
  <>
    <p>Ultimo aggiornamento: 4 agosto 2026.</p>
    <h2 className="text-lg font-semibold">Uso del servizio</h2>
    <p>Soldi Sotto è uno strumento informativo di gestione personale e non offre consulenza finanziaria, fiscale o legale.</p>
    <h2 className="text-lg font-semibold">Responsabilità dell’utente</h2>
    <p>L’utente è responsabile della correttezza dei dati inseriti, della sicurezza delle proprie credenziali e degli export scaricati.</p>
    <h2 className="text-lg font-semibold">Disponibilità</h2>
    <p>Backup, supporto, livelli di servizio, giurisdizione e condizioni definitive devono essere stabiliti dal gestore prima del rilascio pubblico.</p>
  </>
);

const LegalPage = () => {
  const { pathname } = useLocation();
  const isPrivacy = pathname === "/privacy";
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <Card className="mx-auto max-w-3xl">
        <CardHeader>
          <CardTitle>{isPrivacy ? "Informativa privacy" : "Termini d’uso"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
          {isPrivacy ? <Privacy /> : <Terms />}
          <div className="flex gap-4 border-t border-border pt-4">
            <Link to="/" className="font-semibold text-primary">Torna all’app</Link>
            <Link to={isPrivacy ? "/terms" : "/privacy"} className="font-semibold text-primary">
              {isPrivacy ? "Termini d’uso" : "Privacy"}
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
};

export default LegalPage;
