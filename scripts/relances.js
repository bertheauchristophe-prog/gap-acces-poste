// Relances automatiques des emprunts en retard + purge des données anciennes.
// Exécuté par GitHub Actions (.github/workflows/relances.yml).

const SB_URL = 'https://haqqyrycdmmusyxnsiqw.supabase.co';
const SB_KEY = process.env.SB_SERVICE_KEY;
const EJS_SERVICE  = 'service_h6a8p3l';
const EJS_TEMPLATE = 'template_an5b4bb';
const EJS_KEY      = 'uRh8B6H60bDSoWVCT'; // clé publique EmailJS
const JOUR = 86400000;

async function sb(path, method = 'GET', body) {
  const res = await fetch(SB_URL + '/rest/v1/' + path, {
    method,
    headers: {
      apikey: SB_KEY,
      Authorization: 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${method} ${path.split('?')[0]} : HTTP ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function sendMail(params) {
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EJS_SERVICE, template_id: EJS_TEMPLATE,
      user_id: EJS_KEY, template_params: params
    })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`EmailJS : HTTP ${res.status} ${text}`);
}

// Vérifie, sans l'afficher, que la clé fournie est bien une clé serveur
function verifierTypeCle(cle) {
  if (cle.startsWith('sb_secret_')) return console.log('Clé Supabase : secrète (OK)');
  if (cle.startsWith('sb_publishable_')) throw new Error('Le secret SB_KEY contient la clé publique (publishable). Remplacez-la par la clé service_role ou secret.');
  try {
    const role = JSON.parse(Buffer.from(cle.split('.')[1], 'base64url').toString()).role;
    if (role === 'service_role') return console.log('Clé Supabase : service_role (OK)');
    throw new Error(`Le secret SB_KEY contient une clé de rôle "${role}". Remplacez-la par la clé service_role.`);
  } catch (e) {
    if (e.message.startsWith('Le secret')) throw e;
    throw new Error('Le secret SB_KEY ne ressemble pas à une clé Supabase valide.');
  }
}

async function main() {
  if (!SB_KEY) throw new Error('Secret SB_KEY manquant dans GitHub (clé service_role Supabase).');
  verifierTypeCle(SB_KEY);

  const items    = await sb('items?select=id,type,duree_max');
  const emprunts = await sb('emprunts?select=*');
  const params   = await sb('parametres?select=cle,valeur');

  const p = Object.fromEntries(params.map(r => [r.cle, r.valeur]));
  const site         = p.nom_site || 'Poste RTE Bourbonnais';
  const emailContact = p.email_from || '';
  const delaiGlobal  = parseInt(p.delai_relance || '30', 10);
  const frequence    = Math.max(1, parseInt(p.freq_relance || '30', 10)); // "Fréquence de relance" dans Paramètres
  const purgeMois    = parseInt(p.purge_mois || '12', 10);

  const now = Date.now();
  let envoyes = 0, echecs = 0;

  // La table "emprunts" ne contient que les emprunts en cours (supprimés au retour).
  for (const e of emprunts) {
    const item  = items.find(i => i.id === e.item_id);
    const delai = item && item.duree_max ? item.duree_max : delaiGlobal;
    const jours = Math.floor((now - new Date(e.date_emprunt)) / JOUR);
    if (jours <= delai || !e.email) continue;
    if (e.date_derniere_relance && now - new Date(e.date_derniere_relance) < frequence * JOUR) continue;

    try {
      await sendMail({
        to_email: e.email, nom: e.nom || '', prenom: e.prenom || '',
        item_id: e.item_id, item_type: (item && item.type) || 'clé', site,
        date_emprunt: new Date(e.date_emprunt).toLocaleDateString('fr-FR'),
        nb_jours: String(jours), duree_max: String(delai), email_contact: emailContact
      });
      await sb('emprunts?id=eq.' + encodeURIComponent(e.id), 'PATCH', {
        date_derniere_relance: new Date().toISOString(),
        nombre_relances: (e.nombre_relances || 0) + 1
      });
      envoyes++;
      console.log(`Relance envoyée : ${e.item_id} (${jours} jours)`);
    } catch (err) {
      echecs++;
      console.error(`Échec relance ${e.item_id} :`, err.message);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log(`${envoyes} relance(s) envoyée(s), ${echecs} échec(s)`);

  // Purge des données personnelles au-delà de la durée de conservation
  if (purgeMois > 0) {
    const cutoff = new Date(now - purgeMois * 30 * JOUR).toISOString();
    const h = await sb('historique?created_at=lt.' + encodeURIComponent(cutoff), 'DELETE');
    const b = await sb('bons_archives?created_at=lt.' + encodeURIComponent(cutoff), 'DELETE');
    console.log(`Purge (> ${purgeMois} mois) : ${h.length} ligne(s) d'historique, ${b.length} bon(s) archivé(s)`);
  }

  if (echecs > 0) process.exitCode = 1;
}

main().catch(err => { console.error(err.message); process.exitCode = 1; });
