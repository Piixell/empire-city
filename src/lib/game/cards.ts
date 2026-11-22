import type { CardDef, DeckKind } from "./types";

// Two original decks of the world of Valoria:
//   "Destino Arcano" (chance) and "Tesoro della Gilda" (community).
// Card ids and effects are stable (persisted in game_decks); only texts are themed.

export const DECK_NAMES: Record<DeckKind, string> = {
  chance: "Destino Arcano",
  community: "Tesoro della Gilda",
};

export const DECK_SHORT_NAMES: Record<DeckKind, string> = {
  chance: "Destino",
  community: "Tesoro",
};

export const CARDS: CardDef[] = [
  // ------------------------------- Destino Arcano ---------------------------
  { id: "ch01", deck: "chance", title: "Richiamo alla Fontana", text: "Un incantesimo di ritorno ti riporta alla Fontana della Rinascita. Ritira il bonus.", effect: { type: "moveTo", to: "start" } },
  { id: "ch02", deck: "chance", title: "Udienza a corte", text: "Il sovrano di Argentea ti convoca: avanza fino al Palazzo Reale d'Argento.", effect: { type: "moveTo", to: "palazzo-reale" } },
  { id: "ch03", deck: "chance", title: "Pellegrinaggio spirituale", text: "Avanza fino al Tempio del Vento. Se passi dalla Fontana della Rinascita ritira il bonus.", effect: { type: "moveTo", to: "tempio-vento" } },
  { id: "ch04", deck: "chance", title: "Miraggio nel deserto", text: "Avanza fino all'Oasi Nascosta. Se passi dalla Fontana della Rinascita ritira il bonus.", effect: { type: "moveTo", to: "oasi" } },
  { id: "ch05", deck: "chance", title: "Varco instabile", text: "Un varco ti risucchia fino al trasporto più vicino. Se ha un padrone, paghi il doppio del pedaggio.", effect: { type: "moveToNearest", kind: "transport" } },
  { id: "ch06", deck: "chance", title: "Ritirata strategica", text: "Raggiungi il trasporto più vicino. Se ha un padrone, paghi il doppio del pedaggio.", effect: { type: "moveToNearest", kind: "transport" } },
  { id: "ch07", deck: "chance", title: "Sete di mana", text: "Raggiungi la fonte arcana più vicina. Se ha un padrone, paghi 10 volte il risultato dei dadi.", effect: { type: "moveToNearest", kind: "utility" } },
  { id: "ch08", deck: "chance", title: "Imboscata nella giungla", text: "Una creatura selvaggia ti sbarra la strada: torna indietro di 3 caselle.", effect: { type: "moveBy", steps: -3 } },
  { id: "ch09", deck: "chance", title: "Sentiero segreto", text: "Uno scout ti mostra una scorciatoia: avanza di 4 caselle.", effect: { type: "moveBy", steps: 4 } },
  { id: "ch10", deck: "chance", title: "Agguato della guardia reale", text: "Vieni catturato: vai direttamente nelle Segrete del Re senza passare dalla Fontana.", effect: { type: "goToJail" } },
  { id: "ch11", deck: "chance", title: "Pergamena d'evasione", text: "Esci gratis dalle Segrete. Conserva questa carta finché non la usi o la scambi.", effect: { type: "jailFree" } },
  { id: "ch12", deck: "chance", title: "Bottino del drago", text: "Il tuo gruppo abbatte un drago antico: ricevi 150 crediti.", effect: { type: "money", amount: 150 } },
  { id: "ch13", deck: "chance", title: "Campione del torneo", text: "Vinci il torneo dei campioni: ricevi 100 crediti.", effect: { type: "money", amount: 100 } },
  { id: "ch14", deck: "chance", title: "Pedaggio del ponte", text: "Il guardiano del ponte pretende il suo obolo: paga 30 crediti.", effect: { type: "money", amount: -30 } },
  { id: "ch15", deck: "chance", title: "Pozione esplosa", text: "Un esperimento alchemico finisce male: paga 120 crediti di danni.", effect: { type: "money", amount: -120 } },
  { id: "ch16", deck: "chance", title: "Assedio alle mura", text: "Ripara le difese: paga 30 crediti per ogni torretta e 120 per ogni fortezza.", effect: { type: "repairs", perHouse: 30, perTower: 120 } },
  { id: "ch17", deck: "chance", title: "Capitano della spedizione", text: "Guidi la spedizione e paghi le provviste: versa 40 crediti a ogni giocatore.", effect: { type: "payEach", amount: 40 } },
  { id: "ch18", deck: "chance", title: "Viaggio carovaniero", text: "Avanza fino alla Carovana delle Dune. Se passi dalla Fontana della Rinascita ritira il bonus.", effect: { type: "moveTo", to: "carovana" } },
  { id: "ch19", deck: "chance", title: "Reliquia venduta", text: "Un collezionista compra una tua reliquia: ricevi 60 crediti.", effect: { type: "money", amount: 60 } },
  { id: "ch20", deck: "chance", title: "Banchetto dei mercenari", text: "Offri da bere ai mercenari: paga 50 crediti.", effect: { type: "money", amount: -50 } },
  { id: "ch21", deck: "chance", title: "Consiglio di guerra", text: "Il generale ti attende: avanza fino al Bastione del Generale.", effect: { type: "moveTo", to: "bastione" } },
  { id: "ch22", deck: "chance", title: "Nebbia magica", text: "Ti perdi nella nebbia: torna indietro di 2 caselle.", effect: { type: "moveBy", steps: -2 } },

  // ----------------------------- Tesoro della Gilda --------------------------
  { id: "co01", deck: "community", title: "Errore del tesoriere", text: "Il tesoriere della gilda sbaglia i conti a tuo favore: ricevi 200 crediti.", effect: { type: "money", amount: 200 } },
  { id: "co02", deck: "community", title: "Guaritore del villaggio", text: "Paga 60 crediti per le cure dopo l'ultima battaglia.", effect: { type: "money", amount: -60 } },
  { id: "co03", deck: "community", title: "Eredità del mentore", text: "Il tuo vecchio maestro ti lascia 100 crediti.", effect: { type: "money", amount: 100 } },
  { id: "co04", deck: "community", title: "Fiera della gilda", text: "Le tue merci vanno a ruba alla fiera: ricevi 50 crediti.", effect: { type: "money", amount: 50 } },
  { id: "co05", deck: "community", title: "Grazia del sovrano", text: "Esci gratis dalle Segrete. Conserva questa carta finché non la usi o la scambi.", effect: { type: "jailFree" } },
  { id: "co06", deck: "community", title: "Accusa di tradimento", text: "Vai direttamente nelle Segrete del Re senza passare dalla Fontana della Rinascita.", effect: { type: "goToJail" } },
  { id: "co07", deck: "community", title: "Rinascita", text: "Torni alla Fontana della Rinascita: ritira il bonus.", effect: { type: "moveTo", to: "start" } },
  { id: "co08", deck: "community", title: "Festa del raccolto", text: "Organizzi la festa: ogni giocatore ti versa 25 crediti.", effect: { type: "collectFromEach", amount: 25 } },
  { id: "co09", deck: "community", title: "Anniversario della gilda", text: "È la tua festa: ogni giocatore ti regala 50 crediti.", effect: { type: "collectFromEach", amount: 50 } },
  { id: "co10", deck: "community", title: "Addestramento all'accademia", text: "Paga 100 crediti per il corso di scherma.", effect: { type: "money", amount: -100 } },
  { id: "co11", deck: "community", title: "Mappa venduta", text: "Vendi una mappa dei sentieri della giungla: ricevi 25 crediti.", effect: { type: "money", amount: 25 } },
  { id: "co12", deck: "community", title: "Rinforzo delle difese", text: "Paga 40 crediti per ogni torretta e 115 per ogni fortezza.", effect: { type: "repairs", perHouse: 40, perTower: 115 } },
  { id: "co13", deck: "community", title: "Rimborso della corona", text: "La corona ti rimborsa le spese di guerra: ricevi 120 crediti.", effect: { type: "money", amount: 120 } },
  { id: "co14", deck: "community", title: "Quota della gilda", text: "Paga 50 crediti di quota annuale alla gilda.", effect: { type: "money", amount: -50 } },
  { id: "co15", deck: "community", title: "Torneo di tiro con l'arco", text: "Arrivi secondo al torneo: ricevi 10 crediti.", effect: { type: "money", amount: 10 } },
  { id: "co16", deck: "community", title: "Dividendi della carovana", text: "I commerci della carovana rendono bene: ricevi 80 crediti.", effect: { type: "money", amount: 80 } },
  { id: "co17", deck: "community", title: "Visita ai prigionieri", text: "Porti viveri ai prigionieri: spostati sulle Segrete del Re (solo in visita).", effect: { type: "moveTo", to: "jail" } },
  { id: "co18", deck: "community", title: "Armatura da riforgiare", text: "Paga 150 crediti al fabbro per l'armatura nuova.", effect: { type: "money", amount: -150 } },
  { id: "co19", deck: "community", title: "Benedizione degli spiriti", text: "Gli spiriti dell'isola ti premiano: ricevi 150 crediti.", effect: { type: "money", amount: 150 } },
  { id: "co20", deck: "community", title: "Strada sbarrata", text: "Una frana blocca il passo: torna indietro di 2 caselle.", effect: { type: "moveBy", steps: -2 } },
  { id: "co21", deck: "community", title: "Cristallo di mana trovato", text: "Trovi un piccolo cristallo di mana: ricevi 30 crediti.", effect: { type: "money", amount: 30 } },
  { id: "co22", deck: "community", title: "Giro di birre in taverna", text: "Offri da bere a tutti: paga 20 crediti a ogni giocatore.", effect: { type: "payEach", amount: 20 } },
];

export const CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c]));

export function cardsOfDeck(deck: DeckKind): CardDef[] {
  return CARDS.filter((c) => c.deck === deck);
}

export function getCard(id: string): CardDef {
  const c = CARD_BY_ID[id];
  if (!c) throw new Error(`Unknown card ${id}`);
  return c;
}
