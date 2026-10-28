// Static data for `npm run seed`: the demo businesses, the products they sell and the meals
// restaurants donate. The simulation that uses it lives in seed.ts.

export interface SeedBusiness {
  first_name: string;
  last_name: string;
  email: string;
  business_name: string;
  // A name from the cities table.
  city: string;
  address: string;
  phone: string;
  opening_hours: string;
  pickup_hours: string;
  // Left out for a branch: it shows its company's description.
  description?: string;
  // Pickup window in hours (local time), used for pickup dates.
  pickup: [number, number];
  // Chance per day that the business acts (a store publishes a product, a restaurant reserves).
  activity: number;
  // Plan name per credit month, oldest first; the last one repeats for later months.
  plans: string[];
  autoRenew: boolean;
}

export interface SeedStore extends SeedBusiness {
  categories: string[];
  // Products the store has on offer right now.
  currentStock: number;
  // A branch: the name of its company in COMPANIES (created by its headquarters).
  company?: string;
}

export interface ProductTemplate {
  name: string;
  description: string;
  category: string;
  unit: string;
  price: [number, number];
  quantity: [number, number];
}

export interface MealTemplate {
  name: string;
  description: string;
  price: [number, number];
  allergens: string[];
  temperature: "HOT" | "COLD";
}

export const SEED_PASSWORD = "To12345678";

export const ADMINS = [
  { first_name: "Haris", last_name: "Admin", email: "admin@demo.com" },
  { first_name: "Amra", last_name: "Admin", email: "admin2@demo.com" },
];

// Store chains with their headquarters login (COMPANY role). Branches come with step 2.2.
export const COMPANIES = [
  {
    name: "Bingo d.o.o.",
    description: "Trgovački lanac s prodavnicama širom Bosne i Hercegovine.",
    hq: { first_name: "Selma", last_name: "Bingo", phone: "035 000 111", email: "bingo@demo.com" },
  },
];

const ALL_CATEGORIES = ["Meat", "Fish", "Dairy", "Vegetables", "Fruits", "Bakery", "Drinks", "Frozen Food", "Other"];

export const STORES: SeedStore[] = [
  {
    first_name: "Amir", last_name: "Hodžić", email: "market.centar@demo.com", business_name: "Market Centar",
    city: "Sarajevo", address: "Ferhadija 5", phone: "061111111", opening_hours: "07:00–22:00", pickup_hours: "15:00–20:00",
    description: "Supermarket u centru grada sa svježim mesom, mliječnim proizvodima i pekarom.",
    pickup: [15, 20], activity: 0.7, currentStock: 22, categories: ALL_CATEGORIES, plans: ["Pro"], autoRenew: true,
  },
  {
    first_name: "Emir", last_name: "Kovač", email: "zeleni.market@demo.com", business_name: "Zeleni Market",
    city: "Sarajevo", address: "Zmaja od Bosne 44", phone: "061333333", opening_hours: "07:00–21:00", pickup_hours: "14:00–19:00",
    description: "Voće i povrće od lokalnih proizvođača, sokovi i namirnice za kuhinju.",
    pickup: [14, 19], activity: 0.55, currentStock: 18, categories: ["Vegetables", "Fruits", "Drinks", "Other"], plans: ["Pro"], autoRenew: true,
  },
  {
    first_name: "Mirza", last_name: "Delić", email: "mesnica.bosna@demo.com", business_name: "Mesnica Bosna",
    city: "Tuzla", address: "Turalibegova 18", phone: "061444444", opening_hours: "07:00–19:00", pickup_hours: "13:00–18:00",
    description: "Domaće meso iz vlastitog otkupa, suhomesnato i smrznuti program.",
    pickup: [13, 18], activity: 0.4, currentStock: 14, categories: ["Meat", "Frozen Food"], plans: ["Standard"], autoRenew: true,
  },
  {
    first_name: "Selma", last_name: "Begić", email: "pekara.dobra@demo.com", business_name: "Pekara Dobra",
    city: "Tuzla", address: "Slatina 12", phone: "061222222", opening_hours: "06:00–20:00", pickup_hours: "16:00–19:00",
    description: "Pekara sa tradicijom: hljeb, peciva, kroasani i mliječni program.",
    pickup: [16, 19], activity: 0.45, currentStock: 13, categories: ["Bakery", "Dairy"], plans: ["Standard"], autoRenew: false,
  },
  {
    first_name: "Lamija", last_name: "Hadžić", email: "mljekara.vrelo@demo.com", business_name: "Mljekara Vrelo",
    city: "Visoko", address: "Alije Izetbegovića 12", phone: "061555555", opening_hours: "07:00–18:00", pickup_hours: "12:00–17:00",
    description: "Mlijeko, jogurt, sirevi i pavlaka iz vlastite mljekare.",
    pickup: [12, 17], activity: 0.3, currentStock: 11, categories: ["Dairy", "Drinks"], plans: ["Standard"], autoRenew: true,
  },
  {
    first_name: "Dino", last_name: "Marić", email: "ribarnica.neretva@demo.com", business_name: "Ribarnica Neretva",
    city: "Zenica", address: "Trg Alije Izetbegovića 3", phone: "061666666", opening_hours: "07:00–17:00", pickup_hours: "12:00–16:00",
    description: "Svježa riječna i morska riba, isporuka svako jutro.",
    pickup: [12, 16], activity: 0.25, currentStock: 10, categories: ["Fish", "Frozen Food"], plans: ["Basic", "Standard"], autoRenew: false,
  },
  {
    first_name: "Ivana", last_name: "Bošnjak", email: "market.neretva@demo.com", business_name: "Market Neretva",
    city: "Kakanj", address: "Branilaca 5", phone: "061777777", opening_hours: "07:00–21:00", pickup_hours: "15:00–19:00",
    description: "Kvartovski market sa širokim izborom namirnica.",
    pickup: [15, 19], activity: 0.3, currentStock: 9, categories: ALL_CATEGORIES, plans: ["Standard"], autoRenew: false,
  },
  {
    first_name: "Kenan", last_name: "Mujić", email: "vocarna.butmir@demo.com", business_name: "Voćarna Butmir",
    city: "Sarajevo", address: "Butmirska cesta 31", phone: "061888888", opening_hours: "08:00–20:00", pickup_hours: "16:00–19:00",
    description: "Sezonsko voće i povrće sa farmi u okolini Sarajeva.",
    pickup: [16, 19], activity: 0.18, currentStock: 7, categories: ["Fruits", "Vegetables"], plans: ["Basic"], autoRenew: true,
  },
  {
    first_name: "Aida", last_name: "Salihović", email: "pekara.somun@demo.com", business_name: "Pekara Somun",
    city: "Zenica", address: "Maršala Tita 60", phone: "061999999", opening_hours: "06:00–19:00", pickup_hours: "17:00–19:00",
    description: "Somuni, pite i hljeb iz krušne peći.",
    pickup: [17, 19], activity: 0.15, currentStock: 6, categories: ["Bakery"], plans: ["Basic"], autoRenew: false,
  },
  {
    first_name: "Nermin", last_name: "Čaušević", email: "bio.kutak@demo.com", business_name: "Bio Kutak",
    city: "Visoko", address: "Čaršijska 4", phone: "062000000", opening_hours: "09:00–20:00", pickup_hours: "17:00–20:00",
    description: "Organske namirnice, biljni napici i zdrava hrana.",
    pickup: [17, 20], activity: 0.12, currentStock: 5, categories: ["Other", "Drinks", "Dairy", "Vegetables"], plans: ["Basic"], autoRenew: false,
  },
  // Branches of Bingo d.o.o. (after the stores with product templates). No description or logo of
  // their own, so they show the company's.
  {
    first_name: "Lejla", last_name: "Kovač", email: "bingo.sarajevo@demo.com", business_name: "Bingo Sarajevo Centar",
    city: "Sarajevo", address: "Zmaja od Bosne 8", phone: "033400100", opening_hours: "07:00–22:00", pickup_hours: "16:00–20:00",
    pickup: [16, 20], activity: 0.35, currentStock: 10, categories: ALL_CATEGORIES, plans: ["Standard"], autoRenew: true,
    company: "Bingo d.o.o.",
  },
  {
    first_name: "Mirza", last_name: "Hadžić", email: "bingo.visoko@demo.com", business_name: "Bingo Visoko",
    city: "Visoko", address: "Alije Izetbegovića 22", phone: "032400200", opening_hours: "07:00–21:00", pickup_hours: "16:00–19:00",
    pickup: [16, 19], activity: 0.25, currentStock: 8, categories: ALL_CATEGORIES, plans: ["Standard"], autoRenew: false,
    company: "Bingo d.o.o.",
  },
  {
    first_name: "Edina", last_name: "Bešić", email: "bingo.kakanj@demo.com", business_name: "Bingo Kakanj",
    city: "Kakanj", address: "Alije Izetbegovića 5", phone: "032400300", opening_hours: "07:00–21:00", pickup_hours: "16:00–19:00",
    pickup: [16, 19], activity: 0.2, currentStock: 7, categories: ALL_CATEGORIES, plans: ["Basic"], autoRenew: false,
    company: "Bingo d.o.o.",
  },
  {
    first_name: "Haris", last_name: "Delić", email: "bingo.zenica@demo.com", business_name: "Bingo Zenica",
    city: "Zenica", address: "Bulevar Kralja Tvrtka I 14", phone: "032400400", opening_hours: "07:00–22:00", pickup_hours: "16:00–20:00",
    pickup: [16, 20], activity: 0.3, currentStock: 9, categories: ALL_CATEGORIES, plans: ["Standard"], autoRenew: true,
    company: "Bingo d.o.o.",
  },
  {
    first_name: "Amela", last_name: "Mehić", email: "bingo.tuzla@demo.com", business_name: "Bingo Tuzla",
    city: "Tuzla", address: "Mitra Trifunovića Uče 2", phone: "035400500", opening_hours: "07:00–22:00", pickup_hours: "16:00–20:00",
    pickup: [16, 20], activity: 0.3, currentStock: 9, categories: ALL_CATEGORIES, plans: ["Standard"], autoRenew: true,
    company: "Bingo d.o.o.",
  },
];

export const RESTAURANTS: SeedBusiness[] = [
  {
    first_name: "Lejla", last_name: "Softić", email: "restoran.ukus@demo.com", business_name: "Restoran Ukus",
    city: "Sarajevo", address: "Titova 20", phone: "062111111", opening_hours: "10:00–23:00", pickup_hours: "",
    description: "Bosanska i mediteranska kuhinja, dnevni meni i catering.",
    pickup: [0, 0], activity: 0.9, plans: ["Pro"], autoRenew: true,
  },
  {
    first_name: "Tarik", last_name: "Hasić", email: "bistro.avlija@demo.com", business_name: "Bistro Avlija",
    city: "Sarajevo", address: "Sime Milutinovića 4", phone: "062222223", opening_hours: "08:00–22:00", pickup_hours: "",
    description: "Doručci, sezonske salate i jela s roštilja u mirnoj avliji.",
    pickup: [0, 0], activity: 0.75, plans: ["Standard", "Standard", "Pro"], autoRenew: false,
  },
  {
    first_name: "Adnan", last_name: "Mešić", email: "pizzeria.roma@demo.com", business_name: "Pizzeria Roma",
    city: "Tuzla", address: "Trg slobode 7", phone: "062222222", opening_hours: "11:00–23:00", pickup_hours: "",
    description: "Pizza iz krušne peći i domaća tjestenina.",
    pickup: [0, 0], activity: 0.7, plans: ["Basic"], autoRenew: true,
  },
  {
    first_name: "Jasmin", last_name: "Omerović", email: "restoran.starigrad@demo.com", business_name: "Restoran Stari Grad",
    city: "Sarajevo", address: "Baščaršija 12", phone: "062333333", opening_hours: "09:00–23:00", pickup_hours: "",
    description: "Tradicionalna jela, ćevapi i pite u srcu Baščaršije.",
    pickup: [0, 0], activity: 0.6, plans: ["Standard"], autoRenew: false,
  },
  {
    first_name: "Ana", last_name: "Jurić", email: "kafana.most@demo.com", business_name: "Kafana Most",
    city: "Zenica", address: "Kamberovića čikma 2", phone: "062444444", opening_hours: "09:00–24:00", pickup_hours: "",
    description: "Domaća kuhinja i riblji specijaliteti s pogledom na rijeku Bosnu.",
    pickup: [0, 0], activity: 0.55, plans: ["Standard"], autoRenew: true,
  },
  {
    first_name: "Edin", last_name: "Karić", email: "restoran.panorama@demo.com", business_name: "Restoran Panorama",
    city: "Sarajevo", address: "Vrbanja 1", phone: "062555555", opening_hours: "11:00–23:00", pickup_hours: "",
    description: "Restoran za poslovne ručkove i proslave.",
    pickup: [0, 0], activity: 0.5, plans: ["Standard"], autoRenew: false,
  },
  {
    first_name: "Maja", last_name: "Pašić", email: "bistro.zelenikutak@demo.com", business_name: "Bistro Zeleni Kutak",
    city: "Kakanj", address: "Rudarska 12", phone: "062666666", opening_hours: "08:00–21:00", pickup_hours: "",
    description: "Vegetarijanska i veganska jela od lokalnih namirnica.",
    pickup: [0, 0], activity: 0.4, plans: ["Basic"], autoRenew: true,
  },
  {
    first_name: "Haris", last_name: "Imamović", email: "pizzeria.napoli@demo.com", business_name: "Pizzeria Napoli",
    city: "Tuzla", address: "Stupine B4", phone: "062777777", opening_hours: "11:00–23:00", pickup_hours: "",
    description: "Napolitanska pizza i brza dostava u Tuzli.",
    pickup: [0, 0], activity: 0.35, plans: ["Standard"], autoRenew: false,
  },
  {
    first_name: "Goran", last_name: "Vuković", email: "restoran.tvrdjava@demo.com", business_name: "Restoran Tvrđava",
    city: "Visoko", address: "Čaršijska 20", phone: "062888888", opening_hours: "10:00–23:00", pickup_hours: "",
    description: "Jela s ražnja i peke, domaća vina.",
    pickup: [0, 0], activity: 0.3, plans: ["Basic"], autoRenew: false,
  },
  {
    first_name: "Senad", last_name: "Bajrić", email: "ascinica.sofra@demo.com", business_name: "Aščinica Sofra",
    city: "Zenica", address: "Maršala Tita 15", phone: "062999999", opening_hours: "08:00–18:00", pickup_hours: "",
    description: "Kuhana jela, dolme i sogan-dolma po starim receptima.",
    pickup: [0, 0], activity: 0.2, plans: ["Basic"], autoRenew: true,
  },
];

export const PRODUCT_TEMPLATES: ProductTemplate[] = [
  { name: "Pileći batak", description: "Svježi pileći bataci, čuvani na hladnom.", category: "Meat", unit: "kg", price: [9, 14], quantity: [8, 25] },
  { name: "Pileća prsa", description: "Fileti pilećih prsa bez kože.", category: "Meat", unit: "kg", price: [12, 16], quantity: [6, 20] },
  { name: "Mljeveno juneće meso", description: "Mješavina za ćevape i umake.", category: "Meat", unit: "kg", price: [14, 20], quantity: [5, 15] },
  { name: "Teleći odrezak", description: "Odresci spremni za roštilj.", category: "Meat", unit: "kg", price: [22, 30], quantity: [3, 10] },
  { name: "Goveđa pečenica", description: "Pečenica za odreske i medaljone.", category: "Meat", unit: "kg", price: [30, 40], quantity: [2, 6] },
  { name: "Sudžuk domaći", description: "Goveđi sudžuk, sušen na dimu.", category: "Meat", unit: "kg", price: [18, 24], quantity: [3, 10] },
  { name: "Filet lososa", description: "Svježi filet, isporuka od jutros.", category: "Fish", unit: "kg", price: [28, 40], quantity: [3, 8] },
  { name: "Pastrmka", description: "Domaća riječna pastrmka, očišćena.", category: "Fish", unit: "kg", price: [14, 20], quantity: [4, 12] },
  { name: "Orada", description: "Svježa orada, cijela riba.", category: "Fish", unit: "kg", price: [18, 26], quantity: [3, 10] },
  { name: "Lignje", description: "Očišćene lignje za roštilj ili pohanje.", category: "Fish", unit: "kg", price: [16, 22], quantity: [3, 8] },
  { name: "Mlijeko 3.2%", description: "Pasterizovano mlijeko, kutija 1L.", category: "Dairy", unit: "kom", price: [2, 3], quantity: [20, 60] },
  { name: "Jogurt", description: "Tečni jogurt, 1L.", category: "Dairy", unit: "kom", price: [2, 3], quantity: [20, 50] },
  { name: "Sir trapist", description: "Polutvrdi sir, rezan po potrebi.", category: "Dairy", unit: "kg", price: [12, 18], quantity: [4, 12] },
  { name: "Mladi sir", description: "Svježi kravlji sir, 500g.", category: "Dairy", unit: "kom", price: [4, 6], quantity: [10, 25] },
  { name: "Pavlaka", description: "Kisela pavlaka 20% mm, 500g.", category: "Dairy", unit: "kom", price: [3, 4], quantity: [10, 30] },
  { name: "Kajmak", description: "Domaći kajmak, posuda 500g.", category: "Dairy", unit: "kom", price: [8, 12], quantity: [5, 15] },
  { name: "Paradajz", description: "Domaći paradajz, zreo za salate i umake.", category: "Vegetables", unit: "kg", price: [3, 5], quantity: [10, 40] },
  { name: "Paprika", description: "Crvena i zelena paprika.", category: "Vegetables", unit: "kg", price: [3, 6], quantity: [10, 30] },
  { name: "Krompir", description: "Mladi krompir iz lokalnog uzgoja.", category: "Vegetables", unit: "kg", price: [1, 2], quantity: [30, 80] },
  { name: "Zelena salata", description: "Svježa salata, ubrana juče.", category: "Vegetables", unit: "kom", price: [1, 2], quantity: [15, 40] },
  { name: "Tikvice", description: "Mlade tikvice, idealne za grill.", category: "Vegetables", unit: "kg", price: [2, 4], quantity: [10, 25] },
  { name: "Luk crveni", description: "Crveni luk, mreža 5kg.", category: "Vegetables", unit: "pak", price: [5, 8], quantity: [6, 20] },
  { name: "Šampinjoni", description: "Svježi šampinjoni, pakovanje 500g.", category: "Vegetables", unit: "pak", price: [3, 5], quantity: [10, 25] },
  { name: "Jabuke Idared", description: "Jabuke sa lokalnog voćnjaka.", category: "Fruits", unit: "kg", price: [2, 4], quantity: [15, 50] },
  { name: "Banane", description: "Zrele banane, idealne za deserte.", category: "Fruits", unit: "kg", price: [3, 4], quantity: [10, 30] },
  { name: "Grožđe", description: "Stolno grožđe iz Hercegovine.", category: "Fruits", unit: "kg", price: [4, 6], quantity: [8, 20] },
  { name: "Šljive", description: "Sezonske šljive, pogodne za kolače.", category: "Fruits", unit: "kg", price: [2, 4], quantity: [10, 30] },
  { name: "Limun", description: "Limun, mreža 1kg.", category: "Fruits", unit: "pak", price: [3, 5], quantity: [10, 30] },
  { name: "Hljeb bijeli", description: "Svježe pečen hljeb, dan star.", category: "Bakery", unit: "kom", price: [1.5, 2.5], quantity: [15, 40] },
  { name: "Integralni hljeb", description: "Hljeb od integralnog brašna, 600g.", category: "Bakery", unit: "kom", price: [2.5, 3.5], quantity: [10, 30] },
  { name: "Kroasani", description: "Kroasani od maslaca, pakovanje 6 kom.", category: "Bakery", unit: "pak", price: [5, 8], quantity: [5, 15] },
  { name: "Somun", description: "Tradicionalni somun.", category: "Bakery", unit: "kom", price: [1, 2], quantity: [20, 50] },
  { name: "Pecivo mix", description: "Miješana peciva, pakovanje 10 kom.", category: "Bakery", unit: "pak", price: [4, 6], quantity: [6, 18] },
  { name: "Sok od narandže", description: "100% prirodni sok, 1L.", category: "Drinks", unit: "kom", price: [3, 5], quantity: [10, 30] },
  { name: "Mineralna voda", description: "Gazirana mineralna voda, 1.5L.", category: "Drinks", unit: "kom", price: [1, 2], quantity: [24, 72] },
  { name: "Sok od jabuke", description: "Hladno cijeđeni sok od jabuke, 1L.", category: "Drinks", unit: "kom", price: [3, 4], quantity: [10, 30] },
  { name: "Smrznuto povrće mix", description: "Mješavina povrća za variva.", category: "Frozen Food", unit: "kg", price: [4, 6], quantity: [8, 20] },
  { name: "Smrznuti pomfrit", description: "Pomfrit za prženje, vreća 2.5kg.", category: "Frozen Food", unit: "pak", price: [7, 10], quantity: [6, 20] },
  { name: "Smrznuti škampi", description: "Očišćeni škampi, pakovanje 1kg.", category: "Frozen Food", unit: "pak", price: [18, 25], quantity: [3, 10] },
  { name: "Maslinovo ulje", description: "Ekstra djevičansko, 1L.", category: "Other", unit: "l", price: [15, 22], quantity: [5, 15] },
  { name: "Jaja", description: "Domaća jaja, pakovanje 30 kom.", category: "Other", unit: "pak", price: [8, 11], quantity: [6, 20] },
  { name: "Med livadski", description: "Domaći livadski med, tegla 900g.", category: "Other", unit: "kom", price: [15, 20], quantity: [4, 12] },
];

export const MEAL_TEMPLATES: MealTemplate[] = [
  { name: "Grah s kobasicom", description: "Domaći grah, porcija 400g.", price: [6, 9], allergens: ["celery"], temperature: "HOT" },
  { name: "Pileći rižoto", description: "Rižoto s piletinom i povrćem.", price: [8, 12], allergens: ["milk", "celery"], temperature: "HOT" },
  { name: "Musaka", description: "Musaka od krompira i mljevenog mesa.", price: [8, 11], allergens: ["eggs", "milk"], temperature: "HOT" },
  { name: "Pita krompiruša", description: "Domaća pita, četvrtina tepsije.", price: [4, 6], allergens: ["gluten"], temperature: "COLD" },
  { name: "Tjestenina bolonjez", description: "Špagete s bolonjez umakom.", price: [9, 13], allergens: ["gluten", "celery"], temperature: "HOT" },
  { name: "Sezonska salata", description: "Miješana salata s jogurt dresingom.", price: [5, 7], allergens: ["milk"], temperature: "COLD" },
  { name: "Bosanski lonac", description: "Meso i povrće kuhano u loncu.", price: [9, 12], allergens: ["celery"], temperature: "HOT" },
  { name: "Sarma", description: "Sarma u kiselom kupusu, 3 komada.", price: [8, 11], allergens: [], temperature: "HOT" },
];

export const ANNOUNCEMENTS = [
  {
    audience: "ALL" as const,
    title_bs: "Dobrodošli na Još vrijedi",
    body_bs: "Hvala što ste s nama od prvog dana. Objavite višak hrane, a restorani će ga rezervisati u nekoliko klikova.",
    title_en: "Welcome to FoodWise",
    body_en: "Thank you for joining from day one. Publish your surplus food and restaurants will reserve it in a few clicks.",
  },
  {
    audience: "ALL" as const,
    title_bs: "Planirano održavanje",
    body_bs: "U noći između subote i nedjelje od 02:00 do 03:00 platforma neće biti dostupna zbog održavanja.",
    title_en: "Scheduled maintenance",
    body_en: "The platform will be unavailable on Saturday night between 02:00 and 03:00 for maintenance.",
  },
  {
    audience: "STORE" as const,
    title_bs: "Donirajte višak hrane",
    body_bs: "Proizvode kojima ističe rok sada možete jednim klikom prebaciti u donacije. Hvala svima koji već doniraju!",
    title_en: "Donate your surplus",
    body_en: "Products close to expiry can now be moved to donations with one click. Thanks to everyone already donating!",
  },
];
