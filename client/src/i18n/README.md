# Language catalogs

`languages.js` defines the supported languages, native selector names, and text direction. Each JSON file in `translations/` is a separate editable catalog. Use dotted keys through `useLanguage().t('section.key')`.

The current catalogs contain the first translation batch: public navigation and footer, admin navigation and shell labels, the login form, and the translation-coverage notice. Most public page content, the admin management screens, and some operational messages are not translated yet. The notice is shown for every non-English choice, and missing keys warn in development before using the English fallback.

Non-English wording is an initial draft, not a verified translation. A fluent speaker for each language should review the wording and display using the real font before production use. Add reviewed strings in a dedicated catalog; do not translate API routes, database identifiers, status codes, or payload keys.

The starter wood-name glossary includes Teak, Neem, Sandalwood, Eucalyptus, Mango, Jackfruit, Bamboo, and Rosewood in English, Kannada, Hindi, Telugu, and Tamil. These common-name translations are provided only for these four Indian languages; other locales show an explicit translation-coverage notice and report missing glossary keys in development. The admin stock and purchase forms suggest those familiar common names while keeping the existing free-text species field, so a scientific name can still be entered and sent through the existing API field. The suggested values are the English common name; no database/API identifiers or calculations are changed. Rosewood names are marked as uncertain, and forms remind staff to confirm the exact species before recording it.
