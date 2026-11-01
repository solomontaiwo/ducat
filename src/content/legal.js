/**
 * Privacy policy and terms of use.
 *
 * One data structure per document, in both languages, so the two versions
 * cannot drift apart (the app is bilingual and the App Store shows both).
 * `{{app}}` is replaced with the current product name at render time.
 *
 * The controller data is the only part that changes from person to person:
 * check it before submitting the app, together with the Supabase region.
 */
export const LEGAL_UPDATED = "1 novembre 2026";

export const LEGAL_ENTITY = {
  name: "Solomon Taiwo",
  address: "Torino, Italia",
  email: "solomon.taiwo@studenti.polito.it",
  jurisdiction: "Torino, Italia",
};

export const PRIVACY_SECTIONS = {
  it: [
    {
      title: "Titolare del trattamento",
      paragraphs: [
        "Il titolare del trattamento è {{entity}}, {{address}}. Per qualsiasi richiesta relativa ai dati personali puoi scrivere a {{email}}.",
      ],
    },
    {
      title: "Dati trattati",
      paragraphs: [
        "{{app}} tratta solo i dati necessari a far funzionare l’app: indirizzo email, nome visualizzato (facoltativo) e i movimenti che inserisci (tipo, importo, valuta, categoria, descrizione e data), insieme ai budget e alle spese ricorrenti che imposti.",
        "Tema, lingua, preferenze di inserimento rapido e dati della modalità demo restano sul dispositivo e non vengono inviati a nessun server. L’app non legge la tua rubrica, le foto, la posizione o i contatti, non accede ai conti bancari e non raccoglie dati pubblicitari.",
      ],
    },
    {
      title: "Base giuridica e finalità",
      paragraphs: [
        "Il trattamento si basa sull’esecuzione del contratto che accetti creando un account (art. 6, par. 1, lett. b, GDPR): i dati servono esclusivamente per autenticarti, salvare i movimenti, calcolare statistiche e budget, sincronizzare i dispositivi e generare gli export che richiedi.",
        "Non usiamo i tuoi dati per profilazione, marketing o decisioni automatizzate.",
      ],
    },
    {
      title: "Conservazione",
      paragraphs: [
        "I dati restano associati al tuo account finché non lo elimini. Dalla pagina Profilo puoi eliminare l’account in qualsiasi momento: profilo e movimenti vengono cancellati e non sono più recuperabili. Eventuali copie tecniche di sicurezza vengono sovrascritte secondo i tempi del fornitore del database.",
      ],
    },
    {
      title: "Destinatari",
      paragraphs: [
        "Supabase (PostgreSQL e autenticazione) è il fornitore tecnico che ospita il database. Il sito web è pubblicato tramite GitHub Pages. Non vendiamo né condividiamo dati con inserzionisti o data broker.",
        "Se l’installazione configura un endpoint di segnalazione errori, vengono inviati solo dati tecnici sull’errore (messaggio, versione dell’app, pagina), senza il contenuto dei movimenti.",
      ],
    },
    {
      title: "Trasferimenti fuori dall’Unione europea",
      paragraphs: [
        "Il database è ospitato nell’Unione europea. I fornitori tecnici possono trattare dati anche fuori dall’UE sulla base delle clausole contrattuali standard della Commissione europea.",
      ],
    },
    {
      title: "I tuoi diritti",
      paragraphs: [
        "Puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità e opposizione al trattamento scrivendo a {{email}}. Puoi esportare i tuoi dati in JSON, CSV o PDF direttamente dall’app. Se ritieni che il trattamento non rispetti la normativa puoi proporre reclamo al Garante per la protezione dei dati personali o all’autorità di controllo del tuo Paese.",
      ],
    },
    {
      title: "Sicurezza",
      paragraphs: [
        "Il traffico è cifrato con HTTPS. Il database applica regole di accesso per riga: ogni account vede e modifica solo i propri dati. Le password sono gestite da Supabase e non sono mai visibili all’app.",
      ],
    },
    {
      title: "Minori",
      paragraphs: [
        "{{app}} non è destinata a persone di età inferiore a 16 anni e non raccoglie consapevolmente dati di minori.",
      ],
    },
    {
      title: "Modifiche",
      paragraphs: [
        "Se questa informativa cambia in modo sostanziale, l’aggiornamento viene mostrato nell’app prima che le modifiche diventino effettive. La data in cima indica l’ultima revisione.",
      ],
    },
  ],
  en: [
    {
      title: "Data controller",
      paragraphs: [
        "The data controller is {{entity}}, {{address}}. For any request about your personal data you can write to {{email}}.",
      ],
    },
    {
      title: "What we process",
      paragraphs: [
        "{{app}} processes only what the app needs to work: your email address, an optional display name and the transactions you enter (type, amount, currency, category, description and date), together with the budgets and recurring expenses you set.",
        "Theme, language, quick-add preferences and demo-mode data stay on the device and are never sent to a server. The app does not read your contacts, photos, location or address book, does not connect to bank accounts and does not collect advertising data.",
      ],
    },
    {
      title: "Legal basis and purpose",
      paragraphs: [
        "Processing is based on performing the contract you accept when creating an account (Art. 6(1)(b) GDPR): the data is used only to sign you in, store your transactions, compute statistics and budgets, sync your devices and produce the exports you ask for.",
        "We do not use your data for profiling, marketing or automated decisions.",
      ],
    },
    {
      title: "Retention",
      paragraphs: [
        "Data stays linked to your account until you delete it. From the Profile page you can delete the account at any time: profile and transactions are erased and cannot be recovered. Technical backups are overwritten according to the database provider's schedule.",
      ],
    },
    {
      title: "Recipients",
      paragraphs: [
        "Supabase (PostgreSQL and authentication) is the technical provider hosting the database. The website is published through GitHub Pages. We do not sell or share data with advertisers or data brokers.",
        "If the installation configures an error-reporting endpoint, only technical data about the error is sent (message, app version, page), never transaction contents.",
      ],
    },
    {
      title: "Transfers outside the European Union",
      paragraphs: [
        "The database is hosted in the European Union. Technical providers may process data outside the EU under the European Commission's standard contractual clauses.",
      ],
    },
    {
      title: "Your rights",
      paragraphs: [
        "You can request access, rectification, erasure, restriction, portability and object to processing by writing to {{email}}. You can export your data as JSON, CSV or PDF from the app. If you believe processing does not comply with the law, you can lodge a complaint with your national data protection authority.",
      ],
    },
    {
      title: "Security",
      paragraphs: [
        "Traffic is encrypted with HTTPS. The database enforces row level security: each account can only read and change its own data. Passwords are handled by Supabase and are never visible to the app.",
      ],
    },
    {
      title: "Children",
      paragraphs: [
        "{{app}} is not intended for people under 16 and does not knowingly collect data from children.",
      ],
    },
    {
      title: "Changes",
      paragraphs: [
        "If this policy changes materially, the update is shown in the app before it takes effect. The date at the top is the last revision.",
      ],
    },
  ],
};

const TERMS = {
  it: [
    {
      title: "Oggetto",
      paragraphs: [
        "{{app}} è un’applicazione per tenere traccia di entrate e spese personali, impostare budget e consultare statistiche. È gratuita e non richiede alcun acquisto.",
      ],
    },
    {
      title: "Non è consulenza finanziaria",
      paragraphs: [
        "{{app}} è uno strumento informativo di gestione personale. Non offre consulenza finanziaria, fiscale, legale o di investimento e non sostituisce un professionista abilitato.",
      ],
    },
    {
      title: "Account e credenziali",
      paragraphs: [
        "Sei responsabile della correttezza dei dati che inserisci e della riservatezza delle credenziali. Segnala subito a {{email}} un eventuale accesso non autorizzato.",
      ],
    },
    {
      title: "Uso consentito",
      paragraphs: [
        "Ti impegni a non usare l’app per attività illecite, a non tentare di accedere agli account altrui e a non interferire con il funzionamento del servizio.",
      ],
    },
    {
      title: "I tuoi dati",
      paragraphs: [
        "I dati che inserisci restano tuoi. Puoi esportarli in qualsiasi momento e puoi eliminare l’account dalla pagina Profilo: l’operazione è definitiva e non è reversibile.",
      ],
    },
    {
      title: "Disponibilità del servizio",
      paragraphs: [
        "L’app dipende da servizi di terze parti (Supabase per il database e l’autenticazione, GitHub Pages per il sito). Possono esserci interruzioni, manutenzioni o modifiche. Le funzioni possono cambiare nel tempo; gli aggiornamenti di iOS e Mac provengono dall’App Store.",
      ],
    },
    {
      title: "Limitazione di responsabilità",
      paragraphs: [
        "Nei limiti consentiti dalla legge, il servizio è fornito “così com’è” e non rispondiamo di perdite indirette, di dati inseriti in modo errato o di decisioni prese sulla base delle statistiche mostrate.",
      ],
    },
    {
      title: "Proprietà intellettuale",
      paragraphs: [
        "Il nome, il logo e il codice dell’app sono protetti dalle norme applicabili. Il codice è distribuito con licenza MIT; il marchio e l’identità visiva non sono inclusi nella licenza.",
      ],
    },
    {
      title: "Legge applicabile",
      paragraphs: [
        "Questi termini sono regolati dalla legge italiana. Per i consumatori resta competente il giudice del luogo di residenza o domicilio, come previsto dalla normativa applicabile.",
      ],
    },
    {
      title: "Contatti",
      paragraphs: [
        "Per domande su questi termini scrivi a {{email}}.",
      ],
    },
  ],
  en: [
    {
      title: "What this is",
      paragraphs: [
        "{{app}} is an application to track personal income and expenses, set budgets and read statistics. It is free and requires no purchase.",
      ],
    },
    {
      title: "Not financial advice",
      paragraphs: [
        "{{app}} is an informational personal-finance tool. It does not provide financial, tax, legal or investment advice and does not replace a qualified professional.",
      ],
    },
    {
      title: "Account and credentials",
      paragraphs: [
        "You are responsible for the accuracy of the data you enter and for keeping your credentials confidential. Report any unauthorised access to {{email}} right away.",
      ],
    },
    {
      title: "Acceptable use",
      paragraphs: [
        "You agree not to use the app for unlawful activity, not to attempt to access other people's accounts and not to interfere with the service.",
      ],
    },
    {
      title: "Your data",
      paragraphs: [
        "The data you enter remains yours. You can export it at any time and delete the account from the Profile page: deletion is permanent and cannot be undone.",
      ],
    },
    {
      title: "Availability",
      paragraphs: [
        "The app depends on third-party services (Supabase for the database and authentication, GitHub Pages for the website). Interruptions, maintenance and changes may occur. Features may change over time; iOS and Mac updates are delivered by the App Store.",
      ],
    },
    {
      title: "Limitation of liability",
      paragraphs: [
        "To the extent permitted by law, the service is provided “as is” and we are not liable for indirect losses, for data entered incorrectly or for decisions taken on the basis of the statistics shown.",
      ],
    },
    {
      title: "Intellectual property",
      paragraphs: [
        "The app's name, logo and code are protected by applicable law. The code is released under the MIT licence; the trademark and visual identity are not covered by that licence.",
      ],
    },
    {
      title: "Governing law",
      paragraphs: [
        "These terms are governed by Italian law. For consumers, the court of their place of residence or domicile remains competent, as required by applicable law.",
      ],
    },
    {
      title: "Contact",
      paragraphs: [
        "For questions about these terms write to {{email}}.",
      ],
    },
  ],
};

export const TERMS_SECTIONS = TERMS;
