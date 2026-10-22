export const WOOD_SPECIES = [
  { key: 'teak', english: 'Teak', scientificName: 'Tectona grandis' },
  { key: 'neem', english: 'Neem', scientificName: 'Azadirachta indica' },
  { key: 'sandalwood', english: 'Sandalwood', scientificName: 'Santalum album' },
  { key: 'eucalyptus', english: 'Eucalyptus' },
  { key: 'mango', english: 'Mango', scientificName: 'Mangifera indica' },
  { key: 'jackfruit', english: 'Jackfruit', scientificName: 'Artocarpus heterophyllus' },
  { key: 'bamboo', english: 'Bamboo' },
  { key: 'rosewood', english: 'Rosewood' },
  { key: 'shisham', english: 'Shisham', scientificName: 'Dalbergia sissoo' },
  { key: 'sal', english: 'Sal', scientificName: 'Shorea robusta' },
  { key: 'deodar', english: 'Deodar', scientificName: 'Cedrus deodara' },
  { key: 'pine', english: 'Pine' },
  { key: 'acacia', english: 'Acacia' },
  { key: 'silverOak', english: 'Silver Oak', scientificName: 'Grevillea robusta' },
  { key: 'tamarind', english: 'Tamarind', scientificName: 'Tamarindus indica' },
  { key: 'honge', english: 'Honge / Indian Beech', aliases: ['Honge', 'Indian Beech'] }
];

const aliases = new Map(
  WOOD_SPECIES.flatMap(({ key, english, aliases: names = [] }) => [
    ...[english, ...names].flatMap((name) => [
      [name.toLowerCase(), key],
      [`${name.toLowerCase()} wood`, key]
    ])
  ])
);
const missingDatabaseNameWarnings = new Set();

export function getLocalizedWoodName(value, t, language = 'en') {
  if (value && typeof value === 'object') {
    const regionalName = value.names?.find(
      ({ language_code, name_kind }) => language_code === language && name_kind === 'preferred'
    );
    if (!regionalName && language !== 'en' && value.common_name_en && import.meta.env?.DEV) {
      const key = `${language}:${value.id || value.slug || value.common_name_en}`;
      if (!missingDatabaseNameWarnings.has(key)) {
        missingDatabaseNameWarnings.add(key);
        console.warn(`[wood catalogue] Missing "${language}" name for "${value.common_name_en}"; showing the English name.`);
      }
    }
    return regionalName?.name || value.common_name_en || value.species || '';
  }
  if (typeof value !== 'string' || !value.trim()) return value || '';
  const key = aliases.get(value.trim().toLowerCase());
  return key ? t(`woodSpecies.${key}`) : value;
}

export function isWoodNameVerified(value, language = 'en') {
  if (!value || typeof value !== 'object') return true;
  const regionalName = value.names?.find(
    ({ language_code, name_kind }) => language_code === language && name_kind === 'preferred'
  );
  return regionalName
    ? Boolean(regionalName.verified)
    : Boolean(value.common_name_verified ?? value.commonNameVerified);
}

export function getWoodSpeciesSuggestions(t, language = 'en') {
  return WOOD_SPECIES.map(({ key, english, scientificName }) => {
    const translated = t(`woodSpecies.${key}`);
    const localizedName = translated.replace(/\*+$/, '');
    const label = localizedName === english
      ? english
      : `${localizedName}${language === 'en' ? '' : '*'} (${english})`;
    return {
      key,
      value: english,
      label: scientificName ? `${label} — ${scientificName}` : label
    };
  });
}
