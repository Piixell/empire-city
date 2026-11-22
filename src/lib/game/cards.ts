import type { CardDef, DeckKind } from "./types";

// Two original decks: "Evento Urbano" (chance) and "Fondo Cittadino" (community).

export const DECK_NAMES: Record<DeckKind, string> = {
  chance: "Evento Urbano",
  community: "Fondo Cittadino",
};

export const CARDS: CardDef[] = [
  // ------------------------------- Evento Urbano ----------------------------
  { id: "ch01", deck: "chance", title: "Inaugurazione della metro", text: "Prendi la nuova linea e avanza fino alla Partenza.", effect: { type: "moveTo", tile: 0 } },
  { id: "ch02", deck: "chance", title: "Invito a Villa Panorama", text: "Sei ospite d'onore: avanza fino a Villa Panorama.", effect: { type: "moveTo", tile: 47 } },
  { id: "ch03", deck: "chance", title: "Visita guidata", text: "Avanza fino a Via del Duomo. Se passi dalla Partenza ritira il bonus.", effect: { type: "moveTo", tile: 25 } },
  { id: "ch04", deck: "chance", title: "Gita sul fiume", text: "Avanza fino al Molo dei Pescatori. Se passi dalla Partenza ritira il bonus.", effect: { type: "moveTo", tile: 13 } },
  { id: "ch05", deck: "chance", title: "Coincidenza perfetta", text: "Avanza fino al trasporto più vicino. Se è di un altro giocatore paghi il doppio dell'affitto.", effect: { type: "moveToNearest", kind: "transport" } },
  { id: "ch06", deck: "chance", title: "Sciopero dei taxi", text: "Raggiungi il trasporto più vicino. Se è di un altro giocatore paghi il doppio dell'affitto.", effect: { type: "moveToNearest", kind: "transport" } },
  { id: "ch07", deck: "chance", title: "Blackout di quartiere", text: "Avanza fino al servizio pubblico più vicino. Se è posseduto paghi 10 volte il risultato dei dadi.", effect: { type: "moveToNearest", kind: "utility" } },
  { id: "ch08", deck: "chance", title: "Deviazione stradale", text: "Lavori in corso: torna indietro di 3 caselle.", effect: { type: "moveBy", steps: -3 } },
  { id: "ch09", deck: "chance", title: "Scorciatoia", text: "Conosci una strada secondaria: avanza di 4 caselle.", effect: { type: "moveBy", steps: 4 } },
  { id: "ch10", deck: "chance", title: "Eccesso di velocità", text: "Vai direttamente in prigione senza passare dalla Partenza.", effect: { type: "goToJail" } },
  { id: "ch11", deck: "chance", title: "Amnistia comunale", text: "Esci gratis di prigione. Conserva questa carta finché non la usi o la scambi.", effect: { type: "jailFree" } },
  { id: "ch12", deck: "chance", title: "Rimborso fiscale", text: "L'agenzia delle entrate ti restituisce 150 crediti.", effect: { type: "money", amount: 150 } },
  { id: "ch13", deck: "chance", title: "Concorso di architettura", text: "Il tuo progetto vince il primo premio: ricevi 100 crediti.", effect: { type: "money", amount: 100 } },
  { id: "ch14", deck: "chance", title: "Divieto di sosta", text: "Multa per sosta vietata: paga 30 crediti.", effect: { type: "money", amount: -30 } },
  { id: "ch15", deck: "chance", title: "Sanzione ambientale", text: "Scarichi non autorizzati: paga 120 crediti.", effect: { type: "money", amount: -120 } },
  { id: "ch16", deck: "chance", title: "Manutenzione straordinaria", text: "Paga 30 crediti per ogni casa e 120 per ogni torre che possiedi.", effect: { type: "repairs", perHouse: 30, perTower: 120 } },
  { id: "ch17", deck: "chance", title: "Presidente di quartiere", text: "Sei stato eletto presidente del consiglio: paga 40 crediti a ogni giocatore.", effect: { type: "payEach", amount: 40 } },
  { id: "ch18", deck: "chance", title: "Volo last minute", text: "Avanza fino all'Aeroporto Internazionale. Se passi dalla Partenza ritira il bonus.", effect: { type: "moveTo", tile: 29 } },
  { id: "ch19", deck: "chance", title: "Dividendi azionari", text: "Le tue azioni rendono bene: ricevi 60 crediti.", effect: { type: "money", amount: 60 } },
  { id: "ch20", deck: "chance", title: "Spese di rappresentanza", text: "Cena di gala con gli investitori: paga 50 crediti.", effect: { type: "money", amount: -50 } },
  { id: "ch21", deck: "chance", title: "Seduta in Borsa", text: "Avanza fino a Piazza della Borsa.", effect: { type: "moveTo", tile: 35 } },
  { id: "ch22", deck: "chance", title: "Ingorgo in tangenziale", text: "Torna indietro di 2 caselle.", effect: { type: "moveBy", steps: -2 } },

  // ------------------------------ Fondo Cittadino ---------------------------
  { id: "co01", deck: "community", title: "Errore della banca", text: "Errore della banca a tuo favore: ricevi 200 crediti.", effect: { type: "money", amount: 200 } },
  { id: "co02", deck: "community", title: "Visita medica", text: "Paga 60 crediti di spese mediche.", effect: { type: "money", amount: -60 } },
  { id: "co03", deck: "community", title: "Eredità", text: "Uno zio lontano ti lascia 100 crediti.", effect: { type: "money", amount: 100 } },
  { id: "co04", deck: "community", title: "Mercatino solidale", text: "La vendita di beneficenza ti frutta 50 crediti.", effect: { type: "money", amount: 50 } },
  { id: "co05", deck: "community", title: "Buona condotta", text: "Esci gratis di prigione. Conserva questa carta finché non la usi o la scambi.", effect: { type: "jailFree" } },
  { id: "co06", deck: "community", title: "Controllo fiscale", text: "Vai direttamente in prigione senza passare dalla Partenza.", effect: { type: "goToJail" } },
  { id: "co07", deck: "community", title: "Maratona cittadina", text: "Corri fino alla Partenza e ritira il bonus.", effect: { type: "moveTo", tile: 0 } },
  { id: "co08", deck: "community", title: "Festa di quartiere", text: "Organizzi la festa: ogni giocatore ti versa 25 crediti.", effect: { type: "collectFromEach", amount: 25 } },
  { id: "co09", deck: "community", title: "Compleanno", text: "È il tuo compleanno: ogni giocatore ti regala 50 crediti.", effect: { type: "collectFromEach", amount: 50 } },
  { id: "co10", deck: "community", title: "Retta scolastica", text: "Paga 100 crediti di retta scolastica.", effect: { type: "money", amount: -100 } },
  { id: "co11", deck: "community", title: "Consulenza", text: "Ricevi 25 crediti per una consulenza urbanistica.", effect: { type: "money", amount: 25 } },
  { id: "co12", deck: "community", title: "Ristrutturazione edilizia", text: "Paga 40 crediti per ogni casa e 115 per ogni torre.", effect: { type: "repairs", perHouse: 40, perTower: 115 } },
  { id: "co13", deck: "community", title: "Rimborso assicurativo", text: "L'assicurazione ti rimborsa 120 crediti.", effect: { type: "money", amount: 120 } },
  { id: "co14", deck: "community", title: "Tassa sui rifiuti", text: "Paga 50 crediti di tassa sui rifiuti.", effect: { type: "money", amount: -50 } },
  { id: "co15", deck: "community", title: "Concorso fotografico", text: "Secondo premio al concorso fotografico: ricevi 10 crediti.", effect: { type: "money", amount: 10 } },
  { id: "co16", deck: "community", title: "Obbligazioni comunali", text: "Maturano gli interessi: ricevi 80 crediti.", effect: { type: "money", amount: 80 } },
  { id: "co17", deck: "community", title: "Volontariato", text: "Fai visita al carcere come volontario: spostati sulla casella Prigione / Transito (solo in visita).", effect: { type: "moveTo", tile: 12 } },
  { id: "co18", deck: "community", title: "Facciata da rifare", text: "Paga 150 crediti per il restauro della facciata.", effect: { type: "money", amount: -150 } },
  { id: "co19", deck: "community", title: "Bonus efficienza energetica", text: "Ricevi un incentivo di 150 crediti.", effect: { type: "money", amount: 150 } },
  { id: "co20", deck: "community", title: "Strada sbagliata", text: "Torna indietro di 2 caselle.", effect: { type: "moveBy", steps: -2 } },
  { id: "co21", deck: "community", title: "Abbonamento rimborsato", text: "Ricevi 30 crediti di rimborso per l'abbonamento ai mezzi.", effect: { type: "money", amount: 30 } },
  { id: "co22", deck: "community", title: "Cena offerta", text: "Offri la cena a tutti: paga 20 crediti a ogni giocatore.", effect: { type: "payEach", amount: 20 } },
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
